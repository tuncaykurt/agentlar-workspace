# 📦 [PROJE_ADI] — Kurulum Rehberi

[PROJE_ACIKLAMA]

---

## 🚀 Hızlı Başlangıç

Bu projeyi çalıştırmak için Antigravity asistanınıza aşağıdaki prompt'u verin:

### Hazır Başlangıç Prompt'u:

```text
Antigravity, bu klasördeki "[PROJE_ADI]" projesini benim için kurmanı istiyorum.
Lütfen önce projeyi incele, ardından gerekli ortamı kur (venv + requirements.txt).
Sonra .env.example dosyasından yola çıkarak bir .env dosyası oluştur ve benden gerekli API anahtarlarını iste.
Her şey hazır olduğunda projeyi nasıl çalıştıracağımı göster.
```

---

## 📥 Kurulum Adımları

### 1. Klasörü Doğru Yere Koyun
Bu klasörü Antigravity dosyanızın `Projeler/` dizinine sürükleyin:
```
Antigravity/
└── Projeler/
    └── [PROJE_KLASOR_ADI]/    ← Bu klasör
```

### 2. API Anahtarlarını Hazırlayın
Bu proje aşağıdaki servisleri kullanıyor. `.env.example` dosyasını `.env` olarak kopyalayıp kendi anahtarlarınızı girin:

| Servis | Ne İçin Kullanılıyor? | Anahtar Nasıl Alınır? |
|--------|----------------------|----------------------|
[SERVIS_TABLOSU_BURAYA]

### 3. Bağımlılıkları Kurun
```bash
pip install -r requirements.txt
```
> 💡 Antigravity bunu sizin için otomatik yapabilir — yukarıdaki hazır prompt'u kullanın.

---

## 🛠 Gerekli Skill'ler

[SKILL_BAGIMLILIKLARI — yoksa "Bu proje herhangi bir skill'e bağımlı değildir." yaz]

[Eğer skill'ler gerekli ise:]
> ⚠️ Bu projenin tam işlevselliği için aşağıdaki skill'lerin `_skills/` klasörünüzde kurulu olması gerekir:
>
> | Skill | Açıklama |
> |-------|-----------|
> [SKILL_TABLOSU_BURAYA]
>
> Eğer bu skill'ler klasörünüzde yoksa, eğitmeninizden talep edin.

---

## 📁 Proje Yapısı

```
[PROJE_YAPISI_BURAYA]
```

---

## ❓ Sorun mu Yaşıyorsunuz?

Antigravity asistanınıza şunu sorun:
```
Bu projede şu hatayı alıyorum: [hata mesajı]. Nasıl çözebilirim?
```
