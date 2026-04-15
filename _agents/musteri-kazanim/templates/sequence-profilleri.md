# ⏱️ Sequence Profilleri — Sektöre Göre E-posta Sequence Konfigürasyonları

> **Konum:** `_agents/musteri-kazanim/templates/sequence-profilleri.md`
> **Kaynak:** Projeler/_arsiv/B2B_Outreach/Instruction.md — Katman 3: Cold Outreach & Akıllı Sequence Yönetimi
> **Referans:** _agents/musteri-kazanim/AGENT.md

---

## 📌 Sequence Nedir?

Bir **sequence**, bir lead'e gönderilen e-posta dizisidir. Her lead'in davranışına (açma, cevaplama, cevaplamama) göre bir sonraki adım koşullu olarak belirlenir. Bu "akıllı sequence" mantığı, B2B_Outreach projesinin 3. katmanından alınmıştır.

---

## 🔄 Sequence Dallanma Akışı (Tüm Profiller İçin Geçerli)

```
ADIM 1: İlk Mail Gönderimi
  │
  ├─ ❌ Mail AÇILMADI (bekleme_suresi_acilmadi gün sonra)
  │   └─ ADIM 2a: Takip maili
  │       │   → Farklı konu satırı, aynı değer önerisi
  │       ├─ ❌ Yine AÇILMADI
  │       │   └─ ADIM 3a: Son deneme VEYA farklı kanal (LinkedIn DM)
  │       │       └─ Cevap yoksa → sequence_durumu: "exhausted" ⏹️
  │       └─ 👁️ AÇILDI ama CEVAPLANMADI
  │           └─ ADIM 3b: Değer odaklı takip
  │               → Case study, veri, sosyal kanıt paylaş
  │
  ├─ 👁️ Mail AÇILDI ama CEVAPLANMADI (bekleme_suresi_cevaplanmadi gün sonra)
  │   └─ ADIM 2b: Farklı açıdan yaklaşım
  │       │   → Pain point değişikliği, yeni kanca
  │       ├─ ❌ CEVAPLANMADI
  │       │   └─ ADIM 3c: Break-up mail
  │       │       → Nazik kapanış, son şans
  │       │       → sequence_durumu: "exhausted" ⏹️
  │       └─ ✅ CEVAPLANDI → Yanıt İşleme Modülü
  │
  └─ ✅ Mail CEVAPLANDI → Yanıt İşleme Modülü
```

---

## 🏭 Sektöre Göre Profiller

### 1. SaaS / Teknoloji (`saas`)

| Parametre | Değer |
|-----------|-------|
| `toplam_adim` | 4-5 |
| `bekleme_suresi_acilmadi` | 2-3 gün |
| `bekleme_suresi_cevaplanmadi` | 2 gün |
| `gunluk_gonderim_limiti` | 50 |
| `gonderim_araligi` | 3-5 dakika |
| `ton` | Doğrudan, değer odaklı |
| `agirlik` | Case study, metrikler |

**YAML Config:**
```yaml
sequence:
  profil: "saas"
  toplam_adim: 5
  bekleme_suresi_acilmadi: 3
  bekleme_suresi_cevaplanmadi: 2
  gunluk_gonderim_limiti: 50
  gonderim_araligi: 3
```

**Önerilen konu satırları:**
- İlk mail: `{sirket}'in büyümesi için bir fikir`
- Takip 2a: `{ad} — hızlı bir soru`
- Takip 2b: `{sirket} gibi şirketler bunu yapıyor`
- Break-up: `Son mailin — {ad}`

---

### 2. E-ticaret (`eticaret`)

| Parametre | Değer |
|-----------|-------|
| `toplam_adim` | 3-4 |
| `bekleme_suresi_acilmadi` | 3-4 gün |
| `bekleme_suresi_cevaplanmadi` | 3 gün |
| `gunluk_gonderim_limiti` | 40 |
| `gonderim_araligi` | 5 dakika |
| `ton` | ROI ve metrik odaklı |
| `agirlik` | Sosyal kanıt, sonuçlar |

**YAML Config:**
```yaml
sequence:
  profil: "eticaret"
  toplam_adim: 4
  bekleme_suresi_acilmadi: 4
  bekleme_suresi_cevaplanmadi: 3
  gunluk_gonderim_limiti: 40
  gonderim_araligi: 5
```

---

### 3. Kurumsal / Sanayi (`kurumsal`)

| Parametre | Değer |
|-----------|-------|
| `toplam_adim` | 3 |
| `bekleme_suresi_acilmadi` | 5-7 gün |
| `bekleme_suresi_cevaplanmadi` | 5 gün |
| `gunluk_gonderim_limiti` | 30 |
| `gonderim_araligi` | 10 dakika |
| `ton` | Formal, profesyonel |
| `agirlik` | Güven, referans, sertifika |

**YAML Config:**
```yaml
sequence:
  profil: "kurumsal"
  toplam_adim: 3
  bekleme_suresi_acilmadi: 7
  bekleme_suresi_cevaplanmadi: 5
  gunluk_gonderim_limiti: 30
  gonderim_araligi: 10
```

---

### 4. Ajans / Hizmet Sektörü (`ajans`)

| Parametre | Değer |
|-----------|-------|
| `toplam_adim` | 4 |
| `bekleme_suresi_acilmadi` | 2-4 gün |
| `bekleme_suresi_cevaplanmadi` | 3 gün |
| `gunluk_gonderim_limiti` | 40 |
| `gonderim_araligi` | 5 dakika |
| `ton` | Yaratıcı, enerjik |
| `agirlik` | Portfolio, sonuçlar, viral metrikler |

**YAML Config:**
```yaml
sequence:
  profil: "ajans"
  toplam_adim: 4
  bekleme_suresi_acilmadi: 3
  bekleme_suresi_cevaplanmadi: 3
  gunluk_gonderim_limiti: 40
  gonderim_araligi: 5
```

---

### 5. Influencer Outreach (`influencer`)

| Parametre | Değer |
|-----------|-------|
| `toplam_adim` | 2-3 |
| `bekleme_suresi_acilmadi` | 5-7 gün |
| `bekleme_suresi_cevaplanmadi` | 5 gün |
| `gunluk_gonderim_limiti` | 50 |
| `gonderim_araligi` | 5 dakika |
| `ton` | Samimi, kısa |
| `agirlik` | Etkinlik bilgisi, karşılıklı fayda |

**YAML Config:**
```yaml
sequence:
  profil: "influencer"
  toplam_adim: 3
  bekleme_suresi_acilmadi: 5
  bekleme_suresi_cevaplanmadi: 3
  gunluk_gonderim_limiti: 50
  gonderim_araligi: 5
```

**Not:** Influencer'lar genelde meşguldür — fazla takip maili spam hissi verir. Max 3 mail yeterli.

---

### 6. UGC Creator (`ugc`)

| Parametre | Değer |
|-----------|-------|
| `toplam_adim` | 2-3 |
| `bekleme_suresi_acilmadi` | 3-5 gün |
| `bekleme_suresi_cevaplanmadi` | 3 gün |
| `gunluk_gonderim_limiti` | 40 |
| `gonderim_araligi` | 5 dakika |
| `ton` | Samimi, profesyonel |
| `agirlik` | Ödeme, brief detayları |

**YAML Config:**
```yaml
sequence:
  profil: "ugc"
  toplam_adim: 2
  bekleme_suresi_acilmadi: 4
  bekleme_suresi_cevaplanmadi: 3
  gunluk_gonderim_limiti: 40
  gonderim_araligi: 5
```

**Not:** UGC creator'lar ödeme bilgisini hemen görmek ister. İlk mailde brief + ücret aralığı belirt.

---

## 📬 Yanıt İşleme Modülü

Tüm profiller için ortak:

| Yanıt Tipi | Aksiyon | Notlar |
|------------|---------|--------|
| ✅ **Olumlu** | Toplantı planlama, kullanıcıya bildir | sequence_durumu: "won" |
| ❌ **Olumsuz** (ilgi yok) | Kibarca teşekkür, lead'i "cold" işaretle | sequence_durumu: "lost" |
| ❓ **Soru / bilgi talebi** | Yarı-otomatik yanıt hazırla | sequence devam ediyor |
| 🏖️ **OOO / tatil** | Bekleme süresini uzat, sonra tekrar dene | Tatil süresine göre ayarla |
| 🔴 **Bounce** | E-postayı geçersiz işaretle, listeden çıkar | sequence_durumu: "bounced" |

---

## ⚠️ E-posta Sağlık Kuralları (Tüm Profiller İçin)

1. **Warm-up:** Yeni hesap/domain için ilk 2 hafta max 20 mail/gün ile başla
2. **Bounce oranı:** %2'yi geçerse GÖNDERİMİ DURDUR — listeyi temizle
3. **Spam tetikleyiciler:** "ücretsiz", "garanti", "hemen", "sınırlı süre" kelimelerinden kaçın
4. **Unsubscribe:** Her mailde çıkış seçeneği olmalı
5. **SPF/DKIM/DMARC:** Gönderim domain'inin email authentication kayıtları doğru olmalı
6. **Günlük limit:** Asla 50'yi geçme (yeni hesaplarda 20 ile başla)

---

## 🔗 İlgili Kaynaklar

- `_agents/musteri-kazanim/AGENT.md` — Agent ana yönergesi (sequence mantığı detaylı)
- `_agents/musteri-kazanim/templates/email-tr.md` — Türkçe şablonlar
- `_agents/musteri-kazanim/templates/email-en.md` — İngilizce şablonlar
- `Projeler/_arsiv/B2B_Outreach/Instruction.md` — Orijinal B2B sequence mimarisi
