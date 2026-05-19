---
name: website-builder
description: >
  Cinematic, conversion-optimized landing page builder for SMEs.
  Use this skill whenever the user wants to build a website, landing page, hero section,
  or any web page — especially for businesses, brands, courses, or services.
  Also trigger when the user mentions "site yap", "landing page", "web sitesi",
  "hero section", "sayfa tasarla", or any website/landing page related request.
  Builds modular, section-by-section pages with premium design systems,
  GSAP animations, and built-in conversion elements (lead forms, WhatsApp CTA, social proof).
  Outputs a single self-contained HTML file ready for deployment.
---

# Website Builder — Cinematic Landing Pages for SMEs

Build high-fidelity, cinematic landing pages that convert. Every page should feel like a
digital instrument — intentional scrolling, weighted animations, zero generic AI patterns.

This skill produces **single self-contained HTML files** using Tailwind CSS (CDN),
GSAP + ScrollTrigger (CDN), and Google Fonts. No build step required — the output
works directly in a browser or any hosting platform.

---

## Step 1: Gather Requirements

Ask the user these questions in a single turn. Do not over-discuss — gather answers, then build.

1. **Brand name and one-line purpose** — e.g. "Nura Health — precision longevity medicine powered by biological data."
2. **Aesthetic preset** — Pick one from the presets in `references/presets.md`. Show the user the 4 options with a brief description of each.
3. **3 key value propositions** — Brief phrases that become the Features section.
4. **Primary CTA** — What should visitors do? e.g. "Join the waitlist", "WhatsApp'tan yaz", "Ücretsiz dene"
5. **Conversion channel** — WhatsApp number, form endpoint, Calendly link, or email. This determines which conversion elements to include.

If the user has already provided some of these in the conversation, extract them — don't re-ask.

---

## Step 2: Load Design Tokens

Read `references/presets.md` and map the selected preset to its full design system:
- Color palette (primary, accent, background, text, dark)
- Typography (heading font, drama font, mono font)
- Image mood keywords for Unsplash
- Hero line pattern

---

## Step 3: Build Section by Section

Read `references/sections.md` for the full component architecture and `references/interactions.md` for the dynamic code examples of specific functional cards. Build the page in this order:

### Build Order

1. **HTML scaffold** — DOCTYPE, head with fonts + CDN links, noise overlay CSS, Tailwind config
2. **Navbar** — Floating pill, morphs on scroll via IntersectionObserver
3. **Hero** — Full-viewport, gradient overlay on Unsplash image, staggered GSAP entrance
4. **Social Proof Bar** — Logos, stats, or trust badges (CRITICAL for conversion — do not skip)
5. **Features** — 3 interactive cards from value propositions (USE the exact code from `references/interactions.md`)
6. **Philosophy / Manifesto** — Contrasting statements with scroll-triggered text reveal
7. **Process / How It Works** — Sticky stacking cards or step-by-step
8. **Pricing or CTA Section** — Depends on user's business model
9. **Conversion Section** — Lead form, WhatsApp floating button, or booking widget
10. **Footer** — Dark background, brand info, navigation, status indicator

### Per-Section Checklist

For EACH section, verify:
- [ ] Colors match the selected preset exactly
- [ ] Fonts load and render correctly
- [ ] GSAP animations use `gsap.context()` with proper cleanup
- [ ] Section is responsive (stacks on mobile, reduced font sizes)
- [ ] Conversion elements are wired (WhatsApp links use `https://wa.me/PHONE`)
- [ ] No placeholder text — all content is derived from user's brand info
- [ ] Images use real Unsplash URLs matching the preset's image mood

---

## Step 4: Conversion Elements (CRITICAL)

Read `references/conversion.md` for implementation details. Every page MUST include:

1. **Floating WhatsApp Button** (if WhatsApp is the channel) — Fixed bottom-right, pulsing accent glow, opens wa.me link with pre-filled message
2. **Lead Capture Form** (if form-based) — Inline in the CTA section, minimal fields (name + phone or email), styled to match the preset
3. **Social Proof** — At minimum: client count, result metric, or trust logos. Use animated counter if possible.
4. **Urgency/Scarcity Element** — Optional but recommended: limited spots, countdown, or "X people viewing" indicator

---

## Step 5: Deployment

Read `references/deployment.md` for instructions on how to publish the site to GitHub and deploy via Netlify MCP. Execute the deployment steps automatically if the user explicitly requests to publish or deploy the website.

---

## Fixed Design Rules (Apply to ALL presets)

These rules are what make the output premium. Never override them.

### Visual Texture
- Global CSS noise overlay using inline SVG `<feTurbulence>` filter at 0.05 opacity
- `border-radius: 2rem` to `3rem` for all containers — no sharp corners
- Subtle borders using `rgba()` with low opacity

### Micro-Interactions
- Buttons: `scale(1.03)` on hover with `cubic-bezier(0.25, 0.46, 0.45, 0.94)`
- Buttons: `overflow-hidden` with sliding background `<span>` for color transitions
- Links: `translateY(-1px)` lift on hover
- All transitions: minimum 300ms duration

### Animation Standards
- Use `gsap.context()` in script initialization
- Default easing: `power3.out` for entrances, `power2.inOut` for morphs
- Stagger: `0.08` for text elements, `0.15` for cards/containers
- ScrollTrigger: `start: "top 80%"` for most reveals

### Typography Scale
- Hero headline: `clamp(3rem, 8vw, 7rem)` for main line
- Drama font: 3-5x larger than body for emphasis
- Body: `1rem` / `1.125rem` with `1.6` line-height
- Monospace labels: `0.75rem` uppercase with wide letter-spacing

### Responsive Strategy
- Mobile-first: stack all grids to single column below 768px
- Reduce hero font sizes by ~40% on mobile
- Collapse navbar to minimal version (brand + CTA only)
- Disable complex hover animations on touch devices via `@media (hover: hover)`
- Floating WhatsApp button stays visible on all breakpoints

---

## Technical Stack

All loaded via CDN — no npm, no build step:

```html
<!-- Tailwind CSS -->
<script src="https://cdn.tailwindcss.com"></script>

<!-- GSAP + ScrollTrigger -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js"></script>

<!-- Lucide Icons -->
<script src="https://unpkg.com/lucide@latest"></script>

<!-- Google Fonts (varies by preset — see presets.md) -->
<link href="https://fonts.googleapis.com/css2?family=..." rel="stylesheet">
```

### Image Sources
Use real Unsplash URLs matching the preset's `imageMood`. Format:
```
https://images.unsplash.com/photo-XXXXXXXXX?w=1200&q=80
```
Search Unsplash for keywords from the preset, pick high-quality landscape/wide images for hero, and square/portrait for cards.

---

## Output Format

Deliver a single `.html` file containing:
- All HTML structure
- `<style>` block with custom CSS, noise overlay, and Tailwind config overrides
- `<script>` block with all GSAP animations, ScrollTrigger setup, and interaction logic
- Inline Tailwind config via `tailwind.config` script block

The file must be fully functional when opened in a browser with no dependencies other than the CDN links.

---

## Quality Checklist (Before Delivering)

- [ ] Page loads without console errors
- [ ] `lucide.createIcons()` is called in the main script block
- [ ] All animations fire correctly on scroll
- [ ] Navbar morphs when scrolling past hero
- [ ] WhatsApp/CTA link works with correct phone number or URL
- [ ] Social proof section is populated with realistic (but clearly placeholder) numbers
- [ ] Mobile layout doesn't break — test at 375px width mentally
- [ ] No raw template variables or placeholder text visible
- [ ] Every image URL points to a real Unsplash photo
- [ ] Noise overlay is visible but subtle
- [ ] Hero gradient doesn't fully obscure the background image
