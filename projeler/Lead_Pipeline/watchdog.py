"""
Lead Pipeline — Watchdog Modülü
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
24 saat boyunca hiç lead gelmezse Gmail ile uyarı gönderir.
State'i Google Sheets _Meta tab'ında tutar (ephemeral FS koruması).
Günde max 1 alert gönderir (spam koruması).
"""
import logging
import base64
from datetime import datetime, timezone, timedelta
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from config import Config

logger = logging.getLogger(__name__)

# _Meta tab'ında watchdog state satırları
_WATCHDOG_LAST_LEAD_KEY = "watchdog_last_lead_time"
_WATCHDOG_LAST_ALERT_KEY = "watchdog_last_alert_time"


def _read_watchdog_state(sheets_service, spreadsheet_id: str) -> dict:
    """_Meta tab'ından watchdog state'ini okur."""
    state = {}
    try:
        result = (
            sheets_service.spreadsheets()
            .values()
            .get(
                spreadsheetId=spreadsheet_id,
                range="'_Meta'!A:B",
            )
            .execute()
        )
        for row in result.get("values", []):
            if len(row) >= 2:
                state[row[0]] = row[1]
    except Exception as e:
        logger.warning(f"⚠️ Watchdog state okunamadı: {e}")
    return state


def _write_watchdog_state(sheets_service, spreadsheet_id: str, key: str, value: str, all_state: dict):
    """_Meta tab'ına watchdog state satırı yazar/günceller."""
    try:
        # Mevcut tüm state'i oku ve güncelle
        all_state[key] = value

        # Tüm satırları yeniden yaz (mevcut CRM state'ini de koruyarak)
        values = [[k, v] for k, v in all_state.items()]

        sheets_service.spreadsheets().values().update(
            spreadsheetId=spreadsheet_id,
            range="'_Meta'!A1",
            valueInputOption="RAW",
            body={"values": values},
        ).execute()
        logger.debug(f"✅ Watchdog state güncellendi: {key}={value}")
    except Exception as e:
        logger.warning(f"⚠️ Watchdog state yazılamadı: {e}")


def _send_watchdog_alert(hours_silent: int):
    """Gmail API ile lead akışı durdu uyarısı gönderir."""
    from notifier import _get_gmail_service

    try:
        service = _get_gmail_service()
    except Exception as e:
        logger.error(f"❌ Watchdog: Gmail bağlantısı kurulamadı: {e}")
        return False

    now = datetime.now().strftime("%d.%m.%Y %H:%M")

    html_body = f"""
    <div style="font-family:'Segoe UI',Arial,sans-serif; max-width:600px; margin:0 auto; padding:20px;">
        <div style="background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%); padding:24px 30px; border-radius:12px 12px 0 0;">
            <h1 style="color:white; margin:0; font-size:22px;">⚠️ Lead Akışı Durdu!</h1>
            <p style="color:rgba(255,255,255,0.85); margin:8px 0 0; font-size:14px;">Son {hours_silent} saattir yeni lead gelmedi</p>
        </div>

        <div style="background:#fff; border:1px solid #e0e0e0; border-top:none; border-radius:0 0 12px 12px; padding:24px;">
            <p style="font-size:15px; color:#333; line-height:1.6;">
                Lead Pipeline <strong>son {hours_silent} saattir</strong> hiç yeni lead tespit edemedi.
                Bu durum şu sebeplerden kaynaklanıyor olabilir:
            </p>
            <ul style="font-size:14px; color:#555; line-height:1.8;">
                <li>Facebook Ads kampanyası duraklatılmış veya bütçesi bitmiş olabilir</li>
                <li>Google Sheets'e lead düşmeyi kesmiş olabilir</li>
                <li>Pipeline'da sessiz bir hata oluşmuş olabilir</li>
            </ul>
            <p style="font-size:14px; color:#666;">
                📊 <strong>Kontrol et:</strong> Facebook Ads Manager → Lead formları<br>
                📋 <strong>Sheet:</strong> "Mart-2026-Saat Bazlı-v2" tab'ında son satırları kontrol et
            </p>
        </div>

        <p style="color:#999; font-size:11px; margin-top:16px; text-align:center;">
            Bu uyarı {now} tarihinde Lead Pipeline Watchdog tarafından otomatik gönderilmiştir.
            <br>Günde en fazla 1 kez gönderilir.
        </p>
    </div>
    """

    plain_text = (
        f"⚠️ Lead Akışı Durdu!\n\n"
        f"Son {hours_silent} saattir yeni lead gelmedi.\n"
        f"Facebook Ads kampanyasını ve Google Sheets'i kontrol edin.\n"
        f"Tarih: {now}"
    )

    message = MIMEMultipart("alternative")
    message["From"] = f"Lead Pipeline Watchdog <{Config.SENDER_EMAIL}>"
    message["To"] = Config.WATCHDOG_ALERT_EMAIL
    message["Subject"] = f"⚠️ Lead Akışı Durdu — Son {hours_silent} saattir yeni lead yok"

    message.attach(MIMEText(plain_text, "plain", "utf-8"))
    message.attach(MIMEText(html_body, "html", "utf-8"))

    try:
        raw = base64.urlsafe_b64encode(message.as_bytes()).decode("utf-8")
        result = service.users().messages().send(
            userId="me", body={"raw": raw}
        ).execute()
        logger.info(f"📧 Watchdog alert gönderildi → {Config.WATCHDOG_ALERT_EMAIL} | ID: {result.get('id', '?')}")
        return True
    except Exception as e:
        logger.error(f"❌ Watchdog alert gönderilemedi: {e}")
        return False


def run_watchdog(sheets_service, spreadsheet_id: str, new_lead_count: int):
    """
    Watchdog ana fonksiyonu. Her pipeline çalışmasında çağrılır.

    Args:
        sheets_service: Google Sheets API service objesi
        spreadsheet_id: CRM spreadsheet ID
        new_lead_count: Bu çalışmada bulunan yeni lead sayısı
    """
    if not Config.WATCHDOG_ENABLED:
        return

    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()

    # _Meta'dan mevcut state'i oku
    all_state = _read_watchdog_state(sheets_service, spreadsheet_id)

    # Yeni lead geldiyse → last_lead_time güncelle
    if new_lead_count > 0:
        _write_watchdog_state(sheets_service, spreadsheet_id, _WATCHDOG_LAST_LEAD_KEY, now_iso, all_state)
        logger.debug(f"🐕 Watchdog: {new_lead_count} lead geldi, timer sıfırlandı")
        return

    # Yeni lead yok — ne kadar süredir sessiz?
    last_lead_str = all_state.get(_WATCHDOG_LAST_LEAD_KEY, "")

    if not last_lead_str:
        # İlk çalıştırma — şu anı kaydet, alarm atma
        _write_watchdog_state(sheets_service, spreadsheet_id, _WATCHDOG_LAST_LEAD_KEY, now_iso, all_state)
        logger.info("🐕 Watchdog: İlk çalıştırma — başlangıç zamanı kaydedildi")
        return

    try:
        last_lead_time = datetime.fromisoformat(last_lead_str)
        if last_lead_time.tzinfo is None:
            last_lead_time = last_lead_time.replace(tzinfo=timezone.utc)
    except (ValueError, TypeError):
        logger.warning(f"⚠️ Watchdog: Geçersiz last_lead_time: {last_lead_str}")
        _write_watchdog_state(sheets_service, spreadsheet_id, _WATCHDOG_LAST_LEAD_KEY, now_iso, all_state)
        return

    silent_hours = (now - last_lead_time).total_seconds() / 3600

    if silent_hours < Config.WATCHDOG_SILENT_HOURS:
        logger.debug(f"🐕 Watchdog: {silent_hours:.1f}h sessiz (eşik: {Config.WATCHDOG_SILENT_HOURS}h) — henüz alarm yok")
        return

    # Eşik aşıldı — son alert ne zaman gönderildi?
    last_alert_str = all_state.get(_WATCHDOG_LAST_ALERT_KEY, "")

    if last_alert_str:
        try:
            last_alert_time = datetime.fromisoformat(last_alert_str)
            if last_alert_time.tzinfo is None:
                last_alert_time = last_alert_time.replace(tzinfo=timezone.utc)
            hours_since_alert = (now - last_alert_time).total_seconds() / 3600

            if hours_since_alert < 24:
                logger.debug(f"🐕 Watchdog: Son alert {hours_since_alert:.1f}h önce — günde 1 kez sınırı, atlanıyor")
                return
        except (ValueError, TypeError):
            pass

    # ALERT GÖNDER
    logger.warning(f"🐕 Watchdog: {silent_hours:.0f} saattir lead gelmedi — alert gönderiliyor!")
    sent = _send_watchdog_alert(int(silent_hours))

    if sent:
        _write_watchdog_state(sheets_service, spreadsheet_id, _WATCHDOG_LAST_ALERT_KEY, now_iso, all_state)
