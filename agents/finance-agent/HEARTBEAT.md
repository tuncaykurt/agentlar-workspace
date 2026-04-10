# Finance Agent — Heartbeat

## Schedule
- **Satış tetiklemesi**: property.status → 'sold' olduğunda anlık (n8n webhook)
- **Gider takibi**: Haftalık, her Çarşamba 10:00
- **Aylık rapor**: Her ayın 1'i 08:00

## Satış Tetiklemesi (Anlık)
1. n8n webhook: `POST /webhook/sale-closed` → COMMISSION_CALCULATOR çalıştır
2. Komisyonu hesapla ve kaydet
3. Danışmana WA bildirimi gönder (communication-agent üzerinden)
4. Journal'a yaz

## Haftalık Gider Döngüsü (Çarşamba)
1. Onaysız giderleri kontrol et (is_approved IS NULL)
2. 2+ gün bekleyen varsa yöneticiye WA hatırlatma
3. EXPENSE_TRACKER çalıştır → rapor üret

## Aylık Rapor (Ayın 1'i)
1. Önceki ayın tüm komisyon ve gider verilerini topla
2. FINANCE_REPORTER çalıştır
3. Her danışman için bireysel komisyon ekstresi üret
4. Yöneticiye genel özet, danışmanlara bireysel WA mesajı gönder

## Eskalasyon
- Komisyon hesaplama hatası tespit edilirse → Human'a ACIL bildir
- Gider onaysız 5+ gün beklemişse → Yöneticiye WA uyarısı
