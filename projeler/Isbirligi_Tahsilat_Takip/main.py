from datetime import datetime
from notion_client import fetch_published_videos
from database import get_pending_notifications, mark_as_notified
from email_client import send_email_notification
from ops_logger import get_ops_logger

ops = get_ops_logger("Isbirligi_Tahsilat_Takip", "Pipeline")

def check_for_alerts():
    """
    Notion'dan yayınlanmış videoları çeker ve ödeme süresi geçenleri tespit eder.
    
    Akış:
    1. Notion'dan tüm 'Yayınlandı' durumundaki videoları çek (Bildirim Seviyesi + tarih dahil)
    2. Ödeme alınmamış + süre geçmiş + bildirim yükseltme gerektirenleri filtrele
    3. E-posta bildirimi gönder
    4. Notion'da bildirim seviyesini güncelle
    
    SQLite'a gerek kalmadı — tüm state Notion'da tutuluyor.
    """
    print(f"[{datetime.now()}] Notion veritabanları kontrol ediliyor...")
    
    # 1. Notion'dan tüm yayınlanmış videoları çek
    try:
        videos = fetch_published_videos()
    except Exception as e:
        print(f"Notion verisi çekerken hata: {e}")
        ops.error("Notion veri çekme hatası", exception=e)
        return
    
    if not videos:
        print("İncelenecek 'Yayınlandı' konumunda video bulunamadı.")
        return
    
    print(f"Toplam {len(videos)} yayınlanmış video bulundu.")
    
    # İstatistik: ödeme bekleyenler
    unchecked = [v for v in videos if not v.get("check", False)]
    print(f"  → Ödeme onayı bekleyen: {len(unchecked)}")
    print(f"  → Ödeme tamamlanan: {len(videos) - len(unchecked)}")
    
    # 2. Bildirim gereken kayıtları filtrele
    pending = get_pending_notifications(videos, days_threshold=14)
    
    if not pending:
        print("Uyarı gerektiren tahsilat bulunmuyor.")
        return
    
    print(f"{len(pending)} adet bildirim gönderilecek.")
    
    # 3. Her bekleyen kayıt için e-posta bildirimi gönder
    for item in pending:
        days_passed = item.get('days_passed', 0)
        notified_level = item.get('notified_level', 0)
        
        # 28 günden fazla oldu ve kırmızı bildirim (seviye 2) atılmadıysa
        if days_passed >= 28 and notified_level < 2:
            subject = f"🔴 KRİTİK: Ödeme Uyarısı - {item['title']}"
            color = "#ff4d4f"
            bg_color = "#fff1f0"
            headline = "🚨 28 Günü Geçen Kritik Tahsilat Bildirimi"
            new_level = 2
        # 14 ile 28 gün arası ve sarı bildirim (seviye 1) atılmadıysa
        elif days_passed >= 14 and days_passed < 28 and notified_level < 1:
            subject = f"🟡 Geciken Ödeme: {item['title']}"
            color = "#faad14"
            bg_color = "#fffbe6"
            headline = "⚠️ 14 Günü Geçen Tahsilat Bildirimi"
            new_level = 1
        else:
            # Bildirim atılmayacak
            continue

        html_body = f"""
        <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <div style="background-color: {bg_color}; padding: 20px; border-radius: 8px; border-left: 5px solid {color};">
                <h2 style="color: {color}; margin-top: 0;">{headline}</h2>
                <p>Aşağıdaki videonun yayınlanmasının üzerinden <strong>{days_passed} gün</strong> geçti ancak henüz tahsilat onayı verilmedi.</p>
                <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
                <table style="width: 100%; border-collapse: collapse;">
                    <tr>
                        <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Proje/Video Adı:</strong></td>
                        <td style="padding: 8px 0; border-bottom: 1px solid #eee;">{item['title']}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>İşbirliği Türü:</strong></td>
                        <td style="padding: 8px 0; border-bottom: 1px solid #eee;">{item['db_type']}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Yayın Tarihi:</strong></td>
                        <td style="padding: 8px 0; border-bottom: 1px solid #eee;">{item['published_date']}</td>
                    </tr>
                </table>
                <p style="margin-top: 20px;">Lütfen <a href="{item.get('notion_url', 'https://www.notion.so')}">Notion'da bu kaydı aç</a> ve durumu kontrol et. Tahsilat sağlandıysa <strong>'Check'</strong> kutusunu işaretlemeyi unutma.</p>
            </div>
        </body>
        </html>
        """
        
        success = send_email_notification(subject, html_body)
        if success:
            mark_as_notified(item["id"], new_level)
            print(f"Uyarı başarıyla gönderildi (Seviye {new_level}): {item['title']}")
            ops.success(f"Tahsilat uyarısı gönderildi (Seviye {new_level})", item['title'])
        else:
            print(f"Uyarı gönderilemedi (Seviye {new_level}): {item['title']}")
            ops.warning(f"Tahsilat uyarısı gönderilemedi (Seviye {new_level})", item['title'])

def job():
    print(f"[{datetime.now()}] Zamanlanmis gorev basliyor...")
    check_for_alerts()
    print(f"[{datetime.now()}] Zamanlanmis gorev bitti.")

def main():
    print("Isbirligi_Tahsilat_Takip baslatildi. (Cron Modu)")
    
    # Doğrudan job'ı çalıştır
    job()
    
    # Ops loglarının yazılmasını bekle
    ops.wait_for_logs()
    
    print("İşlem tamamlandı, çıkılıyor.")
    import sys
    sys.exit(0)

if __name__ == "__main__":
    main()
