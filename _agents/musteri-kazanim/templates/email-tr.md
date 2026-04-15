# 📧 Türkçe E-posta Şablonları — Müşteri Kazanım Agenti

> **Konum:** `_agents/musteri-kazanim/templates/email-tr.md`
> **Kullanım:** Kampanya config'inde `sablon_dili: "TR"` olduğunda bu şablonlar kullanılır.

---

## 📋 Değişken Referansı

| Değişken | Açıklama | Örnek |
|----------|----------|-------|
| `{ad}` | Alıcının adı (@ olmadan) | Ayşe |
| `{platform}` | Kaynak platform | Instagram |
| `{nis}` | İçerik alanı / niş | lifestyle, müzik |
| `{deger_onerisi}` | Kampanya değer önerisi | Festival iş birliği |
| `{ekstra_bilgi}` | Ek bilgi (etkinlik adı vb.) | İstanbul Müzik Festivali |
| `{gonderici_adi}` | Gönderen kişinin adı | Adınız |
| `{cta}` | Eylem çağrısı | Görüşme ayarlayalım mı? |
| `{sirket}` | Şirket/marka adı (B2B için) | Acme Corp |
| `{pozisyon}` | Unvan (B2B için) | Marketing Director |
| `{kanca}` | Kişiye özel icebreaker | Son paylaşımınız harika |

---

## 1️⃣ Influencer Outreach — İlk Mail

**Senaryo:** Influencer'a ulaşma (etkinlik, iş birliği vb.)

### Konu:
```
İş birliği teklifi — {ad}
```

### Gövde:
```
Merhaba {ad},

{platform}'daki içeriklerini takip ediyorum ve {nis} alanındaki paylaşımların dikkatimi çekti.

{ekstra_bilgi} kapsamında seninle iş birliği yapmak istiyoruz.

Seninle birlikte çalışmak, doğru kitleye ulaşmamızda büyük katkı sağlar diye düşünüyoruz.

{cta}

Saygılarımla,
{gonderici_adi}
```

---

## 2️⃣ Influencer Outreach — Kişiselleştirilmiş Versiyon

**Senaryo:** Daha detaylı, bağlama özel ilk mail

### Konu:
```
{ad} — {ekstra_bilgi} için iş birliği
```

### Gövde:
```
Merhaba {ad},

{platform}'daki {nis} içeriklerini takip ediyorum, gerçekten kaliteli iş çıkarıyorsun.

{kanca}

{ekstra_bilgi} için bir iş birliği teklifi paylaşmak istiyoruz.
{deger_onerisi}

Detayları konuşmak için kısa bir görüşme ayarlayabilir miyiz?

İyi günler,
{gonderici_adi}
```

---

## 3️⃣ B2B Cold Email — İlk Mail

**Senaryo:** Şirketlere kurumsal outreach

### Konu:
```
{sirket} için bir öneri — {gonderici_adi}
```

### Gövde:
```
Merhaba {ad},

{sirket}'teki {pozisyon} rolünüzü gördüm ve {kanca}.

{deger_onerisi}

{cta}

Saygılarımla,
{gonderici_adi}
```

---

## 4️⃣ Takip Maili — Açılmayan (Sequence Adım 2a)

**Senaryo:** İlk mail açılmamışsa, farklı konu satırıyla tekrar deneme

### Konu:
```
{ad} — cevap vermediğini fark ettim 🤗
```

### Gövde:
```
Merhaba {ad},

Geçen hafta bir iş birliği teklifi paylaşmıştım, ama meşgul olabilirsin diye düşündüm.

Kısaca: {deger_onerisi}

{cta}

İyi çalışmalar,
{gonderici_adi}
```

---

## 5️⃣ Takip Maili — Açıldı ama Cevaplanmadı (Sequence Adım 2b)

**Senaryo:** Mail açıldı ama cevap gelmedi — farklı açıdan yaklaşım

### Konu:
```
{ad} — bir bilgi daha paylaşmak istedim
```

### Gövde:
```
Merhaba {ad},

Önceki mailimi incelediysen harika! Bir detay daha eklemek istedim:

{kanca}

{deger_onerisi}

Düşüncelerini merak ediyorum — kısa bir mesajla bile dönüş yaparsan sevinirim.

Saygılarımla,
{gonderici_adi}
```

---

## 6️⃣ Son Deneme / Break-up Mail (Sequence Adım 3)

**Senaryo:** Son şans maili — nazik kapanış

### Konu:
```
Son kez yazıyorum — {ad}
```

### Gövde:
```
Merhaba {ad},

Seni rahatsız etmek istemem, bu konudaki son mailim olacak.

{deger_onerisi}

İlgi duyarsan her zaman ulaşabilirsin. Dönüş yapmazsan gayet anlayışla karşılayacağım.

Başarılar dilerim! 🙌
{gonderici_adi}
```

---

## 7️⃣ Instagram DM Şablonu — Kısa Versiyon

**Senaryo:** E-posta öncesi veya sonrası DM ile dikkat çekme

### DM Metni:
```
Merhaba {ad}! 👋

{platform}'daki içeriklerini severek takip ediyorum.

{ekstra_bilgi} için seninle iş birliği yapmak istiyoruz — detayları paylaşabilmem için e-postana yazabilir miyim?

Teşekkürler 🙏
```

---

## 💡 Kişiselleştirme Kuralları

1. **Çeviri kokmasın** — Doğal Türkçe kullan, İngilizce kalıpları direkt çevirme
2. **Icebreaker max 2 cümle** — İlk paragraf kısa ve vurucu olmalı
3. **Spesifik atıf yap** — "İçeriklerin harika" yerine "Son paylaştığın müzik festivali videosu harika" de
4. **Ton** — Bağlama göre kurumsal veya samimi; influencer'lara samimi, B2B'ye kurumsal
5. **Aynı şablon gönderme** — Her mail için en az 1-2 cümle farklılaştır
6. **Emoji kullanımı** — DM'lerde 1-2 emoji OK, e-postada sadece konu satırında
