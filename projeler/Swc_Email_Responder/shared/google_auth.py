"""
🔐 Antigravity — Merkezi Google OAuth Yardımcısı
===================================================
Bu modül, tüm projelerde Google API erişimi sağlar.
Token'lar merkezi depoda saklanır ve otomatik yenilenir.

Desteklenen ortamlar:
  - Lokal (Mac): _knowledge/credentials/oauth/ dizinindeki token dosyaları
  - Railway/Cloud: GOOGLE_OUTREACH_TOKEN_JSON veya GOOGLE_SWC_TOKEN_JSON
    environment variable'larından JSON string olarak okunur

Kullanım:
    from google_auth import get_gmail_service, get_sheets_service, get_drive_service

    # Outreach hesabı (EMAIL_ADRESI_BURAYA)
    gmail = get_gmail_service("outreach")
    sheets = get_sheets_service("outreach")
    drive = get_drive_service("outreach")

    # Sweatcoin hesabı (EMAIL_ADRESI_BURAYA)
    gmail = get_gmail_service("swc")
    sheets = get_sheets_service("swc")

Token dosyaları:
    _knowledge/credentials/oauth/gmail-outreach-token.json
    _knowledge/credentials/oauth/gmail-ek-hesap-token.json
"""

import os
import json
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

# Merkezi token deposu dizini
OAUTH_DIR = os.path.dirname(os.path.abspath(__file__))

# Hesap → token dosyası eşlemesi
TOKEN_FILES = {
    "outreach": "gmail-outreach-token.json",
    "swc": "gmail-ek-hesap-token.json",
    "[isim]_ai": "gmail-[isim]-ai-token.json",
}

# Hesap → Railway environment variable eşlemesi
TOKEN_ENV_VARS = {
    "outreach": "GOOGLE_OUTREACH_TOKEN_JSON",
    "swc": "GOOGLE_SWC_TOKEN_JSON",
    "[isim]_ai": "GOOGLE_OUTREACH_TOKEN_JSON",
}

ALL_SCOPES = [
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/spreadsheets',
]


def _get_credentials(account: str = "outreach") -> Credentials:
    """
    Merkezi token deposundan credentials al ve gerekirse yenile.
    
    Öncelik sırası:
      1. Lokal dosya: _knowledge/credentials/oauth/gmail-{account}-token.json
      2. Environment variable: GOOGLE_{ACCOUNT}_TOKEN_JSON (Railway/Cloud)

    Args:
        account: "outreach" (EMAIL_ADRESI_BURAYA) veya "swc" (EMAIL_ADRESI_BURAYA)

    Returns:
        Geçerli Google OAuth Credentials objesi

    Raises:
        FileNotFoundError: Token ne dosyada ne env'de bulunamazsa
        ValueError: Bilinmeyen hesap adı
    """
    if account not in TOKEN_FILES:
        raise ValueError(
            f"Bilinmeyen hesap: '{account}'. "
            f"Geçerli hesaplar: {', '.join(TOKEN_FILES.keys())}"
        )

    token_path = os.path.join(OAUTH_DIR, TOKEN_FILES[account])
    env_var = TOKEN_ENV_VARS[account]
    loaded_from = None

    # 1) Lokal dosyadan oku
    if os.path.exists(token_path):
        creds = Credentials.from_authorized_user_file(token_path, ALL_SCOPES)
        loaded_from = "file"
    # 2) Environment variable'dan oku (Railway/Cloud)
    elif os.environ.get(env_var):
        token_json = json.loads(os.environ[env_var])
        creds = Credentials.from_authorized_user_info(token_json, ALL_SCOPES)
        loaded_from = "env"
    else:
        raise FileNotFoundError(
            f"Token bulunamadı: Ne dosya ({token_path}) ne de env ({env_var}) mevcut.\n"
            f"Lokal çözüm: cd {OAUTH_DIR} && python3 auth_helper.py {account}\n"
            f"Railway çözüm: {env_var} env variable'ını token JSON'ı ile set et."
        )

    # Token süresi dolmuşsa otomatik yenile
    if not creds.valid:
        if creds.expired and creds.refresh_token:
            creds.refresh(Request())
            # Yenilenen token'ı kaydet (sadece dosya varsa)
            if loaded_from == "file":
                _save_token(creds, token_path)
        else:
            raise RuntimeError(
                f"Token geçersiz ve yenilenemiyor. "
                f"Çözüm: cd {OAUTH_DIR} && python3 auth_helper.py {account}"
            )

    return creds


def _save_token(creds: Credentials, token_path: str):
    """Yenilenen token'ı dosyaya kaydet."""
    token_data = {
        "token": creds.token,
        "refresh_token": creds.refresh_token,
        "token_uri": creds.token_uri,
        "client_id": creds.client_id,
        "client_secret": creds.client_secret,
        "scopes": list(creds.scopes) if creds.scopes else ALL_SCOPES,
        "universe_domain": "googleapis.com",
        "account": "",
        "expiry": creds.expiry.isoformat() + "Z" if creds.expiry else None,
    }
    with open(token_path, 'w') as f:
        json.dump(token_data, f, indent=2)


def get_gmail_service(account: str = "outreach"):
    """Gmail API service objesi döndür."""
    return build('gmail', 'v1', credentials=_get_credentials(account))


def get_sheets_service(account: str = "outreach"):
    """Google Sheets API service objesi döndür."""
    return build('sheets', 'v4', credentials=_get_credentials(account))


def get_drive_service(account: str = "outreach"):
    """Google Drive API service objesi döndür."""
    return build('drive', 'v3', credentials=_get_credentials(account))


# ─── Kısa yol fonksiyonlar ───────────────────────────────────

def gmail_outreach():
    """EMAIL_ADRESI_BURAYA Gmail service — kısa yol."""
    return get_gmail_service("outreach")


def gmail_swc():
    """EMAIL_ADRESI_BURAYA Gmail service — kısa yol."""
    return get_gmail_service("swc")


def sheets_outreach():
    """EMAIL_ADRESI_BURAYA Sheets service — kısa yol."""
    return get_sheets_service("outreach")


def sheets_swc():
    """EMAIL_ADRESI_BURAYA Sheets service — kısa yol."""
    return get_sheets_service("swc")


def gmail_[isim]_ai():
    """EMAIL_ADRESI_BURAYA Gmail service — kısa yol."""
    return get_gmail_service("[isim]_ai")


def sheets_[isim]_ai():
    """EMAIL_ADRESI_BURAYA Sheets service — kısa yol."""
    return get_sheets_service("[isim]_ai")


def drive_[isim]_ai():
    """EMAIL_ADRESI_BURAYA Drive service — kısa yol."""
    return get_drive_service("[isim]_ai")


if __name__ == "__main__":
    # Quick test
    print("🔍 Google Auth merkezi modül testi...\n")
    for acc in TOKEN_FILES:
        try:
            creds = _get_credentials(acc)
            print(f"  ✅ {acc}: Token geçerli")
            print(f"     Scopes: {len(creds.scopes)} izin")
            print(f"     Expiry: {creds.expiry}")
        except Exception as e:
            print(f"  ❌ {acc}: {e}")
        print()
