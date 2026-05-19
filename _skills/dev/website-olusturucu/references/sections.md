# Section Architecture

Build each section independently, then assemble. Every section must work on its own
and contribute to the conversion funnel.

---

## 1. HTML Scaffold

Start every page with this structure:

```html
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>[Brand Name]</title>

  <!-- Google Fonts (from selected preset) -->
  <link href="[PRESET_FONT_URL]" rel="stylesheet">

  <!-- Tailwind CSS -->
  <script src="https://cdn.tailwindcss.com"></script>

  <!-- GSAP + ScrollTrigger -->
  <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js"></script>

  <!-- Lucide Icons -->
  <script src="https://unpkg.com/lucide@latest"></script>
</head>
```

### Noise Overlay CSS (include in `<style>` block)

```css
.noise-overlay {
  position: fixed;
  top: 0; left: 0;
  width: 100%; height: 100%;
  pointer-events: none;
  z-index: 9999;
  opacity: 0.05;
}
.noise-overlay svg {
  width: 100%;
  height: 100%;
}
```

### Noise Overlay HTML (first child of `<body>`)

```html
<div class="noise-overlay">
  <svg width="100%" height="100%">
    <filter id="noise">
      <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch"/>
    </filter>
    <rect width="100%" height="100%" filter="url(#noise)" opacity="0.5"/>
  </svg>
</div>
```

---

## 2. Navbar — "The Floating Island"

A `fixed` pill-shaped container, horizontally centered at the top.

### Structure
```html
<nav id="navbar" class="fixed top-4 left-1/2 -translate-x-1/2 z-50 ...">
  <div class="flex items-center justify-between px-6 py-3 rounded-pill ...">
    <!-- Logo: brand name as styled text -->
    <a href="#" class="font-heading font-bold text-lg">[BRAND]</a>

    <!-- Nav links (3-4 max, hidden on mobile) -->
    <div class="hidden md:flex items-center gap-8">
      <a href="#features">Özellikler</a>
      <a href="#process">Nasıl Çalışır</a>
      <a href="#pricing">Fiyatlar</a>
    </div>

    <!-- CTA button -->
    <a href="#cta" class="relative overflow-hidden bg-brand-accent text-white px-5 py-2.5 rounded-pill font-heading font-semibold text-sm">
      <span class="relative z-10">[CTA_TEXT]</span>
      <!-- Sliding hover layer -->
      <span class="absolute inset-0 bg-white/20 -translate-x-full hover-slide transition-transform duration-500"></span>
    </a>
  </div>
</nav>
```

### Morphing Behavior (JavaScript)
```javascript
// Navbar morph on scroll
const navbar = document.getElementById('navbar');
const heroSection = document.getElementById('hero');

const observer = new IntersectionObserver(
  ([entry]) => {
    if (entry.isIntersecting) {
      navbar.classList.remove('navbar-scrolled');
      navbar.classList.add('navbar-transparent');
    } else {
      navbar.classList.remove('navbar-transparent');
      navbar.classList.add('navbar-scrolled');
    }
  },
  { threshold: 0.1 }
);
observer.observe(heroSection);
```

### CSS States
```css
.navbar-transparent {
  background: transparent;
  border: 1px solid transparent;
}
.navbar-scrolled {
  background: rgba(var(--bg-rgb), 0.6);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(var(--border-rgb), 0.15);
  box-shadow: 0 4px 30px rgba(0, 0, 0, 0.05);
}
```

---

## 3. Hero Section — "The Opening Shot"

Full viewport height, dramatic typography, strong CTA.

### Layout Rules
- Height: `100dvh` (use `min-h-screen` as fallback)
- Background: Unsplash image matching preset's `imageMood`
- Gradient overlay: `bg-gradient-to-t from-[primary] via-[primary]/70 to-transparent`
- Content: pushed to bottom-left using `flex items-end pb-20 pl-8 md:pl-16`

### Typography Pattern
Follow the preset's hero line pattern:
- **Line 1** (sans heading): Regular weight, medium size ~`text-2xl md:text-4xl`
- **Line 2** (drama serif italic): Massive size `text-5xl md:text-7xl lg:text-8xl`
- **Subtext**: 1-2 lines in mono font, muted color, max 60 characters
- **CTA button**: Below the text, accent-colored, with magnetic hover

### GSAP Animation
```javascript
gsap.registerPlugin(ScrollTrigger);

const ctx = gsap.context(() => {
  // Hero entrance
  const heroTl = gsap.timeline({ defaults: { ease: 'power3.out' } });

  heroTl
    .from('.hero-line-1', { y: 40, opacity: 0, duration: 0.8 })
    .from('.hero-line-2', { y: 60, opacity: 0, duration: 1 }, '-=0.4')
    .from('.hero-subtitle', { y: 30, opacity: 0, duration: 0.6 }, '-=0.5')
    .from('.hero-cta', { y: 20, opacity: 0, duration: 0.5 }, '-=0.3')
    .from('.hero-stats > *', { y: 20, opacity: 0, stagger: 0.1, duration: 0.4 }, '-=0.2');
});
```

### Stats Row (Optional — recommended for social proof)
Place at the bottom of the hero section:
```html
<div class="hero-stats flex gap-8 mt-12">
  <div>
    <span class="font-mono text-2xl font-bold text-brand-accent">500+</span>
    <span class="block text-xs font-mono uppercase tracking-widest opacity-60">Aktif Kullanıcı</span>
  </div>
  <!-- More stats... -->
</div>
```

---

## 4. Social Proof Bar

Immediately after the hero. Builds trust before the user scrolls further.

### Variants

**A) Logo Strip** — For B2B or agency sites:
```html
<section class="py-8 border-y border-brand-text/10">
  <div class="max-w-6xl mx-auto px-6">
    <p class="text-center text-xs font-mono uppercase tracking-widest opacity-40 mb-6">Bize Güvenenler</p>
    <div class="flex items-center justify-center gap-12 opacity-30">
      <!-- Logo images or text logos -->
    </div>
  </div>
</section>
```

**B) Metrics Strip** — For course/community sites:
```html
<section class="py-8 border-y border-brand-text/10">
  <div class="max-w-6xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
    <div>
      <span class="text-3xl font-heading font-bold" data-count="500">0</span><span class="text-brand-accent">+</span>
      <p class="text-xs font-mono uppercase tracking-widest opacity-50 mt-1">Topluluk Üyesi</p>
    </div>
    <!-- More metrics... -->
  </div>
</section>
```

### Animated Counter (for Metrics Strip)
```javascript
// Animate numbers on scroll
document.querySelectorAll('[data-count]').forEach(el => {
  const target = parseInt(el.dataset.count);
  ScrollTrigger.create({
    trigger: el,
    start: 'top 90%',
    onEnter: () => {
      gsap.to(el, {
        textContent: target,
        duration: 1.5,
        ease: 'power2.out',
        snap: { textContent: 1 },
        onUpdate: function() {
          el.textContent = Math.round(parseFloat(el.textContent));
        }
      });
    },
    once: true
  });
});
```

---

## 5. Features — "Interactive Functional Artifacts"

Three cards based on the user's value propositions. Each card should feel like a
functional micro-UI, not a static marketing block.

### Card Layout
```html
<section id="features" class="py-24 px-6">
  <div class="max-w-6xl mx-auto">
    <h2 class="font-heading font-bold text-3xl md:text-5xl mb-4">[Section Title]</h2>
    <p class="font-body text-brand-text/60 max-w-xl mb-16">[Section subtitle]</p>

    <div class="grid md:grid-cols-3 gap-6">
      <!-- Card 1: Diagnostic Shuffler -->
      <!-- Card 2: Telemetry Typewriter -->
      <!-- Card 3: Status Grid -->
    </div>
  </div>
</section>
```

### Card 1 — "Diagnostic Shuffler"
Three overlapping mini-cards that cycle vertically every 3 seconds with a spring-bounce
transition. Labels derived from the first value proposition — generate 3 sub-items.

### Card 2 — "Telemetry Typewriter"
Monospace live-text feed that types messages character-by-character related to the second
value proposition. Includes a blinking accent-colored cursor and a "Canlı" label with a pulsing dot.

### Card 3 — "Status Grid"
A weekly grid (Pzt Sal Çar Per Cum Cmt Paz) with animated highlights showing active days.
Labels from the third value proposition.

### Card Styling (all cards)
```css
.feature-card {
  background: var(--brand-surface);
  border: 1px solid rgba(var(--border-rgb), 0.1);
  border-radius: 2rem;
  padding: 2rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  overflow: hidden;
}
```

### GSAP Entrance
```javascript
gsap.from('.feature-card', {
  y: 60,
  opacity: 0,
  stagger: 0.15,
  duration: 0.8,
  ease: 'power3.out',
  scrollTrigger: {
    trigger: '#features',
    start: 'top 80%',
  }
});
```

---

## 6. Philosophy — "The Manifesto"

Full-width section with the dark color as background. Creates emotional contrast.

### Structure
- Dark background (`bg-brand-primary` or `bg-brand-text`)
- Parallax organic texture image at low opacity behind text
- Two contrasting statements:
  - "Most [industry] focuses on: [common approach]." — neutral, smaller text
  - "We focus on: [differentiated approach]." — massive, drama serif italic, accent keyword

### GSAP Text Reveal
```javascript
// Word-by-word fade-up reveal
const philosophyWords = document.querySelectorAll('.philosophy-word');
gsap.from(philosophyWords, {
  y: '100%',
  opacity: 0,
  stagger: 0.05,
  duration: 0.6,
  ease: 'power3.out',
  scrollTrigger: {
    trigger: '.philosophy-section',
    start: 'top 70%',
  }
});
```

---

## 7. Process — "Sticky Stacking Archive"

3 full-screen (or near full-screen) cards that stack on scroll.

### Stacking Interaction
As each new card scrolls into view, the card underneath:
- Scales to `0.92`
- Blurs to `10px`
- Fades to `0.4`

Use GSAP ScrollTrigger `pin: true` for each card.

### Card Content
Each card represents a step in the user's process:
- Step number in monospace (`01`, `02`, `03`)
- Title in heading font
- 2-line description
- A subtle decorative animation (rotating geometric shape, scanning line, or pulsing waveform)

### Simplified Alternative
If sticky stacking is too complex for the context, use a vertical timeline layout:
```html
<div class="relative border-l-2 border-brand-accent/20 ml-8 pl-8 space-y-16">
  <div class="relative">
    <div class="absolute -left-[2.65rem] w-5 h-5 rounded-full bg-brand-accent"></div>
    <span class="font-mono text-sm text-brand-accent">01</span>
    <h3 class="font-heading font-bold text-2xl mt-2">[Step Title]</h3>
    <p class="font-body text-brand-text/60 mt-2">[Step Description]</p>
  </div>
  <!-- More steps... -->
</div>
```

---

## 8. Pricing / CTA Section

### If the business has pricing tiers:
Three-tier grid. Middle card is highlighted (accent background, slightly larger).

### If pricing doesn't apply:
Convert into a single large CTA section:
```html
<section id="cta" class="py-32 px-6 text-center">
  <div class="max-w-3xl mx-auto">
    <h2 class="font-drama italic text-4xl md:text-6xl mb-6">[Compelling CTA headline]</h2>
    <p class="font-body text-brand-text/60 mb-10">[Supporting text]</p>

    <!-- Primary CTA -->
    <a href="[CTA_LINK]" class="inline-flex items-center gap-3 bg-brand-accent text-white px-8 py-4 rounded-pill font-heading font-semibold text-lg magnetic-btn">
      [CTA_TEXT]
      <svg><!-- Arrow icon --></svg>
    </a>
  </div>
</section>
```

---

## 9. Footer

Dark background, rounded top corners, clean grid layout.

```html
<footer class="bg-brand-text text-brand-bg/80 rounded-t-[4rem] mt-16 pt-16 pb-8 px-6">
  <div class="max-w-6xl mx-auto grid md:grid-cols-4 gap-12 mb-16">
    <!-- Col 1: Brand -->
    <div>
      <h3 class="font-heading font-bold text-xl text-white mb-4">[BRAND]</h3>
      <p class="font-body text-sm opacity-60">[Tagline]</p>
    </div>

    <!-- Col 2-3: Navigation -->
    <div>
      <h4 class="font-mono text-xs uppercase tracking-widest opacity-40 mb-4">Sayfalar</h4>
      <!-- Links -->
    </div>

    <!-- Col 4: Contact -->
    <div>
      <h4 class="font-mono text-xs uppercase tracking-widest opacity-40 mb-4">İletişim</h4>
      <!-- Contact info -->
    </div>
  </div>

  <!-- Bottom bar -->
  <div class="flex items-center justify-between border-t border-white/10 pt-6">
    <p class="text-xs font-mono opacity-40">© 2025 [BRAND]. Tüm hakları saklıdır.</p>

    <!-- System status indicator -->
    <div class="flex items-center gap-2">
      <span class="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
      <span class="text-xs font-mono opacity-40">Sistem Aktif</span>
    </div>
  </div>
</footer>
```
