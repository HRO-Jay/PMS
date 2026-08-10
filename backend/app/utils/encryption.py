"""
AES-256 encryption for sensitive fields: bank_account, id_number.
Uses Fernet (AES-128-CBC + HMAC) from the cryptography library.

For AES-256 we use a 32-byte key.
"""
import base64
import hashlib
from cryptography.fernet import Fernet
from app.config import settings


def _derive_fernet_key(aes_key: str) -> bytes:
    """Derive a Fernet-compatible 32-byte URL-safe base64 key from our AES key."""
    key_bytes = hashlib.sha256(aes_key.encode()).digest()
    return base64.urlsafe_b64encode(key_bytes)


_cipher = None


def _get_cipher() -> Fernet:
    """Lazy-initialize the Fernet cipher."""
    global _cipher
    if _cipher is None:
        _cipher = Fernet(_derive_fernet_key(settings.AES_KEY))
    return _cipher


def encrypt_value(plaintext: str | None) -> bytes | None:
    """Encrypt a string value. Returns encrypted bytes or None."""
    if plaintext is None or plaintext == "":
        return None
    return _get_cipher().encrypt(plaintext.encode())


def decrypt_value(ciphertext: bytes | None) -> str | None:
    """Decrypt encrypted bytes back to a string. Returns None if input is None."""
    if ciphertext is None:
        return None
    return _get_cipher().decrypt(ciphertext).decode()


def mask_value(value: str | None, show_last: int = 4) -> str:
    """Mask a sensitive value, showing only the last N characters."""
    if not value:
        return ""
    if len(value) <= show_last:
        return "*" * len(value)
    return "*" * (len(value) - show_last) + value[-show_last:]
