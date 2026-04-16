---
name: outreach
description: |
  Herhangi bir outreach senaryosu için e-posta gönderim motoru. Lead generation'dan gelen 
  listeleri alır, LLM ile doğal Türkçe kişiselleştirme yapar, Gmail API üzerinden gönderir 
  ve durumları (Sent, Failed vb.) aynı listede takip eder.
---

# Outreach — E-posta Gönderim Motoru

Bu skill, bir kişi/şirket listesine **kişiselleştirilmiş e-postalar** göndermek ve gönderim durumunu takip etmek için tek-çalıştır bir modüldür. Satış, iş birliği, davet, tanışma — hangi amaçla olursa olsun bu skill kullanılır.

Karmaşık Python kodları `scripts/` altında gizlidir; sen (AI) sadece argümanlarla çağırırsın.

---

## 🔑 Kimlik Bilgileri

- **Gönderici Gmail:** `EMAIL_ADRESI_BURAYA`
- **Credentials:** `_knowledge/api-anahtarlari.md` (Google OAuth 2.0)
- **Token:** `token.json` yoksa veya süresi dolmuşsa, script ilk çalışmada otomatik tarayıcı onayı ister. Bir kez yapılır.

---

## 🧠 Türkçe Kişiselleştirme Kuralları

E-posta yazarken aşağıdaki kurallara **kesinlikle** uy:

1. **Çeviri Kokmayan Türkçe:** İngilizce kalıpları birebir çevirme. "X konusundaki paylaşımlarınıza denk geldim" gibi **doğal** ifadeler kullan.
2. **Kısa Açılış:** İlk paragraf (icebreaker) maksimum 2 cümle.
3. **Spesifik Olma:** CSV'de bilgi varsa (web sitesi, şirket adı, platform, bio) oradan somut bir detaya atıf yap.
4. **Ton:** Bağlama göre ayarla — kurumsal ise "Sayın X Bey/Hanım", samimi ise "Merhaba X". Aşırıya kaçma.

---

## 📂 Dosya Yapısı

```
_skills/eposta-gonderim/
├── SKILL.md                     ← Bu dosya (ana yönerge)
├── scripts/
│   └── send_email.py            ← Gmail OAuth + Gönderim + CSV Takibi
├── pipelines/
│   └── email-kampanya.md        ← Evrensel e-posta kampanya akışı
└── templates/                   ← (İleride) Onaylanmış şablonlar
```

---

## 📊 Durum Takibi (State Management)

Bu skill her zaman bir CSV/JSON dosyası üzerinde çalışır. Gönderim sonrası o dosyadaki ilgili satır güncellenir:

| Kolon | Değer |
|-------|-------|
| `Outreach_Status` | `Pending` → `Sent` veya `Failed` |
| `Outreach_Date` | Gönderim tarihi (`YYYY-MM-DD HH:MM`) |
| `Personalized_Message` | Atılan e-postanın kopyası (opsiyonel) |

Böylece kullanıcı listeyi Excel'de açıp kimin hangi aşamada olduğunu görebilir.

---

## 🚀 Nasıl Çalıştırılır

Outreach istendiğinde:
1. `pipelines/email-kampanya.md` dosyasını oku (standart akışı hatırla).
2. Hedef CSV'yi oku, `Outreach_Status` boş/Pending olanları filtrele.
3. Her satır için doğal Türkçe icebreaker + e-posta gövdesi oluştur.
4. Gönder:
   ```bash
   python3 _skills/eposta-gonderim/scripts/send_email.py \
     --to "hedef@email.com" \
     --subject "Konu" \
     --body "<p>Mesaj</p>" \
     --csv "Projeler/X/liste.csv" \
     --row_id 3
   ```
5. Kullanıcıya özet raporla (toplam / gönderilen / atlanan).

---

## ❌ Hata Yönetimi

| Durum | Ne Yapılmalı? |
|-------|---------------|
| `invalid_grant` / Token Hatası | `token.json` sil, scripti terminalde 1 kez çalıştır (tarayıcı onayı gelecek). |
| `quota_exceeded` / Gmail Limiti | Günlük limit ~500. Kampanyayı durdur, kalanlar `Pending` kalır. |
| Boş E-posta Adresi | `Outreach_Status` = `No Email` yaz, atla. |
| Spam riski | Günde 50-100 ile başla, kademeli artır. |
