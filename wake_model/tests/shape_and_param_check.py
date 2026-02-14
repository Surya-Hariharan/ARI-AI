"""
Script to check:
- Batch feature shape
- Model parameter count
- First conv layer config
- Stride/pooling usage
"""
import torch
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).parent.parent / 'src'))

from config import Config
from dataset import WakeWordDataset
from model import create_model, print_model_info

# 1. Create dummy dataset and DataLoader
class DummyDataset(torch.utils.data.Dataset):
    def __len__(self):
        return 8
    def __getitem__(self, idx):
        # Return (feature, label)
        # Feature: (1, 40, 97)
        return torch.randn(1, 40, 97), 1

dataset = DummyDataset()
loader = torch.utils.data.DataLoader(dataset, batch_size=4)

# 2. Print one batch shape
batch = next(iter(loader))
features, labels = batch
print("Batch feature shape:", features.shape)

# 3. Create model and print parameter count
model = create_model()
total_params = sum(p.numel() for p in model.parameters())
print("Total parameter count:", total_params)

# 4. Print first conv layer config
conv1 = model.conv1
print("First conv layer:")
print("  in_channels:", conv1.in_channels)
print("  out_channels:", conv1.out_channels)
print("  kernel_size:", conv1.kernel_size)
print("  stride:", conv1.stride)
print("  padding:", conv1.padding)

# 5. Check for stride >1 or pooling
strides = [conv1.stride]
for i, ds in enumerate(model.ds_layers):
    # ds is nn.Sequential([DepthwiseSeparableConv2d, BatchNorm2d, ReLU, Dropout])
    dw = ds[0]
    strides.append(dw.depthwise.stride)
print("Strides per conv block:", strides)

# 6. Check for pooling layers
has_pooling = any(isinstance(m, torch.nn.modules.pooling._PoolingNd) for m in model.modules())
print("Pooling layers present:", has_pooling)
