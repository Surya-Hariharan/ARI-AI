"""
Test script for redesigned DS-CNN:
- Prints parameter count
- Prints layer-by-layer breakdown
- Prints final tensor shape before global pooling
- Verifies input shape assertion
"""
import torch
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).parent.parent / 'src'))

from model import create_model, print_model_info

# Create dummy input (batch, 1, 40, 97)
dummy = torch.randn(4, 1, 40, 97)
model = create_model()

# Forward pass (should trigger assertion if shape is wrong)
with torch.no_grad():
    out = model(dummy)

# Print model details
model.print_model_details()
