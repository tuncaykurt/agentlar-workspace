# 💰 İşbirliği Tahsilat Takip

Sosyal medya işbirlikleri (YouTube & Reels) için **otomatik tahsilat hatırlatma sistemi**.
Yayınlanmış videoların ödeme durumunu Notion üzerinden takip eder ve geciken ödemeler için kademeli e-posta bildirimi gönderir.

---

## 🎯 Ne Yapar?

1. **Notion'dan veri çeker** — YouTube İşbirliği ve Reels İşbirliği veritabanlarından "Yayınlandı" durumundaki videoları alır
2. **Gecikme hesaplar** — Yayın tarihinden itibaren kaç gün geçtiğini hesaplar
3. **Kademeli bildirim gönderir:**
   - 🟡 **14 gün** geçtiyse → Sarı uyarı e-postası
   - 🔴 **28 gün** geçtiyse → Kırmızı kritik uyarı e-postası
4. **State'i Notion'da tutar** — Bildirim geçmişi Notion page yorumları üzerinden takip edilir (SQLite kullanılmaz)

---

## 🏗️ Mimari

```
Notion (YouTube DB + Reels DB)
         │
         ▼
   notion_client.py ──── Veritabanı sorgusu + yorum okuma/yazma
         │
         ▼
    database.py ──── Bildirim filtresi (gün hesabı + seviye kontrolü)
         │
         ▼
     main.py ──── Railway Native Cron + ana logic
         │
         ▼
   email_client.py ──── Gmail API (OAuth2) ile HTML e-posta gönderimi
```

### Bildirim Seviyeleri (Notion Yorumları ile)

| Seviye | Koşul | Yorum İşareti |
|--------|-------|---------------|
| 0 | Henüz bildirim yok | — |
| 1 | 14+ gün, ödeme alınmamış | `[SİSTEM] Sarı uyarı` |
| 2 | 28+ gün, ödeme alınmamış | `[SİSTEM] Kırmızı uyarı` |

---

## 📁 Dosya Yapısı

| Dosya | Açıklama |
|-------|----------|
| `main.py` | Ana giriş noktası — scheduler + alert mantığı + HTML e-posta şablonu |
| `config.py` | Ortam değişkenlerini `master.env`'den yükler, Notion DB ID'lerini tutar |
| `notion_client.py` | Notion API entegrasyonu — veritabanı sorgusu, yorum okuma/yazma |
| `database.py` | Bildirim filtresi — tarih hesabı, seviye kontrolü |
| `email_client.py` | Gmail API (OAuth2) ile e-posta gönderimi (Railway: env token, Lokal: merkezi OAuth) |
| `railway.json` | Railway deploy konfigürasyonu |
| `requirements.txt` | Python bağımlılıkları |

---

## ⚙️ Ortam Değişkenleri

| Değişken | Kaynak | Açıklama |
|----------|--------|----------|
| `NOTION_SOCIAL_TOKEN` | `master.env` | Notion Social API (yeni workspace) anahtarı |
| `GOOGLE_OUTREACH_TOKEN_JSON` | Railway env | Gmail API OAuth2 token (Railway'de JSON olarak) |

---

## 📡 Notion Veritabanları

| Veritabanı | DB ID | Anahtar Property'ler |
|------------|-------|---------------------|
| YouTube İşbirliği | `1af5cd68ba1b80c58a5ae23c91af2571` | Video Adı, Durum, Check |
| Reels İşbirliği | `1af5cd68ba1b816ebb6efff889efbb44` | Name, Status, Check, Paylaşım Tarihi |

---

## 🚀 Çalıştırma

```bash
# Lokal
python main.py

# Railway'de otomatik çalışır (Railway Cron)
# Tek seferlik uyanır, işlemi yapar ve kapanır. (Örn: Her gün 09:00 UTC)
```

---

## 🚂 Deploy Bilgisi

- **Platform:** Railway (Native Cron Job)
- **GitHub Repo:** `[GITHUB_KULLANICI]/isbirligi-tahsilat-takip`
- **Start Komutu:** `python main.py`
- **Restart Policy:** `NEVER`
- **Zamanlama:** Her gün 07:00 UTC (Railway formatında `0 7 * * *`)

*Not: Sistem sürekli çalışan bir servis olmaktan çıkarılmıştır. İhtiyaç anında tetiklenir, görevini yerine getirip saniyeler içinde tamamen sonlanır.*

---

## 📝 Versiyon Geçmişi

| Tarih | Değişiklik |
|-------|-----------|
| 2026-03-24 | 🚀 Production Stabilizasyonu: Tekrarlayan spam bildirimler önlendi (tam Notion state entegrasyonu), infinite hang'e karşı API timeout eklendi, config Railway uyumlu yapıldı |
| 2026-03-16 | Notion comment-based state'e geçiş (schema pollution önlendi) |
| 2026-03-15 | SQLite → Notion state migration |
| 2026-03-14 | Reels yayın tarihi düzeltmesi (Paylaşım Tarihi property'si) |
| 2026-03-13 | 7 gün sarı + 14 gün kırmızı bildirim sistemi |
| 2026-03-12 | İlk sürüm |
