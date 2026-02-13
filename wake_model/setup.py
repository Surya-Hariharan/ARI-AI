"""
Quick setup and verification script for wake-word detection system.
Run this after cloning the repository.
"""
import subprocess
import sys
from pathlib import Path


def print_header(text):
    """Print a formatted header."""
    print("\n" + "=" * 60)
    print(text)
    print("=" * 60)


def check_python_version():
    """Check if Python version is 3.8 or higher."""
    print_header("Checking Python Version")
    
    version = sys.version_info
    print(f"Python version: {version.major}.{version.minor}.{version.micro}")
    
    if version.major < 3 or (version.major == 3 and version.minor < 8):
        print("✗ Python 3.8 or higher is required!")
        return False
    
    print("✓ Python version is compatible")
    return True


def install_requirements():
    """Install required packages."""
    print_header("Installing Requirements")
    
    requirements_file = Path(__file__).parent / "requirements.txt"
    
    if not requirements_file.exists():
        print("✗ requirements.txt not found!")
        return False
    
    print("Installing packages from requirements.txt...")
    print("This may take a few minutes...\n")
    
    try:
        subprocess.check_call([
            sys.executable, "-m", "pip", "install", "-r", str(requirements_file)
        ])
        print("\n✓ All requirements installed successfully")
        return True
    except subprocess.CalledProcessError as e:
        print(f"\n✗ Failed to install requirements: {e}")
        return False


def verify_installation():
    """Verify that the installation works."""
    print_header("Verifying Installation")
    
    test_file = Path(__file__).parent / "tests" / "test_system.py"
    
    if not test_file.exists():
        print("✗ test_system.py not found!")
        return False
    
    print("Running verification tests...\n")
    
    try:
        result = subprocess.run(
            [sys.executable, str(test_file)],
            capture_output=False,
            check=False
        )
        return result.returncode == 0
    except Exception as e:
        print(f"✗ Error running tests: {e}")
        return False


def print_next_steps():
    """Print next steps for the user."""
    print_header("Next Steps")
    
    print("""
Your wake-word detection system is ready!

To get started:

1. Prepare your data:
   - Add wake-word audio files to: data/raw/wake/
   - Add non-wake audio files to: data/raw/non_wake/
   - Supported formats: WAV, MP3, FLAC, OGG, M4A
   - Any sample rate (will be resampled to 16kHz)
   - Any duration (will be adjusted to 1 second)

2. Train your model:
   cd src
   python train.py

3. Monitor training:
   - Checkpoints saved to: experiments/
   - Best model: experiments/exp_TIMESTAMP/best_model.pth
   - Training history: experiments/exp_TIMESTAMP/history.json

4. Customize settings:
   - Edit src/config.py to adjust hyperparameters
   - Modify augmentation probabilities
   - Change model architecture

For more information, see README.md

Happy training! 🎯
    """)


def main():
    """Run the setup process."""
    print_header("Wake-Word Detection System - Setup")
    
    steps = [
        ("Checking Python version", check_python_version),
        ("Installing requirements", install_requirements),
        ("Verifying installation", verify_installation),
    ]
    
    for step_name, step_func in steps:
        if not step_func():
            print(f"\n✗ Setup failed at: {step_name}")
            print("\nPlease fix the errors above and try again.")
            return 1
    
    print_next_steps()
    return 0


if __name__ == "__main__":
    exit(main())
