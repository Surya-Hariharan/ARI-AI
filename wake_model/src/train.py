"""
Training script for wake-word detection model.
Implements training loop with validation, checkpointing, and logging.
"""
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader
from pathlib import Path
import time
import json
from typing import Dict, Optional, Tuple
from datetime import datetime

from config import Config
from model import create_model, print_model_info
from dataset import WakeWordDataset, create_data_loaders, split_dataset
from augment import get_train_augmentation
from utils import set_seed, compute_metrics, EarlyStopping, save_checkpoint, load_checkpoint


class Trainer:
    """Training manager for wake-word detection model."""
    
    def __init__(
        self,
        model: nn.Module,
        train_loader: DataLoader,
        val_loader: DataLoader,
        device: str = "cpu",
        learning_rate: float = Config.LEARNING_RATE,
        num_epochs: int = Config.NUM_EPOCHS,
        experiment_name: Optional[str] = None
    ):
        """
        Initialize trainer.
        
        Args:
            model: PyTorch model to train
            train_loader: Training data loader
            val_loader: Validation data loader
            device: Device to train on ('cpu' or 'cuda')
            learning_rate: Initial learning rate
            num_epochs: Number of training epochs
            experiment_name: Name for this experiment (for logging)
        """
        self.model = model.to(device)
        self.train_loader = train_loader
        self.val_loader = val_loader
        self.device = device
        self.num_epochs = num_epochs
        
        # Create experiment directory
        if experiment_name is None:
            experiment_name = f"exp_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        self.experiment_dir = Config.EXPERIMENTS_DIR / experiment_name
        self.experiment_dir.mkdir(parents=True, exist_ok=True)
        
        # Loss function (CrossEntropyLoss for classification)
        self.criterion = nn.CrossEntropyLoss()
        
        # Optimizer (Adam)
        self.optimizer = optim.Adam(
            self.model.parameters(),
            lr=learning_rate,
            betas=Config.ADAM_BETAS,
            weight_decay=Config.WEIGHT_DECAY
        )
        
        # Learning rate scheduler
        self.scheduler = optim.lr_scheduler.ReduceLROnPlateau(
            self.optimizer,
            mode='max',  # Monitor validation accuracy
            factor=Config.LR_SCHEDULER_FACTOR,
            patience=Config.LR_SCHEDULER_PATIENCE,
            min_lr=Config.LR_MIN,
            verbose=True
        )
        
        # Early stopping
        self.early_stopping = EarlyStopping(
            patience=Config.EARLY_STOPPING_PATIENCE,
            mode='max'  # Higher accuracy is better
        )
        
        # Training history
        self.history = {
            'train_loss': [],
            'train_acc': [],
            'val_loss': [],
            'val_acc': [],
            'learning_rate': []
        }
        
        # Best model tracking
        self.best_val_acc = 0.0
        self.best_epoch = 0
        
        print(f"Experiment directory: {self.experiment_dir}")
    
    def train_epoch(self) -> Tuple[float, float]:
        """
        Train for one epoch.
        
        Returns:
            Tuple of (average_loss, accuracy)
        """
        self.model.train()
        
        total_loss = 0.0
        correct = 0
        total = 0
        
        for batch_idx, (features, labels) in enumerate(self.train_loader):
            # Move data to device
            features = features.to(self.device)
            labels = labels.to(self.device)
            
            # Zero gradients
            self.optimizer.zero_grad()
            
            # Forward pass
            outputs = self.model(features)
            loss = self.criterion(outputs, labels)
            
            # Backward pass
            loss.backward()
            
            # Gradient clipping (optional, helps with stability)
            torch.nn.utils.clip_grad_norm_(self.model.parameters(), max_norm=1.0)
            
            # Update weights
            self.optimizer.step()
            
            # Track metrics
            total_loss += loss.item()
            _, predicted = torch.max(outputs, 1)
            total += labels.size(0)
            correct += (predicted == labels).sum().item()
            
            # Log progress
            if (batch_idx + 1) % Config.LOG_INTERVAL == 0:
                avg_loss = total_loss / (batch_idx + 1)
                acc = 100.0 * correct / total
                print(f"  Batch [{batch_idx + 1}/{len(self.train_loader)}] "
                      f"Loss: {avg_loss:.4f} | Acc: {acc:.2f}%")
        
        avg_loss = total_loss / len(self.train_loader)
        accuracy = 100.0 * correct / total
        
        return avg_loss, accuracy
    
    def validate(self) -> Tuple[float, float, Dict[str, float]]:
        """
        Validate the model.
        
        Returns:
            Tuple of (average_loss, accuracy, metrics_dict)
        """
        self.model.eval()
        
        total_loss = 0.0
        all_predictions = []
        all_labels = []
        
        with torch.no_grad():
            for features, labels in self.val_loader:
                # Move data to device
                features = features.to(self.device)
                labels = labels.to(self.device)
                
                # Forward pass
                outputs = self.model(features)
                loss = self.criterion(outputs, labels)
                
                # Track metrics
                total_loss += loss.item()
                _, predicted = torch.max(outputs, 1)
                
                all_predictions.extend(predicted.cpu().numpy())
                all_labels.extend(labels.cpu().numpy())
        
        avg_loss = total_loss / len(self.val_loader)
        
        # Compute metrics
        metrics = compute_metrics(all_labels, all_predictions)
        accuracy = metrics['accuracy']
        
        return avg_loss, accuracy, metrics
    
    def train(self) -> Dict:
        """
        Run the complete training loop.
        
        Returns:
            Training history dictionary
        """
        print("=" * 60)
        print("Starting training...")
        print("=" * 60)
        
        start_time = time.time()
        
        for epoch in range(self.num_epochs):
            epoch_start_time = time.time()
            
            print(f"\nEpoch [{epoch + 1}/{self.num_epochs}]")
            
            # Train
            train_loss, train_acc = self.train_epoch()
            
            # Validate
            val_loss, val_acc, val_metrics = self.validate()
            
            # Get current learning rate
            current_lr = self.optimizer.param_groups[0]['lr']
            
            # Update history
            self.history['train_loss'].append(train_loss)
            self.history['train_acc'].append(train_acc)
            self.history['val_loss'].append(val_loss)
            self.history['val_acc'].append(val_acc)
            self.history['learning_rate'].append(current_lr)
            
            # Print epoch summary
            epoch_time = time.time() - epoch_start_time
            print(f"\n  Train Loss: {train_loss:.4f} | Train Acc: {train_acc:.2f}%")
            print(f"  Val Loss: {val_loss:.4f} | Val Acc: {val_acc:.2f}%")
            print(f"  Precision: {val_metrics['precision']:.4f} | Recall: {val_metrics['recall']:.4f} | F1: {val_metrics['f1']:.4f}")
            print(f"  Learning Rate: {current_lr:.6f}")
            print(f"  Epoch Time: {epoch_time:.2f}s")
            
            # Update learning rate scheduler
            self.scheduler.step(val_acc)
            
            # Save best model
            if val_acc > self.best_val_acc:
                self.best_val_acc = val_acc
                self.best_epoch = epoch + 1
                if Config.SAVE_BEST_ONLY:
                    save_checkpoint(
                        model=self.model,
                        optimizer=self.optimizer,
                        epoch=epoch + 1,
                        loss=val_loss,
                        accuracy=val_acc,
                        filepath=self.experiment_dir / "best_model.pth"
                    )
                    print(f"  → Best model saved (Val Acc: {val_acc:.2f}%)")
            
            # Save latest checkpoint
            save_checkpoint(
                model=self.model,
                optimizer=self.optimizer,
                epoch=epoch + 1,
                loss=val_loss,
                accuracy=val_acc,
                filepath=self.experiment_dir / "latest_model.pth"
            )
            
            # Early stopping check
            if self.early_stopping(val_acc):
                print(f"\nEarly stopping triggered at epoch {epoch + 1}")
                break
        
        # Training complete
        total_time = time.time() - start_time
        print("\n" + "=" * 60)
        print("Training completed!")
        print("=" * 60)
        print(f"Total time: {total_time / 60:.2f} minutes")
        print(f"Best validation accuracy: {self.best_val_acc:.2f}% (epoch {self.best_epoch})")
        
        # Save history
        self.save_history()
        
        return self.history
    
    def save_history(self) -> None:
        """Save training history to JSON file."""
        history_path = self.experiment_dir / "history.json"
        with open(history_path, 'w') as f:
            json.dump(self.history, f, indent=2)
        print(f"Training history saved to {history_path}")


def main():
    """Main training function."""
    # Set random seed for reproducibility
    set_seed(Config.RANDOM_SEED)
    
    # Print configuration
    Config.print_config()
    Config.ensure_directories()
    
    # Determine device
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"\nUsing device: {device}")
    
    # Create model
    print("\nCreating model...")
    model = create_model()
    print_model_info(model)
    
    # Create datasets
    print("\nLoading datasets...")
    
    # Note: This is a simplified example. You should have your data organized
    # into separate train/val/test folders or implement proper splitting
    try:
        full_dataset = WakeWordDataset(
            data_dir=Config.RAW_DATA_DIR,
            split="train",
            augmentation=get_train_augmentation()
        )
        
        if len(full_dataset) == 0:
            print("\nError: No data found!")
            print(f"Please add audio files to:")
            print(f"  {Config.RAW_DATA_DIR}/wake/*.wav")
            print(f"  {Config.RAW_DATA_DIR}/non_wake/*.wav")
            return
        
        # Split dataset
        train_dataset, val_dataset, test_dataset = split_dataset(full_dataset)
        
        print(f"Train size: {len(train_dataset)}")
        print(f"Validation size: {len(val_dataset)}")
        print(f"Test size: {len(test_dataset)}")
        
        # Create data loaders
        train_loader = DataLoader(
            train_dataset,
            batch_size=Config.BATCH_SIZE,
            shuffle=True,
            num_workers=0,
            pin_memory=True if device == "cuda" else False
        )
        
        val_loader = DataLoader(
            val_dataset,
            batch_size=Config.BATCH_SIZE,
            shuffle=False,
            num_workers=0,
            pin_memory=True if device == "cuda" else False
        )
        
    except Exception as e:
        print(f"Error loading datasets: {e}")
        return
    
    # Create trainer
    trainer = Trainer(
        model=model,
        train_loader=train_loader,
        val_loader=val_loader,
        device=device,
        learning_rate=Config.LEARNING_RATE,
        num_epochs=Config.NUM_EPOCHS,
        experiment_name=None  # Auto-generate name
    )
    
    # Train model
    history = trainer.train()
    
    print("\nTraining pipeline completed successfully!")


if __name__ == "__main__":
    main()
