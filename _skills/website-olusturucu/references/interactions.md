# Interactive Features Code

To build the interactive cards for the Features section, you MUST use the following code snippets. Do not hallucinate interactions; use these proven implementations.

---

## Card 1: Diagnostic Shuffler

Three overlapping mini-cards that cycle every 3 seconds.

**HTML:**
```html
<div class="feature-card relative min-h-[300px] flex flex-col justify-end">
  <div class="absolute inset-x-6 top-6 h-32 relative perspective-[1000px]">
    <!-- Cycle Items -->
    <div class="shuffler-item absolute inset-0 bg-brand-bg border border-brand-text/10 rounded-xl p-4 shadow-sm z-30 translate-y-0 scale-100 opacity-100 transition-all duration-500">
      <div class="flex items-center gap-2 mb-2">
        <div class="w-2 h-2 rounded-full bg-brand-accent"></div>
        <span class="font-mono text-xs uppercase tracking-widest text-brand-text/60">[Detail 1]</span>
      </div>
      <p class="font-heading font-medium text-sm">[Description 1]</p>
    </div>
    <div class="shuffler-item absolute inset-0 bg-brand-bg border border-brand-text/10 rounded-xl p-4 shadow-sm z-20 translate-y-3 scale-[0.95] opacity-60 transition-all duration-500">
      <div class="flex items-center gap-2 mb-2">
        <div class="w-2 h-2 rounded-full bg-brand-text/20"></div>
        <span class="font-mono text-xs uppercase tracking-widest text-brand-text/60">[Detail 2]</span>
      </div>
      <p class="font-heading font-medium text-sm">[Description 2]</p>
    </div>
    <div class="shuffler-item absolute inset-0 bg-brand-bg border border-brand-text/10 rounded-xl p-4 shadow-sm z-10 translate-y-6 scale-[0.9] opacity-30 transition-all duration-500">
      <div class="flex items-center gap-2 mb-2">
        <div class="w-2 h-2 rounded-full bg-brand-text/20"></div>
        <span class="font-mono text-xs uppercase tracking-widest text-brand-text/60">[Detail 3]</span>
      </div>
      <p class="font-heading font-medium text-sm">[Description 3]</p>
    </div>
  </div>
  
  <h3 class="font-heading font-bold text-xl mt-8 mb-2">[Benefit Title]</h3>
  <p class="font-body text-sm text-brand-text/70">[Benefit Subtitle]</p>
</div>
```

**JavaScript (Add to GSAP Context):**
```javascript
// Diagnostic Shuffler Logic
const items = gsap.utils.toArray('.shuffler-item');
if (items.length > 0) {
  let currentIndex = 0;
  setInterval(() => {
    // Rotate classes conceptually by moving DOM nodes or changing styles
    const first = items[0];
    const parent = first.parentNode;
    parent.appendChild(first); // Move first to end
    
    // Re-select conceptually updated order
    const newItems = Array.from(parent.querySelectorAll('.shuffler-item'));
    newItems.forEach((el, index) => {
      if (index === 0) {
        el.className = 'shuffler-item absolute inset-0 bg-brand-bg border border-brand-text/10 rounded-xl p-4 shadow-sm z-30 translate-y-0 scale-100 opacity-100 transition-all duration-500';
      } else if (index === 1) {
        el.className = 'shuffler-item absolute inset-0 bg-brand-bg border border-brand-text/10 rounded-xl p-4 shadow-sm z-20 translate-y-3 scale-[0.95] opacity-60 transition-all duration-500';
      } else {
        el.className = 'shuffler-item absolute inset-0 bg-brand-bg border border-brand-text/10 rounded-xl p-4 shadow-sm z-10 translate-y-6 scale-[0.9] opacity-30 transition-all duration-500';
      }
    });
  }, 3000);
}
```

---

## Card 2: Telemetry Typewriter

Monospace live-text feed that types messages.

**HTML:**
```html
<div class="feature-card min-h-[300px] flex flex-col">
  <div class="bg-brand-primary text-brand-surface rounded-xl p-4 mb-6 flex-1 border border-brand-primary/20 shadow-inner relative overflow-hidden">
    <!-- Live Badge -->
    <div class="absolute top-4 right-4 flex items-center gap-2">
      <span class="w-1.5 h-1.5 rounded-full bg-brand-accent animate-pulse"></span>
      <span class="font-mono text-[0.65rem] uppercase tracking-widest text-brand-surface/60">Live feed</span>
    </div>
    
    <div class="font-mono text-sm leading-relaxed mt-6">
      <span class="text-brand-accent">> </span>
      <span id="typewriter-text"></span><span class="animate-pulse bg-brand-accent w-1.5 h-4 inline-block align-middle ml-1"></span>
    </div>
  </div>
  
  <h3 class="font-heading font-bold text-xl mb-2">[Benefit Title]</h3>
  <p class="font-body text-sm text-brand-text/70">[Benefit Subtitle]</p>
</div>
```

**JavaScript:**
```javascript
// Telemetry Typewriter Logic
const phrases = [
  "[System action 1...]",
  "[System action 2...]",
  "[System action 3...]"
];
const twEl = document.getElementById('typewriter-text');
if (twEl) {
  let sleepTime = 100;
  let curPhraseIndex = 0;
  const writeLoop = async () => {
    while (true) {
      let curWord = phrases[curPhraseIndex];
      for (let i = 0; i < curWord.length; i++) {
        twEl.innerText = curWord.substring(0, i + 1);
        await new Promise((r) => setTimeout(r, sleepTime));
      }
      await new Promise((r) => setTimeout(r, 2000));
      for (let i = curWord.length; i > 0; i--) {
        twEl.innerText = curWord.substring(0, i - 1);
        await new Promise((r) => setTimeout(r, 50));
      }
      await new Promise((r) => setTimeout(r, 500));
      if (curPhraseIndex === phrases.length - 1) {
        curPhraseIndex = 0;
      } else {
        curPhraseIndex++;
      }
    }
  };
  writeLoop();
}
```

---

## Card 3: Status Grid

Weekly active highlight grid.

**HTML:**
```html
<div class="feature-card min-h-[300px] flex flex-col">
  <div class="grid grid-cols-7 gap-1 mb-auto pt-4">
    <div class="text-center font-mono text-[0.6rem] uppercase tracking-widest text-brand-text/40 mb-2">Pzt</div>
    <div class="text-center font-mono text-[0.6rem] uppercase tracking-widest text-brand-text/40 mb-2">Sal</div>
    <div class="text-center font-mono text-[0.6rem] uppercase tracking-widest text-brand-text/40 mb-2">Çar</div>
    <div class="text-center font-mono text-[0.6rem] uppercase tracking-widest text-brand-text/40 mb-2">Per</div>
    <div class="text-center font-mono text-[0.6rem] uppercase tracking-widest text-brand-text/40 mb-2">Cum</div>
    <div class="text-center font-mono text-[0.6rem] uppercase tracking-widest text-brand-text/40 mb-2">Cmt</div>
    <div class="text-center font-mono text-[0.6rem] uppercase tracking-widest text-brand-text/40 mb-2">Paz</div>
    
    <!-- Row 1 -->
    <div class="h-8 rounded-[4px] bg-brand-text/5 grid-cell"></div>
    <div class="h-8 rounded-[4px] bg-brand-text/5 grid-cell highlight"></div>
    <div class="h-8 rounded-[4px] bg-brand-text/5 grid-cell"></div>
    <div class="h-8 rounded-[4px] bg-brand-text/5 grid-cell highlight"></div>
    <div class="h-8 rounded-[4px] bg-brand-text/5 grid-cell"></div>
    <div class="h-8 rounded-[4px] bg-brand-text/5 grid-cell"></div>
    <div class="h-8 rounded-[4px] bg-brand-text/5 grid-cell highlight"></div>
  </div>
  
  <h3 class="font-heading font-bold text-xl mt-8 mb-2">[Benefit Title]</h3>
  <p class="font-body text-sm text-brand-text/70">[Benefit Subtitle]</p>
</div>
```

**JavaScript:**
```javascript
// Status Grid Animation
const cells = document.querySelectorAll('.grid-cell.highlight');
if (cells.length > 0) {
  gsap.to(cells, {
    backgroundColor: 'var(--brand-accent)',
    opacity: 0.8,
    duration: 1,
    stagger: {
      each: 0.2,
      yoyo: true,
      repeat: -1
    },
    ease: 'power1.inOut'
  });
}
```
