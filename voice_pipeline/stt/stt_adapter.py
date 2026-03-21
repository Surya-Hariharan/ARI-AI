from abc import ABC, abstractmethod

class STTAdapter(ABC):
    """Speech-to-text provider adapter interface"""
    
    @abstractmethod
    def transcribe(self, audio_buffer: bytes) -> str:
        pass

class WhisperSTTAdapter(STTAdapter):
    def transcribe(self, audio_buffer: bytes) -> str:
        # Placeholder for OpenAI Whisper API
        return "example transcript"
