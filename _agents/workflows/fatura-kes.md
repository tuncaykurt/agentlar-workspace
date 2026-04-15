---
description: Fatura Kes — Sosyal Medya İşbirlikleri İçin Otomatik Invoice Üretimi
---

# 📄 Fatura Kesme Workflow'u

Bu workflow, sosyal medya markalarıyla olan işbirlikleri için anında şık ve modern bir PDF invoice (fatura) üretmek amacıyla kullanılır. **İki modda** çalışır: elle bilgi girişi veya e-posta thread'inden otomatik bilgi çıkarma.

## 🛠 Kullanım Amacı
Kullanıcının tek yapması gereken markayı ve fiyatı vermektir — ya da "e-postadan bak" demektir. Fatura üzerindeki *Description* kısmında doğrudan "`[Brand]` collaboration with @INSTAGRAM_KULLANICI_ADI" formatı uygulanır. İsimlendirme ise özel olarak `INVOICE_[Marka]_[GG-AA-YYYY].pdf` şeklinde yapılır.

## 📝 Ön Koşullar ve Girdiler
Workflow'un çalışması için aşağıdaki gibi komutlar girilmelidir:

**Mod 1 — Elle bilgi:**
```
/fatura-kes [Marka Adı], [Meblağ] TL/USD
```
*(Eğer şirket yasal ünvanı ve eklenecek adres/email varsa, onlar da eklenebilir. Yoksa marka adı "company" parametresi yerine de kullanılır.)*

**Mod 2 — E-postadan otomatik çıkarım:**
```
/fatura-kes [Marka Adı], e-postadan bak
```
veya doğal dilde:
```
"Seekoo ile olan mail yazışmasından fatura kes"
"X markasıyla olan e-postamıza bakıp fatura hazırla"
```

## 🔍 Mod Algılama
- Eğer kullanıcı **tutar ve marka adını elle verdiyse** → **Mod 1** (Elle Bilgi)
- Eğer kullanıcı **"e-posta", "mail", "yazışma", "thread", "e-postadan bak", "mailden çıkar"** gibi ifadeler kullandıysa → **Mod 2** (E-posta Modu)

---

## 🚀 Mod 1 — Elle Bilgi ile Fatura

### 1. Parametreleri Analiz Et
Kullanıcıdan gelen bilgileri ayrıştır:
- `brand`: Marka adı (Örn: Apple)
- `company`: Şirket Yasal İsmi (Girildiyse onu kullan, girilmediyse direkt `brand` adını kullan)
- `email`: İletişim e-postası (opsiyonel)
- `address`: Şirket adresi (opsiyonel)
- `amount`: Tutar (Örn: 50000)
- `currency`: Para birimi (Örn: $, TL, vs.)

### 2. PDF Üretimini Tetikleme
Hazırladığımız faturayı oluşturmak için aşağıdaki script argümanlarını kendine göre doldurarak çalıştır. `--output` parametresi verilmez; script varsayılan olarak `uretilen-faturalar/` klasörüne kaydeder.

// turbo
```bash
cd ANTIGRAVITY_ROOT_BURAYA/_skills/fatura-olusturucu
source .venv/bin/activate
python faturalastir.py --brand "${BRAND}" --company "${COMPANY}" --email "${EMAIL}" --address "${ADDRESS}" --amount "${AMOUNT}" --currency "${CURRENCY}"
```

### 3. Sonuç Bildirimi ve Hızlı Erişim
İşlem başarılı olursa:
1. Dosya adını ve konumunu bildir (örn: `INVOICE_Apple_12-03-2026.pdf`)
2. PDF'i Finder'da anında açmak için aşağıdaki komutu çalıştır:

// turbo
```bash
open -R "ANTIGRAVITY_ROOT_BURAYA/_skills/fatura-olusturucu/uretilen-faturalar/INVOICE_${SAFE_BRAND}_${DATE}.pdf"
```

3. Ayrıca kullanıcıya dosyanın tıklanabilir linkini ver: `[INVOICE_Marka_GG-AA-YYYY.pdf](file://ANTIGRAVITY_ROOT_BURAYA/_skills/fatura-olusturucu/uretilen-faturalar/INVOICE_Marka_GG-AA-YYYY.pdf)`
4. Eğer Downloads'a kopyalama başarılıysa bunu da bildir.

---

## 📧 Mod 2 — E-posta Thread'inden Fatura

### 1. Gmail'den İlgili Thread'leri Ara
E-posta okuma scriptini çalıştır:

// turbo
```bash
cd ANTIGRAVITY_ROOT_BURAYA/_skills/fatura-olusturucu
source .venv/bin/activate
python eposta_fatura_oku.py --query "${MARKA_ADI}" --max-results 5
```

### 2. Doğru Thread'i Belirle
- Dönen JSON çıktısında birden fazla thread olabilir
- Subject, tarih ve katılımcılara bakarak en alakalı thread'i seç
- Eğer hangisinin doğru olduğu belirsizse, kullanıcıya seçenekleri sun ve sor

### 3. Thread İçeriğinden Fatura Bilgilerini Çıkar
`full_conversation` alanındaki yazışmayı oku ve şu bilgileri çıkar:
- **brand**: Marka adı
- **company**: Şirket yasal ismi (imza, yazışma içeriği veya e-posta domain'inden)
- **email**: Muhatap e-posta adresi
- **address**: Şirket adresi (varsa)
- **amount**: Anlaşılan tutar (yazışmada geçen rakamlar)
- **currency**: Para birimi ($, TL, €, vb.)

### 4. Kullanıcıya Doğrulat ⚠️
**Bu adım zorunludur!** Çıkarılan bilgileri kullanıcıya göster ve devam etmeden önce onay al:
```
📧 E-postadan çıkarılan fatura bilgileri:
  🏢 Şirket: SEEKOO LLC
  📧 E-posta: contact@seekoo.com  
  📍 Adres: 123 Main St, Suite 100, San Francisco, CA 94102
  💰 Tutar: $700
  
Bu bilgilerle faturayı oluşturayım mı?
```

### 5. Onaydan Sonra PDF Üret
Kullanıcı onayladıktan sonra Mod 1 — Adım 2'ye geç ve faturayı üret.

---

## ⚠️ Hata Durumları

| Durum | Çözüm |
|-------|-------|
| E-posta bulunamadı | Kullanıcıya farklı arama terimi öner veya thread ID sor |
| Tutar yazışmada yok | Kullanıcıdan tutarı elle iste |
| Token hatası | `token_readonly.json` sil, scripti terminalde 1 kez çalıştır |
| Birden fazla thread | Kullanıcıya liste sun, seçmesini iste |
