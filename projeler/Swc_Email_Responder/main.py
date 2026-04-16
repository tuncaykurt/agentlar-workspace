"""
Sweatcoin Email Automation — Multi-Agent Sistem
================================================
Çoklu AI Agent mimarisi ile akıllı email yönetimi.

Mimari:
  📬 Gmail Inbox
       │
    🧭 Router (Dispatcher)
       ├── Sistem/Bot filtre
       ├── Thread analizi (3 katman: liste → LLM → kural)
       └── Agent yönlendirme
           │
      ┌────┴────┐
      │         │
   🎬 CS      📱 IP
   Agent      Agent
      │         │
   3 Aşama:   3 Aşama:
   Intent →   Intent →
   Draft →    Draft →
   Review     Review
      │         │
      └────┬────┘
           │
        📝 Draft

Her agent kendi bilgi tabanı, template'leri ve LLM prompt'ları ile çalışır.
Groq API (LLM) yoksa rule-based fallback otomatik devreye girer.
"""

import sys
import os

# Proje kök dizinini path'e ekle
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from shared.gmail_client import authenticate, get_unread_messages, get_message
from router.dispatcher import dispatch_email
from agents.creative_sourcing_agent import CreativeSourcingAgent
from agents.influencer_program_agent import InfluencerProgramAgent


def process_emails():
    """Ana email işleme fonksiyonu — tüm agentları orkestre eder."""
    service = authenticate()
    
    # Agent'ları başlat
    cs_agent = CreativeSourcingAgent()
    ip_agent = InfluencerProgramAgent()
    
    print("=" * 60)
    print("🤖 Sweatcoin Email Automation — Multi-Agent Sistem v2.0")
    print("   🎬 Creative Sourcing Agent: Aktif")
    print("   📱 Influencer Program Agent: Aktif")
    print("   🧠 LLM: Groq API")
    print("=" * 60)
    print("🔍 Fetching unread emails...")
    print("=" * 60)
    
    messages = get_unread_messages(service)
    
    if not messages:
        print("📭 No unread emails found. Inbox is clean!")
        return
    
    print(f"📬 Found {len(messages)} unread email(s).\n")
    
    stats = {"ignored": 0, "read_only": 0, "drafted": 0}
    
    for message in messages:
        msg_obj = get_message(service, message['id'])
        result = dispatch_email(service, msg_obj, cs_agent, ip_agent)
        
        action = result.get("action", "unknown")
        if action == "ignored":
            stats["ignored"] += 1
        elif action == "read_only":
            stats["read_only"] += 1
        elif action == "drafted":
            stats["drafted"] += 1
    
    # Agent istatistikleri
    cs_stats = cs_agent.get_stats()
    ip_stats = ip_agent.get_stats()
    
    # Sonuç Özeti
    print(f"\n{'=' * 60}")
    print("📊 İŞLEM ÖZETİ")
    print(f"{'=' * 60}")
    print(f"   📝 Taslak (Draft):       {stats['drafted']}")
    print(f"      🎬 Creative Sourcing: {cs_stats.get('creative_sourcing_drafted', 0)}")
    print(f"      📱 Influencer Prog:   {ip_stats.get('influencer_program_drafted', 0)}")
    print(f"   🔇 Sadece Okundu (Read): {stats['read_only']}")
    print(f"   ⏭️  Yok Sayılan (Ignore): {stats['ignored']}")
    print(f"   📬 Toplam İşlenen:       {sum(stats.values())}")
    print(f"{'=' * 60}")


def process_outreach_emails(tab_name="In EN, Roblox", dry_run=False, limit=None, fetched_only=False):
    """
    Google Sheet'ten pending kontaklara outreach email gönder.
    Sheet'teki 'Email Copies' sekmesinden template kullanır.
    
    Args:
        fetched_only: True ise sadece dünkü fetch edilen verilere outreach yap
    """
    from outreach.sheet_mailer import run as run_mailer
    return run_mailer(tab_name=tab_name, dry_run=dry_run, limit=limit, fetched_only=fetched_only)


def fetch_daily_emails(tab_name="In EN, Roblox", dry_run=False, limit=100):
    """
    Kaynak sheet'ten (E-mail Çekme) yeni verileri çekip
    hedef sheet'e (YouTube Email Data) aktar.
    Günde bir kere, hafta içi sabah çalışır.
    """
    from outreach.data_fetcher import run as run_fetcher
    return run_fetcher(tab_name=tab_name, dry_run=dry_run, limit=limit)


def sync_outreach_status(tab_name="In EN, Roblox", dry_run=False):
    """
    Gmail thread'lerini kontrol edip Sheet statülerini güncelle.
    'email sent' statülü kişilerin yanıt durumunu senkronize eder.
    """
    from outreach.status_syncer import run as run_syncer
    return run_syncer(tab_name=tab_name, dry_run=dry_run)


def send_daily_report(mailer_stats, syncer_stats, tab_name="In EN, Roblox"):
    """Günlük outreach raporunu email olarak gönder."""
    from outreach.daily_reporter import run as run_reporter
    return run_reporter(mailer_stats, syncer_stats, tab_name=tab_name)


if __name__ == '__main__':
    process_emails()
    print("\n✅ All emails processed.")

