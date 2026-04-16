---
description: Mail Gönder — toplanan lead listesine Gmail API ile kişiselleştirilmiş e-posta gönder
---

# 📧 Outreach — E-posta Gönderme

> **Agent:** Bu workflow `_agents/musteri-kazanim/AGENT.md` agent'ının bir parçasıdır.
> Agent'ın 5 adımlı pipeline'ındaki **Adım 3 (Kişiselleştirme)**, **Adım 4 (Gönderim)** ve **Adım 5 (Takip & Sequence)** süreçlerini kapsar.
> Tek başına `/mail-gonder` komutuyla da çalıştırılabilir.

Lead listesine Gmail API üzerinden kişiselleştirilmiş, zamanlı ve kontrollü e-posta outreach yapma. Sequence yönetimi ve dallanmalı takip akışı dahil.

---

## Gerekli Skill

`_skills/eposta-gonderim/SKILL.md` → **ÖNCE OKU** — Gmail API entegrasyonu, kişiselleştirme kuralları ve gönderim motoru detayları burada.

## Gerekli Kaynaklar

| Kaynak | Yol | Açıklama |
|--------|-----|----------|
| Outreach Skill | `_skills/eposta-gonderim/SKILL.md` | Gmail API gönderim motoru |
| API Anahtarları | `_knowledge/api-anahtarlari.md` | Google OAuth 2.0 credential'ları |
| Agent Yönergesi | `_agents/musteri-kazanim/AGENT.md` | Sequence mantığı ve orkestrasyon detayları |
| Email Şablonları (TR) | `_agents/musteri-kazanim/templates/email-tr.md` | Türkçe şablonlar |
| Email Şablonları (EN) | `_agents/musteri-kazanim/templates/email-en.md` | İngilizce şablonlar |
| Sequence Profilleri | `_agents/musteri-kazanim/templates/sequence-profilleri.md` | Sektöre göre sequence konfigürasyonları |
| Kampanya Config'leri | `_agents/musteri-kazanim/config/` | Outreach ayarları dahil YAML'lar |
| Outreach Scripti | `_agents/musteri-kazanim/scripts/outreach_gonder.py` | Kişiselleştirme + gönderim birleşik script |
| Takip Scripti | `_agents/musteri-kazanim/scripts/takip_guncelle.py` | Sequence takip ve güncelleme |

---

## Adımlar

### Adım 0: Lead Listesini Hazırla

1. **Lead listesi var mı?**
   - EVET → CSV veya JSON dosyasının yolunu belirle
     - Agent üzerinden: `_agents/musteri-kazanim/data/{kampanya_adi}_enriched.csv`
     - Bağımsız: kullanıcının verdiği CSV/JSON dosyası
   - HAYIR → Önce `/lead-toplama` workflow'unu çalıştır

2. **Zorunlu sütunları kontrol et:**
   - `email` — Boş olanları filtrele (`outreach_status: "No Email"`)
   - `ad` — Kişiselleştirme için gerekli
   - `platform` — Bağlam için gerekli

3. **Config varsa yükle:**
   - `_agents/musteri-kazanim/config/{kampanya}.yaml` → outreach ve sequence ayarları
   - Config yoksa → kullanıcıdan manuel parametreler al

---

### Adım 1: E-posta Şablonu Seçimi

1. **Dil belirle:**
   - Config'den `sablon_dili` oku (TR / EN / IT)
   - Yoksa lead listesindeki `dil` sütununa bak

2. **Şablon kaynağı seç:**

   | Dil | Şablon Dosyası | Yol |
   |-----|---------------|-----|
   | TR | Türkçe şablonlar | `_agents/musteri-kazanim/templates/email-tr.md` |
   | EN | İngilizce şablonlar | `_agents/musteri-kazanim/templates/email-en.md` |
   | Özel | Kullanıcı şablonu | Kullanıcının verdiği dosya |

3. **Şablon yoksa yaz:**
   - SKILL.md'deki formata uygun şablon oluştur
   - Şablon değişkenleri: `{ad}`, `{sirket}`, `{pozisyon}`, `{kanca}`, `{deger_onerisi}`, `{cta}`, `{platform}`

---

### Adım 2: Kişiselleştirme

Her lead için şablon değişkenlerini doldur:

```
{ad}              → Lead'in adı (CSV'den)
{sirket}          → Şirket/marka adı
{pozisyon}        → Unvan (B2B) veya platform rolü (Influencer)
{kanca}           → Kişiye özel dikkat çekici açılış (enrichment verisinden)
{deger_onerisi}   → Kampanyaya özel değer önerisi (config'den)
{cta}             → Eylem çağrısı (config'den)
{platform}        → Lead'in bulunduğu platform
```

**Kişiselleştirme Kuralları:**

1. **Doğallık:** Her mail "elle yazılmış" gibi hissettirmeli — generic/robotic olmamalı
2. **Kanca:** `{kanca}` mümkünse lead'in profiline/şirketine özel üretilmeli
3. **Konu satırı:** Her lead için kişiselleştirilmeli (şablon konu satırı da değişken desteklemeli)
4. **Varyant:** A/B test için aynı kampanyada birden fazla varyant üretilebilir

**Türkçe Kişiselleştirme Kuralları** (Outreach SKILL'den):
- Çeviri kokmayan doğal Türkçe kullan
- İlk paragraf (icebreaker) max 2 cümle
- CSV'deki bilgiye spesifik atıf yap
- Ton: bağlama göre kurumsal veya samimi

**Çıktı:** `data/{kampanya_adi}_messages.json` veya kişiselleştirilmiş CSV

---

### Adım 3: Sequence Profili Seçimi

Kampanya türüne göre uygun sequence profilini seç:

| Profil | Toplam Adım | Bekleme | Ton | Ağırlık |
|--------|-------------|---------|-----|---------|
| **SaaS / Teknoloji** | 4-5 | 2-3 gün | Doğrudan, değer odaklı | Case study |
| **E-ticaret** | 3-4 | 3-4 gün | ROI ve metrik odaklı | Sosyal kanıt |
| **Kurumsal / Sanayi** | 3 | 5-7 gün | Formal | Güven, referans |
| **Ajans / Hizmet** | 4 | 2-4 gün | Yaratıcı | Portfolio, sonuç |
| **Influencer** | 2-3 | 5-7 gün | Samimi, kısa | Viral sonuçlar |
| **UGC Creator** | 2-3 | 3-5 gün | Samimi, profesyonel | Ödeme, brief |

> Detaylı profiller: `_agents/musteri-kazanim/templates/sequence-profilleri.md`

**Config'den oku:**
```yaml
sequence:
  profil: "influencer"        # saas | eticaret | kurumsal | ajans | influencer | ugc
  toplam_adim: 3
  bekleme_suresi_acilmadi: 5  # gün
  bekleme_suresi_cevaplanmadi: 3
  gunluk_gonderim_limiti: 50
  gonderim_araligi: 5         # dakika
  gonderim_saatleri: "09:00-17:00"
  gonderim_gunleri: ["Pzt", "Sal", "Car", "Per", "Cum"]
```

---

### Adım 4: Gönderim

1. **Dry Run kontrolü (ÖNEMLİ):**
   - `dry_run: true` → Önizleme çıktısı oluştur (ilk 5 lead göster), göndermeden dur
   - Kullanıcıdan onay al → `dry_run: false` yap → gerçek gönderime geç
   - **Bağımsız kullanımda bile ilk seferde dry run zorunlu**

2. **Gmail bağlantı kurulumu:**
   - Credentials: `_knowledge/api-anahtarlari.md` → Google OAuth 2.0
   - Token: `token.json` varsa kullan, yoksa tarayıcıda onay iste
   - `invalid_grant` hatası → `token.json` sil, yeniden onay

3. **Rate limiting (Spam koruması):**
   - `gunluk_gonderim_limiti` (varsayılan: 50)
   - İki mail arası minimum bekleme: `gonderim_araligi` (varsayılan: 5 dakika)
   - Sadece `gonderim_saatleri` içinde gönder (varsayılan: 09:00-17:00)
   - Sadece `gonderim_gunleri`'nde gönder (hafta sonu yok)
   - **Warm-up:** Yeni hesaplar için ilk 2 hafta 20/gün

4. **Gönderim komutu:**
   ```bash
   # Script ile:
   python3 _agents/musteri-kazanim/scripts/outreach_gonder.py \
     --config _agents/musteri-kazanim/config/{kampanya}.yaml

   # Veya tek mail:
   python3 _skills/eposta-gonderim/scripts/send_email.py \
     --to "{email}" \
     --subject "{konu}" \
     --body "{mesaj}" \
     --csv "data/{kampanya_adi}_log.csv" \
     --row_id {satir_no}
   ```

5. **Durum takibi — her gönderimde CSV güncellenir:**
   - `outreach_status`: `Pending` → `Sent` / `Failed` / `No Email`
   - `outreach_date`: Gönderim tarihi
   - `personalized_message`: Gönderilen mesajın kopyası

**Hata yönetimi:**

| Hata | Çözüm |
|------|-------|
| `invalid_grant` / Token hatası | `token.json` sil, scripti terminalde 1 kez çalıştır |
| `quota_exceeded` / Gmail limiti | Kampanyayı durdur, kalanlar `Pending` kalır, ertesi gün devam |
| Boş e-posta adresi | `outreach_status: "No Email"` yaz, atla |
| Bounce (geri dönen) | E-postayı geçersiz işaretle, lead'i listeden çıkar |
| Bounce oranı > %2 | 🚨 GÖNDERİMİ DURDUR — listeyi temizle, doğrulamayı tekrarla |

---

### Adım 5: Takip ve Sequence Yönetimi

İlk gönderimden sonra, sequence mantığıyla dallanmalı takip:

```
ADIM 1: İlk Mail Gönderimi
  │
  ├─ ❌ Mail AÇILMADI (bekleme_suresi_acilmadi gün sonra)
  │   └─ ADIM 2a: Takip maili
  │       → Farklı konu satırı, aynı değer önerisi
  │       ├─ ❌ Yine AÇILMADI → ADIM 3a: Son deneme / farklı kanal
  │       │   └─ Cevap yoksa → sequence_durumu: "exhausted" ⏹️
  │       └─ 👁️ AÇILDI ama CEVAPLANMADI
  │           └─ ADIM 3b: Değer odaklı takip (case study, sosyal kanıt)
  │
  ├─ 👁️ Mail AÇILDI ama CEVAPLANMADI (bekleme_suresi_cevaplanmadi gün sonra)
  │   └─ ADIM 2b: Farklı açıdan yaklaşım (pain point değişikliği, yeni kanca)
  │       ├─ ❌ CEVAPLANMADI → ADIM 3c: Break-up mail (nazik kapanış, son şans)
  │       │   → sequence_durumu: "exhausted" ⏹️
  │       └─ ✅ CEVAPLANDI → Yanıt İşleme
  │
  └─ ✅ Mail CEVAPLANDI → Yanıt İşleme
```

**Yanıt İşleme:**

| Yanıt Tipi | Aksiyon |
|------------|---------|
| ✅ **Olumlu** | Toplantı planlama, kullanıcıya bildirim |
| ❌ **Olumsuz** (ilgi yok) | Kibarca teşekkür, lead'i "cold" işaretle |
| ❓ **Soru / bilgi talebi** | İlgili bilgiyi içeren yarı-otomatik yanıt hazırla |
| 🏖️ **OOO / tatil** | Bekleme süresini uzat, sonra yeniden dene |
| 🔴 **Bounce** | E-posta geçersiz işaretle, listeden çıkar |

**Takip scripti:**
```bash
python3 _agents/musteri-kazanim/scripts/takip_guncelle.py \
  --config _agents/musteri-kazanim/config/{kampanya}.yaml
```

---

## Özet Kontrol Listesi

- [ ] Lead listesi hazır ve zorunlu sütunlar mevcut
- [ ] E-posta şablonu seçildi / yazıldı
- [ ] Kişiselleştirme tamamlandı (her lead'e özel)
- [ ] Sequence profili belirlendi
- [ ] Dry run yapıldı ve kullanıcı onayı alındı
- [ ] Gmail bağlantısı kuruldu (OAuth token hazır)
- [ ] Gönderim tamamlandı (rate limiting uygulandı)
- [ ] Log CSV güncellendi (her satırda durum kaydı)
- [ ] Sonuç özeti raporter:
  - Toplam gönderilen
  - Başarılı / Başarısız
  - No Email (atlanmış)
  - Bounce oranı

---

## Sonraki Adımlar

- **Takip gerekiyorsa:** Sequence parametrelerine göre bekleme süresini hesapla, takip scriptini çalıştır
- **Yeni kampanya varsa:** `/lead-toplama` ile lead topla, sonra tekrar `/mail-gonder`
- **Agent üzerinden:** Tüm pipeline otomatik olarak `AGENT.md` yönergesine göre ilerler
