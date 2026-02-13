"""
Utility functions for wake-word detection system.
Includes metrics computation, checkpointing, and helper utilities.
"""
import torch
import torch.nn as nn
import numpy as np
import random
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from sklearn.metrics import (
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    confusion_matrix
)

from config import Config


def set_seed(seed: int = Config.RANDOM_SEED) -> None:
    """
    Set random seed for reproducibility.
    
    Args:
        seed: Random seed value
    """
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    
    if torch.cuda.is_available():
        torch.cuda.manual_seed(seed)
        torch.cuda.manual_seed_all(seed)
        # Make CUDA operations deterministic
        torch.backends.cudnn.deterministic = True
        torch.backends.cudnn.benchmark = False
    
    print(f"Random seed set to {seed}")


def compute_metrics(
    y_true: List[int],
    y_pred: List[int]
) -> Dict[str, float]:
    """
    Compute classification metrics.
    
    Args:
        y_true: True labels
        y_pred: Predicted labels
    
    Returns:
        Dictionary containing accuracy, precision, recall, and F1 score
    """
    accuracy = accuracy_score(y_true, y_pred) * 100.0
    precision = precision_score(y_true, y_pred, average='binary', zero_division=0)
    recall = recall_score(y_true, y_pred, average='binary', zero_division=0)
    f1 = f1_score(y_true, y_pred, average='binary', zero_division=0)
    
    return {
        'accuracy': accuracy,
        'precision': precision,
        'recall': recall,
        'f1': f1
    }


def compute_confusion_matrix(
    y_true: List[int],
    y_pred: List[int]
) -> np.ndarray:
    """
    Compute confusion matrix.
    
    Args:
        y_true: True labels
        y_pred: Predicted labels
    
    Returns:
        Confusion matrix as numpy array
        [[TN, FP],
         [FN, TP]]
    """
    cm = confusion_matrix(y_true, y_pred)
    return cm


def compute_far_frr(
    y_true: List[int],
    y_pred: List[int]
) -> Tuple[float, float]:
    """
    Compute False Acceptance Rate (FAR) and False Rejection Rate (FRR).
    
    FAR: Rate of incorrectly accepting non-wake as wake (FP / (FP + TN))
    FRR: Rate of incorrectly rejecting wake as non-wake (FN / (FN + TP))
    
    Args:
        y_true: True labels (1 for wake, 0 for non-wake)
        y_pred: Predicted labels
    
    Returns:
        Tuple of (FAR, FRR)
    """
    cm = compute_confusion_matrix(y_true, y_pred)
    
    # Confusion matrix:
    # [[TN, FP],
    #  [FN, TP]]
    
    tn, fp, fn, tp = cm.ravel()
    
    # False Acceptance Rate (False Positive Rate)
    far = fp / (fp + tn) if (fp + tn) > 0 else 0.0
    
    # False Rejection Rate (False Negative Rate)
    frr = fn / (fn + tp) if (fn + tp) > 0 else 0.0
    
    return far, frr


def print_confusion_matrix(
    y_true: List[int],
    y_pred: List[int],
    class_names: Optional[List[str]] = None
) -> None:
    """
    Print confusion matrix in a readable format.
    
    Args:
        y_true: True labels
        y_pred: Predicted labels
        class_names: Optional list of class names
    """
    if class_names is None:
        class_names = ['Non-Wake', 'Wake']
    
    cm = compute_confusion_matrix(y_true, y_pred)
    
    print("\nConfusion Matrix:")
    print("=" * 40)
    print(f"                Predicted")
    print(f"              {class_names[0]:>12} {class_names[1]:>12}")
    print(f"Actual")
    print(f"{class_names[0]:>12}  {cm[0, 0]:>12d} {cm[0, 1]:>12d}")
    print(f"{class_names[1]:>12}  {cm[1, 0]:>12d} {cm[1, 1]:>12d}")
    print("=" * 40)
    
    # Compute FAR and FRR
    far, frr = compute_far_frr(y_true, y_pred)
    print(f"False Acceptance Rate (FAR): {far:.4f} ({far * 100:.2f}%)")
    print(f"False Rejection Rate (FRR): {frr:.4f} ({frr * 100:.2f}%)")
    print("=" * 40)


class EarlyStopping:
    """Early stopping to stop training when validation metric stops improving."""
    
    def __init__(
        self,
        patience: int = Config.EARLY_STOPPING_PATIENCE,
        mode: str = 'min',
        min_delta: float = 0.0
    ):
        """
        Initialize early stopping.
        
        Args:
            patience: Number of epochs to wait before stopping
            mode: 'min' for loss (lower is better), 'max' for accuracy (higher is better)
            min_delta: Minimum change to qualify as improvement
        """
        self.patience = patience
        self.mode = mode
        self.min_delta = min_delta
        self.counter = 0
        self.best_value = None
        self.early_stop = False
    
    def __call__(self, current_value: float) -> bool:
        """
        Check if training should stop.
        
        Args:
            current_value: Current validation metric value
        
        Returns:
            True if training should stop, False otherwise
        """
        if self.best_value is None:
            self.best_value = current_value
            return False
        
        if self.mode == 'min':
            improved = current_value < (self.best_value - self.min_delta)
        else:  # mode == 'max'
            improved = current_value > (self.best_value + self.min_delta)
        
        if improved:
            self.best_value = current_value
            self.counter = 0
        else:
            self.counter += 1
            if self.counter >= self.patience:
                self.early_stop = True
                return True
        
        return False


def save_checkpoint(
    model: nn.Module,
    optimizer: torch.optim.Optimizer,
    epoch: int,
    loss: float,
    accuracy: float,
    filepath: Path,
    additional_info: Optional[Dict] = None
) -> None:
    """
    Save model checkpoint.
    
    Args:
        model: PyTorch model
        optimizer: Optimizer
        epoch: Current epoch
        loss: Current loss
        accuracy: Current accuracy
        filepath: Path to save checkpoint
        additional_info: Optional dictionary with additional information
    """
    checkpoint = {
        'epoch': epoch,
        'model_state_dict': model.state_dict(),
        'optimizer_state_dict': optimizer.state_dict(),
        'loss': loss,
        'accuracy': accuracy,
    }
    
    if additional_info is not None:
        checkpoint.update(additional_info)
    
    torch.save(checkpoint, filepath)


def load_checkpoint(
    filepath: Path,
    model: nn.Module,
    optimizer: Optional[torch.optim.Optimizer] = None,
    device: str = 'cpu'
) -> Dict:
    """
    Load model checkpoint.
    
    Args:
        filepath: Path to checkpoint file
        model: Model to load state into
        optimizer: Optional optimizer to load state into
        device: Device to load model on
    
    Returns:
        Checkpoint dictionary
    """
    checkpoint = torch.load(filepath, map_location=device)
    
    model.load_state_dict(checkpoint['model_state_dict'])
    
    if optimizer is not None and 'optimizer_state_dict' in checkpoint:
        optimizer.load_state_dict(checkpoint['optimizer_state_dict'])
    
    print(f"Loaded checkpoint from epoch {checkpoint['epoch']}")
    print(f"  Loss: {checkpoint['loss']:.4f}")
    print(f"  Accuracy: {checkpoint['accuracy']:.2f}%")
    
    return checkpoint


def count_parameters(model: nn.Module) -> Tuple[int, int]:
    """
    Count total and trainable parameters in a model.
    
    Args:
        model: PyTorch model
    
    Returns:
        Tuple of (total_params, trainable_params)
    """
    total_params = sum(p.numel() for p in model.parameters())
    trainable_params = sum(p.numel() for p in model.parameters() if p.requires_grad)
    return total_params, trainable_params


def calculate_model_size(model: nn.Module, dtype: str = 'fp32') -> float:
    """
    Calculate model size in megabytes.
    
    Args:
        model: PyTorch model
        dtype: Data type ('fp32', 'fp16', 'int8')
    
    Returns:
        Model size in MB
    """
    total_params, _ = count_parameters(model)
    
    # Bytes per parameter based on dtype
    bytes_per_param = {
        'fp32': 4,
        'fp16': 2,
        'int8': 1
    }
    
    bytes_total = total_params * bytes_per_param.get(dtype, 4)
    size_mb = bytes_total / (1024 ** 2)
    
    return size_mb


def quantize_model(model: nn.Module) -> nn.Module:
    """
    Apply post-training dynamic quantization to reduce model size.
    
    Args:
        model: PyTorch model (FP32)
    
    Returns:
        Quantized model (INT8)
    """
    # Dynamic quantization (CPU only, good for embedded deployment)
    quantized_model = torch.quantization.quantize_dynamic(
        model,
        {nn.Linear, nn.Conv2d},  # Layers to quantize
        dtype=torch.qint8
    )
    
    return quantized_model


def get_device_info() -> Dict[str, str]:
    """
    Get information about available compute devices.
    
    Returns:
        Dictionary with device information
    """
    info = {
        'cuda_available': torch.cuda.is_available(),
        'cuda_version': torch.version.cuda if torch.cuda.is_available() else None,
        'device_count': torch.cuda.device_count() if torch.cuda.is_available() else 0,
    }
    
    if torch.cuda.is_available():
        info['device_name'] = torch.cuda.get_device_name(0)
        info['device_capability'] = torch.cuda.get_device_capability(0)
    
    return info


class AverageMeter:
    """Computes and stores the average and current value."""
    
    def __init__(self):
        self.reset()
    
    def reset(self):
        """Reset all statistics."""
        self.val = 0
        self.avg = 0
        self.sum = 0
        self.count = 0
    
    def update(self, val: float, n: int = 1):
        """
        Update statistics.
        
        Args:
            val: New value
            n: Number of samples this value represents
        """
        self.val = val
        self.sum += val * n
        self.count += n
        self.avg = self.sum / self.count if self.count > 0 else 0


if __name__ == "__main__":
    # Test utility functions
    print("Testing utility functions...")
    
    # Test seed setting
    set_seed(42)
    
    # Test metrics computation
    y_true = [0, 0, 1, 1, 0, 1, 1, 0]
    y_pred = [0, 0, 1, 0, 0, 1, 1, 1]
    
    print("\nTesting metrics computation...")
    metrics = compute_metrics(y_true, y_pred)
    print(f"Metrics: {metrics}")
    
    print_confusion_matrix(y_true, y_pred)
    
    # Test FAR/FRR
    far, frr = compute_far_frr(y_true, y_pred)
    print(f"\nFAR: {far:.4f}, FRR: {frr:.4f}")
    
    # Test early stopping
    print("\nTesting early stopping...")
    early_stopping = EarlyStopping(patience=3, mode='max')
    values = [0.8, 0.85, 0.83, 0.84, 0.82, 0.81]
    for i, val in enumerate(values):
        if early_stopping(val):
            print(f"  Early stopping triggered at iteration {i + 1}")
            break
        print(f"  Iteration {i + 1}: {val:.2f}, Counter: {early_stopping.counter}")
    
    # Test device info
    print("\nDevice information:")
    device_info = get_device_info()
    for key, value in device_info.items():
        print(f"  {key}: {value}")
    
    print("\nAll utility tests completed!")
