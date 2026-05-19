---
name: firecrawl-cli
description: |
  Firecrawl gives AI agents and apps fast, reliable web context with
  strong search, scraping, and interaction tools.
---

# Firecrawl CLI Skill

Firecrawl helps agents search first, scrape clean content, and interact
with live pages when plain extraction is not enough.

## Kullanım Yolları

### Yol A: Canlı Web Araçları (Live Tools)
İş sırasında web verisine ihtiyaç duyduğunuzda kullanın: arama, kazıma, etkileşim, döküman tarama.

- `firecrawl search` -> Arama yapmak için.
- `firecrawl scrape` -> Belirli bir URL'den temiz veri çekmek için.
- `firecrawl interact` -> Sayfada tıklama, form doldurma veya login gerektiğinde.
- `firecrawl map` -> Bir sitenin URL haritasını çıkarmak için.

### Yol B: Uygulama Entegrasyonu (Build)
Firecrawl'ı bir koda veya workflow'a API üzerinden bağlamak için.

## Kurulum ve Doğrulama
Zaten kurulmuştur. Doğrulamak için:
```bash
firecrawl --status
```

## Varsayılan Akış (Workflow)
1. Keşif gerekiyorsa **search** ile başla.
2. URL varsa **scrape** ile devam et.
3. Tıklama/Login gerekiyorsa **interact** kullan.
4. Hata alırsan `firecrawl ask` ile jobId üzerinden destek al.

## Kaynaklar
- API Docs: https://docs.firecrawl.dev
- Skills Repo: https://github.com/firecrawl/skills
