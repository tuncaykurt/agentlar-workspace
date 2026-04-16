---
name: Web Visuals
description: Antigravity eğitimi için interaktif, görsel web sayfaları oluşturma ve yönetme becerisi. Teknik konseptleri anlaşılır metaforlarla görselleştirir.
---

# Web Visuals Skill

Bu beceri, Antigravity eğitim materyalleri için premium görsel web sayfaları oluşturmak ve yönetmek amacıyla kullanılır.

## Mevcut Sayfalar

### 1. ThemeParkMetaphor.html — Platform vs API
**Konsept:** Restoran metaforu ile Platform ve API erişiminin aynı hizmetin iki farklı kapısı olduğunu anlatır.
- **Ön Kapı (Platform):** GUI ile manuel erişim
- **Arka Kapı (API):** Kod ile otomatik erişim
- **Örnekler:** Apollo, Hunter.io, ChatGPT (tıklanabilir linklerle)
- **Ana Mesaj:** İkisi de aynı krediyi tüketir, fark sadece erişim yöntemi

### 2. TestVsProduction.html — Test vs Yayın Ortamı
**Konsept:** Projelerin test ortamında (bilgisayarda) mı kalacağını, yoksa yayın ortamına (buluta) mı çıkacağını gösterir.
- **Test Ortamı:** Bilgisayarında çalışır, Antigravity ile yönetilir
- **Yayın Ortamı:** Bulutta 7/24 ayakta, dış dünyaya açık
- **Senaryo Kartları:** Hangi projenin nerede kalacağını gösterir
- **Ana Mesaj:** Yayına çıkmak zorunlu değil, ihtiyaca bağlı

## Tasarım Prensipleri

1. **Dark theme** kullan (koyu arka plan: `#0f172a` veya `#0a0f1e`)
2. **Outfit** Google Font kullan (ağırlıklar: 300-900)
3. **Glassmorphism** ve **gradient** efektler uygula
4. **3D ikonlar** oluştur (generate_image aracıyla)
5. **Animasyonlar** ekle (fadeInUp, hover efektleri)
6. **Renk kodlama:** Her konsept için tutarlı renkler kullan (örn. yeşil=kolay, mavi=teknik, mor=özel)
7. **Tıklanabilir linkler** ekle: Öğrencilerin ilgili platformlara gidebilmesi için

## Görsel Üretim Kuralları

- İkonlar "premium, glossy 3D" stilde olmalı
- Koyu/transparan arka plana sahip olmalı
- `assets/` klasörüne kaydet
- `filter: drop-shadow()` ile gölge ekle

## Yayınlama

Sayfaları öğrencilerle paylaşmak için:
1. **GitHub Pages** — En basit yöntem. Repo'yu GitHub'a push et, Settings > Pages'dan yayınla
2. **Netlify** — Drag & drop ile deploy et
3. Tüm sayfalar self-contained (tek HTML dosyası + assets klasörü), kolayca taşınabilir

## Ekran Görüntüsü ile İyileştirme

Sayfa oluşturduktan sonra:
1. Browser subagent ile sayfayı aç
2. Farklı bölümlerin ekran görüntülerini al
3. Görsel tasarımı değerlendir
4. Gerekli iyileştirmeleri yap
5. Gereksiz feedback loop'a girme — sadece belirgin sorunları düzelt
