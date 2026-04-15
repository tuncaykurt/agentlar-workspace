#!/usr/bin/env python3
"""
🏥 Antigravity — Kapsamlı Sağlık Kontrolü (Credential Health Checker)
=====================================================================
Tüm bağlı servislerin bağlantı sağlığını kontrol eder ve sorun varsa
Email → Telegram fallback ile bildirim gönderir.

Kontrol kapsamı:
  1. 🔐 Google OAuth Token'ları (3 hesap: outreach, swc, [isim]_ai)
  2. 🤖 Telegram Bot bağlantısı
  3. 📋 Notion API bağlantısı
  4. 🚀 Railway API bağlantısı
  5. 📧 SMTP (hata bildirimi) bağlantısı

Kullanım:
    # Tüm kontrolleri çalıştır (modül olarak)
    from credential_health_checker import run_full_health_check

    # Komut satırından
    python3 credential_health_checker.py              # Tüm kontroller
    python3 credential_health_checker.py --dry-run    # Bildirim göndermez
    python3 credential_health_checker.py --verbose    # Detaylı çıktı
"""

import os
import sys
import json
import ssl
import smtplib
import urllib.request
import urllib.error
import traceback
from datetime import datetime, timezone, timedelta
from pathlib import Path

# ── Yol Sabitleri ────────────────────────────────────────
SCRIPT_DIR = Path(__file__).resolve().parent
# shared/ klasöründen iki seviye yukarı → Projeler/Swc_Email_Responder
# Eğer Projeler dışında çalıştırılıyorsa fallback
# NOT: Railway'de yol /app/shared/ olduğu için parents[2] IndexError verir.
#      Bu yüzden güvenli parent erişimi kullanıyoruz.
ANTIGRAVITY_ROOT = None
_parent_candidates = [p for i, p in enumerate(SCRIPT_DIR.parents) if i < 4]
_all_candidates = _parent_candidates + [Path.home() / "Desktop" / "Antigravity"]
for candidate in _all_candidates:
    if (candidate / "_knowledge" / "credentials").exists():
        ANTIGRAVITY_ROOT = candidate
        break

if not ANTIGRAVITY_ROOT:
    ANTIGRAVITY_ROOT = Path.home() / "Desktop" / "Antigravity"

MASTER_ENV = ANTIGRAVITY_ROOT / "_knowledge" / "credentials" / "master.env"
OAUTH_DIR = ANTIGRAVITY_ROOT / "_knowledge" / "credentials" / "oauth"

# ── Hesap tanımları ──────────────────────────────────────
GOOGLE_ACCOUNTS = {
    "outreach": {
        "email": "EMAIL_ADRESI_BURAYA",
        "token_file": "gmail-outreach-token.json",
        "env_var": "GOOGLE_OUTREACH_TOKEN_JSON",
    },
    "swc": {
        "email": "EMAIL_ADRESI_BURAYA",
        "token_file": "gmail-ek-hesap-token.json",
        "env_var": "GOOGLE_SWC_TOKEN_JSON",
    },
    "[isim]_ai": {
        "email": "EMAIL_ADRESI_BURAYA",
        "token_file": "gmail-[isim]-ai-token.json",
        "env_var": "GOOGLE_OUTREACH_TOKEN_JSON",
    },
}


# ══════════════════════════════════════════════════════════
# ██  YARDIMCI FONKSİYONLAR
# ══════════════════════════════════════════════════════════

def _load_env_value(key: str, default: str = "") -> str:
    """Environment veya master.env'den değer okur."""
    val = os.environ.get(key)
    if val:
        return val
    try:
        if MASTER_ENV.exists():
            for line in MASTER_ENV.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if line.startswith(f"{key}="):
                    return line.split("=", 1)[1]
    except Exception:
        pass
    return default


def _ssl_context():
    """SSL context oluşturur."""
    ctx = ssl.create_default_context()
    try:
        urllib.request.urlopen("https://google.com", timeout=5, context=ctx)
        return ctx
    except Exception:
        return ssl._create_unverified_context()


_ssl_ctx = None


def _get_ssl_ctx():
    global _ssl_ctx
    if _ssl_ctx is None:
        _ssl_ctx = _ssl_context()
    return _ssl_ctx


# ══════════════════════════════════════════════════════════
# ██  KONTROL FONKSİYONLARI
# ══════════════════════════════════════════════════════════

def check_google_token(account_name: str, account_info: dict) -> dict:
    """
    Tek bir Google OAuth token'ının sağlığını kontrol eder.
    Token'ı yüklemeyi ve yenilemeyi dener. Başarısız olursa hata döner.
    """
    result = {
        "name": f"Google OAuth ({account_info['email']})",
        "account": account_name,
        "status": "UNKNOWN",
        "detail": "",
        "expiry": None,
        "hours_remaining": None,
    }

    token_path = OAUTH_DIR / account_info["token_file"]
    env_var = account_info["env_var"]

    try:
        from google.oauth2.credentials import Credentials
        from google.auth.transport.requests import Request

        ALL_SCOPES = [
            'https://www.googleapis.com/auth/gmail.modify',
            'https://www.googleapis.com/auth/gmail.send',
            'https://www.googleapis.com/auth/drive.file',
            'https://www.googleapis.com/auth/spreadsheets',
        ]

        creds = None
        loaded_from = None

        # 1) Lokal dosya
        if token_path.exists():
            creds = Credentials.from_authorized_user_file(str(token_path), ALL_SCOPES)
            loaded_from = "file"
        # 2) Environment variable
        elif os.environ.get(env_var):
            token_json = json.loads(os.environ[env_var])
            creds = Credentials.from_authorized_user_info(token_json, ALL_SCOPES)
            loaded_from = "env"
        else:
            result["status"] = "NOT_FOUND"
            result["detail"] = f"Token dosyası bulunamadı: {token_path}"
            return result

        # Token geçerlilik kontrolü
        if creds.valid:
            if creds.expiry:
                now_utc = datetime.now(timezone.utc)
                expiry_utc = creds.expiry.replace(tzinfo=timezone.utc) if creds.expiry.tzinfo is None else creds.expiry
                hours_left = (expiry_utc - now_utc).total_seconds() / 3600
                result["expiry"] = creds.expiry.isoformat()
                result["hours_remaining"] = round(hours_left, 1)

                if hours_left < 1:
                    result["status"] = "EXPIRING_SOON"
                    result["detail"] = f"Token {round(hours_left * 60)}dk içinde dolacak!"
                else:
                    result["status"] = "OK"
                    result["detail"] = f"Geçerli ({loaded_from}), {round(hours_left, 1)}s kaldı"
            else:
                result["status"] = "OK"
                result["detail"] = f"Geçerli ({loaded_from})"
        else:
            # Token süresi dolmuş — yenilemeyi dene
            if creds.expired and creds.refresh_token:
                try:
                    creds.refresh(Request())
                    # Yenilenen token'ı kaydet
                    if loaded_from == "file":
                        _save_refreshed_token(creds, str(token_path))
                    result["status"] = "REFRESHED"
                    result["detail"] = f"Süresi dolmuştu, otomatik yenilendi ({loaded_from})"
                    if creds.expiry:
                        result["expiry"] = creds.expiry.isoformat()
                except Exception as e:
                    result["status"] = "REFRESH_FAILED"
                    result["detail"] = f"Yenilenemedi: {str(e)[:150]}"
            else:
                result["status"] = "INVALID"
                result["detail"] = "Token geçersiz ve yenilenemiyor (refresh_token yok)"

    except ImportError:
        result["status"] = "SKIP"
        result["detail"] = "google-auth kütüphanesi yüklü değil (kontrol atlandı)"
    except Exception as e:
        result["status"] = "ERROR"
        result["detail"] = f"Beklenmeyen hata: {str(e)[:200]}"

    return result


def _save_refreshed_token(creds, token_path: str):
    """Yenilenen token'ı dosyaya kaydet."""
    try:
        ALL_SCOPES = [
            'https://www.googleapis.com/auth/gmail.modify',
            'https://www.googleapis.com/auth/gmail.send',
            'https://www.googleapis.com/auth/drive.file',
            'https://www.googleapis.com/auth/spreadsheets',
        ]
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
    except Exception:
        pass  # Sessizce devam et


def check_telegram_bot() -> dict:
    """Telegram Bot bağlantısını test eder (getMe API çağrısı)."""
    result = {
        "name": "Telegram Bot",
        "status": "UNKNOWN",
        "detail": "",
    }

    bot_token = _load_env_value("TELEGRAM_BOT_TOKEN")
    chat_id = _load_env_value("TELEGRAM_ADMIN_CHAT_ID")

    if not bot_token:
        result["status"] = "NOT_CONFIGURED"
        result["detail"] = "TELEGRAM_BOT_TOKEN bulunamadı"
        return result

    if not chat_id:
        result["status"] = "WARNING"
        result["detail"] = "TELEGRAM_ADMIN_CHAT_ID eksik (bot var ama bildirim gönderilemez)"
        return result

    try:
        url = f"https://api.telegram.org/bot{bot_token}/getMe"
        req = urllib.request.Request(url, method="GET")
        with urllib.request.urlopen(req, timeout=10, context=_get_ssl_ctx()) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            if data.get("ok"):
                bot_name = data["result"].get("username", "?")
                result["status"] = "OK"
                result["detail"] = f"@{bot_name} aktif, chat_id={chat_id}"
            else:
                result["status"] = "ERROR"
                result["detail"] = f"API yanıtı hatalı: {data}"
    except Exception as e:
        result["status"] = "ERROR"
        result["detail"] = f"Bağlantı hatası: {str(e)[:150]}"

    return result


def check_notion_api() -> dict:
    """Notion API bağlantısını test eder."""
    result = {
        "name": "Notion API",
        "status": "UNKNOWN",
        "detail": "",
    }

    api_token = _load_env_value("NOTION_API_TOKEN")
    if not api_token:
        result["status"] = "NOT_CONFIGURED"
        result["detail"] = "NOTION_API_TOKEN bulunamadı"
        return result

    try:
        url = "https://api.notion.com/v1/users/me"
        req = urllib.request.Request(
            url,
            headers={
                "Authorization": f"Bearer {api_token}",
                "Notion-Version": "2022-06-28",
                "Content-Type": "application/json",
            },
            method="GET",
        )
        with urllib.request.urlopen(req, timeout=10, context=_get_ssl_ctx()) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            bot_name = data.get("name", "?")
            result["status"] = "OK"
            result["detail"] = f"Bot: {bot_name}"
    except urllib.error.HTTPError as e:
        if e.code == 401:
            result["status"] = "AUTH_FAILED"
            result["detail"] = "Token geçersiz veya süresi dolmuş"
        else:
            result["status"] = "ERROR"
            result["detail"] = f"HTTP {e.code}"
    except Exception as e:
        result["status"] = "ERROR"
        result["detail"] = f"Bağlantı hatası: {str(e)[:150]}"

    return result


def check_railway_api() -> dict:
    """Railway GraphQL API bağlantısını test eder."""
    result = {
        "name": "Railway API",
        "status": "UNKNOWN",
        "detail": "",
    }

    token = _load_env_value("RAILWAY_TOKEN")
    if not token:
        result["status"] = "NOT_CONFIGURED"
        result["detail"] = "RAILWAY_TOKEN bulunamadı"
        return result

    try:
        query = '{"query":"{ me { name email } }"}'
        req = urllib.request.Request(
            "https://backboard.railway.app/graphql/v2",
            data=query.encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {token}",
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=10, context=_get_ssl_ctx()) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            if "data" in data and data["data"].get("me"):
                name = data["data"]["me"].get("name", "?")
                email = data["data"]["me"].get("email", "?")
                result["status"] = "OK"
                result["detail"] = f"Kullanıcı: {name} ({email})"
            elif "errors" in data:
                result["status"] = "AUTH_FAILED"
                result["detail"] = data["errors"][0].get("message", "Bilinmeyen hata")
            else:
                result["status"] = "ERROR"
                result["detail"] = "Beklenmeyen yanıt formatı"
    except Exception as e:
        result["status"] = "ERROR"
        result["detail"] = f"Bağlantı hatası: {str(e)[:150]}"

    return result


def check_smtp() -> dict:
    """SMTP (hata bildirimi) bağlantısını test eder."""
    result = {
        "name": "SMTP (Gmail App Password)",
        "status": "UNKNOWN",
        "detail": "",
    }

    smtp_user = _load_env_value("SMTP_USER")
    smtp_pass = _load_env_value("SMTP_APP_PASSWORD")

    if not smtp_user or not smtp_pass:
        result["status"] = "NOT_CONFIGURED"
        result["detail"] = "SMTP_USER veya SMTP_APP_PASSWORD eksik"
        return result

    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=10) as server:
            server.login(smtp_user, smtp_pass)
            result["status"] = "OK"
            result["detail"] = f"SMTP giriş başarılı: {smtp_user}"
    except smtplib.SMTPAuthenticationError:
        result["status"] = "AUTH_FAILED"
        result["detail"] = "App Password geçersiz veya revoke edilmiş"
    except Exception as e:
        result["status"] = "ERROR"
        result["detail"] = f"Bağlantı hatası: {str(e)[:150]}"

    return result


# ══════════════════════════════════════════════════════════
# ██  ANA KONTROL & BİLDİRİM
# ══════════════════════════════════════════════════════════

# Alarm gerektiren statüler
ALERT_STATUSES = {
    "NOT_FOUND", "INVALID", "REFRESH_FAILED", "AUTH_FAILED",
    "ERROR", "NOT_CONFIGURED",
}

# Uyarı olarak raporlanacak (ama acil değil)
WARNING_STATUSES = {"EXPIRING_SOON", "WARNING"}


def run_full_health_check(verbose: bool = False) -> dict:
    """
    Tüm servislerin sağlık kontrolünü çalıştırır.

    Returns:
        {
            "timestamp": str,
            "results": [dict],
            "problems": [dict],     # Alarm gerektiren sorunlar
            "warnings": [dict],     # Uyarılar (acil değil)
            "all_healthy": bool,
        }
    """
    results = []
    problems = []
    warnings = []

    print("🏥 Antigravity Kapsamlı Sağlık Kontrolü")
    print("=" * 55)
    print(f"   🕐 {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 55)

    # ── 1. Google OAuth Token'ları ─────────────────────
    print("\n🔐 Google OAuth Token Kontrolü")
    print("-" * 40)
    for acc_name, acc_info in GOOGLE_ACCOUNTS.items():
        r = check_google_token(acc_name, acc_info)
        results.append(r)
        status_icon = "✅" if r["status"] in ("OK", "REFRESHED") else "⚠️" if r["status"] in WARNING_STATUSES else "❌"
        print(f"  {status_icon} {r['name']}: {r['detail']}")

        if r["status"] in ALERT_STATUSES:
            problems.append(r)
        elif r["status"] in WARNING_STATUSES:
            warnings.append(r)

    # ── 2. Telegram Bot ───────────────────────────────
    print("\n🤖 Harici Servis Kontrolleri")
    print("-" * 40)

    r = check_telegram_bot()
    results.append(r)
    status_icon = "✅" if r["status"] == "OK" else "⚠️" if r["status"] in WARNING_STATUSES else "❌"
    print(f"  {status_icon} {r['name']}: {r['detail']}")
    if r["status"] in ALERT_STATUSES:
        problems.append(r)
    elif r["status"] in WARNING_STATUSES:
        warnings.append(r)

    # ── 3. Notion API ─────────────────────────────────
    r = check_notion_api()
    results.append(r)
    status_icon = "✅" if r["status"] == "OK" else "⚠️" if r["status"] in WARNING_STATUSES else "❌"
    print(f"  {status_icon} {r['name']}: {r['detail']}")
    if r["status"] in ALERT_STATUSES:
        problems.append(r)
    elif r["status"] in WARNING_STATUSES:
        warnings.append(r)

    # ── 4. Railway API ────────────────────────────────
    r = check_railway_api()
    results.append(r)
    status_icon = "✅" if r["status"] == "OK" else "⚠️" if r["status"] in WARNING_STATUSES else "❌"
    print(f"  {status_icon} {r['name']}: {r['detail']}")
    if r["status"] in ALERT_STATUSES:
        problems.append(r)
    elif r["status"] in WARNING_STATUSES:
        warnings.append(r)

    # ── 5. SMTP ───────────────────────────────────────
    r = check_smtp()
    results.append(r)
    status_icon = "✅" if r["status"] == "OK" else "⚠️" if r["status"] in WARNING_STATUSES else "❌"
    print(f"  {status_icon} {r['name']}: {r['detail']}")
    if r["status"] in ALERT_STATUSES:
        problems.append(r)
    elif r["status"] in WARNING_STATUSES:
        warnings.append(r)

    # ── Özet ──────────────────────────────────────────
    all_healthy = len(problems) == 0
    print(f"\n{'=' * 55}")
    if all_healthy and len(warnings) == 0:
        print("✅ Tüm servisler sağlıklı!")
    elif all_healthy:
        print(f"⚠️  {len(warnings)} uyarı var (acil değil)")
    else:
        print(f"🚨 {len(problems)} KRİTİK SORUN + {len(warnings)} uyarı!")
    print(f"{'=' * 55}\n")

    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "results": results,
        "problems": problems,
        "warnings": warnings,
        "all_healthy": all_healthy,
    }


def send_health_alert(problems: list, warnings: list):
    """
    Sağlık kontrolü sonucunda sorun varsa bildirim gönderir.
    Öncelik 1: Email (SMTP)
    Öncelik 2: Telegram (Email başarısız olursa)
    """
    if not problems and not warnings:
        return

    # Mesaj oluştur
    lines = ["🏥 Antigravity Sağlık Kontrolü Raporu\n"]

    if problems:
        lines.append(f"🚨 {len(problems)} KRİTİK SORUN:")
        for p in problems:
            lines.append(f"  ❌ {p['name']}: {p['detail']}")
        lines.append("")

    if warnings:
        lines.append(f"⚠️ {len(warnings)} UYARI:")
        for w in warnings:
            lines.append(f"  ⚠️ {w['name']}: {w['detail']}")
        lines.append("")

    lines.append(f"Kontrol zamanı: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    message = "\n".join(lines)
    subject = f"{'🚨' if problems else '⚠️'} Credential Health: {len(problems)} sorun, {len(warnings)} uyarı"

    # 1. Öncelik: Email
    email_sent = _try_send_email(subject, message)

    if email_sent:
        print("  📧 Sağlık raporu Email ile gönderildi.")
    else:
        print("  ❌ Email gönderilemedi, Telegram'a geçiliyor...")
        # 2. Öncelik: Telegram
        telegram_sent = _try_send_telegram(subject, message)
        if telegram_sent:
            print("  📱 Sağlık raporu Telegram ile gönderildi.")
        else:
            print("  ❌ Telegram ile de gönderilemedi! Manuel kontrol gerekli.")


def _try_send_email(subject: str, body: str) -> bool:
    """SMTP ile hata bildirimi gönder."""
    try:
        smtp_user = _load_env_value("SMTP_USER")
        smtp_pass = _load_env_value("SMTP_APP_PASSWORD")
        if not smtp_user or not smtp_pass:
            return False

        from email.mime.text import MIMEText
        msg = MIMEText(body, "plain", "utf-8")
        msg["Subject"] = f"[ALARM] {subject}"
        msg["From"] = smtp_user
        msg["To"] = "EMAIL_ADRESI_BURAYA"

        with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=15) as server:
            server.login(smtp_user, smtp_pass)
            server.sendmail(smtp_user, "EMAIL_ADRESI_BURAYA", msg.as_string())
        return True
    except Exception as e:
        print(f"  ⚠️ SMTP hatası: {e}")
        return False


def _try_send_telegram(subject: str, body: str) -> bool:
    """Telegram ile hata bildirimi gönder."""
    try:
        import requests
        bot_token = _load_env_value("TELEGRAM_BOT_TOKEN")
        chat_id = _load_env_value("TELEGRAM_ADMIN_CHAT_ID")
        if not bot_token or not chat_id:
            return False

        text = f"🚨 *{subject}*\n\n{body}"
        url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
        resp = requests.post(url, json={
            "chat_id": chat_id,
            "text": text[:4000],  # Telegram mesaj limiti
            "parse_mode": "Markdown",
        }, timeout=10)
        resp.raise_for_status()
        return True
    except Exception as e:
        # Requests yoksa urllib ile dene
        try:
            bot_token = _load_env_value("TELEGRAM_BOT_TOKEN")
            chat_id = _load_env_value("TELEGRAM_ADMIN_CHAT_ID")
            if not bot_token or not chat_id:
                return False

            text = f"🚨 {subject}\n\n{body}"
            payload = json.dumps({
                "chat_id": chat_id,
                "text": text[:4000],
            }).encode("utf-8")
            url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
            req = urllib.request.Request(
                url, data=payload,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=10, context=_get_ssl_ctx()) as resp:
                return resp.status == 200
        except Exception:
            return False


# ══════════════════════════════════════════════════════════
# ██  KOMUT SATIRI GİRİŞİ
# ══════════════════════════════════════════════════════════

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Antigravity Kapsamlı Sağlık Kontrolü")
    parser.add_argument("--dry-run", action="store_true", help="Bildirim göndermez")
    parser.add_argument("--verbose", action="store_true", help="Detaylı çıktı")
    args = parser.parse_args()

    report = run_full_health_check(verbose=args.verbose)

    if not args.dry_run and (report["problems"] or report["warnings"]):
        print("\n📤 Bildirim gönderiliyor...")
        send_health_alert(report["problems"], report["warnings"])
    elif args.dry_run and (report["problems"] or report["warnings"]):
        print("\n📋 [DRY-RUN] Bildirim gönderilMEdi (--dry-run modu)")

    # Exit code: 0 = sağlıklı, 1 = sorun var
    sys.exit(0 if report["all_healthy"] else 1)
