from abc import ABC, abstractmethod

class TTSAdapter(ABC):
    """Text-to-speech adapter interface"""

    @abstractmethod
    def synthesize(self, text: str) -> bytes:
        pass

class ElevenLabsTTSAdapter(TTSAdapter):
    def synthesize(self, text: str) -> bytes:
        # Placeholder for ElevenLabs API
        return b"binary_audio_data"
