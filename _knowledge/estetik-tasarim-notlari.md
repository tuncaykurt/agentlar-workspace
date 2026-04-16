# 🎨 Estetik Tasarım Notları

> Bu dosya, beğenilen web visual tasarımlarını ilerisi için referans olarak saklar.

---

## 1. n8n Tarzı Flow/Hiyerarşi Tasarımı

**Kaynak:** `AntigravityHierarchy.html` (silindi, estetik burada korunuyor)  
**Tarih:** 2026-03-14

### Neden Beğenildi?
- n8n benzeri akış diyagramı görünümü
- Kartlar arası animasyonlu bağlantı çizgileri (SVG Bezier curves)
- Kareli/noktalı grid arka plan (40x40px)
- Canlı renkli "port" noktaları ve marching-ants animasyonlu çizgiler
- Sol altta sabit "legend" kutusu ile açıklama paneli

### Renk Paleti
```css
--bg-color: #0b0e14;        /* Koyu mavi-siyah zemin */
--grid-color: rgba(255, 255, 255, 0.05);  /* Grid çizgileri */
--card-bg: #151922;          /* Kart arkaplanı */
--card-border: #222733;      /* Kart border */
--text-main: #FFFFFF;
--text-muted: #94A3B8;

/* Kategori renkleri */
--c-agent: #3b82f6;          /* Blue */
--c-knowledge: #a855f7;      /* Purple */
--c-skills: #f97316;         /* Orange */
--c-projects: #10b981;       /* Emerald */
```

### Temel CSS Teknikleri
```css
/* n8n tarzı kareli grid arka plan */
background-image:
    linear-gradient(var(--grid-color) 1px, transparent 1px),
    linear-gradient(90deg, var(--grid-color) 1px, transparent 1px);
background-size: 40px 40px;

/* Kart üst çizgisi (accent rengi) */
.node::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 4px;
    background: var(--theme);
    border-top-left-radius: 12px;
    border-top-right-radius: 12px;
}

/* Bağlantı noktaları ("port"lar) */
.port {
    position: absolute;
    width: 14px; height: 14px;
    background: var(--bg-color);
    border: 2px solid var(--theme);
    border-radius: 50%;
    z-index: 10;
}

/* Animasyonlu kesikli çizgiler (marching ants) */
.svg-path-fg {
    stroke-dasharray: 6 6;
    animation: march 1s linear infinite;
}

@keyframes march {
    from { stroke-dashoffset: 24; }
    to { stroke-dashoffset: 0; }
}

/* Canlı durum noktası (nabız efekti) */
.status-dot {
    width: 6px; height: 6px;
    background: var(--theme);
    border-radius: 50%;
    box-shadow: 0 0 8px var(--theme);
    animation: pulse-dot 1.5s infinite;
}
```

### Kart Tasarım Özellikleri
- **Border-radius:** 12px
- **Genişlik:** 320px
- **Gölge:** `0 10px 30px rgba(0, 0, 0, 0.5)`
- **Hover efekti:** `translateY(-5px)` + border renk değişimi
- **Font:** Inter (400, 500, 600, 700)

### SVG Bağlantı Çizgileri (JavaScript)
- Kartlar arasında dinamik Bezier eğrileri çiziliyor
- Port noktalarından çıkıp diğer port noktalarına gidiyor
- Responsive: Mobilde dikey akış, masaüstünde yatay

### Kullanım Alanları
- Sistem mimarisi görselleri
- Veri akış diyagramları
- Proje hiyerarşi anlatımları
- n8n/otomasyon akış şemaları
- Herhangi bir "X → Y → Z" ilişkisi gösteren sayfa

---

*Bu dosya yeni beğenilen tasarımlar buldukça güncellenecektir.*
