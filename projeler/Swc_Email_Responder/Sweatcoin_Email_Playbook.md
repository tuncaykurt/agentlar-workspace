# Sweatcoin E-posta Otomasyon Playbook v3.1

## 🔑 TEMEL PRENSEP: Thread Başlangıcı Her Şeyi Belirler

**Eğer thread'i BİZ başlattıysak → Değerlendir ve gerekirse cevap ver.**
**Eğer thread'i ONLAR başlattıysa → %99 görmezden gel (okundu olarak işaretle).**

Bu kural, tüm yanlış cevapları engeller. Script her e-posta için önce thread'in ilk mesajını kontrol eder.

## 🧠 GENİŞLETİLMİŞ PRENSİP: AI Katmanı ile Niyet (Intent) Okuma

Sadece basit if-else veya anahtar kelime eşleşmesi yetmez. Özellikle "Thread'i biz başlattıysak" devreye giren bir AI katmanıyla (veya simülasyonuyla) gelen e-postanın **anlamı** çıkarılır.

Bu sayede:
* "Tatildeyim" dönen mailler (Out of Office) → **Görmezden gelinir (Okundu)**
* "Bu e-posta adresi bulunamadı" (Bounce) → **Görmezden gelinir (Okundu)**
* Diğer tüm influencer (Tip 2) cevapları → AI tarafından kategorize edilip **DRAFT (Taslak)** oluşturulur.

---

## Karar Akışı

```
Yeni Okunmamış E-posta
   │
   ├─ @[ŞİRKET_DOMAIN] (Takım üyesi)
   │   └─ IGNORE & OKUNMADI BIRAK (Manuel yanıtlanacak)
   │
   ├─ Sistem/Bot → IGNORE (Notion, Google, Apify vb.)
   │
   ├─ Transactional (MailSuite, Mailtrack vb.)
   │   └─ OKUNDU OLARAK İŞARETLE, cevap verme
   │
   ├─ Ödeme/Çekim Şikâyeti (payment, withdrawal vb.)
   │   └─ [İSİM]@[ŞİRKET_DOMAIN]'e FORWARD ET + OKUNDU işaretle
   │
   ├─ Influencer Tip 1 (Creative Sourcing partneri)
   │   ├─ Tespit: 1) Bilinen e-posta listesi VEYA 2) Thread ilk mesaj içerik analizi
   │   │   (rate, promotional video, collaboration inquiry vb. sinyaller)
   │   └─ İçerik analiz et, DRAFT OLUŞTUR (Asla otomatik gönderme)
   │
   ├─ ONLAR başlattı (UGC satıcıları, cold email, partnership inquiry vs.)
   │   └─ OKUNDU OLARAK İŞARETLE, cevap verme
   │   NOT: Subject-bazlı tespit de yapılır (partnership inquiry, ugc inquiry vb.)
   │
   └─ BİZ başlattık (Influencer Tip 2 - Influencer Program)
       └─ AI Katmanı (LLM) ile İçerik/Niyet (Intent) Analizi:
           ├─ Tatilde/Out of Office (AUTO_REPLY) → OKUNDU OLARAK İŞARETLE, cevap verme
           ├─ Ulaşılamadı (BOUNCE) → OKUNDU OLARAK İŞARETLE, cevap verme
           ├─ İlgileniyor (INTERESTED) → DRAFT (Interested template)
           ├─ Sadece ücretli (PAID_ONLY) → DRAFT (Paid Only template)
           ├─ İlgilenmiyor (NOT_INTERESTED) → DRAFT (Not Interested template)
           └─ Belirsiz (UNCLEAR) → DRAFT (manuel inceleme)
```

---

## Asla Cevap Verilmeyenler

| Tür | Açıklama | Aksiyon |
|:---|:---|:---|
| UGC Satıcıları | Bize içerik satmak isteyen creator'lar | Okundu, cevap yok |
| Cold Email | B2B servis/ürün satanlar | Okundu, cevap yok |
| Cold Outreach / Partnership | Partnership inquiry, ugc inquiry, collab teklifi | Okundu, cevap yok |
| Promotional | Newsletter, teklif, kampanya | Okundu, cevap yok |
| Sistem | Notion, Google, Apify, vb. | Okundu, cevap yok |
| Transactional | MailSuite Daily Report, Mailtrack vb. | Okundu, cevap yok |
| Otomatik Yanıtlar | Out of Office, Tatil mesajları | Okundu, cevap yok (AI tarafından filtrelenir) |
| Teslimat Hataları | Mail gitmedi, Bounce, Address not found | Okundu, cevap yok (AI tarafından filtrelenir) |
| Takım (@[ŞİRKET_DOMAIN]) | Şirket içi yazışmalar | **Okunmadı** bırak, cevap yok (Manuel ilgilenilecek) |
| Influencerlar (Tip 1 & 2) | Tüm creative sourcing ve outreach iletişimleri | **DRAFT** oluşturulur, ASLA otomatik gönderilmez |

## Otomatik Yönlendirmeler

| Tür | Açıklama | Aksiyon |
|:---|:---|:---|
| Ödeme Şikâyetleri | "Payment not sent", "Unpaid withdrawal" vb. | **Okundu olarak işaretle** (Forward kaldırıldı — 2026-03-16) |

---

## İletişim Stili

- **Selamlama:** "Hi {İlk İsim},"
- **İmza:** "Best,\n[İSİM]\nInfluencer & Affiliate Marketing – Sweatcoin"
- **Ton:** Sıcak, profesyonel, kısa (3-5 cümle)
- **Dil:** Her koşulda tamamen **İngilizce**. Karşı taraf hangi dilde yazarsa yazsın (İspanyolca, Fransızca vb.), niyet (intent) AI tarafından çözülür ve taslak daima *İngilizce* şablonlarla oluşturulur.
- **Asla:** "username" değil, "email address you used to sign up" istenir
