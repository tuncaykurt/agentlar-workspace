"""
Sweatcoin Email Automation — Railway Scheduler
===============================================
Bu dosya Railway üzerinde sürekli çalışır ve hafta içi (Pzt-Cum) belirli
saatlerde multi-agent email otomasyonunu (main.py) tetikler.

Görevler:
1. Email Responder (10:41, 13:11 ve 15:41 TR saati) — Inbox'taki email'lere yanıt
2. Outreach Mailer (11:11 TR saati) — Google Sheet'ten yeni kontaklara email gönder
3. Status Syncer (11:11 TR saati) — Thread statülerini Sheet'te güncelle

Saatler doğal görünmesi için tam yuvarlak olmayan dakikalar seçilmiştir.
Hafta sonları hiçbir mail işlemi yapılmaz.

Timezone:
    Railway sunucuları UTC kullanır. Schedule saatleri UTC olarak
    ayarlanmıştır (TR saati - 3 saat = UTC saati).
    TR 10:41 = UTC 07:41, TR 13:11 = UTC 10:11, vs.

Health Check:
    PORT env variable üzerinden HTTP sunucusu açılır.
    GET / → JSON durum bilgisi (Railway'in servisi canlı tutması için)

Auth: Merkezi google_auth modülü kullanılır.
      Lokal: _knowledge/credentials/oauth/ token dosyaları
      Railway: GOOGLE_SWC_TOKEN_JSON env variable
"""

import os
import sys
import time
import json
import schedule
import threading
from datetime import datetime, timezone, timedelta
from http.server import HTTPServer, BaseHTTPRequestHandler

# Notifier module import
try:
    from shared.notifier import send_alert
except ImportError:
    # Handle path issues if needed
    import sys
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from shared.notifier import send_alert

# Credential Health Checker import
try:
    from shared.credential_health_checker import run_full_health_check, send_health_alert
except ImportError:
    run_full_health_check = None
    send_health_alert = None

from ops_logger import get_ops_logger
ops = get_ops_logger("Swc_Email_Responder", "Scheduler")

# ═══════════════════════════════════════════════════════════════
# 🕐 Timezone Sabitleri
# ═══════════════════════════════════════════════════════════════
# Railway sunucuları UTC'de çalışır. Schedule saatleri UTC olarak
# yazılmıştır. Loglarda Türkiye saatini göstermek için offset
# kullanıyoruz.
# ═══════════════════════════════════════════════════════════════
TR_OFFSET = timedelta(hours=3)

def tr_now():
    """Şu anki Türkiye saatini döndür (UTC+3)."""
    return datetime.now(timezone.utc) + TR_OFFSET


# ═══════════════════════════════════════════════════════════════
# 🏥 Health Check Sunucusu
# ═══════════════════════════════════════════════════════════════
# Railway HTTP trafiği olmayan servisleri uyutabiliyor (idle sleep).
# Bu küçük sunucu Railway'e "ben hâlâ yaşıyorum" sinyali gönderir.
# Ayrıca servis-izleyici gibi dış sistemler de bu endpoint'i
# kullanarak servisin sağlığını kontrol edebilir.
# ═══════════════════════════════════════════════════════════════

# Global durum bilgisi — health check endpoint'i bunu döner
_service_status = {
    "service": "sweatcoin-email-automation",
    "scheduler_started_at": None,
    "last_heartbeat": None,
    "last_job_run": None,
    "last_job_result": None,
    "next_run": None,
    "total_runs": 0,
    "total_errors": 0,
}


class HealthHandler(BaseHTTPRequestHandler):
    """Basit health check + trigger HTTP handler."""

    def do_GET(self):
        """
        GET / → servis durumu JSON olarak döner.
        GET /trigger/outreach → outreach'i acil tetikler (tüm pending'lere).
        GET /trigger/data-fetch → data fetch'i acil tetikler.
        """
        path = self.path.rstrip("/")
        
        if path == "/trigger/outreach":
            self._trigger_outreach()
            return
        elif path == "/trigger/data-fetch":
            self._trigger_data_fetch()
            return
        
        # Default: Health check
        _service_status["last_heartbeat"] = datetime.now().isoformat()
        _service_status["next_run"] = str(schedule.next_run()) if schedule.jobs else None
        _service_status["uptime_seconds"] = int(
            (datetime.now() - datetime.fromisoformat(_service_status["scheduler_started_at"])).total_seconds()
        ) if _service_status["scheduler_started_at"] else 0

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(_service_status, indent=2).encode())

    def _trigger_outreach(self):
        """Outreach'i arka planda tetikle — tüm pending'lere email gönder."""
        import threading
        def _run():
            try:
                import main
                print("\n🚨 ACIL OUTREACH TETİKLENDİ (HTTP trigger)")
                stats = main.process_outreach_emails(tab_name="In EN, Roblox", fetched_only=False)
                print(f"✅ Acil outreach tamamlandı: {stats}")
                _service_status["last_job_run"] = tr_now().isoformat()
                _service_status["last_job_result"] = f"manual_outreach: {stats.get('sent', 0)} sent"
            except Exception as e:
                print(f"❌ Acil outreach hatası: {e}")
                import traceback
                traceback.print_exc()
        
        threading.Thread(target=_run, daemon=True).start()
        
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps({
            "status": "triggered",
            "task": "outreach",
            "mode": "all_pending",
            "message": "Outreach arka planda başlatıldı. Sonuçlar loglardan takip edilebilir."
        }).encode())

    def _trigger_data_fetch(self):
        """Data fetch'i arka planda tetikle."""
        import threading
        def _run():
            try:
                import main
                print("\n🚨 ACIL DATA FETCH TETİKLENDİ (HTTP trigger)")
                stats = main.fetch_daily_emails(tab_name="In EN, Roblox", limit=100)
                print(f"✅ Acil data fetch tamamlandı: {stats}")
                _service_status["last_job_run"] = tr_now().isoformat()
                _service_status["last_job_result"] = f"manual_fetch: {stats.get('fetched', 0)} rows"
            except Exception as e:
                print(f"❌ Acil data fetch hatası: {e}")
                import traceback
                traceback.print_exc()
        
        threading.Thread(target=_run, daemon=True).start()
        
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps({
            "status": "triggered",
            "task": "data_fetch",
            "message": "Data fetch arka planda başlatıldı."
        }).encode())

    def log_message(self, format, *args):
        """Health check loglarını bastırma — ana logları kirletmesin."""
        pass


def start_health_server():
    """Health check sunucusunu ayrı bir thread'de başlat."""
    port = int(os.environ.get("PORT", 8080))
    server = HTTPServer(("0.0.0.0", port), HealthHandler)
    print(f"🏥 Health check sunucusu aktif: http://0.0.0.0:{port}/")
    server.serve_forever()


# ═══════════════════════════════════════════════════════════════
# 📧 Email İşlem Fonksiyonları
# ═══════════════════════════════════════════════════════════════

def run_automation():
    """Ana email responder otomasyonunu çalıştır."""
    now = tr_now()
    weekday = now.weekday()  # 0=Pzt, 6=Paz
    
    # Hafta sonu kontrolü (ekstra güvenlik)
    if weekday >= 5:
        print(f"📅 {now.strftime('%Y-%m-%d %H:%M')} — Hafta sonu, çalışmıyorum.")
        return
    
    print(f"\n{'='*60}")
    print(f"🚀 Email Responder tetiklendi: {now.strftime('%Y-%m-%d %H:%M:%S')} (TR)")
    print(f"{'='*60}\n")
    
    _service_status["total_runs"] += 1
    
    try:
        # Yeni multi-agent sistemi çalıştır
        import main
        main.process_emails()
        print(f"\n✅ Email Responder tamamlandı: {tr_now().strftime('%H:%M:%S')} (TR)")
        _service_status["last_job_run"] = tr_now().isoformat()
        _service_status["last_job_result"] = "success"
        get_ops_logger("Swc_Email_Responder", "Responder").success("Email Responder tamamlandı")
    except Exception as e:
        print(f"❌ Email Responder hatası: {e}")
        import traceback
        traceback.print_exc()
        
        _service_status["last_job_run"] = tr_now().isoformat()
        _service_status["last_job_result"] = f"error: {str(e)[:200]}"
        _service_status["total_errors"] += 1
        get_ops_logger("Swc_Email_Responder", "Responder").error("Email Responder çöktü", exception=e)
        
        # Sadece ardışık hatalar için veya önemli exception'lar için bildirim gönder
        err_msg = traceback.format_exc()
        # Bildirimi tetikle
        send_alert("Swc Email Responder: Görev Çöktü", f"Email Responder (process_emails) çalışırken bir hata oluştu:\n\n{str(e)}\n\n{err_msg[:1000]}")


def run_data_fetch():
    """Günlük veri aktarma — Kaynak sheet'ten 100 yeni satırı hedef sheet'e aktar."""
    now = tr_now()
    weekday = now.weekday()
    
    if weekday >= 5:
        print(f"📅 {now.strftime('%Y-%m-%d %H:%M')} — Hafta sonu, veri aktarma çalışmıyor.")
        return
    
    print(f"\n{'='*60}")
    print(f"📥 Data Fetch tetiklendi: {now.strftime('%Y-%m-%d %H:%M:%S')} (TR)")
    print(f"{'='*60}\n")
    
    _service_status["total_runs"] += 1
    
    try:
        import main
        fetch_stats = main.fetch_daily_emails(tab_name="In EN, Roblox", limit=100)
        
        fetched = fetch_stats.get('fetched', 0) if fetch_stats else 0
        print(f"\n✅ Data Fetch tamamlandı: {fetched} satır aktarıldı ({tr_now().strftime('%H:%M:%S')} TR)")
        _service_status["last_job_run"] = tr_now().isoformat()
        _service_status["last_job_result"] = f"data_fetch: {fetched} rows"
        get_ops_logger("Swc_Email_Responder", "Pipeline").success("Data Fetch tamamlandı", f"{fetched} satır aktarıldı")
        
        # 0 satır aktarıldıysa uyarı gönder — silent failure tespiti
        if fetched == 0:
            dedup_skipped = fetch_stats.get('skipped_dedup', 0) if fetch_stats else 0
            print(f"\n⚠️ DİKKAT: 0 satır aktarıldı! Dedup ile atlanan: {dedup_skipped}")
            print("   Kaynak sheet'te yeni veri olup olmadığını kontrol edin.")
            send_alert(
                "Swc Email Responder: Data Fetch — 0 Satır Aktarıldı",
                f"Bugünkü data fetch işlemi 0 satır aktardı.\n"
                f"Dedup ile atlanan: {dedup_skipped}\n\n"
                f"Muhtemel neden: Kaynak sheet'teki tüm veriler zaten hedef sheet'te mevcut.\n"
                f"Çözüm: Kaynak sheet'e (email çekme) yeni veri eklenmeli."
            )
    except Exception as e:
        print(f"❌ Data Fetch hatası: {e}")
        import traceback
        traceback.print_exc()
        
        _service_status["last_job_run"] = tr_now().isoformat()
        _service_status["last_job_result"] = f"error: {str(e)[:200]}"
        _service_status["total_errors"] += 1
        
        err_msg = traceback.format_exc()
        send_alert("Swc Email Responder: Data Fetch Görevi Çöktü", f"Data Fetch çalışırken bir hata oluştu:\n\n{str(e)}\n\n{err_msg[:1000]}")
        get_ops_logger("Swc_Email_Responder", "Pipeline").error("Data Fetch çöktü", exception=e)


def run_outreach():
    """Outreach email gönderimi + statü senkronizasyonu."""
    now = tr_now()
    weekday = now.weekday()
    
    if weekday >= 5:
        print(f"📅 {now.strftime('%Y-%m-%d %H:%M')} — Hafta sonu, outreach çalışmıyor.")
        return
    
    print(f"\n{'='*60}")
    print(f"📨 Outreach tetiklendi: {now.strftime('%Y-%m-%d %H:%M:%S')} (TR)")
    print(f"{'='*60}\n")
    
    _service_status["total_runs"] += 1
    
    try:
        import main

        # ADIM 1: Dünkü veriye outreach email gönder
        print("\n📬 ADIM 1: Dünkü fetch verisine outreach email gönderimi...")
        mailer_stats = main.process_outreach_emails(tab_name="In EN, Roblox", fetched_only=True)

        # ADIM 1b: Dünkü veri yoksa, tüm pending'lere fallback yap
        sent_count = mailer_stats.get('sent', 0) if mailer_stats else 0
        if sent_count == 0:
            print("\n⚠️ Dünkü fetch verisi boş — tüm pending kişilere fallback outreach başlatılıyor...")
            mailer_stats = main.process_outreach_emails(tab_name="In EN, Roblox", fetched_only=False)
            sent_fallback = mailer_stats.get('sent', 0) if mailer_stats else 0
            print(f"   Fallback outreach: {sent_fallback} email gönderildi.")

        # ADIM 2: Thread statülerini güncelle
        print("\n🔄 ADIM 2: Thread statü senkronizasyonu...")
        syncer_stats = main.sync_outreach_status(tab_name="In EN, Roblox")

        # ADIM 3: Günlük rapor emaili gönder
        print("\n📊 ADIM 3: Günlük rapor gönderimi...")
        report_result = main.send_daily_report(
            mailer_stats=mailer_stats or {"sent": 0, "skipped": 0, "errors": 0},
            syncer_stats=syncer_stats or {"updated": 0, "unchanged": 0, "errors": 0},
            tab_name="In EN, Roblox"
        )

        if report_result and report_result.get("sent"):
            print(f"\n📧 Rapor emaili gönderildi!")
        else:
            error_msg = report_result.get("error", "bilinmeyen hata") if report_result else "None döndü"
            print(f"\n⚠️ Rapor gönderilemedi: {error_msg}")

        print(f"\n✅ Outreach tamamlandı: {tr_now().strftime('%H:%M:%S')} (TR)")
        _service_status["last_job_run"] = tr_now().isoformat()
        _service_status["last_job_result"] = "success"
        get_ops_logger("Swc_Email_Responder", "Outreach").success("Outreach tamamlandı")
    except Exception as e:
        print(f"❌ Outreach hatası: {e}")
        import traceback
        traceback.print_exc()
        
        _service_status["last_job_run"] = tr_now().isoformat()
        _service_status["last_job_result"] = f"error: {str(e)[:200]}"
        _service_status["total_errors"] += 1
        
        err_msg = traceback.format_exc()
        send_alert("Swc Email Responder: Outreach Görevi Çöktü", f"Outreach çalışırken bir hata oluştu:\n\n{str(e)}\n\n{err_msg[:1000]}")
        get_ops_logger("Swc_Email_Responder", "Outreach").error("Outreach çöktü", exception=e)


def run_credential_health_check():
    """Tüm bağlı servislerin credential sağlığını kontrol et."""
    now = tr_now()
    
    print(f"\n{'='*60}")
    print(f"🏥 Credential Health Check tetiklendi: {now.strftime('%Y-%m-%d %H:%M:%S')} (TR)")
    print(f"{'='*60}\n")
    
    _service_status["total_runs"] += 1
    
    if run_full_health_check is None:
        print("⚠️ credential_health_checker modülü yüklenemedi, atlanıyor.")
        return
    
    try:
        report = run_full_health_check()
        
        if report["problems"] or report["warnings"]:
            print(f"\n📤 Sağlık sorunları tespit edildi, bildirim gönderiliyor...")
            send_health_alert(report["problems"], report["warnings"])
        
        _service_status["last_job_run"] = tr_now().isoformat()
        _service_status["last_job_result"] = f"health_check: {len(report['problems'])} sorun, {len(report['warnings'])} uyarı"
        print(f"\n✅ Health Check tamamlandı: {tr_now().strftime('%H:%M:%S')} (TR)")
    except Exception as e:
        print(f"❌ Credential Health Check hatası: {e}")
        import traceback
        traceback.print_exc()
        
        _service_status["last_job_run"] = tr_now().isoformat()
        _service_status["last_job_result"] = f"error: {str(e)[:200]}"
        _service_status["total_errors"] += 1
        
        send_alert("Credential Health Check Çöktü", f"Sağlık kontrolü çalışırken hata:\n{str(e)}")


# ═══════════════════════════════════════════════════════════════
# 🚀 Ana Giriş Noktası
# ═══════════════════════════════════════════════════════════════

def main():
    now_utc = datetime.now(timezone.utc)
    hour = now_utc.hour
    now_tr = tr_now()
    
    print("="*60)
    print("📧 Sweatcoin Email Automation — Railway Cron")
    print(f"   🕐 Sunucu UTC: {now_utc.strftime('%H:%M')} → TR saati: {now_tr.strftime('%H:%M')}")
    print("="*60)
    
    # Cron at 07:00 UTC (10:00 TR) runs everything
    if hour == 7:
        print("\n🌅 Morning Run (07:xx UTC) - Running all tasks...")
        run_credential_health_check()
        run_data_fetch()
        run_outreach()
        run_automation()
    else:
        print(f"\n🕑 Subsequent Run ({now_utc.strftime('%H:%M')} UTC) - Running only Email Responder...")
        run_automation()
        
    print("\n✅ All tasks completed successfully. Exiting.")
    ops.wait_for_logs()
    sys.exit(0)

if __name__ == '__main__':
    main()
