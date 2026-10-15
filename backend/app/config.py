from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    mongodb_url: str = "mongodb://localhost:27017"
    mongodb_db: str = "pocketledger"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    groq_api_key: str = ""
    groq_model: str = "openai/gpt-oss-20b"
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()
