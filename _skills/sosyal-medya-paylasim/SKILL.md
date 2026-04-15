---
name: Social Media Publisher
description: Üretilen metin, görsel veya videoları Make.com (veya n8n) aracı ile Instagram, TikTok, YouTube Shorts ve LinkedIn gibi sosyal medya platformlarında otomatik olarak yayınlamak için kullanılır.
---

## Açıklama

`sosyal-medya-paylasim` yeteneği, Antigravity'nin içerik üretim yeteneklerini (örneğin `kie-ai-video-production`) bir adım öteye taşıyıp, oluşan içeriklerin dış dünyaya (sosyal medyaya) otopilot olarak dağıtılmasını sağlar. 

API karmaşasını ve token yönetimini basitleştirmek adına, bu skill doğrudan sosyal ağların API'leriyle konuşmak yerine **Make.com** veya **n8n** üzerinde kurulmuş bir **Webhook** URL'ine verileri postalar. Platform gönderim işini bu entegrasyon aracı üstlenir.

## Gereksinimler

- `python3 -m pip install -r scripts/requirements.txt` ile bağımlılıkların (ör. `requests`) kurulu olması.
- İçeriklerin ulaşılabilir bir URL üzerinden sunuluyor olması (yerel dosyalar webhook ile gönderilemediği için Make.com/n8n tarafına içeriklerin public URL'lerinin, örneğin S3 veya Imgur linklerinin iletilmesi gerekir). LLM ile içerik yazımı ise sorunsuz iletilir.
- `.env` dosyasında (veya `_knowledge/api-anahtarlari.md` içinde belirtilen şekilde) `MAKE_WEBHOOK_URL` değişkeninin ayarlanmış olması.

## Adımlar

1. Gönderilecek içeriği (Metin, Medya URL'si) ve hedef platformları (ig, tiktok, linkedin, youtube) belirle.
2. `scripts/post_to_socials.py` aracını uygun argümanlarla çağır.
3. Aracı script, webhook'a POST isteği atar.

## Komut Kullanımı (CLI)

```bash
python3 _skills/sosyal-medya-paylasim/scripts/post_to_socials.py \
  --text "Bugün harika bir videoyla karşınızdayız! #Antigravity #AI" \
  --media "https://example.com/video.mp4" \
  --platforms "ig,tiktok,linkedin"
```

### Parametreler
- `--text`: Sosyal medyada paylaşılacak metin/açıklama.
- `--media`: (Opsiyonel) Görsel veya videonun **erişilebilir (public)** URL adresi.
- `--platforms`: Paylaşılacak platformların virgülle ayrılmış listesi (`ig`, `tiktok`, `youtube`, `linkedin`, `twitter`).

## Çıktı Formatı

Script başarılı olduğunda JSON formatında veya konsol logu olarak sonucunu döner. Make.com'a başarıyla iletilip iletilmediğini bildirir. Eğer test modundaysak, isteğin yapıldığı belirtilir ancak canlıya çıkmıyorsa ilgili bilgiler döner.

## Notlar
- Lokal ortamdaki bir dosya doğrudan gönderilmemelidir, medya parametresi URL beklemektedir.
- Kimlik bilgileri (`MAKE_WEBHOOK_URL`) güvenlik sebebiyle koda gömülmemeli, `--webhook` parametresi üzerinden veya `os.environ` (.env) üzerinden alınmalıdır.
