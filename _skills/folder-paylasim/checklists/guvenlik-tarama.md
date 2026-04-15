# 🔐 Güvenlik Tarama Kontrol Listesi

Bu dosya, paylaşım sırasında dosyalar içinde tespit edilmesi ve temizlenmesi gereken hassas bilgi desenlerini tanımlar.
Antigravity bu dosyayı referans olarak kullanır.

---

## API Key Desenleri (Regex)

Aşağıdaki desenler dosya içeriklerinde aranmalı:

### OpenAI
- **Desen:** `sk-proj-[A-Za-z0-9_-]{20,}`
- **Alternatif:** `sk-[A-Za-z0-9]{20,}`
- **Placeholder:** `OPENAI_API_KEY_BURAYA`

### Apify
- **Desen:** `apify_api_[A-Za-z0-9]{30,}`
- **Placeholder:** `APIFY_API_KEY_BURAYA`

### Groq
- **Desen:** `gsk_[A-Za-z0-9]{50,}`
- **Placeholder:** `GROQ_API_KEY_BURAYA`

### Perplexity
- **Desen:** `pplx-[A-Za-z0-9]{40,}`
- **Placeholder:** `PERPLEXITY_API_KEY_BURAYA`

### Google
- **Desen:** `AIza[A-Za-z0-9_-]{35}`
- **Placeholder:** `GOOGLE_API_KEY_BURAYA`

### Supadata
- **Desen:** `sd_[a-f0-9]{30,}`
- **Placeholder:** `SUPADATA_API_KEY_BURAYA`

### Telegram Bot Token
- **Desen:** `[0-9]{8,10}:AA[A-Za-z0-9_-]{33}`
- **Placeholder:** `TELEGRAM_BOT_TOKEN_BURAYA`

### Hex API Key'ler (Kie AI, Hunter, Apollo, ImgBB)
- **Desen:** API key bağlamında geçen 32-40 karakter uzunluğunda hex string: `[a-f0-9]{32,40}`
- **Dikkat:** Bu desen çok genel — sadece API key satırlarında kullan, commit hash'leri gibi yerlerde yanlış eşleşme yapabilir
- **Placeholder:** İlgili servisin adına göre belirle (örn: `KIE_AI_API_KEY_BURAYA`)

### OAuth Client ID
- **Desen:** `[0-9]{10,}-[a-z0-9]{30,}\.apps\.googleusercontent\.com`
- **Placeholder:** `OAUTH_CLIENT_ID_BURAYA`

---

## Kişisel Bilgi Desenleri

### E-posta Adresleri
- **Desen:** Kullanıcının bilinen e-postaları (profil.md'den al)
- **Genel desen:** `[isim][a-z]*@[a-z]+\.[a-z]+`
- **Placeholder:** `EMAIL_ADRESI_BURAYA`

### Kişisel URL'ler
- **Desen:** `[SOSYAL_MEDYA_KULLANICI]\.com`, `instagram\.com/INSTAGRAM_KULLANICI_ADI` vb.
- **Placeholder:** `KISISEL_URL_BURAYA`

### Dosya Sistemi Yolları
- **Desen:** `/Users/KULLANICI_ADI/...`
- **Placeholder:** Göreceli yol ile değiştir veya genel bir yol kullan

---

## Tarama Stratejisi

1. **Önce bilinen key'leri ara:** `_knowledge/api-anahtarlari.md` dosyasındaki gerçek key değerlerini al, dosyalarda birebir ara
2. **Sonra desenleri tara:** Yukarıdaki regex desenlerini kullanarak tarama yap
3. **Son olarak manuel kontrol:** Dosya isimlerine bak — `token.json`, `credentials.json`, `*.pem`, `*.key` gibi dosyalar var mı?

---

## Taranacak Dosya Türleri

| Uzantı | Açıklama |
|--------|----------|
| `.py` | Python kaynak kodu |
| `.js` / `.ts` | JavaScript/TypeScript |
| `.md` | Markdown dökümantasyon |
| `.json` | JSON konfigürasyon |
| `.yaml` / `.yml` | YAML konfigürasyon |
| `.env` | Environment dosyası |
| `.sh` | Shell script |
| `.html` | HTML dosyaları |
| `.txt` | Metin dosyaları |
| `.cfg` / `.ini` / `.conf` | Konfigürasyon dosyaları |

---

## Atlanacak Dosya/Klasörler

Bu dosya/klasörlerin içeriği taranmaz, doğrudan silinir veya hariç tutulur:

- `.git/`
- `.venv/` / `venv/` / `env/`
- `__pycache__/`
- `node_modules/`
- `.DS_Store`
- `*.pyc`
- `token.json`
- `.cursor/` / `.vscode/`
