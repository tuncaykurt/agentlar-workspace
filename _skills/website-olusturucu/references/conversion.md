# Conversion Elements

These elements are CRITICAL for SME landing pages. A beautiful page that doesn't convert
is worthless. Every page built with this skill must include at least one primary conversion
mechanism and one social proof element.

---

## 1. Floating WhatsApp Button

The #1 conversion channel for Turkish SMEs. Always include unless the user explicitly
says they don't use WhatsApp.

### Implementation

```html
<!-- Floating WhatsApp Button -->
<a href="https://wa.me/[PHONE_NUMBER]?text=[ENCODED_MESSAGE]"
   target="_blank"
   rel="noopener noreferrer"
   id="whatsapp-float"
   class="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-[#25D366] text-white pl-4 pr-5 py-3 rounded-pill shadow-lg shadow-[#25D366]/30 font-heading font-semibold text-sm hover:scale-105 transition-transform duration-300">
  <!-- WhatsApp Icon -->
  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
    <path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492a.5.5 0 00.611.611l4.458-1.495A11.94 11.94 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-2.317 0-4.46-.758-6.194-2.04l-.432-.328-2.637.884.884-2.637-.328-.432A9.96 9.96 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
  </svg>
  <span class="hidden sm:inline">Bize Yazın</span>
</a>
```

### Phone Number Format
- Turkish numbers: `90` + 10-digit number (no spaces, no dashes, no plus sign)
- Example: `905551234567`
- Pre-filled message: URL-encode the Turkish text
  - Example: `Merhaba%2C%20web%20sitenizden%20yazıyorum.%20Bilgi%20almak%20istiyorum.`

### Entrance Animation
```javascript
// WhatsApp button entrance — delayed for better UX
gsap.from('#whatsapp-float', {
  y: 100,
  opacity: 0,
  duration: 0.6,
  ease: 'back.out(1.7)',
  delay: 2, // Appears after 2 seconds
});
```

### Pulse Effect (CSS)
```css
#whatsapp-float {
  animation: wp-pulse 2s infinite;
}
@keyframes wp-pulse {
  0%, 100% { box-shadow: 0 4px 15px rgba(37, 211, 102, 0.3); }
  50% { box-shadow: 0 4px 30px rgba(37, 211, 102, 0.6); }
}
```

---

## 2. Inline Lead Capture Form

For businesses that collect leads via form (phone sales, consultation booking, etc.).

### Minimal Form (Name + Phone — best for Turkish market)

```html
<div class="max-w-md mx-auto bg-brand-surface border border-brand-text/10 rounded-card p-8">
  <h3 class="font-heading font-bold text-xl mb-2">Ücretsiz Danışmanlık</h3>
  <p class="font-body text-sm text-brand-text/60 mb-6">Bilgilerinizi bırakın, sizi arayalım.</p>

  <div class="space-y-4">
    <input
      type="text"
      placeholder="Adınız Soyadınız"
      class="w-full px-4 py-3 rounded-xl bg-brand-bg border border-brand-text/10 font-body text-sm focus:outline-none focus:border-brand-accent transition-colors"
    />
    <input
      type="tel"
      placeholder="Telefon Numaranız"
      class="w-full px-4 py-3 rounded-xl bg-brand-bg border border-brand-text/10 font-body text-sm focus:outline-none focus:border-brand-accent transition-colors"
    />
    <button
      class="w-full bg-brand-accent text-white py-3.5 rounded-xl font-heading font-semibold text-sm magnetic-btn hover:scale-[1.02] transition-transform duration-300">
      Hemen Başla →
    </button>
  </div>

  <p class="text-xs font-mono text-brand-text/30 mt-4 text-center">Bilgileriniz güvende. Spam yapmıyoruz.</p>
</div>
```

### Form Submission Options
Since this is a static HTML file, provide these options:

**Option A — Formspree (no backend needed):**
```html
<form action="https://formspree.io/f/[FORM_ID]" method="POST">
```

**Option B — Google Forms redirect:**
Provide the user with instructions to connect to Google Forms via a hidden iframe or redirect.

**Option C — WhatsApp as form action:**
Instead of submitting to a backend, construct a WhatsApp message from the form fields:
```javascript
function submitToWhatsApp() {
  const name = document.getElementById('name').value;
  const phone = document.getElementById('phone').value;
  const message = encodeURIComponent(
    `Yeni Form Başvurusu\nAd: ${name}\nTelefon: ${phone}`
  );
  window.open(`https://wa.me/[PHONE]?text=${message}`, '_blank');
}
```

---

## 3. Social Proof Elements

### A) Testimonial Cards
```html
<div class="grid md:grid-cols-3 gap-6">
  <div class="bg-brand-surface border border-brand-text/10 rounded-card p-6">
    <div class="flex items-center gap-1 mb-4">
      <!-- 5 stars in accent color -->
      <span class="text-brand-accent">★★★★★</span>
    </div>
    <p class="font-body text-sm text-brand-text/70 mb-4 italic">"[Testimonial text]"</p>
    <div class="flex items-center gap-3">
      <div class="w-10 h-10 rounded-full bg-brand-accent/20 flex items-center justify-center font-heading font-bold text-brand-accent text-sm">AÖ</div>
      <div>
        <p class="font-heading font-semibold text-sm">[Name]</p>
        <p class="font-mono text-xs text-brand-text/40">[Title / Company]</p>
      </div>
    </div>
  </div>
</div>
```

### B) Result Metrics
Big numbers with labels — most effective when placed right after the hero:
```html
<div class="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
  <div>
    <span class="block font-heading font-bold text-4xl text-brand-accent">%340</span>
    <span class="block font-mono text-xs uppercase tracking-widest text-brand-text/40 mt-1">Verimlilik Artışı</span>
  </div>
  <div>
    <span class="block font-heading font-bold text-4xl">500+</span>
    <span class="block font-mono text-xs uppercase tracking-widest text-brand-text/40 mt-1">Eğitim Alan KOBİ</span>
  </div>
  <div>
    <span class="block font-heading font-bold text-4xl">48</span>
    <span class="block font-mono text-xs uppercase tracking-widest text-brand-text/40 mt-1">Saat İçerik</span>
  </div>
  <div>
    <span class="block font-heading font-bold text-4xl text-brand-accent">4.9</span>
    <span class="block font-mono text-xs uppercase tracking-widest text-brand-text/40 mt-1">Ortalama Puan</span>
  </div>
</div>
```

### C) Trust Badges
For Turkish businesses, these work well:
- "SSL ile Korunan Ödeme"
- "7/24 WhatsApp Destek"
- "Para İade Garantisi"
- "[X] Gündür Aktif"

---

## 4. Urgency / Scarcity Elements

### A) Limited Spots Counter
```html
<div class="inline-flex items-center gap-2 bg-brand-accent/10 text-brand-accent px-4 py-2 rounded-pill text-sm font-mono">
  <span class="w-2 h-2 rounded-full bg-brand-accent animate-pulse"></span>
  Son <strong>7</strong> kontenjan kaldı
</div>
```

### B) Next Cohort Countdown
```html
<div class="text-center">
  <p class="font-mono text-xs uppercase tracking-widest text-brand-text/40 mb-3">Sonraki Dönem Başlangıcı</p>
  <div id="countdown" class="flex justify-center gap-4">
    <div class="bg-brand-surface border border-brand-text/10 rounded-xl px-4 py-3 min-w-[4rem]">
      <span class="block font-heading font-bold text-2xl countdown-days">00</span>
      <span class="block font-mono text-[0.65rem] uppercase tracking-widest text-brand-text/40">Gün</span>
    </div>
    <div class="bg-brand-surface border border-brand-text/10 rounded-xl px-4 py-3 min-w-[4rem]">
      <span class="block font-heading font-bold text-2xl countdown-hours">00</span>
      <span class="block font-mono text-[0.65rem] uppercase tracking-widest text-brand-text/40">Saat</span>
    </div>
    <div class="bg-brand-surface border border-brand-text/10 rounded-xl px-4 py-3 min-w-[4rem]">
      <span class="block font-heading font-bold text-2xl countdown-mins">00</span>
      <span class="block font-mono text-[0.65rem] uppercase tracking-widest text-brand-text/40">Dakika</span>
    </div>
  </div>
</div>
```

### Countdown JavaScript
```javascript
function startCountdown(targetDate) {
  function update() {
    const now = new Date().getTime();
    const distance = targetDate - now;

    if (distance < 0) return;

    const days = Math.floor(distance / (1000 * 60 * 60 * 24));
    const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const mins = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));

    document.querySelector('.countdown-days').textContent = String(days).padStart(2, '0');
    document.querySelector('.countdown-hours').textContent = String(hours).padStart(2, '0');
    document.querySelector('.countdown-mins').textContent = String(mins).padStart(2, '0');
  }

  update();
  setInterval(update, 60000); // Update every minute
}

// Set target date
startCountdown(new Date('2025-08-01T00:00:00').getTime());
```

---

## 5. Calendly / Booking Widget

For consultation-based businesses:

```html
<!-- Calendly Inline Widget -->
<div class="calendly-inline-widget"
     data-url="https://calendly.com/[USERNAME]"
     style="min-width:320px;height:630px;">
</div>
<script src="https://assets.calendly.com/assets/external/widget.js" async></script>
```

Or as a popup trigger on the CTA button:
```html
<a href="#"
   onclick="Calendly.initPopupWidget({url: 'https://calendly.com/[USERNAME]'});return false;"
   class="bg-brand-accent text-white px-8 py-4 rounded-pill font-heading font-semibold">
  Randevu Al →
</a>
<link href="https://assets.calendly.com/assets/external/widget.css" rel="stylesheet">
<script src="https://assets.calendly.com/assets/external/widget.js" async></script>
```

---

## Integration Notes for Artifex Campus Members

When distributing these pages to SME clients:

1. **WhatsApp number** — Always ask for the business WhatsApp number, not personal
2. **Form backend** — Recommend Formspree (free tier: 50 submissions/month) or direct WhatsApp form submission for zero-cost setup
3. **Hosting** — The output HTML file can be hosted on:
   - **Netlify (ÖNERİLEN — Antigravity MCP entegrasyonu ile tam otomatik deploy)**
   - Vercel (free, alternatif)
   - Tiiny.host (simplest for non-technical users)
   - Any shared hosting via FTP
4. **Domain** — The client should already have their domain; just point the DNS
5. **Analytics** — Add Google Analytics or Meta Pixel by inserting the script tag in the `<head>`
6. **Custom domain email** — Remind clients that `info@theirbrand.com` looks more professional

### Meta Pixel Integration (Common Request)
```html
<!-- Meta Pixel Code -->
<script>
!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '[PIXEL_ID]');
fbq('track', 'PageView');
</script>
```

### Form Submission Event Tracking
```javascript
// Fire conversion event on form submit
function trackFormSubmit() {
  if (typeof fbq !== 'undefined') {
    fbq('track', 'Lead');
  }
  if (typeof gtag !== 'undefined') {
    gtag('event', 'generate_lead');
  }
}
```
