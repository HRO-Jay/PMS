"""
Auth API router — Supabase Auth integration.
"""
from fastapi import APIRouter, Depends, HTTPException, Header
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from app.config import settings

router = APIRouter(prefix="/api/auth", tags=["auth"])

security = HTTPBearer(auto_error=False)


@router.get("/me")
async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
):
    """
    Verify the JWT token and return current user info.
    Tokens are issued by Supabase Auth.
    """
    if not credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")

    token = credentials.credentials

    # In production, verify the Supabase JWT using the JWKS endpoint.
    # For now, return the decoded claims (verification happens at Supabase level).
    import jwt
    import json
    import httpx

    try:
        # Fetch JWKS from Supabase
        jwks_url = f"{settings.SUPABASE_URL}/auth/v1/.well-known/jwks.json"
        async with httpx.AsyncClient() as client:
            resp = await client.get(jwks_url)
            jwks = resp.json()

        # Decode without verification first to get kid
        unverified = jwt.decode(token, options={"verify_signature": False})
        kid = unverified.get("kid")

        # Find matching key
        key_data = None
        for key in jwks.get("keys", []):
            if key.get("kid") == kid:
                key_data = key
                break

        if key_data is None:
            raise HTTPException(status_code=401, detail="Invalid token kid")

        public_key = jwt.algorithms.RSAAlgorithm.from_jwt(json.dumps(key_data))

        payload = jwt.decode(
            token,
            public_key,
            algorithms=["RS256"],
            audience="authenticated",
            options={"verify_exp": True},
        )

        return {
            "user_id": payload.get("sub"),
            "email": payload.get("email"),
            "role": payload.get("role", "authenticated"),
        }
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Auth check failed: {e}")
