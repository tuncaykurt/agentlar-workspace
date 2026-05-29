from datetime import datetime, timedelta
from jose import JWTError, jwt
from passlib.context import CryptContext
from core.config import settings
from cryptography.fernet import Fernet
import base64
import hashlib

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Fernet icin 32-byte url-safe base64 key uret
_key_hash = hashlib.sha256(settings.SECRET_KEY.encode()).digest()
_fernet_key = base64.urlsafe_b64encode(_key_hash)
fernet = Fernet(_fernet_key)

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 gün


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return {}


def encrypt_string(text: str) -> str:
    if not text:
        return ""
    return fernet.encrypt(text.encode()).decode()


def decrypt_string(encrypted: str) -> str:
    if not encrypted:
        return ""
    return fernet.decrypt(encrypted.encode()).decode()
