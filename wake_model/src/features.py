"""
Feature extraction module for wake-word detection.
Handles conversion of raw audio to log-mel spectrograms.
"""
import torch
import torchaudio
import numpy as np
from typing import Union, Tuple
from config import Config


def extract_log_mel_spectrogram(
    waveform: Union[torch.Tensor, np.ndarray],
    sample_rate: int = Config.SAMPLE_RATE,
    n_mels: int = Config.N_MELS,
    n_fft: int = Config.N_FFT,
    hop_length: int = Config.HOP_LENGTH,
    win_length: int = Config.WIN_LENGTH,
    f_min: float = Config.F_MIN,
    f_max: float = Config.F_MAX,
    normalize: bool = True
) -> torch.Tensor:
    """
    Extract log-mel spectrogram from raw audio waveform.
    
    Args:
        waveform: Input audio waveform. Shape: (1, samples) or (samples,)
        sample_rate: Audio sample rate in Hz
        n_mels: Number of mel filterbanks
        n_fft: FFT window size
        hop_length: Hop length for STFT
        win_length: Window length for STFT
        f_min: Minimum frequency
        f_max: Maximum frequency
        normalize: Whether to normalize the spectrogram per sample
    
    Returns:
        Log-mel spectrogram tensor. Shape: (1, n_mels, time_steps)
    """
    # Convert numpy array to tensor if needed
    if isinstance(waveform, np.ndarray):
        waveform = torch.from_numpy(waveform).float()
    
    # Ensure waveform is 2D: (1, samples)
    if waveform.ndim == 1:
        waveform = waveform.unsqueeze(0)
    
    # Create mel spectrogram transformation
    mel_spectrogram_transform = torchaudio.transforms.MelSpectrogram(
        sample_rate=sample_rate,
        n_fft=n_fft,
        win_length=win_length,
        hop_length=hop_length,
        f_min=f_min,
        f_max=f_max,
        n_mels=n_mels,
        window_fn=torch.hann_window,
        power=2.0,  # Power spectrogram
    )
    
    # Extract mel spectrogram
    mel_spec = mel_spectrogram_transform(waveform)
    
    # Convert to log scale (add small epsilon to avoid log(0))
    log_mel_spec = torch.log(mel_spec + 1e-9)
    
    # Normalize per sample if requested
    if normalize:
        log_mel_spec = normalize_spectrogram(log_mel_spec)
    
    return log_mel_spec


def normalize_spectrogram(
    spectrogram: torch.Tensor,
    eps: float = 1e-9
) -> torch.Tensor:
    """
    Normalize spectrogram to zero mean and unit variance.
    
    Args:
        spectrogram: Input spectrogram tensor
        eps: Small epsilon for numerical stability
    
    Returns:
        Normalized spectrogram
    """
    mean = spectrogram.mean()
    std = spectrogram.std()
    
    normalized = (spectrogram - mean) / (std + eps)
    
    return normalized


def pad_or_truncate_waveform(
    waveform: torch.Tensor,
    target_length: int = Config.WINDOW_SAMPLES
) -> torch.Tensor:
    """
    Pad or truncate waveform to target length.
    
    Args:
        waveform: Input waveform tensor. Shape: (1, samples) or (samples,)
        target_length: Target number of samples
    
    Returns:
        Waveform with exact target_length samples. Shape: (1, target_length)
    """
    # Ensure 2D shape
    if waveform.ndim == 1:
        waveform = waveform.unsqueeze(0)
    
    current_length = waveform.shape[1]
    
    if current_length > target_length:
        # Truncate from center
        start_idx = (current_length - target_length) // 2
        waveform = waveform[:, start_idx:start_idx + target_length]
    elif current_length < target_length:
        # Pad with zeros
        padding = target_length - current_length
        pad_left = padding // 2
        pad_right = padding - pad_left
        waveform = torch.nn.functional.pad(waveform, (pad_left, pad_right), mode='constant', value=0)
    
    return waveform


def load_and_preprocess_audio(
    audio_path: str,
    target_sample_rate: int = Config.SAMPLE_RATE,
    target_length: int = Config.WINDOW_SAMPLES
) -> torch.Tensor:
    """
    Load audio file and preprocess to standard format.
    
    Args:
        audio_path: Path to audio file
        target_sample_rate: Target sample rate for resampling
        target_length: Target length in samples
    
    Returns:
        Preprocessed waveform. Shape: (1, target_length)
    """
    # Load audio file
    waveform, sample_rate = torchaudio.load(audio_path)
    
    # Convert to mono if stereo
    if waveform.shape[0] > 1:
        waveform = torch.mean(waveform, dim=0, keepdim=True)
    
    # Resample if necessary
    if sample_rate != target_sample_rate:
        resampler = torchaudio.transforms.Resample(
            orig_freq=sample_rate,
            new_freq=target_sample_rate
        )
        waveform = resampler(waveform)
    
    # Pad or truncate to target length
    waveform = pad_or_truncate_waveform(waveform, target_length)
    
    return waveform


def extract_features_from_file(
    audio_path: str,
    normalize: bool = True
) -> torch.Tensor:
    """
    Complete pipeline: load audio file and extract log-mel spectrogram.
    
    Args:
        audio_path: Path to audio file
        normalize: Whether to normalize the spectrogram
    
    Returns:
        Log-mel spectrogram. Shape: (1, n_mels, time_steps)
    """
    # Load and preprocess audio
    waveform = load_and_preprocess_audio(audio_path)
    
    # Extract features
    features = extract_log_mel_spectrogram(waveform, normalize=normalize)
    
    return features


def get_feature_shape() -> Tuple[int, int, int]:
    """
    Get the expected shape of extracted features.
    
    Returns:
        Tuple of (channels, n_mels, time_steps)
    """
    n_mels, time_steps = Config.get_feature_shape()
    return (1, n_mels, time_steps)


if __name__ == "__main__":
    # Test feature extraction with synthetic audio
    print("Testing feature extraction...")
    
    # Create synthetic audio (1 second of random noise)
    synthetic_audio = torch.randn(1, Config.WINDOW_SAMPLES)
    
    # Extract features
    features = extract_log_mel_spectrogram(synthetic_audio)
    
    print(f"Input shape: {synthetic_audio.shape}")
    print(f"Feature shape: {features.shape}")
    print(f"Expected shape: {get_feature_shape()}")
    print(f"Feature statistics - Mean: {features.mean():.4f}, Std: {features.std():.4f}")
    print(f"Min: {features.min():.4f}, Max: {features.max():.4f}")
    print("\nFeature extraction test completed successfully!")
