# Consultant Agent — Heartbeat

## Schedule
- **Sertifika kontrolü**: Her Pazartesi 09:00
- **Profil tamlık kontrolü**: Haftalık, Pazartesi 09:30
- **Aylık performans raporu**: Her ayın 2'si 09:00

## Haftalık Döngü (Pazartesi)

### 09:00 — Sertifika Kontrolü
1. Süresi 30 günde dolacak sertifikaları tespit et
2. Süresi dolan varsa → danışmana WA uyarısı + admin bildirimi
3. CERTIFICATION_TRACKER çalıştır

### 09:30 — Profil Tamlık Kontrolü
1. Eksik alan olan danışmanları tespit et (zorunlu alanlar: profil fotosu, telefon, vergi no, yetki belgesi)
2. Eksik danışmanlara WA hatırlatma
3. PROFILE_MANAGER: profil tamlık oranını hesapla + rapor üret

## Aylık Performans Raporu (Ayın 2'si 09:00)
1. Önceki ayın verilerini topla: satış sayısı, komisyon tutarı, müşteri görüşme sayısı
2. Her danışman için bireysel rapor
3. Takım genel raporu
4. n8n webhook: danışmanlara bireysel WA mesajı

## Eskalasyon
- Danışman 30+ gün hiç müşteri görüşmemişse → Admin'e bildir
- Yetki belgesi süresi dolduysa → ACIL admin bildirimi
- Profil tamlık < %70 oldu → Human'a eskalasyon
