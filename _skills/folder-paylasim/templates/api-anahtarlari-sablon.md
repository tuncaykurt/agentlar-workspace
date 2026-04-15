# API Anahtarları ve Servisler

Bu dosyayı her yeni servis eklendiğinde güncelle.
Antigravity her konuşmada buraya bakarak hangi servisleri kullandığını hatırlar.

---

## Kullanılan Servisler

### Apify
- **API Anahtarı:** `BURAYA_KENDI_APIFY_API_KEYINIZI_YAZIN`
- **Kullanım:** Instagram/TikTok scraping, veri çekme
- **Nereden Alınır:** https://console.apify.com → Settings → Integrations → Personal API Token

### OpenAI
- **API Anahtarı:** `BURAYA_KENDI_OPENAI_API_KEYINIZI_YAZIN`
- **Kullanım:** GPT-4.1 ile analiz, içerik üretimi
- **Nereden Alınır:** https://platform.openai.com → API Keys

### Kie AI
- **API Anahtarı:** `BURAYA_KENDI_KIE_AI_API_KEYINIZI_YAZIN`
- **Base URL:** `https://api.kie.ai/api/v1/`
- **Kullanım:** Video ve görsel üretimi (Kling 3.0, Veo 3.1, Nano Banana 2, vb.)
- **Not:** Tüm görevler asenkron — createTask → recordInfo döngüsü
- **Nereden Alınır:** https://kie.ai → API bölümü

### Telegram
- **Bot Token:** `BURAYA_KENDI_TELEGRAM_BOT_TOKENINIZI_YAZIN`
- **Kullanım:** Bot üzerinden bildirim ve içerik teslimi
- **Nereden Alınır:** Telegram'da @BotFather ile yeni bot oluşturun

---

### Hunter.io
- **API Anahtarı:** `BURAYA_KENDI_HUNTER_API_KEYINIZI_YAZIN`
- **Kullanım:** E-posta bulma, lead enrichment
- **Nereden Alınır:** https://hunter.io → API

### Apollo.io
- **API Anahtarı:** `BURAYA_KENDI_APOLLO_API_KEYINIZI_YAZIN`
- **Kullanım:** B2B lead bulma, kişi arama
- **Nereden Alınır:** https://app.apollo.io → Settings → Integrations → API

### Gmail (Outreach)
- **Hesap:** `BURAYA_KENDI_GMAIL_ADRESINIZI_YAZIN`
- **Credentials Dosyası:** Google Cloud Console'dan OAuth2 credentials indirip proje klasörüne koyun
- **Kullanım:** Otomatik outreach e-postaları gönderme (Gmail API OAuth2)
- **Nereden Alınır:** https://console.cloud.google.com → APIs → Gmail API → OAuth

### Groq
- **API Anahtarı:** `BURAYA_KENDI_GROQ_API_KEYINIZI_YAZIN`
- **Base URL:** `https://api.groq.com/openai/v1`
- **Kullanım:** Hızlı LLM çıkarımı, sesli mesaj transkripti
- **Not:** OpenAI uyumlu API formatı
- **Nereden Alınır:** https://console.groq.com → API Keys

### Perplexity
- **API Anahtarı:** `BURAYA_KENDI_PERPLEXITY_API_KEYINIZI_YAZIN`
- **Base URL:** `https://api.perplexity.ai`
- **Kullanım:** Gerçek zamanlı web araştırması
- **Not:** OpenAI uyumlu format — model: `sonar` veya `sonar-pro`
- **Nereden Alınır:** https://docs.perplexity.ai → API Settings

### ImgBB
- **API Anahtarı:** `BURAYA_KENDI_IMGBB_API_KEYINIZI_YAZIN`
- **Base URL:** `https://api.imgbb.com/1/upload`
- **Kullanım:** Yerel görselleri public URL'ye yükle
- **Nereden Alınır:** https://api.imgbb.com → Get API Key (ücretsiz)

### Supadata
- **API Anahtarı:** `BURAYA_KENDI_SUPADATA_API_KEYINIZI_YAZIN`
- **Base URL:** `https://api.supadata.ai/v1`
- **Kullanım:** YouTube/TikTok video transkript çıkarma
- **Auth Header:** `x-api-key: {API_KEY}`
- **Nereden Alınır:** https://supadata.ai → Dashboard → API Key

### ElevenLabs
- **API Anahtarı:** `BURAYA_KENDI_ELEVENLABS_API_KEYINIZI_YAZIN`
- **Base URL:** `https://api.elevenlabs.io/v1`
- **Kullanım:** Text-to-speech seslendirme, reklam dış sesi
- **Önerilen Model:** `eleven_multilingual_v2` (Türkçe için)
- **Nereden Alınır:** https://elevenlabs.io → Developers → Create API Key

---

> ⚠️ Bu dosyayı hiçbir zaman herkese açık bir yere (GitHub vb.) yükleme.
> 💡 Başlangıçta tüm servislerin anahtarlarını girmenize gerek yok — hangi skill'i veya projeyi kullanacaksanız, onun ihtiyaç duyduğu servislerin anahtarlarını girin.
