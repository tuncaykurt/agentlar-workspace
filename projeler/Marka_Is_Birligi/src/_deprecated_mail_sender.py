# ═══════════════════════════════════════════════════════════
# ⚠️ LEGACY DOSYA — KULLANILMIYOR
# ═══════════════════════════════════════════════════════════
# Bu dosya projenin bağımsız olduğu dönemden kalmadır.
# Artık Antigravity ekosistemi altındayız.
#
# Mail gönderimi için: _skills/eposta-gonderim/scripts/send_email.py
# Workflow: /mail-gonder veya /marka-outreach
#
# Bu dosyayı değiştirmeyin, sadece referans olarak tutulur.
# ═══════════════════════════════════════════════════════════

import smtplib
import ssl
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import sys
import os

# Ayarları import ediyoruz
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from config import settings

def send_collaboration_mail(target_email, brand_name, portfolio_link="https://portfolyom.com"):
    """
    Belirlenen markaya kişiselleştirilmiş bir iş birliği maili gönderir.
    """
    
    # HTML Taslağını oku
    try:
        with open(settings.MAIL_TEMPLATE_PATH, 'r', encoding='utf-8') as f:
            html_content = f.read()
    except FileNotFoundError:
        print(f"HATA: {settings.MAIL_TEMPLATE_PATH} dosyası bulunamadı!")
        return False

    # İçeriği kişiselleştir
    html_content = html_content.replace("{brand_name}", brand_name)
    html_content = html_content.replace("{portfolio_url}", portfolio_link)

    # Mail mesajını oluştur
    message = MIMEMultipart("alternative")
    message["Subject"] = f"{brand_name} x [İSİM SOYAD] | İş Birliği Teklifi"
    message["From"] = settings.GMAIL_USER
    message["To"] = target_email

    # Plain-text versiyonu (HTML açılmazsa diye)
    text = f"""
    Merhaba {brand_name},
    
    Ben [İSİM SOYAD]. Markanızla iş birliği yapmak istiyorum.
    Portfolyomu buradan inceleyebilirsiniz: {portfolio_link}
    
    Sevgiler.
    """
    
    part1 = MIMEText(text, "plain")
    part2 = MIMEText(html_content, "html")
    message.attach(part1)
    message.attach(part2)

    # Google Uygulama Şifresi veya SMTP Ayarları
    # NOT: Gmail için 'Uygulama Şifreleri' (App Passwords) kullanılmalıdır.
    smtp_server = "smtp.gmail.com"
    port = 465  # SSL için
    password = os.environ.get("GMAIL_APP_PASSWORD", "BURAYA_UYGULAMA_SIFRESI")

    print(f"GÖNDERİLİYOR: {brand_name} ({target_email})...")
    
    context = ssl.create_default_context()
    try:
        with smtplib.SMTP_SSL(smtp_server, port, context=context) as server:
            server.login(settings.GMAIL_USER, password)
            server.sendmail(settings.GMAIL_USER, target_email, message.as_string())
        print(f"BAŞARILI: {brand_name} markasına mail gönderildi.")
        return True
    except Exception as e:
        print(f"HATA OLUŞTU: {e}")
        return False

if __name__ == "__main__":
    # Test amaçlı
    test_email = "test@example.com"
    test_brand = "Test Markası"
    # send_collaboration_mail(test_email, test_brand)
