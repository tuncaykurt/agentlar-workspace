# 🚀 Antigravity — İlk Adımlar Rehberi

Hoş geldiniz! Bu klasör, yapay zekâ asistanınız **Antigravity** ile çalışmak için ihtiyacınız olan her şeyi içeriyor. Skill'ler, projeler ve otomasyon altyapıları sizin için hazırlanmış durumda.

Tek yapmanız gereken birkaç basit adımı tamamlamak — sonra Antigravity sizin için çalışmaya başlayacak.

---

## 📋 Kurulum — 3 Adımda Hazır

### Adım 1: Kendinizi Tanıtın (2 dakika)

`_knowledge/profil.md` dosyasını açın ve `[KÖŞELI PARANTEZ]` içindeki yerleri kendi bilgilerinizle değiştirin.

Bu dosya, Antigravity'nin sizi tanımasını sağlar — işletmenizi, ne iş yaptığınızı ve hedeflerinizi bilir.

> 💡 **İpucu:** Bu dosyayı kendiniz düzenleyebilir veya Antigravity'ye şunu söyleyebilirsiniz:
> ```
> Antigravity, _knowledge/profil.md dosyasını benimle birlikte doldur. 
> Sırayla bana sorular sor ve yanıtlarımla dosyayı güncelle.
> ```

### Adım 2: API Anahtarlarınızı Girin (5-10 dakika)

`_knowledge/api-anahtarlari.md` dosyasını açın. Her servis için `BURAYA_KENDI_ANAHTARINIZI_YAZIN` yazan yerlere kendi API anahtarlarınızı girin.

> ⚠️ **Hepsini birden girmenize gerek yok!** Hangi servisleri kullanacaksanız, sadece onların anahtarlarını girin. Diğerleri daha sonra eklenebilir.

**Sık kullanılan servisler ve nereden alınacağı:**

| Servis | Ne İşe Yarar? | Nereden Alınır? |
|--------|-------------|-----------------|
| OpenAI | Akıllı metin analizi ve üretimi | [platform.openai.com](https://platform.openai.com) |
| Kie AI | Video ve görsel üretimi | [kie.ai](https://kie.ai) |
| Apify | Sosyal medya veri çekimi | [apify.com](https://apify.com) |

### 🛡️ Önemli Güvenlik Uyarısı

> ⚠️ **API anahtarlarınızı GitHub'a ASLA push etmeyin!**
> 
> `_knowledge/api-anahtarlari.md` dosyası sizin **kişisel** dosyanızdır. İçindeki anahtarlar herkese açık olursa kötüye kullanılabilir ve hesaplarınızdan ücret kesilir.
> 
> Bu repo'nun `.gitignore` dosyası zaten bu dosyaları koruyacak şekilde ayarlanmıştır. Ama eğer GitHub'a push edecekseniz, push etmeden önce şunu kontrol edin:
> 
> ```bash
> git status
> ```
> 
> Çıktıda `api-anahtarlari.md`, `.env` veya `credentials` içeren dosyalar **görünmüyorsa** güvendesiniz. Görünüyorsa push yapmayın ve Antigravity'ye sorun.

### Adım 3: Hazırsınız! 🎉

API anahtarlarınızı girdikten sonra tüm skill'ler ve projeler kullanıma hazır. 

---

## 🧠 Antigravity Nasıl Çalışır?

```
Antigravity/
├── _knowledge/        → Antigravity'nin sizi tanıdığı bilgiler
│   ├── profil.md            (Siz kimsiniz, ne iş yapıyorsunuz)
│   ├── api-anahtarlari.md   (Servislerin anahtarları)
│   └── calisma-kurallari.md (Çalışma tercihleriniz)
│
├── _skills/           → Antigravity'nin yetenekleri
│   ├── kie-ai-video-production/  (Video & görsel üretimi)
│   ├── lead-generation/          (Lead toplama)
│   ├── outreach/                 (E-posta gönderimi)
│   └── ...
│
├── Projeler/          → Çalışma alanınız
│   └── (Projeleriniz burada)
│
└── _agents/workflows/ → Kısayol komutları
    └── (Workflow'larınız burada)
```

### 📌 Knowledge (Bilgi Tabanı)
Antigravity her konuşmada `_knowledge/` içindeki dosyaları okur. Bu sayede sizi tanır, hangi servisleri kullandığınızı bilir ve tutarlı çalışır.

### 📌 Skill'ler
Skill'ler Antigravity'nin **kalıcı yetenekleridir**. Bir skill bir kere eklendikten sonra, Antigravity o işi her zaman yapabilir. Skill'lere dokunmanıza gerek yok — sadece API anahtarlarınızı tanımlayın.

### 📌 Projeler
Projeler, belirli bir amaca yönelik çalışma alanlarıdır. Bir proje birden fazla skill'i kullanabilir. Yeni projeler oluşturabilir veya mevcut projeleri özelleştirebilirsiniz.

### 📌 Workflow'lar
Workflow'lar, sık kullanılan işlemler için kısayollardır. Örneğin `/icerik-uretimi` yazarak içerik otomasyon pipeline'ını başlatabilirsiniz.

---

## 🎯 İlk Denemeler

Kurulumu tamamladıktan sonra şu prompt'ları deneyin:

### Video Üretimi:
```
Antigravity, ürünümün fotoğrafını çektim. Bunu profesyonel bir reklam videosuna dönüştür.
```

### Lead Toplama:
```
Antigravity, benim sektörümdeki potansiyel müşterileri bul ve bir liste oluştur.
```

### İçerik Oluşturma:
```
Antigravity, Instagram'da paylaşmak için kısa bir reel scripti yaz.
```

---

## ❓ Sıkça Sorulan Sorular

**S: Bir skill çalışmıyor, ne yapmalıyım?**
C: Önce `_knowledge/api-anahtarlari.md` dosyasında ilgili servisin API anahtarını girdiğinizden emin olun.

**S: Yeni bir skill nasıl eklenir?**
C: Eğitmeninizden aldığınız skill klasörünü `_skills/` dizinine sürükleyin. Skill'in `GEREKSINIMLER.md` dosyasını okuyun.

**S: API anahtarlarımı nasıl alırım?**
C: Antigravity'ye sorun: `"[Servis Adı] API anahtarını nasıl alabilirim?"`

---

> 💡 Bu dosya rehberinizdir. Başka sorunuz olursa Antigravity'ye doğrudan sorabilirsiniz!
