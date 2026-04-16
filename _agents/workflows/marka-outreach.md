---
description: Marka Outreach — markalarla iş birliği için lead bulma, kişiselleştirme ve outreach pipeline'ı
---

# 🤝 Marka Outreach

> **Agent:** Bu workflow `_agents/musteri-kazanim/AGENT.md` agent'ının bir parçasıdır.
> **Proje:** `Projeler/Marka_Is_Birligi/`
> Tek başına `/marka-outreach` komutuyla da çalıştırılabilir.

Marka iş birliği outreach sürecini uçtan uca yönetir: marka bulma, iletişim bilgisi toplama, kişiselleştirilmiş HTML e-posta gönderimi.

---

## Gerekli Skill'ler

| Skill | Yol | Ne İçin |
|-------|-----|---------|
| Lead Generation | `_skills/lead-generation/SKILL.md` | Marka lead bulma |
| E-posta Gönderim | `_skills/eposta-gonderim/SKILL.md` | Gmail API ile gönderim |

## Gerekli Kaynaklar

| Kaynak | Yol | Açıklama |
|--------|-----|----------|
| Kampanya Config | `Projeler/Marka_Is_Birligi/config/kampanya.yaml` | Kampanya ayarları |
| Marka CSV | `Projeler/Marka_Is_Birligi/data/markalar.csv` | Mevcut marka listesi |
| HTML Şablon | `Projeler/Marka_Is_Birligi/mail_templates/collaboration_tr.html` | İş birliği email şablonu |
| API Anahtarları | `_knowledge/api-anahtarlari.md` | Apify, Gmail credential'ları |
| Agent Yönergesi | `_agents/musteri-kazanim/AGENT.md` | Orkestrasyon mantığı |

---

## Adımlar

### Adım 0: Hazırlık

1. **Kampanya config'ini oku:**
   - `Projeler/Marka_Is_Birligi/config/kampanya.yaml`
   - `hedef_tip`, `icp`, `arama`, `outreach` ve `sequence` parametrelerini kontrol et

2. **Mevcut marka listesini kontrol et:**
   - `Projeler/Marka_Is_Birligi/data/markalar.csv` dosyasını oku
   - `outreach_status: Pending` olan markaları say
   - Yeni marka eklenmesi gerekiyor mu kullanıcıya sor

3. **API anahtarlarını doğrula:**
   - `_knowledge/api-anahtarlari.md` → Apify token, Gmail OAuth credential'ları mevcut mu?

---

### Adım 1: Marka Lead Toplama (Opsiyonel)

> ⚠️ Mevcut listede yeterli marka varsa bu adım atlanabilir.

1. Kullanıcıdan hedef sektörleri ve bölgeyi onayla
2. `_skills/lead-generation/SKILL.md`'deki pipeline'ı kullan:
   - Google Maps: `compass/crawler-google-places` → sektöre göre firma bul
   - Web Enrichment: `vdrmota/contact-info-scraper` → iletişim bilgisi çıkar
3. Bulunan markaları `markalar.csv`'ye **Antigravity standart formatında** ekle:
   - `lead_id`: `MIB-XXX` formatında
   - `outreach_status`: `Pending`
   - Tüm standart sütunları doldur

---

### Adım 2: Marka Listesini Kullanıcıya Onayla

1. `markalar.csv`'deki `Pending` durumundaki markaları listele
2. Her marka için gösterilecek bilgiler:
   - Marka adı, e-posta, sektör
3. Kullanıcıdan onay al: "Bu markalara outreach gönderilebilir mi?"
4. Onay alınmadıysa → liste düzenlemesini bekle

---

### Adım 3: Kişiselleştirme

1. **HTML şablonu oku:**
   - `Projeler/Marka_Is_Birligi/mail_templates/collaboration_tr.html`

2. **Her marka için kişiselleştir:**
   - `{brand_name}` → Marka adı (CSV'den)
   - `{portfolio_url}` → [İSİM]'ın portfolyo linki
   - Konu satırı: `"{marka_adi} x [İSİM SOYAD] | İş Birliği Teklifi"`

3. **Kişiselleştirme Kuralları** (Outreach SKILL'den):
   - Doğal Türkçe, çeviri kokmayan ifadeler
   - Markanın sektörüne özel atıf (CSV notlarından)
   - Samimi ama profesyonel ton (influencer profili)

---

### Adım 4: Gönderim

1. **Dry Run (ZORUNLU — İlk seferde):**
   - İlk 3 markanın kişiselleştirilmiş mailini önizleme olarak göster
   - Kullanıcı onayı al → `dry_run: false`

2. **Gmail bağlantısı:**
   - `_skills/eposta-gonderim/scripts/send_email.py` kullan
   - Credentials: `_knowledge/api-anahtarlari.md` → Gmail OAuth 2.0
   - Token: `_skills/eposta-gonderim/token.json`

3. **Gönderim komutu:**
   ```bash
   python3 _skills/eposta-gonderim/scripts/send_email.py \
     --to "{email}" \
     --subject "{marka_adi} x [İSİM SOYAD] | İş Birliği Teklifi" \
     --body "{kisisellestirilmis_html}" \
     --csv "Projeler/Marka_Is_Birligi/data/markalar.csv" \
     --row_id {satir_no}
   ```

4. **Rate Limiting:**
   - Günlük max: 30 (kampanya.yaml'dan)
   - İki mail arası: 10 dakika
   - Sadece 09:00-17:00 arası, hafta içi

5. **Durum güncelleme:**
   - CSV'de `outreach_status` → `Sent` / `Failed`
   - `outreach_date` → Gönderim tarihi

---

### Adım 5: Raporlama

Gönderim sonrası kullanıcıya özet:

```
📊 Marka Outreach Özeti
══════════════════════════
• Toplam marka: X
• Gönderilen: X  
• Başarısız: X
• E-posta yok: X
• Zaten gönderilmiş: X
• Cevaplanmış: X
```

---

## Hata Yönetimi

| Hata | Çözüm |
|------|-------|
| Token hatası | `token.json` sil, terminalde 1 kez script çalıştır |
| Gmail limiti | Kampanyayı durdur, ertesi gün devam |
| Boş e-posta | `outreach_status: "No Email"` yaz, atla |
| Bounce | E-postayı geçersiz işaretle |

---

## Özet Kontrol Listesi

- [ ] Kampanya config'i okundu
- [ ] Marka listesi kontrol edildi
- [ ] (Opsiyonel) Yeni markalar eklendi
- [ ] Kullanıcı onayı alındı
- [ ] HTML şablon kişiselleştirildi
- [ ] Dry run yapıldı ve onaylandı
- [ ] Gönderim tamamlandı
- [ ] CSV güncellendi
- [ ] Sonuç raporu verildi

---

## İlişkili Workflow'lar

- `/lead-toplama` — Sadece marka bulma kısmı
- `/mail-gonder` — Sadece gönderim kısmı
- `/fatura-kes` — İş birliği onaylandıysa fatura oluşturma
