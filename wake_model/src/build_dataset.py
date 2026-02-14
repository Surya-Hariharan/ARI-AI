"""
Professional dataset pipeline for wake-word detection (DS-CNN).
Processes raw audio, splits into train/val/test, and saves as WAV.
"""
import os
import shutil
import librosa
import numpy as np
import soundfile as sf
from pathlib import Path
from typing import List, Tuple, Dict
import random
from collections import Counter

# Constants
RAW_DIR = Path("data/raw")
PROCESSED_DIR = Path("data/processed")
SAMPLE_RATE = 16000
DURATION = 1.0  # seconds
SAMPLES = int(SAMPLE_RATE * DURATION)
SEED = 42

LABEL_MAP = {
    "positive": 1,
    "negative": 0,
    "hard_negative": 0,
    "noise": 0
}

SPLIT_RATIOS = (0.7, 0.15, 0.15)  # train, val, test


def preprocess_audio(filepath: Path) -> np.ndarray:
    """
    Load, resample, convert to mono, normalize, trim/pad to 1s.
    Returns float32 waveform of shape (SAMPLES,).
    """
    y, sr = librosa.load(filepath, sr=SAMPLE_RATE, mono=True)
    # Normalize
    if np.max(np.abs(y)) > 0:
        y = y / np.max(np.abs(y))
    # Pad or trim
    if len(y) > SAMPLES:
        y = y[:SAMPLES]
    elif len(y) < SAMPLES:
        y = np.pad(y, (0, SAMPLES - len(y)), mode='constant')
    return y.astype(np.float32)


def collect_files(raw_dir: Path) -> List[Tuple[Path, int, str]]:
    """
    Collect all audio files and assign labels.
    Returns list of (filepath, label, class_name).
    """
    files = []
    for class_name, label in LABEL_MAP.items():
        class_dir = raw_dir / class_name
        if not class_dir.exists():
            continue
        for ext in (".wav", ".mp3", ".flac", ".ogg", ".m4a"):
            for f in class_dir.glob(f"*{ext}"):
                files.append((f, label, class_name))
    return files


def split_dataset(files: List[Tuple[Path, int, str]], seed: int = SEED) -> Dict[str, List[Tuple[Path, int, str]]]:
    """
    Stratified split into train/val/test.
    Returns dict with keys 'train', 'val', 'test'.
    """
    random.seed(seed)
    # Group by label
    by_label = {}
    for f, label, cname in files:
        by_label.setdefault(label, []).append((f, label, cname))
    splits = {"train": [], "val": [], "test": []}
    for label, group in by_label.items():
        n = len(group)
        idx = list(range(n))
        random.shuffle(idx)
        n_train = int(n * SPLIT_RATIOS[0])
        n_val = int(n * SPLIT_RATIOS[1])
        n_test = n - n_train - n_val
        for i, j in enumerate(idx):
            if i < n_train:
                splits["train"].append(group[j])
            elif i < n_train + n_val:
                splits["val"].append(group[j])
            else:
                splits["test"].append(group[j])
    return splits


def save_wav(waveform: np.ndarray, out_path: Path):
    out_path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(out_path), waveform, SAMPLE_RATE, subtype='PCM_16')


def build_dataset():
    """
    Main pipeline: preprocess, split, save, log counts.
    """
    if PROCESSED_DIR.exists():
        shutil.rmtree(PROCESSED_DIR)
    files = collect_files(RAW_DIR)
    print(f"Found {len(files)} audio files.")
    splits = split_dataset(files, seed=SEED)
    for split, items in splits.items():
        print(f"\nProcessing {split} set ({len(items)} files):")
        class_counter = Counter()
        for src_path, label, class_name in items:
            y = preprocess_audio(src_path)
            # Save as WAV: data/processed/split/class_name/filename.wav
            out_dir = PROCESSED_DIR / split / class_name
            out_path = out_dir / (src_path.stem + ".wav")
            save_wav(y, out_path)
            class_counter[class_name] += 1
        for cname, count in class_counter.items():
            print(f"  {cname:15s}: {count}")
    print("\nDone. Processed data saved to:", PROCESSED_DIR)


if __name__ == "__main__":
    build_dataset()
