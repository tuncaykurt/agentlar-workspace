# Aesthetic Presets

Each preset defines a complete design system: palette, typography, identity, image mood, and hero line pattern. Present these to the user as options — they pick one, and you apply the full token set.

---

## Preset A — "Organic Tech" (Clinical Boutique)

**Identity:** A bridge between a biological research lab and an avant-garde luxury magazine. Clean, precise, but alive.

**Palette:**
- Primary: Moss `#2E4036`
- Accent: Clay `#CC5833`
- Background: Cream `#F2F0E9`
- Text/Dark: Charcoal `#1A1A1A`
- Surface: `#FFFFFF` (cards/overlays)
- Border: `rgba(46, 64, 54, 0.12)`

**Typography:**
- Headings: `Plus Jakarta Sans` (weight 700, tracking -0.02em)
- Drama: `Cormorant Garamond` Italic (weight 500)
- Mono/Data: `IBM Plex Mono` (weight 400)
- Body: `Outfit` (weight 400, line-height 1.6)

**Google Fonts URL:**
```
https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Cormorant+Garamond:ital,wght@0,400;1,500;1,600&family=IBM+Plex+Mono:wght@400;500&family=Outfit:wght@300;400;500&display=swap
```

**Image Mood:** dark forest, organic textures, moss, ferns, laboratory glassware, botanical close-ups

**Hero Line Pattern:**
- Line 1: "[Concept noun] is the" → Bold sans heading font
- Line 2: "[Power word]." → Massive serif italic drama font (4x-5x size of line 1)

**Example Hero:**
- "Precision is the"
- "*Foundation.*"

**Best For:** Health, wellness, biotech, premium consulting, coaching businesses, organic products

---

## Preset B — "Midnight Luxe" (Dark Editorial)

**Identity:** A private members' club meets a high-end watchmaker's atelier. Exclusive, aspirational, confident.

**Palette:**
- Primary: Obsidian `#0D0D12`
- Accent: Champagne `#C9A84C`
- Background: Ivory `#FAF8F5`
- Text/Dark: Slate `#2A2A35`
- Surface: `#FFFFFF`
- Border: `rgba(13, 13, 18, 0.10)`

**Typography:**
- Headings: `Inter` (weight 700, tracking -0.03em)
- Drama: `Playfair Display` Italic (weight 700)
- Mono/Data: `JetBrains Mono` (weight 400)
- Body: `Inter` (weight 400, line-height 1.6)

**Google Fonts URL:**
```
https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Playfair+Display:ital,wght@0,700;1,700&family=JetBrains+Mono:wght@400;500&display=swap
```

**Image Mood:** dark marble, gold accents, architectural shadows, luxury interiors, watch details, leather textures

**Hero Line Pattern:**
- Line 1: "[Aspirational noun] meets" → Bold sans heading font
- Line 2: "[Precision word]." → Massive serif italic drama font

**Example Hero:**
- "Excellence meets"
- "*Precision.*"

**Best For:** Finance, law, luxury retail, premium B2B services, real estate, high-end education

---

## Preset C — "Brutalist Signal" (Raw Precision)

**Identity:** A control room for the future — no decoration, pure information density. Honest, direct, powerful.

**Palette:**
- Primary: Paper `#E8E4DD`
- Accent: Signal Red `#E63B2E`
- Background: Off-white `#F5F3EE`
- Text/Dark: Black `#111111`
- Surface: `#FFFFFF`
- Border: `rgba(17, 17, 17, 0.15)`

**Typography:**
- Headings: `Space Grotesk` (weight 700, tracking -0.02em)
- Drama: `DM Serif Display` Italic (weight 400)
- Mono/Data: `Space Mono` (weight 400)
- Body: `Space Grotesk` (weight 400, line-height 1.6)

**Google Fonts URL:**
```
https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=DM+Serif+Display:ital@0;1&family=Space+Mono:wght@400;700&display=swap
```

**Image Mood:** concrete, brutalist architecture, raw materials, industrial machinery, steel beams, construction

**Hero Line Pattern:**
- Line 1: "[Direct verb] the" → Bold sans heading font
- Line 2: "[System noun]." → Massive serif italic drama font

**Example Hero:**
- "Deploy the"
- "*System.*"

**Best For:** Tech startups, SaaS, automation services, agencies, developer tools, AI products

---

## Preset D — "Vapor Clinic" (Neon Biotech)

**Identity:** A genome sequencing lab inside a Tokyo nightclub. Futuristic, electric, immersive.

**Palette:**
- Primary: Deep Void `#0A0A14`
- Accent: Plasma `#7B61FF`
- Background: Ghost `#F0EFF4`
- Text/Dark: Graphite `#18181B`
- Surface: `rgba(255, 255, 255, 0.06)` (for dark bg) / `#FFFFFF` (for light bg)
- Border: `rgba(123, 97, 255, 0.15)`

**Typography:**
- Headings: `Sora` (weight 700, tracking -0.02em)
- Drama: `Instrument Serif` Italic (weight 400)
- Mono/Data: `Fira Code` (weight 400)
- Body: `Sora` (weight 400, line-height 1.6)

**Google Fonts URL:**
```
https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&family=Fira+Code:wght@400;500&display=swap
```

**Image Mood:** bioluminescence, dark water, neon reflections, microscopy, abstract data visualization, neural networks

**Hero Line Pattern:**
- Line 1: "[Tech noun] beyond" → Bold sans heading font
- Line 2: "[Boundary word]." → Massive serif italic drama font

**Example Hero:**
- "Intelligence beyond"
- "*Limits.*"

**Best For:** AI companies, data analytics, futuristic brands, gaming, creative tech agencies, innovation labs

---

## How to Present to the User

Show the presets like this:

> **A) Organic Tech** — Warm, clinical, botanical. Think research lab meets luxury magazine.
> **B) Midnight Luxe** — Dark, gold, exclusive. Think members' club meets watchmaker.
> **C) Brutalist Signal** — Raw, red, information-dense. Think control room for the future.
> **D) Vapor Clinic** — Neon, futuristic, electric. Think biotech lab meets Tokyo nightclub.

Let the user pick, then apply ALL tokens from their chosen preset without modification.

---

## Tailwind Config Override

For each preset, include this in the HTML file's script block:

```html
<script>
  tailwind.config = {
    theme: {
      extend: {
        colors: {
          'brand-primary': '[PRIMARY_HEX]',
          'brand-accent': '[ACCENT_HEX]',
          'brand-bg': '[BACKGROUND_HEX]',
          'brand-text': '[TEXT_HEX]',
          'brand-surface': '[SURFACE_HEX]',
        },
        fontFamily: {
          'heading': ['[HEADING_FONT]', 'sans-serif'],
          'drama': ['[DRAMA_FONT]', 'serif'],
          'mono': ['[MONO_FONT]', 'monospace'],
          'body': ['[BODY_FONT]', 'sans-serif'],
        },
        borderRadius: {
          'card': '2rem',
          'pill': '3rem',
        }
      }
    }
  }
</script>
```
