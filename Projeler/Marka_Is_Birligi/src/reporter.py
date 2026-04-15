#!/usr/bin/env python3
import csv
import os
import time
from datetime import datetime, timezone, timedelta
import requests
import logging

import sys

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BASE_DIR)

MARKALAR_CSV = os.path.join(BASE_DIR, "data", "markalar.csv")
TR_TZ = timezone(timedelta(hours=3))

def parse_date(date_str):
    if not date_str:
        return None
    try:
        return datetime.strptime(date_str.strip(), "%Y-%m-%d %H:%M").replace(tzinfo=TR_TZ)
    except ValueError:
        try:
            return datetime.strptime(date_str.strip(), "%Y-%m-%d").replace(tzinfo=TR_TZ)
        except ValueError:
            return None

def send_telegram_alert(message):
    try:
        token = os.environ.get("TELEGRAM_BOT_TOKEN")
        chat_id = os.environ.get("TELEGRAM_ADMIN_CHAT_ID")
        if not token or not chat_id:
            print("⚠️ TELEGRAM_BOT_TOKEN veya TELEGRAM_ADMIN_CHAT_ID env var eksik, rapor gönderilemedi.")
            return
        url = f"https://api.telegram.org/bot{token}/sendMessage"
        payload = {"chat_id": chat_id, "text": message, "parse_mode": "HTML"}
        requests.post(url, json=payload, timeout=10)
    except Exception as e:
        logging.error(f"Telegram gönderme hatası: {e}", exc_info=True)

def run_weekly_report():
    print("📊 Haftalık rapor hazırlanıyor...")
    
    now = datetime.now(TR_TZ)
    seven_days_ago = now - timedelta(days=7)
    
    outreach_count = 0
    followup_count = 0
    
    recent_threads = [] # (brand_name, thread_id)
    
    if os.path.exists(MARKALAR_CSV):
        with open(MARKALAR_CSV, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                o_date = parse_date(row.get("outreach_date"))
                f_date = parse_date(row.get("followup_date"))
                
                if o_date and o_date >= seven_days_ago:
                    outreach_count += 1
                if f_date and f_date >= seven_days_ago:
                    followup_count += 1
                    
                # Son 30 gün içindeki outreach'leri response takibi için al
                if o_date and (now - o_date).days <= 30:
                    thread_id = row.get("outreach_thread_id")
                    if thread_id:
                        recent_threads.append((row.get("marka_adi", "Bilinmeyen Marka"), thread_id))
    
    print(f"Bu hafta {outreach_count} outreach, {followup_count} follow-up yapıldı.")
    
    response_count = 0
    responded_brands = []
    
    try:
        from src.gmail_sender import get_service, SENDER_EMAIL
        service = get_service()
        
        for brand_name, thread_id in recent_threads:
            try:
                thread = service.users().threads().get(userId='me', id=thread_id).execute()
                messages = thread.get('messages', [])
                for msg in messages:
                    # Gelen mesajı kontrol et
                    # epoch timestamps (internalDate is in milliseconds)
                    internal_date = int(msg.get('internalDate', 0)) / 1000.0
                    msg_date = datetime.fromtimestamp(internal_date, tz=timezone.utc)
                    if msg_date >= seven_days_ago: # Son 7 günde gelen bir mesaj
                        # Kendimizden gelmiyorsa response'tur
                        headers = msg.get('payload', {}).get('headers', [])
                        sender = ""
                        for h in headers:
                            if h['name'] == 'From':
                                sender = h['value']
                                break
                        
                        if SENDER_EMAIL.lower() not in sender.lower() and "EMAIL_ADRESI_BURAYA" not in sender.lower():
                            response_count += 1
                            if brand_name not in responded_brands:
                                responded_brands.append(brand_name)
                            break # Aynı thread'de 1 kere saymamız yeterli
            except Exception as e:
                # Thread bulunamadı veya silindi vs.
                continue
            
    except Exception as e:
        print(f"Gmail response kontrol hatası: {e}")
        
    report = (
        "📊 <b>Marka İş Birliği - Haftalık Rapor</b>\n\n"
        f"✉️ <b>Yeni Outreach:</b> {outreach_count}\n"
        f"📬 <b>Follow-Up:</b> {followup_count}\n"
        f"💬 <b>Gelen Response:</b> {response_count}\n"
    )
    if responded_brands:
        report += f"\n<i>(Yanıt verenler: {', '.join(responded_brands)})</i>"
        
    send_telegram_alert(report)
    print("✅ Haftalık rapor gönderildi.")

if __name__ == "__main__":
    run_weekly_report()
