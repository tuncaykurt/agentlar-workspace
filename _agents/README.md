# 🤖 Agents

Bu klasör, Antigravity'nin akıllı orkestrasyon agent'larını içerir. Her agent, belirli skill'leri koordine ederek uçtan uca iş akışları yönetir.

---

## Agent'lar

### 1. 🎯 Müşteri Kazanım Agenti (`musteri-kazanim/`)

**Amaç:** Herhangi bir hedef kitle için lead bulma, iletişim bilgisi çıkarma ve e-posta outreach sürecini tek bir agent olarak yürütmek.

**Kullandığı Skill'ler:**
- `_skills/marketing/lead-generation/` → Apify ile profil tarama
- `_skills/marketing/eposta-gonderim/` → Gmail ile e-posta gönderimi

**Yapı:**
```
musteri-kazanim/
├── AGENT.md          ← Orkestrasyon yönergesi
├── config/           ← Kampanya konfigürasyonları (YAML)
├── templates/        ← E-posta şablonları (TR/EN) + sequence profilleri
├── scripts/          ← Kampanya başlatma, outreach, takip scriptleri
└── data/             ← Kampanya çıktıları (git-ignored)
```

**İlişkili Workflow'lar:** `/lead-toplama`, `/mail-gonder`, `/marka-outreach`

---

### 2. 🎬 İçerik Üretim Agenti (`icerik-uretim/`)

**Amaç:** Hedef sektörde içerik üretim sürecini (araştırma → script yazma → video prompting) uçtan uca yönetmek.

**Kullandığı Skill'ler:**
- `_skills/content/kie-ai-video-production/` → Video üretimi
- `_skills/marketing/rakip-analiz/` → Rakip analizi

**Yapı:**
```
icerik-uretim/
├── AGENT.md          ← Orkestrasyon yönergesi
├── config/           ← Marka profili (ornek-marka.yaml)
└── workflows/        ← Araştırma, script, ilham, hesaplama workflow'ları
```

**İlişkili Workflow'lar:** `/arastirma-yap`, `/script-yaz`, `/ilham-al`, `/hesaplama-scripti`, `/icerik-uretimi`

---

### 3. 🚀 Deploy & Paylaşım Agenti (`yayinla-paylas/`)

**Amaç:** Projelerin production'a alınmasını ve dış dünyayla paylaşılmasını yönetmek.

**Kullandığı Skill'ler:**
- `_skills/content/canli-yayina-al/` → Coolify/GitHub deploy pipeline
- `_skills/dev/folder-paylasim/` → Proje export ve paylaşım paketleme
- `_skills/analysis/proje-gorsellestirici/` → HTML görselleştirme

**Yapı:**
```
yayinla-paylas/
├── AGENT.md          ← Orkestrasyon yönergesi
└── workflows/        ← Deploy ve export workflow'ları
```

**İlişkili Workflow'lar:** `/proje-paylas`, `/proje-gorsellestir`

---

## Workflow'lar (`workflows/`)

Tüm slash-command workflow'ları `_agents/workflows/` altında bulunur. Her workflow hem bağımsız hem de ilgili agent'ın parçası olarak çalışabilir.

| Workflow | Slash Command | Agent |
|----------|--------------|-------|
| `lead-toplama.md` | `/lead-toplama` | 🎯 musteri-kazanim |
| `mail-gonder.md` | `/mail-gonder` | 🎯 musteri-kazanim |
| `arastirma-yap.md` | `/arastirma-yap` | 🎬 icerik-uretim |
| `script-yaz.md` | `/script-yaz` | 🎬 icerik-uretim |
| `ilham-al.md` | `/ilham-al` | 🎬 icerik-uretim |
| `hesaplama-scripti.md` | `/hesaplama-scripti` | 🎬 icerik-uretim |
| `icerik-uretimi.md` | `/icerik-uretimi` | 🎬 icerik-uretim |
| `proje-paylas.md` | `/proje-paylas` | 🚀 yayinla-paylas |
| `proje-gorsellestir.md` | `/proje-gorsellestir` | 🚀 yayinla-paylas |
| `marka-outreach.md` | `/marka-outreach` | 🎯 musteri-kazanim |

---

## Mimari Prensipler

1. **Skill'ler atomiktir** — Tek bir iş yaparlar (örn. lead bul, email gönder)
2. **Agent'lar orkestratördür** — Skill'leri koordine ederek uçtan uca akış yönetirler
3. **Workflow'lar bağımsızdır** — Hem tek başına hem agent parçası olarak çalışırlar
4. **Config ile parametrize** — Her kampanya/görev kendi YAML config'iyle tanımlanır
5. **Data lokal kalır** — Kampanya çıktıları (CSV/JSON) git'e gönderilmez

