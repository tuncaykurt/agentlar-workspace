---
name: İçerik Üretim Agenti
description: |
  İçerik üretim sürecini (araştırma → script yazma → video üretimi) uçtan uca
  orkestre eden agent. Herhangi bir marka/kişi için sosyal medya video içerikleri üretir.
---

# 🎬 İçerik Üretim Agenti

> **Agent:** `_agents/icerik-uretim/`
> **Amaç:** Araştırmadan video üretimine kadar tüm içerik pipeline'ını tek çatı altında yönetmek.
> **Durum:** Aktif

---

## 📋 Bu Agent Ne Yapar?

5 ayrı adımlı workflow'u tek bir orkestrasyon çatısı altında birleştirir:

```
                    ┌─────────────────┐
                    │  İÇERİK ÜRETİM  │
                    │     AGENT'I      │
                    └────────┬────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
   ┌────▼─────┐       ┌─────▼──────┐       ┌─────▼──────┐
   │ ARAŞTIRMA │       │  SCRİPT    │       │   VİDEO    │
   │  KATMANI  │       │  KATMANI   │       │  KATMANI   │
   └────┬──────┘       └─────┬──────┘       └─────┬──────┘
        │                    │                    │
   ┌────▼─────┐       ┌─────▼──────┐       ┌─────▼──────┐
   │araştırma  │       │ script-yaz │       │ icerik-    │
   │   yap     │       │ ilham-al   │       │ uretimi    │
   │           │       │ hesaplama  │       │ (Kie AI)   │
   └───────────┘       └────────────┘       └────────────┘
```

---

## 🛠️ Kullandığı Skill'ler

| Skill | Konum | Ne İçin Kullanılır |
|-------|-------|-------------------|
| **Kie AI Video Production** | `_skills/kie-ai-video-production/SKILL.md` | Video/görsel üretimi (Kling, Veo, Sora vb.) |
| **Competitor Radar** | `_skills/rakip-analiz/SKILL.md` | Rakip analizi (Instagram, TikTok, Meta Ads) |

---

## 🔧 Kullandığı Araçlar

| Araç | Konum | Ne İçin |
|------|-------|---------| 
| **Calculator** | Proje içi `tools/calculator.py` | Yatırım/finans hesaplamaları |
| **Transcript** | Proje içi `tools/transcript.py` | Videolardan transkript çıkarma |
| **Currency** | Proje içi `tools/currency.py` | Döviz çevirisi |
| **Radar Engine** | `_skills/rakip-analiz/scripts/radar_engine.py` | Rakip profil analizi |

> 💡 Araçlar `Projeler/` altındaki ilgili projenin `tools/` klasöründe tutulur.

---

## 📁 Agent Yapısı

```
_agents/icerik-uretim/
├── AGENT.md                          ← Bu dosya (ana yönerge)
├── config/
│   └── ornek-marka.yaml              ← Yeni markalar için konfigürasyon şablonu
└── workflows/
    ├── arastirma-yap.md              ← Pazar araştırma workflow'u
    ├── script-yaz.md                 ← Script yazma workflow'u
    ├── ilham-al.md                   ← Rakipten ilham alma workflow'u
    └── hesaplama-scripti.md          ← Hesaplama içerikli script workflow'u
```

> **Not:** `_agents/workflows/icerik-uretimi.md` (slash command: `/icerik-uretimi`) bu agent'ın video üretim adımını tetikler.

---

## 🔄 Uçtan Uca Orkestrasyon Akışı

Bir içerik üretim talebi geldiğinde agent şu akışı izler:

### Adım 1: Talebi Analiz Et
Kullanıcının isteğinden **içerik türünü** belirle:

| Kullanıcı Ne Diyor? | Tetiklenen Workflow |
|---------------------|---------------------|
| "X bölgesini/sektörünü analiz et" | `workflows/arastirma-yap.md` → `workflows/script-yaz.md` |
| "Şu rakibin videosundan ilham al" | `workflows/ilham-al.md` |
| "Hesaplamalı içerik yap" | `workflows/hesaplama-scripti.md` |
| "Genel bir script yaz" | `workflows/script-yaz.md` |
| "Bu script için video üret" | `/icerik-uretimi` workflow'u |
| "Sıfırdan içerik üret (araştırma → video)" | **Tam Pipeline** (hepsini sırayla) |

### Adım 2: Config'i Yükle
```yaml
# config/ornek-marka.yaml'dan varsayılan ayarları çek
marka: "Marka Adınız"
dil: Türkçe
ton: samimi-profesyonel
hedef_kitle: "Hedef kitlenizin açıklaması"
```

### Adım 3: Pipeline Çalıştır
İçerik türüne göre ilgili workflow'ları **sırayla** çalıştır.

---

## 🚀 5 Workflow'un Büyük Resmi

### A. Araştırma Workflow'u (`workflows/arastirma-yap.md`)
**Tetikleyici:** Pazar analizi, trend veya araştırma gerektiğinde
**Girdi:** Konu (sektör, bölge, trend türü)
**Çıktı:** Metrikler tablosu + fırsat analizi + kaynaklar
**Sonraki Adım:** Script yazma

### B. Script Yazma Workflow'u (`workflows/script-yaz.md`)
**Tetikleyici:** Araştırma tamamlandığında veya doğrudan script istenmesi
**Girdi:** Araştırma notları veya konu
**Çıktı:** Hook → Script → Tablo → CTA formatında video scripti
**Sonraki Adım:** Video üretimi

### C. İlham Alma Workflow'u (`workflows/ilham-al.md`)
**Tetikleyici:** Rakip videosundan ilham istenmesi
**Girdi:** Video URL'i veya rakip kanal adı
**Çıktı:** Uyarlanmış orijinal script + ilham kaynağı notu
**Sonraki Adım:** Video üretimi

### D. Hesaplama Workflow'u (`workflows/hesaplama-scripti.md`)
**Tetikleyici:** Rakamsal hesaplama gerektiren script (finans, ROI, maliyet analizi vb.)
**Girdi:** Parametreler (fiyat, vade, oranlar)
**Çıktı:** Hesaplamalı script + tablo + detay
**Sonraki Adım:** Video üretimi

### E. Video Üretim Workflow'u (`_agents/workflows/icerik-uretimi.md`)
**Tetikleyici:** Script hazır olduğunda video gerektiğinde
**Girdi:** Script veya video prompt'u
**Çıktı:** AI ile üretilmiş video/görsel URL'leri
**Kullandığı Skill:** `_skills/kie-ai-video-production/SKILL.md`

---

## 🎯 Tam Pipeline Örneği (Araştırma → Video)

```
1. [Araştırma]     → Hedef konuyu araştır (web + sektör verileri)
2. [Config]        → Marka YAML'ından kuralları al
3. [Script Yaz]    → Araştırma verilerinden script üret
4. [Video Prompt]  → Script'e uygun görsel prompt hazırla  
5. [AI Video]      → Video üretim skill'i ile video üret
6. [Seslendirme]   → (opsiyonel) Text-to-speech ile dış ses
7. [Teslim]        → Video URL'ini kullanıcıya sun
```

---

## ⚙️ Config Kullanımı

Agent her çalıştığında `config/` altındaki YAML dosyasından şu değerleri çeker:

- **Marka kimliği:** İsim, platformlar, alan
- **Üslup kuralları:** Ton, dil, cümle uzunluğu
- **Hesaplama metrikleri:** Sektöre özel parametreler
- **Format kuralları:** Script yapısı (Hook → Script → Tablo → CTA)
- **Yasak ifadeler:** Abartılı vaatler, yanıltıcı bilgiler

Farklı bir marka/müşteri için çalışılacaksa `config/` altına yeni YAML dosyası oluşturulabilir.
`config/ornek-marka.yaml` dosyasını kopyalayarak başlayın.

---

## ❌ Hata Senaryoları

| Hata | Çözüm |
|------|-------|
| Araştırma verisi bulunamadı | Web aramasını genişlet, İngilizce anahtar kelimeler dene |
| Config dosyası eksik | `config/ornek-marka.yaml` şablonunu kopyala ve doldur |
| AI Video API 402 (kredi yok) | `_knowledge/api-anahtarlari.md` → API anahtarını kontrol et |
| AI Video API 500 (sunucu hatası) | 30 saniye bekle, tekrar dene |
| Transcript alınamadı | İlgili API anahtarını kontrol et |

---

## 📌 İlişkili Kaynaklar

- **Video Üretim Skill:** `_skills/kie-ai-video-production/SKILL.md`
- **Rakip Analiz Skill:** `_skills/rakip-analiz/SKILL.md`
- **API Anahtarları:** `_knowledge/api-anahtarlari.md`
- **Ana Workflow:** `_agents/workflows/icerik-uretimi.md` (slash command)
