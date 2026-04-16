---
description: Paylaşım — Skill, proje veya tüm Antigravity starter kit'ini başkalarının kullanabileceği formata dönüştür
---

> **🤖 Agent:** Bu workflow `_agents/yayinla-paylas/AGENT.md` agent'ının **Export akışının** bir parçasıdır.
> Bağımsız olarak `/proje-paylas` komutuyla da çalışabilir.

# 📦 Paylaşım (Export)

Skill'leri, projeleri veya bütün Antigravity yapısını başkalarının alıp kullanabileceği formata çevirir. 
API anahtarlarını temizler, bağımlılıkları çözer, kurulum rehberi üretir.

## Gerekli Skill
`_skills/paylasim/SKILL.md` → ÖNCE OKU

## Kullanım

Bu workflow 3 modda çalışır. Kullanıcı ne paylaşmak istediğini belirtir:

### Mod 1: Skill Paylaşımı
```
/proje-paylas skill [skill-adi]
```
Örnek: `/proje-paylas skill kie-ai-video-production`

### Mod 2: Proje Paylaşımı
```
/proje-paylas proje [proje-adi]
```
Örnek: `/proje-paylas proje B2B_Outreach`

### Mod 3: Starter Kit (Tam Antigravity)
```
/proje-paylas starter-kit
```

---

## Adımlar (Tüm Modlar İçin Genel Akış)

1. **Skill'i Oku**
   - `_skills/paylasim/SKILL.md` dosyasını oku
   - İlgili mod bölümündeki adımları takip et

2. **Güvenlik Taraması**
   - `_skills/paylasim/checklists/guvenlik-tarama.md` dosyasını referans al
   - `_knowledge/api-anahtarlari.md` dosyasındaki gerçek key'leri al ve dosyalarda birebir ara
   - Regex desenleri ile API key taraması yap
   - Kişisel bilgileri temizle

3. **Bağımlılık Kontrolü**
   - `_skills/paylasim/checklists/bagimlilik-kontrol.md` dosyasını referans al
   - Proje dışı import'ları tespit et ve çöz
   - Skill bağımlılıklarını tespit et ve belirle
   - requirements.txt oluştur/güncelle

4. **Belgeleme**
   - İlgili şablonu `_skills/paylasim/templates/` altından al
   - Skill export → `GEREKSINIMLER_SKILL.md` şablonundan `GEREKSINIMLER.md` oluştur
   - Proje export → `KURULUM_REHBERI_PROJE.md` şablonundan `KURULUM_REHBERI.md` oluştur
   - Starter Kit → `BASLANGIÇ_REHBERI.md` şablonundan oluştur
   - Profil şablonu → `profil-sablon.md`
   - API anahtarları şablonu → `api-anahtarlari-sablon.md`

5. **Sonuç Raporlama**
   - Temizlenen key'leri listele
   - Silinen/hariç tutulan dosyaları listele
   - Tespit edilen bağımlılıkları listele
   - Hedef klasör yolunu bildir
