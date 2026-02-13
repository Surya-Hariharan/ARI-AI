"""
System verification test for wake-word detection.
Run this to verify your setup is working correctly.
"""
import torch
import sys
from pathlib import Path

# Add src to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent / 'src'))

from config import Config
from model import create_model, print_model_info
from features import extract_log_mel_spectrogram
from augment import get_train_augmentation
from utils import set_seed, get_device_info


def test_imports():
    """Test that all modules can be imported."""
    print("Testing imports...")
    try:
        import torch
        import torchaudio
        import numpy
        import sklearn
        print("  ✓ All required packages are installed")
        return True
    except ImportError as e:
        print(f"  ✗ Import error: {e}")
        print("  Please run: pip install -r requirements.txt")
        return False


def test_config():
    """Test configuration module."""
    print("\nTesting configuration...")
    try:
        Config.print_config()
        Config.ensure_directories()
        print("  ✓ Configuration loaded successfully")
        return True
    except Exception as e:
        print(f"  ✗ Configuration error: {e}")
        return False


def test_model():
    """Test model creation and forward pass."""
    print("\nTesting model...")
    try:
        model = create_model()
        print_model_info(model)
        
        # Test forward pass
        batch_size = 2
        n_mels, time_steps = Config.get_feature_shape()
        dummy_input = torch.randn(batch_size, 1, n_mels, time_steps)
        
        model.eval()
        with torch.no_grad():
            output = model(dummy_input)
        
        assert output.shape == (batch_size, Config.NUM_CLASSES), \
            f"Expected output shape ({batch_size}, {Config.NUM_CLASSES}), got {output.shape}"
        
        print("  ✓ Model creation and forward pass successful")
        return True
    except Exception as e:
        print(f"  ✗ Model error: {e}")
        return False


def test_features():
    """Test feature extraction."""
    print("\nTesting feature extraction...")
    try:
        # Create synthetic audio
        waveform = torch.randn(1, Config.WINDOW_SAMPLES)
        
        # Extract features
        features = extract_log_mel_spectrogram(waveform, normalize=True)
        
        expected_shape = (1, Config.N_MELS, Config.get_feature_shape()[1])
        assert features.shape == expected_shape, \
            f"Expected feature shape {expected_shape}, got {features.shape}"
        
        print(f"  Input shape: {waveform.shape}")
        print(f"  Feature shape: {features.shape}")
        print("  ✓ Feature extraction successful")
        return True
    except Exception as e:
        print(f"  ✗ Feature extraction error: {e}")
        return False


def test_augmentation():
    """Test audio augmentation."""
    print("\nTesting augmentation...")
    try:
        # Create synthetic audio
        waveform = torch.randn(1, Config.WINDOW_SAMPLES)
        
        # Get augmentation pipeline
        augmenter = get_train_augmentation()
        
        # Apply augmentation
        augmented = augmenter(waveform)
        
        assert augmented.shape == waveform.shape, \
            f"Augmented shape {augmented.shape} doesn't match input {waveform.shape}"
        
        print(f"  Input shape: {waveform.shape}")
        print(f"  Augmented shape: {augmented.shape}")
        print("  ✓ Augmentation successful")
        return True
    except Exception as e:
        print(f"  ✗ Augmentation error: {e}")
        return False


def test_device():
    """Test device availability."""
    print("\nTesting device...")
    try:
        device_info = get_device_info()
        print(f"  CUDA Available: {device_info['cuda_available']}")
        if device_info['cuda_available']:
            print(f"  CUDA Version: {device_info['cuda_version']}")
            print(f"  Device Name: {device_info['device_name']}")
        else:
            print("  Running on CPU (CUDA not available)")
        print("  ✓ Device check successful")
        return True
    except Exception as e:
        print(f"  ✗ Device error: {e}")
        return False


def test_reproducibility():
    """Test reproducibility with seed setting."""
    print("\nTesting reproducibility...")
    try:
        # Set seed
        set_seed(42)
        
        # Generate random numbers
        rand1 = torch.rand(5)
        
        # Set seed again
        set_seed(42)
        
        # Generate random numbers again
        rand2 = torch.rand(5)
        
        assert torch.allclose(rand1, rand2), "Random numbers should be identical with same seed"
        
        print("  ✓ Reproducibility test passed")
        return True
    except Exception as e:
        print(f"  ✗ Reproducibility error: {e}")
        return False


def main():
    """Run all tests."""
    print("=" * 60)
    print("Wake-Word Detection System - Verification Test")
    print("=" * 60)
    
    tests = [
        test_imports,
        test_config,
        test_model,
        test_features,
        test_augmentation,
        test_device,
        test_reproducibility,
    ]
    
    results = []
    for test in tests:
        try:
            result = test()
            results.append(result)
        except Exception as e:
            print(f"  ✗ Unexpected error: {e}")
            results.append(False)
    
    # Summary
    print("\n" + "=" * 60)
    print("Test Summary")
    print("=" * 60)
    passed = sum(results)
    total = len(results)
    print(f"Passed: {passed}/{total}")
    
    if passed == total:
        print("\n✓ All tests passed! Your setup is ready.")
        print("\nNext steps:")
        print("1. Add audio data to data/raw/wake/ and data/raw/non_wake/")
        print("2. Run training: cd src && python train.py")
        return 0
    else:
        print("\n✗ Some tests failed. Please check the errors above.")
        return 1


if __name__ == "__main__":
    exit(main())
