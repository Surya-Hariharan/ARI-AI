"""
Initialize professional folder structure for wake-word detection dataset.
Creates raw, processed, and metadata directories with class and speaker subfolders.
"""
from pathlib import Path

BASE_DIR = (Path(__file__).resolve().parent.parent / "data").resolve()
RAW_CLASSES = ["wake", "non_wake", "hard_negative", "noise"]
SPLITS = ["train", "val", "test"]
SPEAKER_DEFAULT = "speaker_01"

RAW_DIR = BASE_DIR / "raw"
PROCESSED_DIR = BASE_DIR / "processed"
METADATA_DIR = BASE_DIR / "metadata"
VERSION_FILE = BASE_DIR / "DATASET_VERSION.txt"

VERSION_CONTENT = """v0.1
- Initial dataset scaffold
- Multi-class setup
- No samples collected yet
"""

def create_dir(path: Path):
    if not path.exists():
        path.mkdir(parents=True, exist_ok=True)
        print(f"Created: {path}")
    else:
        print(f"Exists:  {path}")


def main():
    print("\nInitializing dataset structure...")
    # Safety check: ensure BASE_DIR is under project root
    project_root = Path(__file__).resolve().parent.parent
    if BASE_DIR.parent != project_root:
        raise RuntimeError(f"Base data directory not found at expected location: {BASE_DIR}. Check project root.")

    # Raw structure
    for cls in RAW_CLASSES:
        class_dir = RAW_DIR / cls
        speaker_dir = class_dir / SPEAKER_DEFAULT
        create_dir(speaker_dir)
    # Processed structure
    for split in SPLITS:
        split_dir = PROCESSED_DIR / split
        create_dir(split_dir)
    # Metadata
    create_dir(METADATA_DIR)
    # Version file
    if not VERSION_FILE.exists():
        VERSION_FILE.write_text(VERSION_CONTENT)
        print(f"Created: {VERSION_FILE}")
    else:
        print(f"Exists:  {VERSION_FILE}")
    print("\nDataset structure initialization complete.")

if __name__ == "__main__":
    main()
