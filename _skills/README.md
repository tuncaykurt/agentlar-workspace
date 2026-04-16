# 🛠 Skills

Bu klasör, Antigravity'ye öğretilen kalıcı yetenekleri (skill'leri) içerir.

Her skill, kendi klasörü içinde bir `SKILL.md` dosyasıyla tanımlanır.
Antigravity bir göreve başlamadan önce ilgili skill'i okuyarak nasıl davranacağını öğrenir.

---

## Mevcut Skill'ler ve Kullanan Agent'lar

| # | Skill | Açıklama | Kullanan Agent(lar) |
|---|-------|---------|---------------------|
| 1 | `rakip-analiz` | Rakip analizi ve izleme | 🤖 `icerik-uretim` |
| 2 | `folder-paylasim` | Klasör bazlı paylaşım | 🤖 `yayinla-paylas` |
| 3 | `kie-ai-video-production` | Video, görsel ve ses üretimi | 🤖 `icerik-uretim` |
| 4 | `lead-generation` | Potansiyel müşteri ve veri toplama (Apify) | 🤖 `musteri-kazanim` |
| 5 | `eposta-gonderim` | Toplanan verilere e-posta gönderimi (Gmail) | 🤖 `musteri-kazanim` |
| 6 | `canli-yayina-al` | GitHub + Railway ile 7/24 deployment | 🤖 `yayinla-paylas` |
| 7 | `proje-gorsellestirici` | Projelerin D3.js ile interaktif mimari şeması | 🤖 `yayinla-paylas` |
| 8 | `folder-paylasim` | Proje export ve paylaşıma hazırlama | 🤖 `yayinla-paylas` |
| 9 | `rakip-analiz` | Rakiplerin landing page analizi | 🤖 `musteri-kazanim` |
| 10 | `egitim-gorselleri` | Web temelli görselleştirmeler | — (bağımsız) |
| 11 | `website-olusturucu` | Web sitesi oluşturma | — (bağımsız) |
| 12 | `sifre-yonetici` | Merkezi şifre/token yönetimi ve dağıtımı | Tüm agent'lar |
| 13 | `fatura-olusturucu` | Sosyal medya iş birlikleri için PDF invoice üretimi | 🤖 `yayinla-paylas` |
| 14 | `otomatik-yedekleme` | Haftalık otomatik backup sistemi (cron) | — (bağımsız) |
| 15 | `servis-izleyici` | Railway + Cron + Lokal proje sağlık kontrolü | Tüm agent'lar |
| 16 | `reels-kapak` | AI ile Instagram Reels kapak görseli üretimi (Kie AI pipeline) | 🤖 `icerik-uretim` |
| 17 | `telefon-formatlayici` | Telefon numarası formatlama ve doğrulama | — (bağımsız) |

---

## Yeni Skill Nasıl Eklenir?

1. `_skills/` altında yeni bir klasör aç (örn. `apify-analizi/`)
2. İçine `SKILL.md` dosyası oluştur
3. `SKILL.md` içine şu formatı kullan:

```markdown
---
name: Skill Adı
description: Bu skill ne zaman kullanılır?
---

## Açıklama
...

## Adımlar
1. ...
2. ...

## Çıktı Formatı
...
```
