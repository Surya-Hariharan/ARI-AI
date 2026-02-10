import os
from supabase import create_client, Client
from dotenv import load_dotenv
import logging

# Load environment variables
load_dotenv()

# Configure logging
logger = logging.getLogger("ari.db")

class SupabaseManager:
    _instance = None

    def __init__(self):
        self.client: Client = None
        self.is_connected = False
        self._initialize()

    def _initialize(self):
        url = os.getenv("SUPABASE_URL")
        key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

        if not url or not key:
            logger.warning("Supabase credentials missing. Running in DEGRADED mode.")
            return

        try:
            self.client = create_client(url, key)
            self.is_connected = True
            logger.info("Supabase client initialized successfully.")
        except Exception as e:
            logger.error(f"Failed to initialize Supabase client: {e}")
            self.is_connected = False

    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            cls._instance = SupabaseManager()
        return cls._instance

    def get_client(self) -> Client:
        return self.client

# Global instance
supabase_manager = SupabaseManager()

def get_supabase() -> Client:
    """
    Returns the Supabase client instance.
    Application logic should check if client is None or catch exceptions.
    """
    return supabase_manager.get_client()
