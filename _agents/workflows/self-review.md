---
description: Self-Review — Her görev tamamlandığında sonucun gerçekten doğru olup olmadığını bizzat doğrula. "Yaptım" demeden önce ZORUNLU çalışır.
---

# 🔍 /self-review — Sonuç Doğrulama Mekanizması

> **KURAL:** Antigravity bir görevi "tamamladım" demeden önce bu workflow'u
> çalıştırır. Çıktı doğrulaması yapılmadan hiçbir görev tamamlanmış SAYILMAZ.
>
> Bu workflow sadece `/self-review` ile çağrıldığında değil, VERİ YAZAN/OKUYAN
> HER GÖREVİN SONUNDA OTOMATİK olarak uygulanır.

---

## Ne Zaman Uygulanır?

Bu mekanizma aşağıdaki durumların **HERHANGİ BİRİNDE** zorunludur:

| Görev Tipi | Doğrulama Hedefi |
|---|---|
| Google Sheets'e veri yazma | Sheets'i oku, yazılan veri orada mı? |
| Notion'a kayıt oluşturma/güncelleme | Notion'ı sorgula, kayıt var mı ve doğru mu? |
| Gmail ile e-posta gönderme | Gönderildi mi? (sent folder kontrolü) |
| Google Calendar'a etkinlik ekleme | Etkinlik var mı? |
| GitHub'a dosya push etme | Dosya GitHub'da var mı, içerik doğru mu? |
| Pipeline çalıştırma (cron/manual) | Pipeline çıktısı gerçekten üretildi mi? |
| Notion'dan veri okuyup işleme | Okunan veri doğru mu, eksik kayıt var mı? |
| Herhangi bir veri dönüştürme | Kaynak ve hedef eşleşiyor mu? |

---

## ADIM 1 — Görev Çıktısını Tanımla

Görevi tamamladıktan sonra kendine sor:

1. **Bu görev NE üretmeliydi?** (Örn: "10 lead Notion'a yazılmalıydı")
2. **Çıktı NEREDE gösterilmeli?** (Örn: "Notion DB'de", "Google Sheet'te", "Gmail sent'te")
3. **Kaç adet kayıt/çıktı olmalıydı?** (Örn: "Sheet'te 47 satır vardı, 47'si de Notion'a geçmeliydi")

---

## ADIM 2 — Kaynağı Oku (Source Verification)

Kaynaktan gelen veriyi TEKRAR oku ve say:

```
# Google Sheets kaynak ise:
mcp_google-workspace-mcp_read_sheet_values → satır sayısını not et

# Notion kaynak ise:
mcp_notion-mcp-server_API-query-data-source → kayıt sayısını not et

# Gmail kaynak ise:
mcp_google-workspace-mcp_search_gmail_messages → mesaj sayısını not et
```

**Kaynak kayıt sayısı = BEKLENEN çıktı sayısı**

---

## ADIM 3 — Hedefi Oku (Destination Verification)

Çıktının yazıldığı yeri GERÇEKTEN oku:

### 3.1 — Notion'a Yazıldıysa
```
mcp_notion-mcp-server_API-query-data-source ile:
1. Toplam kayıt sayısını al
2. Son eklenen kayıtları listele (sorts: created_time descending)
3. Her kayıtta ZORUNLU alanları kontrol et:
   - İsim/başlık boş mu? → ❌ "İsimsiz Lead" problemi
   - Durum alanı doğru mu?
   - Tarih alanı var mı?
   - Diğer zorunlu alanlar dolu mu?
```

### 3.2 — Google Sheets'e Yazıldıysa
```
mcp_google-workspace-mcp_read_sheet_values ile:
1. Yazılması gereken aralığı oku
2. Boş hücre var mı kontrol et
3. Veri formatı doğru mu? (tarih, sayı, metin)
```

### 3.3 — Gmail ile Gönderildiyse
```
mcp_google-workspace-mcp_search_gmail_messages ile:
1. "in:sent" query ile gönderilen mailleri ara
2. Alıcı doğru mu?
3. Konu doğru mu?
```

### 3.4 — GitHub'a Push Edildiyse
```
mcp_github-mcp-server_get_file_contents ile:
1. Dosya GitHub'da var mı?
2. İçerik doğru mu?
3. Branch doğru mu?
```

### 3.5 — Calendar'a Eklendiyse
```
mcp_google-workspace-mcp_get_events ile:
1. Etkinlik var mı?
2. Tarih/saat doğru mu?
3. Katılımcılar doğru mu?
```

---

## ADIM 4 — Kaynak vs Hedef Karşılaştırması (Data Integrity)

Bu ADIM en kritik adımdır. Aşağıdaki kontrolleri MUTLAKA yap:

### 4.1 — Sayısal Karşılaştırma
```
KAYNAK_SAYISI = [kaynak sistemdeki kayıt sayısı]
HEDEF_SAYISI  = [hedef sistemdeki yazılan kayıt sayısı]

if KAYNAK_SAYISI != HEDEF_SAYISI:
    ❌ BAŞARISIZ — Eksik veri var
    → Eksik kayıtları tespit et
    → Tekrar yaz
    → Bu adıma DÖN
```

### 4.2 — İçerik Bütünlüğü
Her kayıt için kritik alanları kontrol et:
- **Boş/null alan var mı?** → "İsimsiz Lead" problemi
- **Veri doğru formatta mı?** → Tarih yanlış parse edilmiş olabilir
- **Duplicate var mı?** → Aynı kayıt iki kere yazılmış olabilir

### 4.3 — Örnekleme Testi
İlk 3 ve son 3 kaydı detaylıca kontrol et:
- Kaynak verideki satır X = Hedef verideki kayıt X ?
- Tüm alanlar eşleşiyor mu?

---

## ADIM 5 — Sonuç Kararı

### ✅ BAŞARILI — Şartlar:
- [ ] Kaynak sayısı = Hedef sayısı
- [ ] Hiçbir zorunlu alan boş değil
- [ ] Örnekleme testi geçti (en az 3 kayıt doğrulandı)
- [ ] Duplicate yok

### ❌ BAŞARISIZ — Herhangi biri sağlanmıyorsa:
1. Sorunu TANIMLA (kaç kayıt eksik, hangi alanlar boş, neden?)
2. Sorunu DÜZELT
3. ADIM 2'ye DÖN ve tekrar doğrula
4. Bu döngü başarılı olana kadar DEVAM ET

**⚠️ KESİNLİKLE "başarısız oldu ama kullanıcıya başarılı dedim" durumu YAŞANMAZ.**

---

## ADIM 6 — Kullanıcıya Doğrulanmış Rapor Ver

Görev sonunda kullanıcıya verilen rapor şu formatta olmalıdır:

```markdown
## ✅ Self-Review Raporu

### Görev: [görev açıklaması]

### 📊 Veri Doğrulama
| Metrik | Sonuç |
|--------|-------|
| Kaynak kayıt sayısı | X |
| Hedef kayıt sayısı | X |
| Eşleşme | ✅ %100 |
| Boş alan kontrolü | ✅ Boş alan yok |
| Örnekleme testi | ✅ 3/3 doğrulandı |
| Duplicate kontrolü | ✅ Duplicate yok |

### 🔍 Doğrulama Detayı
- Kaynak: [Google Sheets / Notion / Gmail] — [X] kayıt
- Hedef: [Notion / Sheets / GitHub] — [X] kayıt
- Kontrol edilen örnekler:
  1. [Kayıt 1 adı] → ✅ Tüm alanlar doğru
  2. [Kayıt 2 adı] → ✅ Tüm alanlar doğru
  3. [Kayıt 3 adı] → ✅ Tüm alanlar doğru
```

---

## Örnekler

### Örnek 1: Lead Pipeline (Sheets → Notion)
```
1. Google Sheets'i oku → 47 aktif lead var
2. Pipeline'ı çalıştır
3. Notion DB'yi sorgula → 47 yeni kayıt var mı?
4. Her kayıtta isim, telefon, durum alanları dolu mu?
5. İlk 3 ve son 3 kaydı karşılaştır: Sheet satırı = Notion kaydı mı?
6. ✅ veya ❌ kararı ver
```

### Örnek 2: Mail Gönderimi
```
1. Lead listesinde 15 kişi var
2. Mail gönder
3. Gmail sent folder'ı kontrol et → 15 mail gönderildi mi?
4. Her mailin alıcısı doğru mu?
5. ✅ veya ❌ kararı ver
```

### Örnek 3: Blog Yazıcı (Notion → GitHub)
```
1. Notion'dan blog konusu alındı
2. Blog yazılıp GitHub'a push edildi
3. GitHub'da dosya var mı? İçerik boş değil mi?
4. ✅ veya ❌ kararı ver
```

---

## ⛔ Anti-Patternler (ASLA YAPMA)

1. **"Başarıyla tamamlandı" deyip kontrol etmeme** → En büyük günah
2. **API çağrısının 200 dönmesini yeterli sayma** → 200 OK olsa bile veri yanlış/eksik olabilir
3. **Sadece log'a bakıp "hata yok" deme** → Hatasız log ≠ doğru veri
4. **"N kayıt işlendi" log mesajına güvenme** → Gerçekten işlenip işlenmediğini HEDEFten doğrula
5. **Örnekleme yapmama** → Sayı eşleşse bile içerik bozuk olabilir
6. **Kullanıcının kendisinin kontrol etmesini bekleme** → SEN kontrol et

---

## Entegrasyon Noktaları

Bu workflow otomatik olarak şu workflow'larla birlikte çalışır:

| Workflow | Self-Review Tetikleme Noktası |
|---|---|
| `/lead-toplama` | Lead'ler Notion'a yazıldıktan sonra |
| `/mail-gonder` | Mailler gönderildikten sonra |
| `/canli-yayina-al` | Deploy sonrası pipeline çıktısı kontrolü |
| `/stabilize` | Adım 6.3 (Gerçek Çıktı Doğrulaması) |
| `/icerik-uretimi` | İçerik üretilip kaydedildikten sonra |
| `/marka-outreach` | Outreach lead'leri ve mailler sonrası |
| Ad-hoc görevler | Herhangi bir veri okuma/yazma görevi sonrası |

---

## 🏗️ Kural Özeti

> **Altın Kural:** "Yaptım" deme, "Doğruladım" de.
>
> Her veri işlemi sonrası:
> 1. Kaynağı oku
> 2. Hedefi oku
> 3. İkisini karşılaştır
> 4. Örnekleme yap
> 5. Sonucu raporla
>
> Bu 5 adım yapılmadan hiçbir görev TAMAMLANMIŞ SAYILMAZ.
