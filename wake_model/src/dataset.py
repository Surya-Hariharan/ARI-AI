"""
Dataset module for wake-word detection.
Provides PyTorch Dataset class for loading and processing audio data.
"""
import torch
from torch.utils.data import Dataset, DataLoader
from pathlib import Path
from typing import List, Tuple, Optional, Callable
import json

from config import Config
from features import load_and_preprocess_audio, extract_log_mel_spectrogram
from augment import AudioAugmentation, get_train_augmentation


class WakeWordDataset(Dataset):
    """
    PyTorch Dataset for wake-word detection.
    
    Expected directory structure:
        data/raw/
            wake/
                sample001.wav
                sample002.wav
                ...
            non_wake/
                sample001.wav
                sample002.wav
                ...
    """
    
    def __init__(
        self,
        data_dir: Path,
        split: str = "train",
        augmentation: Optional[AudioAugmentation] = None,
        cache_features: bool = False
    ):
        """
        Initialize the dataset.
        
        Args:
            data_dir: Root directory containing 'wake' and 'non_wake' folders
            split: Dataset split ('train', 'val', or 'test')
            augmentation: Optional augmentation pipeline
            cache_features: Whether to cache extracted features in memory
        """
        self.data_dir = Path(data_dir)
        self.split = split
        self.augmentation = augmentation
        self.cache_features = cache_features
        
        # Load file paths and labels
        self.samples: List[Tuple[Path, int]] = []
        self._load_samples()
        
        # Feature cache
        self.feature_cache = {} if cache_features else None
        
        print(f"Loaded {len(self.samples)} samples for {split} split")
    
    def _load_samples(self) -> None:
        """Load all audio file paths and their labels."""
        # Class 0: non-wake, Class 1: wake
        class_mapping = {
            'non_wake': 0,
            'wake': 1
        }
        
        for class_name, label in class_mapping.items():
            class_dir = self.data_dir / class_name
            
            if not class_dir.exists():
                print(f"Warning: Directory {class_dir} does not exist. Creating it...")
                class_dir.mkdir(parents=True, exist_ok=True)
                continue
            
            # Get all audio files (common formats)
            audio_extensions = ['.wav', '.mp3', '.flac', '.ogg', '.m4a']
            audio_files = []
            for ext in audio_extensions:
                audio_files.extend(list(class_dir.glob(f'*{ext}')))
            
            # Add to samples list
            for audio_path in audio_files:
                self.samples.append((audio_path, label))
        
        if len(self.samples) == 0:
            print(f"Warning: No audio files found in {self.data_dir}")
            print(f"Expected structure: {self.data_dir}/{{wake,non_wake}}/*.wav")
    
    def __len__(self) -> int:
        """Return the number of samples in the dataset."""
        return len(self.samples)
    
    def __getitem__(self, idx: int) -> Tuple[torch.Tensor, int]:
        """
        Get a single sample from the dataset.
        
        Args:
            idx: Sample index
        
        Returns:
            Tuple of (feature_tensor, label)
            - feature_tensor: Shape (1, n_mels, time_steps)
            - label: Integer class label (0 or 1)
        """
        # Get audio path and label
        audio_path, label = self.samples[idx]
        
        # Check cache first
        if self.feature_cache is not None and idx in self.feature_cache:
            features = self.feature_cache[idx]
        else:
            # Load and preprocess audio
            waveform = load_and_preprocess_audio(str(audio_path))
            
            # Apply augmentation if specified (only on waveform)
            if self.augmentation is not None:
                waveform = self.augmentation(waveform)
            
            # Extract features
            features = extract_log_mel_spectrogram(waveform, normalize=True)
            
            # Cache if enabled (only cache base features, not augmented)
            if self.feature_cache is not None and self.augmentation is None:
                self.feature_cache[idx] = features
        
        # Remove batch dimension if present (Dataset should return (C, H, W))
        if features.ndim == 3:
            features = features.squeeze(0)  # (1, n_mels, time_steps) -> (n_mels, time_steps)
        
        # For CNN input, we need (C, H, W) format, so add channel dimension back
        # features shape: (n_mels, time_steps) -> (1, n_mels, time_steps)
        features = features.unsqueeze(0)
        
        return features, label
    
    def get_class_distribution(self) -> dict:
        """
        Get the distribution of classes in the dataset.
        
        Returns:
            Dictionary mapping class labels to counts
        """
        distribution = {0: 0, 1: 0}
        for _, label in self.samples:
            distribution[label] += 1
        return distribution
    
    def get_sample_info(self, idx: int) -> dict:
        """
        Get information about a specific sample.
        
        Args:
            idx: Sample index
        
        Returns:
            Dictionary with sample information
        """
        audio_path, label = self.samples[idx]
        return {
            'path': str(audio_path),
            'label': label,
            'class_name': 'wake' if label == 1 else 'non_wake',
            'filename': audio_path.name
        }


def create_data_loaders(
    data_dir: Path = Config.RAW_DATA_DIR,
    batch_size: int = Config.BATCH_SIZE,
    num_workers: int = 0,
    use_augmentation: bool = True
) -> Tuple[DataLoader, DataLoader, DataLoader]:
    """
    Create train, validation, and test data loaders.
    
    Note: This is a simplified version. In production, you would split
    your data into train/val/test folders or use a metadata file.
    
    Args:
        data_dir: Root directory containing audio data
        batch_size: Batch size for data loaders
        num_workers: Number of worker processes for data loading
        use_augmentation: Whether to use augmentation for training
    
    Returns:
        Tuple of (train_loader, val_loader, test_loader)
    """
    # Get augmentation for training
    train_aug = get_train_augmentation() if use_augmentation else None
    
    # Create datasets
    # Note: This assumes you have separate train/val/test folders
    # If not, you'll need to implement splitting logic
    train_dataset = WakeWordDataset(
        data_dir=data_dir,
        split="train",
        augmentation=train_aug,
        cache_features=False
    )
    
    val_dataset = WakeWordDataset(
        data_dir=data_dir,
        split="val",
        augmentation=None,  # No augmentation for validation
        cache_features=True
    )
    
    test_dataset = WakeWordDataset(
        data_dir=data_dir,
        split="test",
        augmentation=None,  # No augmentation for testing
        cache_features=True
    )
    
    # Create data loaders
    train_loader = DataLoader(
        train_dataset,
        batch_size=batch_size,
        shuffle=True,
        num_workers=num_workers,
        pin_memory=True if torch.cuda.is_available() else False
    )
    
    val_loader = DataLoader(
        val_dataset,
        batch_size=batch_size,
        shuffle=False,
        num_workers=num_workers,
        pin_memory=True if torch.cuda.is_available() else False
    )
    
    test_loader = DataLoader(
        test_dataset,
        batch_size=batch_size,
        shuffle=False,
        num_workers=num_workers,
        pin_memory=True if torch.cuda.is_available() else False
    )
    
    return train_loader, val_loader, test_loader


def split_dataset(
    dataset: WakeWordDataset,
    train_ratio: float = Config.TRAIN_SPLIT,
    val_ratio: float = Config.VAL_SPLIT,
    test_ratio: float = Config.TEST_SPLIT,
    random_seed: int = Config.RANDOM_SEED
) -> Tuple[Dataset, Dataset, Dataset]:
    """
    Split a dataset into train, validation, and test sets.
    
    Args:
        dataset: Dataset to split
        train_ratio: Fraction for training
        val_ratio: Fraction for validation
        test_ratio: Fraction for testing
        random_seed: Random seed for reproducibility
    
    Returns:
        Tuple of (train_dataset, val_dataset, test_dataset)
    """
    from torch.utils.data import random_split
    
    # Ensure ratios sum to 1
    assert abs(train_ratio + val_ratio + test_ratio - 1.0) < 1e-6, \
        "Train, val, and test ratios must sum to 1.0"
    
    # Calculate split sizes
    total_size = len(dataset)
    train_size = int(total_size * train_ratio)
    val_size = int(total_size * val_ratio)
    test_size = total_size - train_size - val_size
    
    # Set random seed for reproducibility
    generator = torch.Generator().manual_seed(random_seed)
    
    # Split dataset
    train_dataset, val_dataset, test_dataset = random_split(
        dataset,
        [train_size, val_size, test_size],
        generator=generator
    )
    
    return train_dataset, val_dataset, test_dataset


if __name__ == "__main__":
    # Test dataset loading
    print("Testing WakeWordDataset...")
    
    # Create a test dataset
    dataset = WakeWordDataset(
        data_dir=Config.RAW_DATA_DIR,
        split="train",
        augmentation=get_train_augmentation()
    )
    
    print(f"\nDataset size: {len(dataset)}")
    
    if len(dataset) > 0:
        print(f"Class distribution: {dataset.get_class_distribution()}")
        
        # Get a sample
        features, label = dataset[0]
        print(f"\nSample features shape: {features.shape}")
        print(f"Sample label: {label}")
        print(f"Sample info: {dataset.get_sample_info(0)}")
        
        # Test data loader
        print("\nTesting DataLoader...")
        loader = DataLoader(dataset, batch_size=4, shuffle=True)
        
        for batch_features, batch_labels in loader:
            print(f"Batch features shape: {batch_features.shape}")
            print(f"Batch labels shape: {batch_labels.shape}")
            print(f"Batch labels: {batch_labels}")
            break
    else:
        print("\nNo samples found. Please add audio files to:")
        print(f"  {Config.RAW_DATA_DIR}/wake/")
        print(f"  {Config.RAW_DATA_DIR}/non_wake/")
    
    print("\nDataset test completed!")
