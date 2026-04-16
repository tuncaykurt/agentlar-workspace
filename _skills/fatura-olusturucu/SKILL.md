---
name: Fatura Oluşturucu
description: Sosyal medya işbirlikleri için otomatik PDF invoice üreten skill — elle bilgi veya e-posta thread'inden otomatik çıkarım ile
---

# 📄 Fatura Oluşturucu

Sosyal medya markalarıyla yapılan işbirliklerin faturalandırılması için kullanılan otomatik PDF invoice oluşturma aracı.

## 🔀 İki Mod

Bu skill **iki farklı modda** çalışır:

### Mod 1 — Elle Bilgi ile Fatura (Varsayılan)
Kullanıcı doğrudan marka adı, şirket bilgileri ve ücreti verir. Script doğrudan çalışır.

### Mod 2 — E-posta Thread'inden Otomatik Fatura
Kullanıcı bir marka/şirket adı verir ve "e-postadan çıkar" veya "mail'den bak" gibi bir ifade kullanır. Bu durumda:
1. Gmail API ile ilgili e-posta thread'leri aranır
2. Thread'deki yazışmadan fatura bilgileri (şirket adı, adres, e-posta, tutar, para birimi) AI tarafından çıkarılır  
3. Çıkarılan bilgiler kullanıcıya doğrulattırılır
4. Onaylanan bilgilerle fatura kesilir

## Ne Yapar?
- Verilen marka adı, şirket bilgileri ve ücret bilgisiyle şık bir PDF fatura üretir
- Description kısmı otomatik olarak `[Brand] collaboration with @INSTAGRAM_KULLANICI_ADI` formatında oluşturulur
- PDF isimlendirmesi `INVOICE_[Marka]_[GG-AA-YYYY].pdf` şeklinde yapılır
- Üretilen PDF otomatik olarak `~/Downloads` klasörüne kopyalanmaya çalışılır

## Dosya Yapısı
```
fatura-olusturucu/
├── SKILL.md                  # Bu dosya
├── faturalastir.py           # Ana script (fpdf2 ile PDF üretimi)
├── eposta_fatura_oku.py      # Gmail'den fatura bilgisi çıkaran script
├── requirements.txt          # Python bağımlılıkları
├── Roboto-Regular.ttf        # Unicode font (Türkçe karakter desteği)
├── Roboto-Bold.ttf           # Unicode font (bold)
├── uretilen-faturalar/       # 📂 Üretilen tüm PDF faturalar buraya kaydedilir
├── fatura-ornekler/          # Eski invoice örnekleri (referans)
├── token_readonly.json       # Gmail API token (otomatik oluşur)
└── .venv/                    # Python sanal ortamı
```

## Kullanım

### Mod 1: Workflow ile (elle bilgi)
```
/fatura-kes [Marka Adı], [Meblağ] [Para Birimi]
```

### Mod 2: E-postadan otomatik çıkarım
```
/fatura-kes [Marka Adı], e-postadan bak
```
veya doğa dilde:
```
"Seekoo ile olan e-posta yazışmasından fatura bilgilerini çıkar ve fatura kes"
```

### Komut satırından (PDF üretimi)
```bash
cd _skills/fatura-olusturucu
source .venv/bin/activate
python faturalastir.py \
  --brand "Marka Adı" \
  --company "Şirket Yasal İsmi" \
  --email "iletisim@email.com" \
  --address "Şirket Adresi" \
  --amount "700" \
  --currency "$" \
  --output .
```

### Komut satırından (Gmail'den bilgi çıkarma)
```bash
cd _skills/fatura-olusturucu
source .venv/bin/activate
python eposta_fatura_oku.py --query "Seekoo" --max-results 5
```

### Parametreler — faturalastir.py
| Parametre | Zorunlu | Açıklama |
|-----------|---------|----------|
| `--brand` | ✅ | Marka adı (description'da kullanılır) |
| `--company` | ✅ | Şirket yasal ismi |
| `--email` | ❌ | İletişim e-postası |
| `--address` | ❌ | Şirket adresi |
| `--amount` | ✅ | Fatura tutarı |
| `--currency` | ❌ | Para birimi (varsayılan: `$`) |
| `--output` | ❌ | Çıktı dizini (varsayılan: `.`) |

### Parametreler — eposta_fatura_oku.py
| Parametre | Zorunlu | Açıklama |
|-----------|---------|----------|
| `--query` | ✅ | Gmail arama sorgusu (marka adı, kişi adı, şirket ismi) |
| `--max-results` | ❌ | Döndürülecek max thread sayısı (varsayılan: 5) |
| `--thread-id` | ❌ | Belirli bir thread ID ile doğrudan çekme |
| `--output` | ❌ | Çıktı dosya yolu (varsayılan: stdout) |

## 📧 E-posta Modu — AI İçin Talimatlar

E-postadan fatura bilgisi çıkarma işlemi şu adımları takip eder:

### Adım 1: Gmail'den Thread Ara
```bash
cd ./_skills/fatura-olusturucu
source .venv/bin/activate
python eposta_fatura_oku.py --query "[MARKA_ADI]" --max-results 5
```

### Adım 2: Dönen JSON'dan Doğru Thread'i Belirle
- Subject, tarih ve katılımcılara bakarak en ilgili thread'i seç
- Eğer birden fazla thread varsa, kullanıcıya hangisinin doğru olduğunu sor

### Adım 3: Thread İçeriğinden Fatura Bilgisi Çıkar
JSON çıktısındaki `full_conversation` alanını oku ve şu bilgileri çıkar:
- **company**: Şirket yasal ismi (yazışmada geçen ya da imzadan)
- **email**: Muhatap e-posta adresi  
- **address**: Şirket adresi (varsa)
- **amount**: Anlaşılan tutar
- **currency**: Para birimi ($, TL, €, vb.)
- **brand**: Marka adı

### Adım 4: Kullanıcıya Doğrulat
Çıkarılan bilgileri kullanıcıya göster ve onay al:
```
📧 E-postadan çıkarılan fatura bilgileri:
  🏢 Şirket: SEEKOO LLC
  📧 E-posta: contact@seekoo.com  
  📍 Adres: 123 Main St, Suite 100, San Francisco, CA 94102
  💰 Tutar: $700
  
Bu bilgilerle faturayı oluşturayım mı?
```

### Adım 5: Onay Sonrası Faturayı Kes
Standart `faturalastir.py` ile faturayı üret.

## Sabit Bilgiler (Gönderen)
- **İsim:** [İSİM SOYAD]
- **Adres:** Mithatpaşa Cad. No: 103/3, Onur Mahallesi, Balçova, 35330 İzmir
- **E-posta:** EMAIL_ADRESI_BURAYA
- **Telefon:** +90 533 366 62 13

## 🔑 Kimlik Bilgileri (E-posta modu)
- **Gmail hesabı:** `EMAIL_ADRESI_BURAYA`
- **Credentials:** `_skills/eposta-gonderim/credentials.json` (paylaşımlı OAuth2 credentials)
- **Token:** `token_readonly.json` — ilk çalıştırmada otomatik tarayıcı onayı istenir

## Bağımlılıklar
- Python 3.10+
- fpdf2 (PDF üretimi)
- google-api-python-client (Gmail API)
- google-auth-oauthlib (OAuth2)
- google-auth-httplib2 (HTTP transport)
