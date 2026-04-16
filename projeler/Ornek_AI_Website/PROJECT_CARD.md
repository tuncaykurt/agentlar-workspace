# 📋 Project Card
> Bu dosya Antigravity'nin projeyi hızla anlaması için hazırlanmıştır.

| Alan | Değer |
|------|-------|
| **Platform** | netlify |
| **Start Command** | `npm run dev` (Lokal) |
| **Build Command** | `npm run build` |
| **Root Directory** | `Projeler/Ornek_AI_Website` |
| **GitHub Repo** | `[GITHUB_KULLANICI]/[REPO_ADI]` (mono-repo) |

## Env Variables
Mevcut bir kritik env var bulunmuyor (Statik/SSG ağırlıklı mimari). 

## Dosya Yapısı (kısa)
- `src/app/` → Sayfa routing (Next.js 15 App Router)
- `src/components/` → Bütünleşen React Client Component'ları
- `src/i18n/` → `tr.json`, `en.json`, `es.json`, `zh.json` (Çoklu dil mapleri)
- `public/` → Medya dosyaları (resimler vb.)

## Bilinen Platform Kısıtlamaları & Mimari Kurallar
- Sitede yapılan **HER METİN DEĞİŞİKLİĞİ**, 4 dilin `i18n/locales/*.json` dosyalarına yansıtılmak ZORUNDADIR. (Türkçe güncellenir, sonra diğer 3 dil). 
- Sayfalar Server Component / Client Component olarak dengelidir. Etkileşim için `"use client";` kullanılmaktadır.

## Son Doğrulama
- **Tarih:** 2026-03-23
- **Durum:** ✅ Çalışıyor
