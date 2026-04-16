"""
Daily Reporter — Gunluk outreach raporu
========================================
Outreach mailer ve status syncer sonuclarini derleyip
EMAIL_ADRESI_BURAYA adresine rapor emaili gonderir.

Gonderici: "swc" ([İŞ_EMAIL_ADRESI]) — Railway'de token mevcut
Alici: EMAIL_ADRESI_BURAYA
"""

import sys
import os
import base64
from email.mime.text import MIMEText
from datetime import datetime, timezone, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from shared.google_auth import get_gmail_service

TR_OFFSET = timedelta(hours=3)
REPORT_RECIPIENT = "EMAIL_ADRESI_BURAYA"

# Turkce gun isimleri
_GUN_ISIMLERI = ["Pazartesi", "Sali", "Carsamba", "Persembe", "Cuma", "Cumartesi", "Pazar"]
_AY_ISIMLERI = ["", "Ocak", "Subat", "Mart", "Nisan", "Mayis", "Haziran",
                "Temmuz", "Agustos", "Eylul", "Ekim", "Kasim", "Aralik"]


def _tr_now():
    return datetime.now(timezone.utc) + TR_OFFSET


def _format_tr_date(dt):
    """Turkce tarih formati: '15 Mart 2026, Pazartesi'"""
    gun = _GUN_ISIMLERI[dt.weekday()]
    ay = _AY_ISIMLERI[dt.month]
    return f"{dt.day} {ay} {dt.year}, {gun}"


def _build_report_body(mailer_stats, syncer_stats, tab_name):
    """
    Istatistiklerden okunabilir rapor metni olustur.
    """
    now = _tr_now()
    date_str = _format_tr_date(now)

    sent = mailer_stats.get("sent", 0)
    skipped = mailer_stats.get("skipped", 0)
    mail_errors = mailer_stats.get("errors", 0)

    updated = syncer_stats.get("updated", 0)
    unchanged = syncer_stats.get("unchanged", 0)
    sync_errors = syncer_stats.get("errors", 0)
    details = syncer_stats.get("details", [])

    total_tracked = updated + unchanged + sync_errors

    lines = [
        "SWEATCOIN OUTREACH — GUNLUK RAPOR",
        "=" * 40,
        f"Tarih: {date_str}",
        f"Sekme: {tab_name}",
        "",
        "--- OUTREACH EMAIL ---",
        f"Gonderilen: {sent}",
        f"Atlanan: {skipped}",
        f"Hata: {mail_errors}",
        "",
        "--- STATUS GUNCELLEMELERI ---",
        f"Guncellenen: {updated}",
        f"Degismeyen: {unchanged}",
        f"Hata: {sync_errors}",
    ]

    if details:
        lines.append("")
        lines.append("--- YANIT DETAYLARI ---")
        for i, d in enumerate(details, 1):
            lines.append(f"{i}. {d['channel_name']} — {d['new_status']}")
            if d.get("snippet"):
                lines.append(f'   "{d["snippet"]}"')

    lines.extend([
        "",
        "--- OZET ---",
        f"Toplam email gonderilen: {sent}",
        f"Toplam takip edilen: {total_tracked}",
        "",
        "Bu rapor otomatik olusturulmustur.",
    ])

    return "\n".join(lines)


def run(mailer_stats, syncer_stats, tab_name="In EN, Roblox"):
    """
    Gunluk rapor emaili gonder.

    Returns: dict {"sent": bool, "error": str or None}
    """
    print("=" * 60)
    print("📊 Daily Reporter")
    print(f"   📋 Sekme: {tab_name}")
    print("=" * 60)

    body = _build_report_body(mailer_stats, syncer_stats, tab_name)

    now = _tr_now()
    date_short = f"{now.day} {_AY_ISIMLERI[now.month]} {now.year}"
    subject = f"SWC Outreach Rapor — {date_short}"

    try:
        gmail_service = get_gmail_service("swc")

        message = MIMEText(body)
        message['to'] = REPORT_RECIPIENT
        message['subject'] = subject
        message['from'] = '[İŞ_EMAIL_ADRESI]'

        raw = base64.urlsafe_b64encode(message.as_bytes()).decode('utf-8')
        gmail_service.users().messages().send(
            userId='me',
            body={'raw': raw}
        ).execute()

        print(f"  ✅ Rapor gönderildi: {REPORT_RECIPIENT}")
        print(f"  📧 Subject: {subject}")
        return {"sent": True, "error": None}
    except Exception as e:
        print(f"  ❌ Rapor gönderilemedi: {e}")
        return {"sent": False, "error": str(e)}


if __name__ == '__main__':
    # Test: bos stats ile rapor gonder
    test_mailer = {"sent": 3, "skipped": 1, "errors": 0}
    test_syncer = {
        "updated": 2, "unchanged": 5, "errors": 0,
        "details": [
            {"channel_name": "TestChannel", "email": "test@example.com",
             "new_status": "Replied - Awaiting Response", "snippet": "I'm interested..."},
        ]
    }
    run(test_mailer, test_syncer)
