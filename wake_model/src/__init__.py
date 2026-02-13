"""
Wake-Word Detection System
A production-ready wake-word detection system using DS-CNN architecture.
"""

__version__ = "1.0.0"
__author__ = "Wake-Word Detection Team"

from .config import Config
from .model import DSCNN, create_model
from .dataset import WakeWordDataset
from .utils import set_seed, compute_metrics

__all__ = [
    'Config',
    'DSCNN',
    'create_model',
    'WakeWordDataset',
    'set_seed',
    'compute_metrics',
]
