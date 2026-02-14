"""
Model architecture module for wake-word detection.
Implements Depthwise Separable CNN (DS-CNN) for efficient keyword spotting.
"""
import torch
import torch.nn as nn
from typing import Tuple
from config import Config


class DepthwiseSeparableConv2d(nn.Module):
    """
    Depthwise Separable Convolution: depthwise conv + pointwise conv.
    """
    def __init__(
        self,
        in_channels: int,
        out_channels: int,
        kernel_size: Tuple[int, int] = (3, 3),
        stride: Tuple[int, int] = (1, 1),
        padding: Tuple[int, int] = (1, 1),
        bias: bool = False
    ):
        super().__init__()
        self.depthwise = nn.Conv2d(
            in_channels=in_channels,
            out_channels=in_channels,
            kernel_size=kernel_size,
            stride=stride,
            padding=padding,
            groups=in_channels,
            bias=bias
        )
        self.pointwise = nn.Conv2d(
            in_channels=in_channels,
            out_channels=out_channels,
            kernel_size=(1, 1),
            stride=(1, 1),
            padding=(0, 0),
            bias=bias
        )
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = self.depthwise(x)
        x = self.pointwise(x)
        return x


class DSCNN(nn.Module):
    """
    Redesigned DS-CNN for wake-word detection.
    - Gradual channel expansion: 1→16→32→64→64
    - Only one stride (2,2) in second block
    - No Dropout, no pooling
    - Input shape: (batch, 1, 40, 97)
    """
    def __init__(
        self,
        input_channels: int = 1,
        num_classes: int = 2,
        input_shape: Tuple[int, int] = (40, 97)
    ):
        super().__init__()
        self.input_channels = input_channels
        self.num_classes = num_classes
        self.input_shape = input_shape

        # Channel progression
        chs = [1, 16, 32, 64, 64]

        # First standard conv (no stride)
        self.conv1 = nn.Conv2d(
            in_channels=chs[0],
            out_channels=chs[1],
            kernel_size=(3, 3),
            stride=(1, 1),
            padding=(1, 1),
            bias=False
        )
        self.bn1 = nn.BatchNorm2d(chs[1])
        self.relu1 = nn.ReLU(inplace=True)

        # DS-CNN blocks
        self.ds_layers = nn.ModuleList()
        # Block 1: 16→32, stride 2 (downsampling)
        self.ds_layers.append(nn.Sequential(
            DepthwiseSeparableConv2d(
                in_channels=chs[1], out_channels=chs[2],
                kernel_size=(3, 3), stride=(2, 2), padding=(1, 1), bias=False),
            nn.BatchNorm2d(chs[2]),
            nn.ReLU(inplace=True)
        ))
        # Block 2: 32→64, stride 1
        self.ds_layers.append(nn.Sequential(
            DepthwiseSeparableConv2d(
                in_channels=chs[2], out_channels=chs[3],
                kernel_size=(3, 3), stride=(1, 1), padding=(1, 1), bias=False),
            nn.BatchNorm2d(chs[3]),
            nn.ReLU(inplace=True)
        ))
        # Block 3: 64→64, stride 1
        self.ds_layers.append(nn.Sequential(
            DepthwiseSeparableConv2d(
                in_channels=chs[3], out_channels=chs[4],
                kernel_size=(3, 3), stride=(1, 1), padding=(1, 1), bias=False),
            nn.BatchNorm2d(chs[4]),
            nn.ReLU(inplace=True)
        ))

        self.global_avg_pool = nn.AdaptiveAvgPool2d((1, 1))
        self.fc = nn.Linear(chs[4], num_classes)

        self._initialize_weights()

    def _initialize_weights(self) -> None:
        for m in self.modules():
            if isinstance(m, nn.Conv2d):
                nn.init.kaiming_normal_(m.weight, mode='fan_out', nonlinearity='relu')
                if m.bias is not None:
                    nn.init.constant_(m.bias, 0)
            elif isinstance(m, nn.BatchNorm2d):
                nn.init.constant_(m.weight, 1)
                nn.init.constant_(m.bias, 0)
            elif isinstance(m, nn.Linear):
                nn.init.normal_(m.weight, 0, 0.01)
                nn.init.constant_(m.bias, 0)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # Assert input shape
        assert x.shape[1:] == (1, 40, 97), f"Input must be (batch, 1, 40, 97), got {x.shape}"
        x = self.conv1(x)
        x = self.bn1(x)
        x = self.relu1(x)
        for ds_layer in self.ds_layers:
            x = ds_layer(x)
        # Save shape before pooling for reporting
        self._prepool_shape = x.shape
        x = self.global_avg_pool(x)
        x = x.view(x.size(0), -1)
        x = self.fc(x)
        return x

    def get_num_parameters(self) -> Tuple[int, int]:
        total_params = sum(p.numel() for p in self.parameters())
        trainable_params = sum(p.numel() for p in self.parameters() if p.requires_grad)
        return total_params, trainable_params

    def get_model_size_mb(self) -> float:
        total_params, _ = self.get_num_parameters()
        return (total_params * 4) / (1024 ** 2)

    def get_quantized_size_mb(self) -> float:
        total_params, _ = self.get_num_parameters()
        return (total_params * 1) / (1024 ** 2)

    def layer_param_breakdown(self) -> list:
        breakdown = []
        # Conv1
        conv1_params = sum(p.numel() for p in self.conv1.parameters())
        breakdown.append(("conv1", conv1_params))
        # DS blocks
        for i, ds in enumerate(self.ds_layers):
            dw = ds[0]
            dw_params = sum(p.numel() for p in dw.parameters())
            bn_params = sum(p.numel() for p in ds[1].parameters())
            breakdown.append((f"ds_block{i+1}_dwsep", dw_params))
            breakdown.append((f"ds_block{i+1}_bn", bn_params))
        # FC
        fc_params = sum(p.numel() for p in self.fc.parameters())
        breakdown.append(("fc", fc_params))
        return breakdown

    def print_model_details(self) -> None:
        print("\nModel Details:")
        total, trainable = self.get_num_parameters()
        print(f"Total parameters: {total}")
        print(f"Trainable parameters: {trainable}")
        print("Layer-by-layer breakdown:")
        for name, count in self.layer_param_breakdown():
            print(f"  {name:20s}: {count}")
        print(f"Float32 model size: {self.get_model_size_mb():.3f} MB")
        print(f"Quantized INT8 size: {self.get_quantized_size_mb():.3f} MB")
        if hasattr(self, '_prepool_shape'):
            print(f"Final tensor shape before global pooling: {self._prepool_shape}")
        print("\nStride (2,2) is applied in the FIRST DS block (16→32 channels).\n")


def create_model(
    input_channels: int = 1,
    num_classes: int = 2
) -> DSCNN:
    return DSCNN(input_channels=input_channels, num_classes=num_classes)


def print_model_info(model: nn.Module) -> None:
    if hasattr(model, 'print_model_details'):
        model.print_model_details()
    else:
        total_params = sum(p.numel() for p in model.parameters())
        print(f"Total parameters: {total_params:,}")


if __name__ == "__main__":
    # Test model creation
    print("Testing DS-CNN model...")
    
    # Create model
    model = create_model()
    
    # Print model info
    print_model_info(model)
    
    # Test forward pass
    print("\nTesting forward pass...")
    batch_size = 4
    n_mels, time_steps = Config.get_feature_shape()
    
    # Create dummy input
    dummy_input = torch.randn(batch_size, 1, n_mels, time_steps)
    print(f"Input shape: {dummy_input.shape}")
    
    # Forward pass
    model.eval()
    with torch.no_grad():
        output = model(dummy_input)
    
    print(f"Output shape: {output.shape}")
    print(f"Output logits sample: {output[0]}")
    
    # Apply softmax to get probabilities
    probabilities = torch.softmax(output, dim=1)
    print(f"Output probabilities sample: {probabilities[0]}")
    
    print("\nModel test completed successfully!")
