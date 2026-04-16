# CRM Agent — Heartbeat

## Schedule
- **Günlük döngü**: Her gün 08:30
- **Haftalık inceleme**: Her Pazartesi 09:00

## Günlük Döngü

### 1. Bağlam Oku (5 dk)
- `journal/entries/` — Son 24 saatin ajanlar arası bildirimleri
- `knowledge/STRATEGY.md` — Mevcut öncelikler
- `data/imports/new_clients.csv` — Bekleyen yeni müşteri var mı?

### 2. Durumu Değerlendir (5 dk)
Sırasıyla kontrol et:
- Bugün vadesi gelen follow_up var mı? → **FOLLOW_UP_SCHEDULER** çalıştır
- Yeni import bekliyor mu? → **CONTACT_MANAGER** çalıştır
- Uyarı durumu yok → log yaz ve bitir

### 3. Skill Çalıştır
```
follow_up_due AND new_import? → Önce CONTACT_MANAGER, sonra FOLLOW_UP_SCHEDULER
follow_up_due? → FOLLOW_UP_SCHEDULER
new_import? → CONTACT_MANAGER
ikisi de yok? → Pasif müşteri kontrolü yap, journal'a yaz
```

### 4. Journal'a Yaz
- Ne yapıldı (kaç takip gönderildi, kaç yeni müşteri eklendi)
- Dikkat çeken bulgu varsa belirt
- Sonraki gün için not bırak

## Haftalık İnceleme (Pazartesi 09:00)

1. **Veri topla**: Son 7 günün interaction ve follow_up kayıtlarını incele
2. **Skorla**:
   - Tamamlanan follow_up oranı → KPI 1
   - 7 günde iletişim kurulan aktif müşteri oranı → KPI 2
   - Won lead sayısı (satış kapandıysa commissions tablosundan) → KPI 3
3. **Analiz**: Bu haftanın KPI hareketleri geçen haftayla kıyasla
4. **MEMORY.md güncelle**: Doğrulanan pattern varsa ekle
5. **Journal'a yaz**: Haftalık CRM özeti (format: WEEKLY_REVIEW.md şablonu)
6. **Output üret**: `outputs/YYYY-MM-DD_crm_weekly_summary.md`

## Eskalasyon Kuralları
- KPI 1 (takip tamamlanma) < %70 → Journal'a ACIL notu düş, danışmana WA uyarısı için communication-agent'a bildir
- 5+ müşteri 30 günden fazla sessiz → Human'a bildir (orchestrator üzerinden)
- Yeni müşteri CSV formatı hatalıysa → Human'a yönlendir, import'ı durdur
