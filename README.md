# AI Agent Sistemi - Sifirdan Kur

Markdown dosyalariyla calisan, local-first bir multi-agent sistemi.
Tek ihtiyacin: **VSCode + Claude Code**.

## Ne Bu?

Her biri tek bir ise odaklanan, olculebilir hedefleri olan, zamanlanmis dongulerde calisan AI agentlari.
Kod yok. Veritabani yok. Her sey markdown.

```
Sen (insan) --> Orchestrator --> Agentlar --> Ciktilar
                                    |
                                    v
                              Journal (paylasilan hafiza)
                                    ^
                                    |
                              Tum agentlar okur
```

## Hizli Baslangic (5 dakika)

### 1. Klasoru kopyala
```bash
git clone <bu-repo> my-agents
cd my-agents
code .
```

### 2. Claude Code'u ac
VSCode'da `Cmd+Shift+P` → "Claude Code" → Enter.

### 3. Ilk agentini olustur
Claude Code'a de ki:
```
"agents/standard-agent klasorunu kopyalayip agents/[agent-adim] olarak yeni bir agent olustur.
Misyonum: [tek cumlede ne yapmali].
KPI'larim: [2-3 olculebilir hedef]."
```

### 4. Heartbeat tanimla
```
"Bu agentin HEARTBEAT.md dosyasini doldur.
Gunluk/haftalik calissin, her dongude [ne yapmali]."
```

### 5. Skill ekle
```
"Bu agent icin bir [skill-adi] skill'i olustur.
Amaci: [ne yapmali]. Girdisi: [ne okuyacak]. Ciktisi: [ne uretecek]."
```

Bitti. Artik agentin var.

---

## Mimarinin 4 Sutunu

### 1. Belirli Hedefler
Her agentin olculebilir KPI'lari var. "Icerik uret" degil — "haftalik 3 post, engagement rate >5%".

### 2. Odakli Skill'ler
Her skill bir hedefe hizmet eder. Hedefe hizmet etmeyen skill silinir.

### 3. Heartbeat (Zamanlanmis Dongu)
Agentlar sadece istendiginde degil, zamanlanmis dongulerde calisir. Her dongu: oku → degerlendir → uret → logla.

### 4. Paylasilan Hafiza (Journal)
Agentlar birbirleriyle dogrudan konusmaz. Journal'a yazar, journal'dan okur. Bu paylasilan hafiza katmani.

---

## Klasor Yapisi

```
my-agents/
├── CLAUDE.md              ← Claude Code'un okudugu ana dosya
├── CONVENTIONS.md         ← Isimlendirme ve yapi kurallari
├── AGENT_REGISTRY.md      ← Tum agentlarin listesi
├── NEW_AGENT_BOOTSTRAP.md ← Yeni agent olusturma rehberi
│
├── agents/                ← Her agent kendi klasorunde
│   └── standard-agent/    ← Sablondan kopyala
│       ├── AGENT.md       ← Misyon, hedefler, KPI'lar
│       ├── HEARTBEAT.md   ← Dongu zamanlama ve adimlar
│       ├── MEMORY.md      ← Agent'in kendi ogrenimleri
│       ├── RULES.md       ← Sinirlar ve devir kurallari
│       ├── skills/        ← Her skill ayri dosya
│       ├── data/imports/  ← Insan'in biraktigi veri
│       ├── outputs/       ← Agent ciktilari
│       └── scripts/       ← Otomasyon script'leri
│
├── knowledge/             ← Statik referans (marka, strateji, hedef kitle)
├── journal/               ← Yasayan hafiza (olaylar, kararlar)
├── templates/             ← Yeniden kullanilabilir formatlar
├── orchestrator/          ← Koordinasyon katmani
├── outputs/               ← Tarihli ciktilar
│
└── examples/              ← Ornek agent (podcast-agent)
```

---

## Agent Nasil Calisir?

```
Her Dongu (gunluk/haftalik):
┌──────────────────────────┐
│  1. CONTEXT OKU           │
│     - journal/ kontrol et │
│     - knowledge/ oku      │
│     - MEMORY.md oku       │
├──────────────────────────┤
│  2. DURUM DEGERLENDIR     │
│     - En degerli aksiyon? │
│     - Hangi skill calissin│
├──────────────────────────┤
│  3. SKILL CALISTIR        │
│     - Girdi → Islem → Cikti│
├──────────────────────────┤
│  4. LOGLA                 │
│     - journal/ yaz        │
│     - MEMORY.md guncelle  │
│     - outputs/ kaydet     │
└──────────────────────────┘
```

---

## Ornek Agent: Podcast Agent

`examples/podcast-agent/` klasorunde tamamlanmis bir ornek var.
Inceleyerek kendi agentini nasil olusturacagini gorebilirsin.

---

## Neden Bu Yapi?

| Avantaj | Aciklama |
|---------|----------|
| Kopyalanabilir | YouTube agenti → TikTok agentine kucuk degisikliklerle |
| Anlasilabilir | Az dosya, net amac |
| Olculebilir | KPI'lara karsi pass/fail |
| Otonom | Heartbeat ile zamanlanmis donguler |
| Paylasimli hafiza | Journal uzerinden agentlar arasi bilgi akisi |
| Sifir bagimlillik | Markdown + Claude Code, baska bir sey yok |

---

## Ipuclari

- **Basit basla.** Tek hedef, tek skill, haftalik dongu. Sonra buyut.
- **KPI koymazsan olcemezsin.** Her agentin en az 2 olculebilir hedefi olmali.
- **Memory bos baslar.** Ogrenmeler gercek veriden gelir, varsayimdan degil.
- **Hedefe hizmet etmeyen skill'i sil.** Gereksiz karmasiklik dusman.
- **Haftalik review yapmazsan agent ogrenemez.** En onemli adim bu.

---

## Sorular?

Claude Code'a sor:
```
"Bu projenin yapisini anlat ve benim icin bir [X] agenti olustur."
```

Claude Code CLAUDE.md dosyasini okuyacak ve tum yapiya hakim olacak.
