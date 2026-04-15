# 🤖 Shorts Demo Otomasyonu

**Durum:** ✅ Railway 7/24 Aktif  
**Platform:** Railway (auto-deploy via GitHub)  
**Telegram Bot:** [@ai_factory_demo_bot](https://t.me/ai_factory_demo_bot)

---

## Açıklama

AI Factory topluluğu için Telegram üzerinden çalışan **tek seferlik YouTube Shorts demo botu**. Kullanıcılar bot'a bir video fikri yazarak AI ile video ürettirebilir. Her kullanıcı **tek bir demo hakkına** sahiptir; admin kullanıcı sınırsız kullanabilir.

### Nasıl Çalışır?

1. Kullanıcı Telegram'dan mesaj yazar (örn: "köpek marketten et çalıyor")
2. **GPT-4.1** mesajı sınıflandırır — sohbet / video fikri / belirsiz
3. Video fikri ise GPT detaylı İngilizce prompt üretir (Sora prompt kurallarına göre)
4. **Fal AI (Sora 2)** ile 9:16 portrait video üretilir (~3-5 dk)
5. Video kullanıcıya Telegram'dan gönderilir
6. Kullanıcının demo hakkı düşer

## Kullanılan Servisler

| Servis | Kullanım |
|--------|----------|
| **Telegram Bot API** | Kullanıcı arayüzü (polling) |
| **OpenAI GPT-4.1** | Mesaj sınıflandırma + prompt üretimi |
| **OpenAI GPT-4.1-mini** | Video üretimi sırasında sohbet yanıtları |
| **Fal AI (Sora 2)** | Video üretim motoru (text-to-video) |

## Çalıştırma

```bash
# Lokal
cp .env.example .env   # Gerçek değerleri gir
pip install -r requirements.txt
python bot.py

# Production (Railway)
# GitHub push → otomatik deploy
# Environment variables Railway Dashboard'da ayarlı
```

## Dosya Yapısı

| Dosya | Açıklama |
|-------|---------| 
| `bot.py` | Ana bot mantığı — tüm handler'lar, pipeline ve video üretim |
| `config.env` | Lokal env dosyası (git'te yok) |
| `.env.example` | Env variable şablonu |
| `requirements.txt` | Python bağımlılıkları |
| `railway.json` | Railway deploy konfigürasyonu |
| `sora_prompt_guidelines.md` | Sora 2 prompt mühendisliği kuralları |
| `Sistem_Nasil_Calisir.html` | Pipeline görselleştirme (akış şeması) |
| `AI Factory Sorular (2).csv` | Bilgi tabanı — bot'un SSS cevapları |
| `Sora 2 Vücut Kamerası (10).json` | Bodycam tarzı prompt şablonları |
| `Tüm Prompt Üreticiler (1).json` | Tüm kategoriler için prompt şablonları |

## Özellikler

- ✅ Tek seferlik demo limiti (admin bypass)
- ✅ Video üretimi sırasında sohbet desteği
- ✅ Güvenlik kuralları (sistem/kod bilgisi paylaşmaz)
- ✅ Global error handler (Conflict, NetworkError, TimedOut bastırılır)
- ✅ Railway container uyumu (`stop_signals=None`)
- ✅ Progress mesajları (90sn: "Devam ediyor", 210sn: "Neredeyse bitti")

## Environment Variables

| Değişken | Açıklama |
|----------|----------|
| `TELEGRAM_BOT_TOKEN` | Telegram bot tokeni |
| `OPENAI_API_KEY` | OpenAI API anahtarı |
| `FAL_API_KEY` | Fal AI API anahtarı |
| `ADMIN_CHAT_ID` | Admin Telegram chat ID (sınırsız kullanım) |
