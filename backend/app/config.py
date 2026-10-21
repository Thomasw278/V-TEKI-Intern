from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "KarbonLens API"
    # Format: mysql+pymysql://USER:PASSWORD@HOST:PORT/NAMA_DB?charset=utf8mb4
    database_url: str = "mysql+pymysql://karbon:karbon@localhost:3306/karbonlens?charset=utf8mb4"
    jwt_secret: str = "ganti-dengan-string-acak-panjang"
    jwt_expire_hours: int = 12
    storage_dir: Path = Path("./storage")
    max_upload_mb: int = 50
    # Pisahkan dengan koma, mis. "http://localhost:3000,http://127.0.0.1:3000"
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"
    # Lokasi tesseract.exe bila tidak ada di PATH (Windows), mis. C:\\Program Files\\Tesseract-OCR\\tesseract.exe
    tesseract_cmd: str = ""

    @property
    def cors_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
