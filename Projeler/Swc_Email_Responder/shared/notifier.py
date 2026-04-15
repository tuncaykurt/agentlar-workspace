import os
import sys
import smtplib
from email.mime.text import MIMEText
import requests
import traceback
import logging

# master.env'den ayarları okuma
def get_env_var(key, default=""):
    val = os.environ.get(key)
    if val:
        return val
    # Eğer environment'ta yoksa master.env'den okumayı dene
    try:
        env_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))), 
            "_knowledge", "credentials", "master.env"
        )
        if os.path.exists(env_path):
            with open(env_path, "r", encoding="utf-8") as f:
                for line in f:
                    if line.startswith(f"{key}="):
                        return line.strip().split("=", 1)[1]
    except Exception as e:
        logging.warning("master.env okunurken hata oluştu", exc_info=True)
    return default

def send_alert(subject, message):
    """
    Sistemsel kritik hataları bildir.
    Öncelik 1: Email (SMTP üzerinden)
    Öncelik 2: Telegram (Eğer Email başarısız olursa)
    """
    print(f"⚠️ Kritik Hata Bildirimi Başlatılıyor: {subject}")
    
    # 1. Öncelik: Email
    email_success = _send_email_alert(subject, message)
    
    if email_success:
        print("  ✅ Uyarı başarıyla Email ile gönderildi.")
    else:
        print("  ❌ Email ile uyarı gönderilemedi, Telegram'a geçiliyor...")
        # 2. Öncelik: Telegram
        telegram_success = _send_telegram_alert(subject, message)
        if telegram_success:
            print("  ✅ Uyarı başarıyla Telegram ile gönderildi.")
        else:
            print("  ❌ Uyarı Telegram ile de gönderilemedi!")

def _send_email_alert(subject, body):
    try:
        smtp_user = get_env_var("SMTP_USER")
        smtp_pass = get_env_var("SMTP_APP_PASSWORD")
        to_email = "EMAIL_ADRESI_BURAYA"
        
        if not smtp_user or not smtp_pass:
            print("  ⚠️ SMTP_USER veya SMTP_APP_PASSWORD bulunamadı.")
            return False

        msg = MIMEText(body)
        msg['Subject'] = f"[ALARM] {subject}"
        msg['From'] = smtp_user
        msg['To'] = to_email

        with smtplib.SMTP_SSL('smtp.gmail.com', 465) as smtp_server:
            smtp_server.login(smtp_user, smtp_pass)
            smtp_server.sendmail(smtp_user, to_email, msg.as_string())
        return True
    except Exception as e:
        logging.error(f"  ⚠️ SMTP Hatası: {e}", exc_info=True)
        return False

def _send_telegram_alert(subject, body):
    try:
        bot_token = get_env_var("TELEGRAM_BOT_TOKEN")  # 8175305637:...
        chat_id = get_env_var("TELEGRAM_ADMIN_CHAT_ID")
        
        if not bot_token or not chat_id:
            print("  ⚠️ TELEGRAM_BOT_TOKEN veya TELEGRAM_ADMIN_CHAT_ID bulunamadı.")
            return False

        url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
        payload = {
            "chat_id": chat_id,
            "text": f"🚨 *{subject}*\n\n{body}",
            "parse_mode": "Markdown"
        }
        
        response = requests.post(url, json=payload, timeout=10)
        response.raise_for_status()
        return True
    except Exception as e:
        logging.error(f"  ⚠️ Telegram Hatası: {e}", exc_info=True)
        return False

if __name__ == "__main__":
    # Test
    send_alert("Test Uyarısı", "Bu bir test mesajıdır. Sistem sağlıklı çalışıyor mu kontrol ediliyor.")
