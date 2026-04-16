import base64
from email.message import EmailMessage
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
import datetime

from logger import get_logger
from config import settings

logger = get_logger(__name__)

def get_gmail_service():
    """Gmail API servisini başlatır. Expired token varsa otomatik yeniler."""
    try:
        creds = Credentials.from_authorized_user_file(
            settings.OAUTH_TOKEN_PATH,
            ['https://www.googleapis.com/auth/gmail.modify']
        )
        
        # Token geçersiz veya expired ise refresh_token ile yenile
        if not creds.valid and creds.refresh_token:
            logger.info("OAuth token gecersiz/expired, refresh_token ile yenileniyor...")
            creds.refresh(Request())
            logger.info("Token basariyla yenilendi.")
            
            # Yenilenen token'ı dosyaya geri kaydet
            try:
                with open(settings.OAUTH_TOKEN_PATH, 'w') as f:
                    f.write(creds.to_json())
                logger.info("Yenilenen token dosyaya kaydedildi.")
            except Exception as save_err:
                logger.warning(f"Token dosyaya kaydedilemedi (ephemeral FS olabilir): {save_err}")
        elif not creds.valid and not creds.refresh_token:
            logger.error("OAuth token gecersiz ve refresh_token bulunamadi! Mail gonderilemez.")
            return None
        
        service = build('gmail', 'v1', credentials=creds)
        return service
    except Exception as e:
        logger.error(f"Gmail servisi baslatilamadi: {e}", exc_info=True)
        return None

def send_performance_report(videos, report_summary=""):
    """Barajı aşan videoları HTML formatında mail olarak gönderir."""
    if not videos:
        logger.info("Raporlanacak siniri asan video bulunmadi.")
        return
        
    service = get_gmail_service()
    if not service:
        logger.error("Gmail servisi alinmadi, rapor gonderilemedi!")
        return

    msg = EmailMessage()
    
    today_str = datetime.datetime.now().strftime("%d %B %Y")
    
    html_content = f"""
    <html>
      <body style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
        <h2 style="color: #2c3e50;">Sosyal Medya Performans Raporu 🚀</h2>
        <p style="font-size: 14px; margin-bottom: 20px;"><strong>Tarih:</strong> {today_str}</p>
    """
    
    if report_summary:
        html_content += f"""
        <div style="background-color: #f1f8ff; padding: 15px; border-left: 4px solid #3498db; margin-bottom: 25px;">
            {report_summary}
        </div>
        """
        
    html_content += """
        <p>Aşağıda hedeflenen barajları aşan içerikler listelenmiştir:</p>
        <p style="font-size: 13px; color: #7f8c8d;">Barajlar: Instagram Reels ≥ 200K | TikTok ≥ 100K | YouTube Shorts ≥ 100K | YouTube Long-Form ≥ 10K</p>
        <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
          <thead>
            <tr style="background-color: #f8f9fa;">
              <th style="padding: 12px; border: 1px solid #ddd; text-align: left;">Platform</th>
              <th style="padding: 12px; border: 1px solid #ddd; text-align: left;">İzlenme</th>
              <th style="padding: 12px; border: 1px solid #ddd; text-align: left;">Tarih</th>
              <th style="padding: 12px; border: 1px solid #ddd; text-align: center;">Link</th>
            </tr>
          </thead>
          <tbody>
    """
    
    for v in videos:
        # İzlenme sayısını düzgün formatla (100000 -> 100.000)
        try:
            formatted_views = f"{int(v['views']):,}".replace(",", ".")
        except (ValueError, TypeError):
            formatted_views = str(v.get('views', '?'))
        
        # Tarih formatla
        date_str = v.get('date', 'Bilinmiyor')
        if isinstance(date_str, str) and 'T' in date_str:
            date_str = date_str[:10]
        
        url = v.get('url', '#')
        
        html_content += f"""
            <tr>
              <td style="padding: 12px; border: 1px solid #ddd; font-weight: bold;">{v['platform']}</td>
              <td style="padding: 12px; border: 1px solid #ddd; color: #e74c3c; font-weight: bold;">{formatted_views}</td>
              <td style="padding: 12px; border: 1px solid #ddd;">{date_str}</td>
              <td style="padding: 12px; border: 1px solid #ddd; text-align: center;">
                <a href="{url}" style="background-color: #3498db; color: white; padding: 6px 12px; text-decoration: none; border-radius: 4px; display: inline-block;">Videoya Git</a>
              </td>
            </tr>
        """
        
    html_content += """
          </tbody>
        </table>
        <p style="margin-top: 30px; font-size: 13px; color: #7f8c8d;">
          <em>Bu rapor Antigravity AI tarafından otomatik olarak oluşturulmuştur.</em>
        </p>
      </body>
    </html>
    """

    msg.set_content("HTML destekleyen bir mail istemcisi kullanin.")
    msg.add_alternative(html_content, subtype='html')

    msg['To'] = 'EMAIL_ADRESI_BURAYA'
    msg['From'] = '[İSİM SOYAD] <EMAIL_ADRESI_BURAYA>'
    msg['Subject'] = f'🔥 Haftalık Sosyal Medya Çıktıları ({today_str})'

    raw_msg = base64.urlsafe_b64encode(msg.as_bytes()).decode('utf-8')

    if settings.IS_DRY_RUN:
        logger.info(f"[DRY-RUN] Mail gonderimi atlaniyor. {len(videos)} video raporlandi.")
        return
        
    try:
        message = service.users().messages().send(userId="me", body={'raw': raw_msg}).execute()
        logger.info(f"Rapor basariyla gonderildi! Message Id: {message['id']}")
    except Exception as e:
        logger.error(f"Rapor gonderilim hatasi: {e}", exc_info=True)

def send_technical_error_report(errors):
    """Sadece teknik problemleri EMAIL_ADRESI_BURAYA adresine atar."""
    if not errors:
        return
        
    service = get_gmail_service()
    if not service:
        logger.error("Gmail servisi alinmadi, teknik hata raporu gonderilemedi!")
        return

    msg = EmailMessage()
    
    error_list_html = "".join([f"<li>{err}</li>" for err in errors])
    
    html_content = f"""
    <html>
      <body style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
        <h2 style="color: #c0392b;">[TAKİP_EDİLEN_HESAP] Notifier - Teknik Hata Raporu ⚠️</h2>
        <p>Proje çalışırken Apify veri çekme aşamasında aşağıdaki hatalar meydana geldi. Bu platformlar atlandı:</p>
        <ul>
            {error_list_html}
        </ul>
        <p>Lütfen Apify panosunu ve Actor durumlarını kontrol et.</p>
      </body>
    </html>
    """

    msg.set_content("HTML destekleyen bir mail istemcisi kullanin.")
    msg.add_alternative(html_content, subtype='html')

    msg['To'] = 'EMAIL_ADRESI_BURAYA'
    msg['From'] = '[İSİM SOYAD] <EMAIL_ADRESI_BURAYA>'
    msg['Subject'] = '⚠️ Apify Veri Çekme Hatası - [TAKİP_EDİLEN_HESAP] Notifier'

    raw_msg = base64.urlsafe_b64encode(msg.as_bytes()).decode('utf-8')

    if settings.IS_DRY_RUN:
        logger.info(f"[DRY-RUN] Teknik hata maili gonderimi atlaniyor.")
        return
        
    try:
        message = service.users().messages().send(userId="me", body={'raw': raw_msg}).execute()
        logger.info(f"Teknik hata raporu basariyla gonderildi! Message Id: {message['id']}")
    except Exception as e:
        logger.error(f"Teknik hata raporu gonderilim hatasi: {e}", exc_info=True)
