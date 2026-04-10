# Communication Agent — Heartbeat

## Schedule
- **Anlık**: Evolution API webhook (inbound WA mesajı)
- **Anlık**: Sanal santral webhook (çağrı tamamlandı)
- **Kampanya zamanı**: n8n cron (kampanya.scheduled_at geldiğinde)
- **Haftalık rapor**: Her Pazartesi 09:30

## Anlık Tetiklemeler

### İnbound WhatsApp
1. Evolution API webhook → n8n → interactions tablosuna kaydet
2. Danışmana bildirim gönder (atanmış danışman varsa)
3. Anahtar kelime tespiti: "fiyat", "randevu", "bilgi" → otomatik hızlı cevap şablonu

### Çağrı Tamamlandı (Sanal Santral)
1. CDR webhook → CALL_LOGGER çalıştır
2. Müşteriyi telefon numarasından tespit et
3. interactions tablosuna kaydet (süre, yön, kayıt URL)
4. Danışmana WA özet bildir

## Kampanya Gönderimi
1. scheduled_at = şimdi olan kampanyaları bul
2. WHATSAPP_CAMPAIGNER çalıştır
3. Tamamlandığında: status = 'completed', campaign_logs güncelle

## Haftalık Rapor (Pazartesi 09:30)
1. COMMUNICATION_REPORTER çalıştır
2. Journal'a haftalık iletişim özeti yaz

## Eskalasyon
- WA yanıt oranı < %40 → Human'a bildir
- Kampanya başarısızlık > %10 → Teknik sorun, Human'a eskalasyon
- Evolution API erişilemiyor → ACIL Human bildirimi
