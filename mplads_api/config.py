import os
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(arbitrary_types_allowed=True)

    PROJECT_ROOT: Path = Path(__file__).resolve().parent.parent
    SHARED_ARTIFACT_DIR: Path = PROJECT_ROOT / "shared_preprocessing_artifacts"
    FEATURE1_ARTIFACT_DIR: Path = PROJECT_ROOT / "feature1_artifacts"
    FEATURE2_ARTIFACT_DIR: Path = PROJECT_ROOT / "feature2_artifacts"
    FEATURE3_ARTIFACT_DIR: Path = PROJECT_ROOT / "feature3_artifacts"
    FEATURE5_ARTIFACT_DIR: Path = PROJECT_ROOT / "feature5_artifacts"
    FEATURE7_ARTIFACT_DIR: Path = PROJECT_ROOT / "feature7_artifacts"

    API_TITLE: str = "MPLADS Risk Analytics API"
    API_VERSION: str = "1.0.0"
    API_KEY: str = os.getenv("MPLADS_API_KEY", "mplads-secret-key-2026")


settings = Settings()
