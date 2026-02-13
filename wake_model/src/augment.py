"""
Audio augmentation module for wake-word detection.
Provides various augmentation techniques to improve model robustness.
"""
import torch
import torchaudio
import numpy as np
from typing import Optional
from config import Config


def time_shift(
    waveform: torch.Tensor,
    shift_max: float = Config.TIME_SHIFT_MAX,
    sample_rate: int = Config.SAMPLE_RATE
) -> torch.Tensor:
    """
    Apply time shift augmentation by rolling the waveform.
    
    Args:
        waveform: Input waveform. Shape: (1, samples) or (samples,)
        shift_max: Maximum shift as fraction of total length
        sample_rate: Sample rate (not used, kept for API consistency)
    
    Returns:
        Time-shifted waveform with same shape as input
    """
    if waveform.ndim == 1:
        waveform = waveform.unsqueeze(0)
    
    signal_length = waveform.shape[1]
    max_shift_samples = int(signal_length * shift_max)
    
    # Random shift amount (can be positive or negative)
    shift_amount = np.random.randint(-max_shift_samples, max_shift_samples + 1)
    
    # Roll the tensor
    shifted = torch.roll(waveform, shifts=shift_amount, dims=1)
    
    return shifted


def add_noise(
    waveform: torch.Tensor,
    noise_level: float = Config.NOISE_LEVEL
) -> torch.Tensor:
    """
    Add random Gaussian noise to waveform.
    
    Args:
        waveform: Input waveform. Shape: (1, samples) or (samples,)
        noise_level: Standard deviation of Gaussian noise
    
    Returns:
        Noisy waveform with same shape as input
    """
    if waveform.ndim == 1:
        waveform = waveform.unsqueeze(0)
    
    noise = torch.randn_like(waveform) * noise_level
    noisy_waveform = waveform + noise
    
    return noisy_waveform


def random_gain(
    waveform: torch.Tensor,
    gain_min: float = Config.GAIN_MIN,
    gain_max: float = Config.GAIN_MAX
) -> torch.Tensor:
    """
    Apply random gain (volume adjustment) to waveform.
    
    Args:
        waveform: Input waveform. Shape: (1, samples) or (samples,)
        gain_min: Minimum gain factor
        gain_max: Maximum gain factor
    
    Returns:
        Gain-adjusted waveform with same shape as input
    """
    if waveform.ndim == 1:
        waveform = waveform.unsqueeze(0)
    
    # Sample random gain factor
    gain_factor = np.random.uniform(gain_min, gain_max)
    
    # Apply gain
    gained_waveform = waveform * gain_factor
    
    return gained_waveform


def speed_perturbation(
    waveform: torch.Tensor,
    speed_min: float = Config.SPEED_MIN,
    speed_max: float = Config.SPEED_MAX,
    sample_rate: int = Config.SAMPLE_RATE
) -> torch.Tensor:
    """
    Apply speed perturbation by resampling the audio.
    
    Args:
        waveform: Input waveform. Shape: (1, samples) or (samples,)
        speed_min: Minimum speed factor (< 1.0 = slower)
        speed_max: Maximum speed factor (> 1.0 = faster)
        sample_rate: Original sample rate
    
    Returns:
        Speed-perturbed waveform, resampled to original length
    """
    if waveform.ndim == 1:
        waveform = waveform.unsqueeze(0)
    
    original_length = waveform.shape[1]
    
    # Sample random speed factor
    speed_factor = np.random.uniform(speed_min, speed_max)
    
    # Calculate new sample rate (speed up = higher sample rate)
    new_sample_rate = int(sample_rate * speed_factor)
    
    # Resample
    resampler = torchaudio.transforms.Resample(
        orig_freq=new_sample_rate,
        new_freq=sample_rate
    )
    
    # Apply resampling (this changes the effective speed)
    perturbed = resampler(waveform)
    
    # Pad or truncate to original length
    current_length = perturbed.shape[1]
    if current_length > original_length:
        # Truncate
        start_idx = (current_length - original_length) // 2
        perturbed = perturbed[:, start_idx:start_idx + original_length]
    elif current_length < original_length:
        # Pad with zeros
        padding = original_length - current_length
        pad_left = padding // 2
        pad_right = padding - pad_left
        perturbed = torch.nn.functional.pad(perturbed, (pad_left, pad_right), mode='constant', value=0)
    
    return perturbed


class AudioAugmentation:
    """
    Composable audio augmentation pipeline.
    Applies augmentations with configurable probabilities.
    """
    
    def __init__(
        self,
        prob_time_shift: float = Config.AUG_PROB_TIME_SHIFT,
        prob_noise: float = Config.AUG_PROB_NOISE,
        prob_gain: float = Config.AUG_PROB_GAIN,
        prob_speed: float = Config.AUG_PROB_SPEED,
        time_shift_max: float = Config.TIME_SHIFT_MAX,
        noise_level: float = Config.NOISE_LEVEL,
        gain_min: float = Config.GAIN_MIN,
        gain_max: float = Config.GAIN_MAX,
        speed_min: float = Config.SPEED_MIN,
        speed_max: float = Config.SPEED_MAX,
        sample_rate: int = Config.SAMPLE_RATE
    ):
        """
        Initialize augmentation pipeline with configurable parameters.
        
        Args:
            prob_time_shift: Probability of applying time shift
            prob_noise: Probability of adding noise
            prob_gain: Probability of applying random gain
            prob_speed: Probability of applying speed perturbation
            time_shift_max: Maximum time shift fraction
            noise_level: Noise standard deviation
            gain_min: Minimum gain factor
            gain_max: Maximum gain factor
            speed_min: Minimum speed factor
            speed_max: Maximum speed factor
            sample_rate: Audio sample rate
        """
        self.prob_time_shift = prob_time_shift
        self.prob_noise = prob_noise
        self.prob_gain = prob_gain
        self.prob_speed = prob_speed
        
        self.time_shift_max = time_shift_max
        self.noise_level = noise_level
        self.gain_min = gain_min
        self.gain_max = gain_max
        self.speed_min = speed_min
        self.speed_max = speed_max
        self.sample_rate = sample_rate
    
    def __call__(self, waveform: torch.Tensor) -> torch.Tensor:
        """
        Apply augmentation pipeline to waveform.
        
        Args:
            waveform: Input waveform. Shape: (1, samples) or (samples,)
        
        Returns:
            Augmented waveform
        """
        augmented = waveform.clone()
        
        # Apply time shift
        if np.random.random() < self.prob_time_shift:
            augmented = time_shift(
                augmented,
                shift_max=self.time_shift_max,
                sample_rate=self.sample_rate
            )
        
        # Apply noise
        if np.random.random() < self.prob_noise:
            augmented = add_noise(
                augmented,
                noise_level=self.noise_level
            )
        
        # Apply random gain
        if np.random.random() < self.prob_gain:
            augmented = random_gain(
                augmented,
                gain_min=self.gain_min,
                gain_max=self.gain_max
            )
        
        # Apply speed perturbation
        if np.random.random() < self.prob_speed:
            augmented = speed_perturbation(
                augmented,
                speed_min=self.speed_min,
                speed_max=self.speed_max,
                sample_rate=self.sample_rate
            )
        
        return augmented


def get_train_augmentation() -> AudioAugmentation:
    """
    Get standard augmentation pipeline for training.
    
    Returns:
        AudioAugmentation instance configured for training
    """
    return AudioAugmentation()


def get_no_augmentation() -> Optional[AudioAugmentation]:
    """
    Get no augmentation (for validation/test).
    
    Returns:
        None (no augmentation)
    """
    return None


if __name__ == "__main__":
    # Test augmentation functions
    print("Testing audio augmentation...")
    
    # Create synthetic audio
    synthetic_audio = torch.randn(1, Config.WINDOW_SAMPLES)
    
    print(f"Original audio shape: {synthetic_audio.shape}")
    print(f"Original audio range: [{synthetic_audio.min():.4f}, {synthetic_audio.max():.4f}]")
    print()
    
    # Test individual augmentations
    print("Testing time shift...")
    shifted = time_shift(synthetic_audio)
    print(f"  Shape: {shifted.shape}, Range: [{shifted.min():.4f}, {shifted.max():.4f}]")
    
    print("Testing noise addition...")
    noisy = add_noise(synthetic_audio)
    print(f"  Shape: {noisy.shape}, Range: [{noisy.min():.4f}, {noisy.max():.4f}]")
    
    print("Testing random gain...")
    gained = random_gain(synthetic_audio)
    print(f"  Shape: {gained.shape}, Range: [{gained.min():.4f}, {gained.max():.4f}]")
    
    print("Testing speed perturbation...")
    perturbed = speed_perturbation(synthetic_audio)
    print(f"  Shape: {perturbed.shape}, Range: [{perturbed.min():.4f}, {perturbed.max():.4f}]")
    
    print("\nTesting augmentation pipeline...")
    augmenter = get_train_augmentation()
    augmented = augmenter(synthetic_audio)
    print(f"  Shape: {augmented.shape}, Range: [{augmented.min():.4f}, {augmented.max():.4f}]")
    
    print("\nAll augmentation tests completed successfully!")
