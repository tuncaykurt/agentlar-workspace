# 🏗️ Emlak Arazi Drone Çekim

**Durum:** 🔧 Geliştirme
**Agent:** 🎬 icerik-uretim

---

## Açıklama

Dubai emlak arazi ve gayrimenkul projeleri için drone çekim simülasyonu ve görselleştirme sistemi. Google Maps verileri ile arazi analizi yapar, Kie AI ile drone perspektifli video içerikleri üretir.

## Kullanılan Servisler

- **Google Maps API** — Arazi konum ve harita verileri
- **Kie AI** — AI video üretim
- **ImgBB** — Görsel upload
- **Gemini** — AI analiz ve değerlendirme

## Çalıştırma

```bash
cp .env.example .env  # Değerleri doldur
pip install -r requirements.txt
python src/main.py
```

## Dosya Yapısı

| Dosya | Açıklama |
|-------|---------|
| `src/config.py` | Konfigürasyon |
| `src/` | Kaynak kodlar |
| `.env.example` | Env variable şablonu |
| `requirements.txt` | Python bağımlılıkları |
