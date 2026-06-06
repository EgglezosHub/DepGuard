from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="DEPGUARD_")

    npm_registry_url: str = "https://registry.npmjs.org"
    osv_api_url: str = "https://api.osv.dev/v1"

    cache_path: str = "./depguard_cache.db"
    cache_ttl_seconds: int = 60 * 60 * 24 * 7

    max_depth: int = 6
    max_nodes: int = 500

    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]

settings = Settings()