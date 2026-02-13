# Wake-Word Detection System

A production-ready wake-word detection system using Depthwise Separable CNN (DS-CNN) architecture optimized for embedded deployment.

## Overview

This project implements a lightweight, efficient neural network for binary wake-word classification designed to run on resource-constrained devices with a target model size of <1MB after quantization.

### Key Features

- **Compact Architecture**: DS-CNN architecture with <1MB footprint (quantized)
- **16kHz Audio Processing**: Optimized for real-time audio at 16kHz sample rate
- **Log-Mel Spectrograms**: 40 mel-frequency bins for robust feature extraction
- **Modular Design**: Clean separation of concerns across components
- **Production-Ready**: Reproducible training with proper validation and checkpointing
- **Data Augmentation**: Multiple augmentation techniques for improved robustness

## Architecture Specifications

- **Input**: 1-second audio clips (16,000 samples @ 16kHz)
- **Features**: Log-mel spectrogram (40 mel bins)
- **Model**: Depthwise Separable CNN
- **Output**: Binary classification (wake vs non-wake)
- **Target Size**: <1MB (INT8 quantized)

## Project Structure

```
wake_model/
│
├── src/                    # Source code
│   ├── config.py          # Centralized configuration
│   ├── features.py        # Feature extraction (log-mel spectrograms)
│   ├── augment.py         # Audio augmentation
│   ├── dataset.py         # PyTorch Dataset implementation
│   ├── model.py           # DS-CNN model architecture
│   ├── train.py           # Training script
│   └── utils.py           # Utility functions and helpers
│
├── data/                   # Data directory
│   ├── raw/               # Raw audio files
│   │   ├── wake/          # Wake-word samples
│   │   └── non_wake/      # Non-wake samples
│   └── processed/         # Processed features (optional)
│
├── experiments/            # Training experiments and checkpoints
│
├── tests/                  # Unit tests (to be implemented)
│
├── requirements.txt        # Python dependencies
└── README.md              # This file
```

## Installation

### Prerequisites

- Python 3.8 or higher
- pip package manager

### Setup

1. Clone or navigate to the project directory:
```bash
cd wake_model
```

2. Create a virtual environment (recommended):
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

## Data Preparation

### Expected Data Format

Organize your audio data in the following structure:

```
wake_model/data/raw/
├── wake/
│   ├── wake_sample_001.wav
│   ├── wake_sample_002.wav
│   └── ...
└── non_wake/
    ├── non_wake_sample_001.wav
    ├── non_wake_sample_002.wav
    └── ...
```

### Audio Requirements

- **Format**: WAV, MP3, FLAC, OGG, or M4A
- **Sample Rate**: Any (will be resampled to 16kHz)
- **Duration**: Any (will be padded/truncated to 1 second)
- **Channels**: Mono or Stereo (will be converted to mono)

### Recommended Dataset Size

- **Minimum**: 500 samples per class
- **Recommended**: 2,000+ samples per class
- **Ratio**: Balanced classes (50/50) or adjust loss weighting

## Usage

### Training

Navigate to the `src` directory and run the training script:

```bash
cd src
python train.py
```

The training script will:
1. Load and preprocess audio data
2. Split into train/validation/test sets
3. Train the DS-CNN model
4. Save checkpoints and training history
5. Report metrics (accuracy, precision, recall, F1)

### Configuration

All hyperparameters are centralized in `config.py`. Key parameters:

```python
# Audio Parameters
SAMPLE_RATE = 16000        # 16kHz
WINDOW_SIZE = 1.0          # 1 second
N_MELS = 40                # 40 mel bins

# Model Parameters
MODEL_LAYERS = (64, 64, 64, 64)  # Channel sizes
DROPOUT_RATE = 0.2

# Training Parameters
BATCH_SIZE = 32
LEARNING_RATE = 0.001
NUM_EPOCHS = 100
```

### Testing Individual Components

Each module can be tested independently:

```bash
# Test configuration
python config.py

# Test feature extraction
python features.py

# Test augmentation
python augment.py

# Test dataset loading
python dataset.py

# Test model architecture
python model.py

# Test utilities
python utils.py
```

## Model Architecture

### DS-CNN (Depthwise Separable CNN)

The model uses depthwise separable convolutions to reduce parameters while maintaining performance:

1. **Standard Conv2D**: Initial feature extraction
2. **DS Conv Blocks**: Efficient feature processing (3-4 layers)
3. **Global Average Pooling**: Spatial dimension reduction
4. **Fully Connected**: Final classification

### Parameter Efficiency

Depthwise separable convolutions reduce parameters by ~8-9x compared to standard convolutions:

- **Standard Conv**: `K × K × C_in × C_out`
- **DS Conv**: `K × K × C_in + C_in × C_out`

## Data Augmentation

The system includes several augmentation techniques to improve robustness:

1. **Time Shift**: Random temporal shifting (±10%)
2. **Noise Addition**: Gaussian noise injection
3. **Random Gain**: Volume perturbation (0.8-1.2x)
4. **Speed Perturbation**: Time stretching/compression (0.9-1.1x)

Each augmentation is applied probabilistically during training.

## Training Features

### Automatic Features

- ✅ Train/validation/test splitting
- ✅ Early stopping (patience-based)
- ✅ Learning rate scheduling (ReduceLROnPlateau)
- ✅ Checkpoint saving (best and latest)
- ✅ Training history logging
- ✅ Reproducible random seeds
- ✅ GPU support (automatic detection)

### Metrics Tracked

- Accuracy
- Precision
- Recall
- F1 Score
- False Acceptance Rate (FAR)
- False Rejection Rate (FRR)
- Confusion Matrix

## Model Deployment

### Quantization

To reduce model size for deployment:

```python
from utils import quantize_model
from model import create_model

# Load trained model
model = create_model()
# ... load weights ...

# Quantize to INT8
quantized_model = quantize_model(model)
```

This typically reduces model size by ~4x (FP32 → INT8).

### Export for Deployment

```python
# Export to TorchScript
scripted_model = torch.jit.script(model)
scripted_model.save("wake_model.pt")

# Export to ONNX (for cross-platform deployment)
import torch.onnx
dummy_input = torch.randn(1, 1, 40, 101)
torch.onnx.export(model, dummy_input, "wake_model.onnx")
```

## Performance Targets

### Accuracy Goals

- **Validation Accuracy**: >95%
- **False Acceptance Rate (FAR)**: <5%
- **False Rejection Rate (FRR)**: <5%

### Computational Requirements

- **Model Size**: <1MB (quantized)
- **Inference Time**: <50ms (CPU)
- **Memory**: <10MB RAM

## Troubleshooting

### Common Issues

**Issue**: No data found
```
Error: No data found!
```
**Solution**: Ensure audio files are in `data/raw/wake/` and `data/raw/non_wake/`

**Issue**: CUDA out of memory
```
RuntimeError: CUDA out of memory
```
**Solution**: Reduce `BATCH_SIZE` in `config.py`

**Issue**: Import errors
```
ModuleNotFoundError: No module named 'torch'
```
**Solution**: Install requirements: `pip install -r requirements.txt`

## Future Enhancements

Potential improvements for production deployment:

- [ ] Real-time audio streaming inference
- [ ] Mobile/embedded deployment examples (TFLite, ONNX)
- [ ] Multi-word detection
- [ ] Speaker adaptation
- [ ] Noise robustness testing
- [ ] Edge TPU optimization
- [ ] Comprehensive unit tests

## Technical Details

### Feature Extraction

- **STFT Parameters**:
  - FFT size: 512
  - Hop length: 160 samples (~10ms)
  - Window length: 400 samples (~25ms)
  - Window function: Hann window

- **Mel Filterbank**:
  - Number of filters: 40
  - Frequency range: 20Hz - 8000Hz
  - Log compression with normalization

### Training Strategy

- **Optimizer**: Adam (β1=0.9, β2=0.999)
- **Loss**: Cross-Entropy
- **L2 Regularization**: Weight decay = 0.0001
- **Gradient Clipping**: Max norm = 1.0
- **LR Schedule**: ReduceLROnPlateau (factor=0.5, patience=5)

## License

This project is provided as-is for educational and research purposes.

## Citation

If you use this code in your research, please cite:

```
Wake-Word Detection System using DS-CNN
https://github.com/yourusername/wake_model
```

## Contact

For questions or issues, please open an issue on the project repository.

---

**Note**: This is a foundational ML system. For production deployment, additional hardening, testing, and optimization are required.
