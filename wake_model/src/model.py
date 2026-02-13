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
    Depthwise Separable Convolution.
    Consists of depthwise convolution followed by pointwise (1x1) convolution.
    Significantly reduces parameters compared to standard convolution.
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
        """
        Initialize depthwise separable convolution.
        
        Args:
            in_channels: Number of input channels
            out_channels: Number of output channels
            kernel_size: Convolution kernel size
            stride: Convolution stride
            padding: Padding size
            bias: Whether to use bias
        """
        super(DepthwiseSeparableConv2d, self).__init__()
        
        # Depthwise convolution (groups=in_channels means each input channel
        # is convolved separately)
        self.depthwise = nn.Conv2d(
            in_channels=in_channels,
            out_channels=in_channels,
            kernel_size=kernel_size,
            stride=stride,
            padding=padding,
            groups=in_channels,
            bias=bias
        )
        
        # Pointwise convolution (1x1 convolution to combine channels)
        self.pointwise = nn.Conv2d(
            in_channels=in_channels,
            out_channels=out_channels,
            kernel_size=(1, 1),
            stride=(1, 1),
            padding=(0, 0),
            bias=bias
        )
    
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """Forward pass."""
        x = self.depthwise(x)
        x = self.pointwise(x)
        return x


class DSCNN(nn.Module):
    """
    Depthwise Separable CNN for wake-word detection.
    Lightweight architecture suitable for embedded deployment.
    """
    
    def __init__(
        self,
        input_channels: int = Config.INPUT_CHANNELS,
        num_classes: int = Config.NUM_CLASSES,
        layer_channels: Tuple[int, ...] = Config.MODEL_LAYERS,
        dropout_rate: float = Config.DROPOUT_RATE,
        input_shape: Tuple[int, int] = Config.get_feature_shape()
    ):
        """
        Initialize DS-CNN model.
        
        Args:
            input_channels: Number of input channels (1 for mono audio features)
            num_classes: Number of output classes
            layer_channels: Tuple specifying number of channels for each DS conv layer
            dropout_rate: Dropout probability
            input_shape: Shape of input features (n_mels, time_steps)
        """
        super(DSCNN, self).__init__()
        
        self.input_channels = input_channels
        self.num_classes = num_classes
        self.input_shape = input_shape
        
        # First standard convolution layer
        self.conv1 = nn.Conv2d(
            in_channels=input_channels,
            out_channels=layer_channels[0],
            kernel_size=(3, 3),
            stride=(2, 2),
            padding=(1, 1),
            bias=False
        )
        self.bn1 = nn.BatchNorm2d(layer_channels[0])
        self.relu1 = nn.ReLU(inplace=True)
        
        # Depthwise separable convolution layers
        self.ds_layers = nn.ModuleList()
        in_ch = layer_channels[0]
        
        for out_ch in layer_channels[1:]:
            ds_block = nn.Sequential(
                DepthwiseSeparableConv2d(
                    in_channels=in_ch,
                    out_channels=out_ch,
                    kernel_size=(3, 3),
                    stride=(1, 1),
                    padding=(1, 1),
                    bias=False
                ),
                nn.BatchNorm2d(out_ch),
                nn.ReLU(inplace=True),
                nn.Dropout2d(p=dropout_rate)
            )
            self.ds_layers.append(ds_block)
            in_ch = out_ch
        
        # Global average pooling
        self.global_avg_pool = nn.AdaptiveAvgPool2d((1, 1))
        
        # Fully connected classifier
        self.fc = nn.Linear(layer_channels[-1], num_classes)
        
        # Initialize weights
        self._initialize_weights()
    
    def _initialize_weights(self) -> None:
        """Initialize model weights using He initialization."""
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
        """
        Forward pass of the model.
        
        Args:
            x: Input tensor. Shape: (batch, 1, n_mels, time_steps)
        
        Returns:
            Output logits. Shape: (batch, num_classes)
        """
        # First convolution
        x = self.conv1(x)
        x = self.bn1(x)
        x = self.relu1(x)
        
        # Depthwise separable convolutions
        for ds_layer in self.ds_layers:
            x = ds_layer(x)
        
        # Global average pooling
        x = self.global_avg_pool(x)
        
        # Flatten
        x = x.view(x.size(0), -1)
        
        # Fully connected layer
        x = self.fc(x)
        
        return x
    
    def get_num_parameters(self) -> Tuple[int, int]:
        """
        Calculate number of parameters in the model.
        
        Returns:
            Tuple of (total_params, trainable_params)
        """
        total_params = sum(p.numel() for p in self.parameters())
        trainable_params = sum(p.numel() for p in self.parameters() if p.requires_grad)
        return total_params, trainable_params
    
    def get_model_size_mb(self) -> float:
        """
        Estimate model size in megabytes (FP32).
        
        Returns:
            Model size in MB
        """
        total_params, _ = self.get_num_parameters()
        # FP32: 4 bytes per parameter
        size_mb = (total_params * 4) / (1024 ** 2)
        return size_mb


def create_model(
    input_channels: int = Config.INPUT_CHANNELS,
    num_classes: int = Config.NUM_CLASSES,
    layer_channels: Tuple[int, ...] = Config.MODEL_LAYERS,
    dropout_rate: float = Config.DROPOUT_RATE
) -> DSCNN:
    """
    Factory function to create DS-CNN model.
    
    Args:
        input_channels: Number of input channels
        num_classes: Number of output classes
        layer_channels: Tuple specifying channels for each layer
        dropout_rate: Dropout probability
    
    Returns:
        DSCNN model instance
    """
    model = DSCNN(
        input_channels=input_channels,
        num_classes=num_classes,
        layer_channels=layer_channels,
        dropout_rate=dropout_rate
    )
    return model


def print_model_info(model: nn.Module) -> None:
    """
    Print detailed model information.
    
    Args:
        model: PyTorch model
    """
    if isinstance(model, DSCNN):
        total_params, trainable_params = model.get_num_parameters()
        model_size = model.get_model_size_mb()
        quantized_size = model_size / 4  # INT8 quantization reduces size by ~4x
        
        print("=" * 60)
        print("Model Information")
        print("=" * 60)
        print(f"Architecture: DS-CNN (Depthwise Separable CNN)")
        print(f"Input shape: (batch, {model.input_channels}, {model.input_shape[0]}, {model.input_shape[1]})")
        print(f"Output classes: {model.num_classes}")
        print(f"Total parameters: {total_params:,}")
        print(f"Trainable parameters: {trainable_params:,}")
        print(f"Model size (FP32): {model_size:.2f} MB")
        print(f"Estimated size (INT8 quantized): {quantized_size:.2f} MB")
        print(f"Target size: {Config.TARGET_MODEL_SIZE_MB} MB")
        
        if quantized_size <= Config.TARGET_MODEL_SIZE_MB:
            print(f"✓ Model meets size constraint (<{Config.TARGET_MODEL_SIZE_MB} MB)")
        else:
            print(f"✗ Model exceeds size constraint (>{Config.TARGET_MODEL_SIZE_MB} MB)")
        
        print("=" * 60)
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
