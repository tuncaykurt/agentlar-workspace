# Skill: COMMUNICATION_REPORTER

## Purpose
Haftalık iletişim metrikleri raporu oluştur: WA yanıt oranı, çağrı istatistikleri, kampanya sonuçları.

## Serves Goals
- İletişim log doğruluğu %100

## Inputs
- Supabase: `interactions` (son 7 gün)
- Supabase: `campaigns` ve `campaign_logs` (son 7 gün)

## Process
1. WA metrikleri: gönderilen / yanıtlanan / okunmayan
2. Çağrı metrikleri: toplam çağrı, ortalama süre, cevapsız oranı
3. Kampanya metrikleri: gönderilen kampanya sayısı, teslim oranı
4. Danışman bazında dağılım
5. Önceki haftayla kıyasla (MEMORY.md'den)
6. Rapor üret + journal'a yaz

## Outputs
- `outputs/YYYY-MM-DD_communication_report.md`
- Journal girişi (özet metrikler)
- MEMORY.md güncellemesi (trend doğrulanmışsa)

## Quality Bar
- Her danışman için ayrı satır
- WA yanıt oranı kanaldan bağımsız doğru hesaplanmalı (inbound / outbound ayrı)
