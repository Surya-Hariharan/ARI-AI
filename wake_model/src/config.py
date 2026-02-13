"""
Configuration file for wake-word detection system.
Contains all hyperparameters, paths, and settings.
"""
from pathlib import Path
from typing import Tuple


class Config:
    """Centralized configuration for wake-word detection."""
    
    # ========== Audio Parameters ==========
    SAMPLE_RATE: int = 16000  # 16kHz audio sample rate
    WINDOW_SIZE: float = 1.0  # 1 second input window
    WINDOW_SAMPLES: int = int(SAMPLE_RATE * WINDOW_SIZE)  # 16000 samples
    
    # ========== Feature Extraction Parameters ==========
    N_MELS: int = 40  # Number of mel filterbanks
    N_FFT: int = 512  # FFT window size
    HOP_LENGTH: int = 160  # Hop length for STFT (~10ms at 16kHz)
    WIN_LENGTH: int = 400  # Window length for STFT (~25ms at 16kHz)
    F_MIN: float = 20.0  # Minimum frequency
    F_MAX: float = 8000.0  # Maximum frequency (Nyquist for 16kHz)
    
    # ========== Model Architecture Parameters ==========
    INPUT_CHANNELS: int = 1  # Single channel input (mono audio)
    NUM_CLASSES: int = 2  # Binary classification: wake vs non-wake
    
    # DS-CNN layer configuration (channels for each layer)
    MODEL_LAYERS: Tuple[int, ...] = (64, 64, 64, 64)
    DROPOUT_RATE: float = 0.2
    
    # ========== Training Parameters ==========
    BATCH_SIZE: int = 32
    LEARNING_RATE: float = 0.001
    NUM_EPOCHS: int = 100
    EARLY_STOPPING_PATIENCE: int = 10
    
    # Optimizer settings
    WEIGHT_DECAY: float = 0.0001
    ADAM_BETAS: Tuple[float, float] = (0.9, 0.999)
    
    # Learning rate scheduler
    LR_SCHEDULER_FACTOR: float = 0.5
    LR_SCHEDULER_PATIENCE: int = 5
    LR_MIN: float = 1e-6
    
    # ========== Data Augmentation Parameters ==========
    # Time shift
    TIME_SHIFT_MAX: float = 0.1  # Maximum shift as fraction of window (±10%)
    
    # Noise addition
    NOISE_LEVEL: float = 0.005  # Standard deviation of Gaussian noise
    
    # Random gain
    GAIN_MIN: float = 0.8
    GAIN_MAX: float = 1.2
    
    # Speed perturbation
    SPEED_MIN: float = 0.9
    SPEED_MAX: float = 1.1
    
    # Augmentation probabilities
    AUG_PROB_TIME_SHIFT: float = 0.5
    AUG_PROB_NOISE: float = 0.5
    AUG_PROB_GAIN: float = 0.5
    AUG_PROB_SPEED: float = 0.3
    
    # ========== Paths ==========
    PROJECT_ROOT: Path = Path(__file__).parent.parent.absolute()
    DATA_DIR: Path = PROJECT_ROOT / "data"
    RAW_DATA_DIR: Path = DATA_DIR / "raw"
    PROCESSED_DATA_DIR: Path = DATA_DIR / "processed"
    EXPERIMENTS_DIR: Path = PROJECT_ROOT / "experiments"
    
    # ========== Reproducibility ==========
    RANDOM_SEED: int = 42
    
    # ========== Validation/Test Split ==========
    TRAIN_SPLIT: float = 0.7
    VAL_SPLIT: float = 0.15
    TEST_SPLIT: float = 0.15
    
    # ========== Model Quantization ==========
    TARGET_MODEL_SIZE_MB: float = 1.0  # Target for quantized model
    QUANTIZE: bool = True  # Enable post-training quantization
    
    # ========== Logging ==========
    LOG_INTERVAL: int = 10  # Log every N batches during training
    SAVE_BEST_ONLY: bool = True
    
    @classmethod
    def get_feature_shape(cls) -> Tuple[int, int]:
        """
        Calculate the expected shape of mel-spectrogram features.
        
        Returns:
            Tuple of (n_mels, time_steps)
        """
        time_steps = 1 + (cls.WINDOW_SAMPLES - cls.N_FFT) // cls.HOP_LENGTH
        return (cls.N_MELS, time_steps)
    
    @classmethod
    def ensure_directories(cls) -> None:
        """Create all necessary directories if they don't exist."""
        cls.RAW_DATA_DIR.mkdir(parents=True, exist_ok=True)
        cls.PROCESSED_DATA_DIR.mkdir(parents=True, exist_ok=True)
        cls.EXPERIMENTS_DIR.mkdir(parents=True, exist_ok=True)
    
    @classmethod
    def print_config(cls) -> None:
        """Print current configuration settings."""
        print("=" * 60)
        print("Wake-Word Detection Configuration")
        print("=" * 60)
        print(f"Audio Sample Rate: {cls.SAMPLE_RATE} Hz")
        print(f"Window Size: {cls.WINDOW_SIZE} seconds ({cls.WINDOW_SAMPLES} samples)")
        print(f"Mel Bins: {cls.N_MELS}")
        print(f"Feature Shape: {cls.get_feature_shape()}")
        print(f"Model Layers: {cls.MODEL_LAYERS}")
        print(f"Batch Size: {cls.BATCH_SIZE}")
        print(f"Learning Rate: {cls.LEARNING_RATE}")
        print(f"Epochs: {cls.NUM_EPOCHS}")
        print(f"Random Seed: {cls.RANDOM_SEED}")
        print(f"Target Model Size: {cls.TARGET_MODEL_SIZE_MB} MB (quantized)")
        print("=" * 60)


if __name__ == "__main__":
    # Test configuration
    Config.print_config()
    Config.ensure_directories()
    print(f"\nDirectories ensured at: {Config.PROJECT_ROOT}")
