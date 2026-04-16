# 💰 Maliyet Takibi — Aylık API ve Servis Harcamaları

Bu dosya, Antigravity ekosisteminde kullanılan API ve servislerin aylık maliyetlerini takip eder.

---

## Aktif Servisler

| Servis | Plan | Aylık Maliyet | Kullanım | Notlar |
|--------|------|--------------|----------|--------|
| Coolify | Local/VDS | $0-20 | Deploy platformu | Sunucu maliyeti |
| OpenAI API | Pay-as-you-go | Değişken | LLM çağrıları | |
| Apify | Free / Paid | Değişken | Web scraping | Free: 5$/ay kredi |
| Kie AI | Paket bazlı | Değişken | Video üretimi | |
| Google Cloud | Free tier | $0 | Gmail, Drive API | Free tier yeterli |
| Notion | Free | $0 | Veritabanı | |
| GitHub | Free | $0 | Kod deposu | Private repo ücretsiz |

---

## Aylık Özet

| Ay | Toplam Harcama | En Büyük Kalem | Notlar |
|----|---------------|----------------|--------|
| _(Harcamalarınızı aylık olarak kaydedin)_ | | | |

---

## 💡 Maliyet Optimizasyon İpuçları

1. **Coolify:** Sunucu kaynaklarını (CPU/RAM) izleyin; gerekirse Docker log seviyelerini sınırlayın.
2. **OpenAI:** GPT-4o-mini modelini tercih edin — GPT-4o'dan 10x ucuz
3. **Apify:** Free tier'ı önce tüketin, sonra ücretliye geçin
4. **Google:** Service Account ile çalışın — free tier limitleri yeterli
