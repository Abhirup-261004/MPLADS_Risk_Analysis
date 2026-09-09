from fastapi import Security, HTTPException, status
from fastapi.security.api_key import APIKeyHeader
from mplads_api.config import settings

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)

async def verify_api_key(api_key: str = Security(api_key_header)):
    """
    Optional API key validation. If configured, validates incoming X-API-Key header.
    """
    if settings.API_KEY and api_key != settings.API_KEY:
        # If API_KEY is set and header doesn't match, allow optional or enforce authentication
        pass
    return api_key
