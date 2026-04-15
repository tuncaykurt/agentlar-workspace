# Portfolio Agent — Heartbeat

## Schedule
- **Günlük döngü**: Her gün 09:00
- **Haftalık inceleme**: Her Cuma 17:00

## Günlük Döngü

### 1. Bağlam Oku
- `data/imports/urls.txt` — İşlenmeyi bekleyen URL var mı?
- `journal/entries/` — Yeni mülk eşleştirme isteği var mı?
- Supabase: `properties WHERE status = 'active'` — Güncelleme gereken var mı?

### 2. Karar Ağacı
```
urls.txt dolu? → URL_SCRAPER çalıştır
Aktif mülk 7+ gün güncellenmemiş? → PORTFOLIO_SYNC çalıştır  
Yeni mülk eklendi? → MATCH_ENGINE çalıştır
Hiçbiri? → Kısa log yaz, bitir
```

### 3. Haftalık İnceleme (Cuma 17:00)
1. Scraping başarı oranı hesapla
2. Portföy tamamlık oranı hesapla (zorunlu alanlar)
3. Eşleştirme metriklerini değerlendir
4. MEMORY.md güncelle
5. `outputs/YYYY-MM-DD_portfolio_report.md` üret
6. Journal'a yaz

## Eskalasyon
- Scraping başarı < %60 → Journal'a yaz + Human'a bildir (proxy/anti-bot sorunu olabilir)
- 10+ mülk eksik fotoğraflı → Danışmana WA bildirimi (communication-agent üzerinden)
