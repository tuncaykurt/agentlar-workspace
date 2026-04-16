# [İSİM] AI — Kişisel Marka Web Sitesi

> **[İSİM SOYAD]**'in kişisel marka web sitesi. Yapay zeka eğitimi, AI otomasyon ve içerik üretimi alanlarındaki uzmanlığı sergileyen premium, fütüristik multi-page landing site.

## 🌐 Canlı Linkler

| Platform | URL |
|---|---|
| **Netlify (Ana)** | https://KISISEL_WEBSITE_BURAYA |
| **Preview** | https://friendly-rabanadas-0e4beb.netlify.app |

## 🏗 Teknoloji Stack

| Katman | Teknoloji | Versiyon |
|---|---|---|
| **Framework** | Next.js (App Router) + TypeScript | 15.x |
| **Styling** | Tailwind CSS v4 | 4.0.x |
| **Animasyon** | Framer Motion | 11.x |
| **İkonlar** | Lucide React | 0.460.x |
| **Utility** | clsx + tailwind-merge | — |

## ⚠️ KRİTİK UYARI: Gelecek LLM'ler & Agent'lar İçin Mimari Notlar

1. **Bu proje saf bir Next.js 15 (App Router) projesidir.** Eski Vite/React mimarisi tamamen terk edilmiştir. "Eski haline getirme", Vite konfigürasyonlarını geri getirme veya import yollarını (eski `src/App.tsx` vb.) Vite mimarisine uydurmaya çalışma gibi işlemler **KESİNLİKLE YASAKTIR**.
2. **Eski Yedekler:** `Ornek_AI_Website_Dev` ve `Ornek_AI_Website_vite_backup` gibi eski Vite dizinleri silinmiş & `Antigravity/_arsiv/` dizinine taşınmıştır. Başka dizindeki kodları bu projeye referans gösterme.
3. **Lokal Build Hataları (`EPERM` / `sh: next: not found`):** Eğer bu makinede (macOS) `npm install` veya `npm run build` komutları Sandbox içinde `EPERM (Operation not permitted)` yetki hatası veya cache kilitlenmesi verirse, bu **kodun bozuk olduğu anlamına GELMEZ**. Hata tamamen macOS SIP / Cursor Sandbox kısıtlamalarından kaynaklanmaktadır. 
   - Kodu "düzeltmek" adına package downgrade, major refactor veya dosyaları sil-kopyala (rm -rf) döngüsüne **GİRME**. Sistemin lokal kısıtlamalarına dokunma, kod zaten stable'dır.
   - Sadece CI/CD deployment'larına (Netlify, vb.) ve canlı preview ortamlarına güven.

## 📁 Proje Yapısı (Güncel — Mart 2026)

```
Ornek_AI_Website/
├── public/
│   ├── hero_bg/
│   │   └── hero_Elevate_New_V1.jpg    # Ana hero arka plan fotoğrafı (Flux AI üretimi)
│   ├── images/
│   │   ├── products/                   # ProductsSection kart görselleri
│   │   │   ├── isletme_kobi.png
│   │   │   ├── kurumsal_holding.png
│   │   │   ├── girisimci.png
│   │   │   └── marka_isbirligi.png
│   │   ├── logos/                      # Marka & kurum logoları
│   │   │   ├── turkiye-finans-logo.png # Türkiye Finans (lokal dosya)
│   │   │   ├── Udemy_logo.svg (1).png  # Udemy (lokal dosya)
│   │   │   ├── images (8) copy 2.png   # GittiGidiyor (lokal dosya)
│   │   │   └── ...diğerleri
│   │   ├── team/                       # Ekip üyeleri profil fotoğrafları (LinkedIn'den)
│   │   │   ├── ceren.jpeg
│   │   │   ├── sarper.jpg
│   │   │   ├── ece.jpeg
│   │   │   ├── berke.jpeg
│   │   │   ├── savas.jpeg
│   │   │   └── okan.jpg
│   │   └── egitimler/                  # Kurumsal eğitim fotoğrafları
│   │       ├── egitim1.jpg
│   │       ├── egitim2.jpg
│   │       └── egitim3.jpg
│   ├── team/                           # AI takım üyeleri avatarları
│   │   ├── bobby_ai.png
│   │   ├── daisy_ai.png
│   │   ├── gipsy_ai.png
│   │   └── joshua_ai.png
│   ├── portrait.png                    # CollaborationsPage creator portresi
│   ├── mediakit-banner.png             # CollaborationsPage hero arka plan
│   ├── videos/                         # Arka plan reel videoları (CollaborationsPage Viral Kartlar)
│   │   └── reel1.mp4 - reel5.mp4
│   ├── favicon.svg                     # Site favicon
│   └── icons.svg                       # SVG ikon sprite
├── src/
│   ├── App.tsx                         # Ana uygulama — hash-based routing
│   ├── main.tsx                        # React entry point (LanguageProvider wrapper)
│   ├── index.css                       # Global stiller + Tailwind v4 design system
│   ├── i18n/                           # 🌐 Çoklu dil sistemi
│   │   ├── i18n.tsx                    # LanguageProvider, useTranslation, useLanguage hooks
│   │   └── locales/                    # Dil dosyaları (JSON)
│   │       ├── tr.json                 # 🇹🇷 Türkçe (ana dil)
│   │       ├── en.json                 # 🇬🇧 İngilizce
│   │       ├── zh.json                 # 🇨🇳 Çince (Basitleştirilmiş)
│   │       └── es.json                 # 🇪🇸 İspanyolca
│   ├── pages/
│   │   ├── HomePage.tsx                # Ana sayfa (HeroSectionElevate + ProductsSection)
│   │   ├── SolutionsPage.tsx           # Çözümler sayfası (Artifex Campus + Hizmetler)
│   │   ├── AIFactoryPage.tsx           # AI Factory eğitim platformu
│   │   ├── CorporateTrainingsPage.tsx  # Kurumsal Eğitimler sayfası + logoları + CTA
│   │   ├── CollaborationsPage.tsx      # İş Birlikleri sayfası (Media Kit + Viral içerikler)
│   │   └── AboutPage.tsx              # Hakkımızda sayfası (İnsan + AI ekip — gerçek fotoğraflar)
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Navbar.tsx              # Üst navigasyon — dropdown menüler + LanguageSwitcher
│   │   │   ├── Footer.tsx              # Site alt bilgi + sosyal medya ikonları
│   │   │   └── LanguageSwitcher.tsx    # 🌐 Dil seçici dropdown (bayrak + isim)
│   │   └── sections/
│   │       ├── HeroSectionElevate.tsx  # ⭐ Full-screen hero (bg fotoğraf + sol overlay metin)
│   │       ├── ProductsSection.tsx     # 4-kart ürün grid (kitle segmentasyonu)
│   │       └── ServicesSection.tsx     # Hizmetler detay kartları
│   └── assets/                         # Statik varlıklar (eski, çoğu kullanılmıyor)
├── index.html                          # HTML giriş noktası
├── vite.config.ts                      # Vite yapılandırması (base: '/Ornek_AI_Website/')
├── railway.json                        # Railway deploy yapılandırması
├── tsconfig.json                       # TypeScript konfigürasyonu
├── eslint.config.js                    # ESLint kuralları
└── package.json                        # Bağımlılıklar ve script'ler
```

## 🗺 Sayfa Yapısı & Routing

Site **Next.js App Router** kullanır (`app/` dizini):

```
/                               → HomePage
/cozumler                       → SolutionsPage
/egitimler/ai-factory           → AIFactoryPage
/egitimler/kurumsal-egitimler   → CorporateTrainingsPage
/isbirlikleri                   → CollaborationsPage
/hakkimizda                     → AboutPage
/blog                           → BlogIndexPage
/blog/[slug]                    → Blog Post (Dinamik MDX Sayfası)
```

### Navigasyon Yapısı (Navbar)

```
Navbar (pill-shaped, glassmorphism, sticky)
│
├── Çözümler (dropdown)
│   ├── Artifex Campus → /cozumler (Tak-çıkar AI çözümleri — "Çok Yakında")
│   └── Hizmetler      → /cozumler (alt bölüm — danışmanlık, otomasyon kartları)
│
├── Eğitimler (dropdown)
│   ├── AI Factory          → /egitimler/ai-factory (AI otomasyon satış eğitimi)
│   └── Kurumsal Eğitimler  → /egitimler/kurumsal-egitimler (kurumsal workshop/danışmanlık)
│
├── İş Birlikleri → /isbirlikleri
│
├── Hakkımızda → /hakkimizda
│
├── Blog → /blog
│
└── 🌐 Dil Seçici (sağ üst) → EN / TR / ZH / ES
```

### Sayfa Akış Detayları

```
├── #/ — HomePage
│   ├── HeroSectionElevate  ← Full-screen bg fotoğraf + "Yapay zeka? [İSİM]." overlay
│   └── ProductsSection     ← 4 kart: İşletmeler, Kurumsal, Girişimciler, Markalar
│
├── #/cozumler — SolutionsPage
│   ├── Artifex Campus     ← "Tak-çıkar AI çözümleri" + "Çok Yakında" durumu
│   └── ServicesSection    ← Detaylı hizmet kartları (Eğitim referansları KALDIRILDI)
│
├── #/egitimler/ai-factory — AIFactoryPage
│   └── AI Factory         ← İndigo/mor renk şeması, AI otomasyon satış eğitimi
│
├── #/egitimler/kurumsal-egitimler — CorporateTrainingsPage
│   ├── Kurum Kartları     ← 6 kurum: Türkiye Finans, Misyon, Başkent Üni, Udemy, GittiGidiyor, Trendyol
│   ├── Logo Sistemi       ← Lokal dosya > Google Favicon API fallback
│   └── İletişim CTA       ← EMAIL_ADRESI_BURAYA
│
├── #/isbirlikleri — CollaborationsPage
│   ├── Media Kit Hero     ← Paralaks banner + istatistik kartları
│   ├── Kitle Demografisi  ← Cinsiyet, yaş, coğrafya dağılım (arka plan ikonları kaldırıldı)
│   ├── Viral İçerikler    ← Reel kartları (lokal .mp4 background videoları + Premium UI)
│   ├── Platform Erişimi   ← Instagram, TikTok, YouTube, Facebook, Udemy, Skool kartları
│   └── İletişim CTA       ← EMAIL_ADRESI_BURAYA sponsorluk butonu
│
├── #/hakkimizda — AboutPage
│   └── Ekip Bölümü        ← 6 insan (gerçek LinkedIn fotoğrafları) + 4 AI takım üyesi kartları
│
Footer (tüm sayfalarda — sosyal medya ikonları + copyright)
```

## ⭐ Hero Section — Mevcut Tasarım (HeroSectionElevate)

- **Yaklaşım:** Full-screen background image + sol tarafta metin overlay
- **Arka Plan:** `/public/hero_bg/hero_Elevate_New_V1.jpg` — Flux AI ile üretilmiş
- **Overlay:** Siyah→şeffaf gradyan (soldan sağa) — opacity 90%
- **İçerik:**
  1. **Başlık:** "Yapay zeka? [İSİM]." (gradient accent)
  2. **Alt başlık:** "Bireylerden işletmelere, yapay zekayı gerçek sonuçlara dönüştüren..."
  3. **3 Metrik Kart:** 250K+ takipçi, 1.000+ üye, 10+ kurumsal müşteri
- **Animasyon:** Framer Motion fade-up reveal (sıralı delay)
- **Responsive:** Desktop'ta sol overlay, mobilde tam genişlik

## 🎨 Design System (index.css)

### Tailwind v4 Custom Değişkenler
| Token | Değer | Kullanım |
|---|---|---|
| `--color-electric-blue` | `#00d4ff` | Vurgu mavi |
| `--color-accent-purple` | `#7c3aed` | Vurgu mor |
| `--color-accent-violet` | `#a855f7` | Vurgu açık mor |

### Utility Sınıflar
- `.glass-panel` — Glassmorphism panel efekti
- `.glass-button` — Hover'da gradient gösteren buton
- `.bento-card` — Mouse-tracking glow kartları
- `.text-gradient` / `.text-gradient-accent` / `.text-gradient-warm` — Metin gradyanları
- `.glow-blue` / `.glow-purple` — Box-shadow glow efektleri
- `.section-divider` — Bölümler arası gradient çizgi

### Fontlar
- **Display:** Space Grotesk (başlıklar)
- **Body:** DM Sans (metin)

## 🚀 Çalıştırma

```bash
# Bağımlılıkları kur
npm install

# Geliştirme sunucusu
npm run dev
# → http://localhost:3000

# Production build (Static Export test)
npm run build
```

## 🚂 Deploy (Netlify MCP Otonomisi)

Proje **Netlify** üzerinde barındırılacak şekilde kurgulanmıştır (Next.js SSR/Functions destekli). Cloudflare Pages'in statik HTML kısıtlamaları terk edilmiştir.

### Antigravity & Netlify MCP Entegrasyonu
- **Mimari:** Bu proje, Netlify gösterge paneline (dashboard) manuel giriş yapılmasını tamamen ortadan kaldıran uçtan uca AI otonomisine sahiptir.
- **Süreç:** GitHub üzerinden yapılan güncellemeler otomatik olarak Netlify tarafından derlenirken, Antigravity AI ajanı `netlify-mcp-server` aracılığıyla projeyi `93e952dd-4720-4bca-93e8-55ddcaa844f6` (Site ID) üzerinden takip eder, pipeline durumunu denetler ve site yapılandırmasını otonom olarak yönetir.
- **Avantaj:** Tam teşekküllü Next.js 15 SSR yetenekleri, API route desteği ve sıfır-konfigürasyon otonom dağıtım.

## 🖼 Görsel Yönetimi

| Görsel | Konum | Kullanıldığı Yer |
|---|---|---|
| Hero arka plan | `public/hero_bg/hero_Elevate_New_V1.jpg` | HeroSectionElevate |
| Ürün kartları | `public/images/products/*.png` | ProductsSection |
| Marka logoları | `public/images/logos/` | CorporateTrainingsPage (lokal dosya öncelikli) |
| Ekip fotoğrafları (insan) | `public/images/team/*.jpg/.jpeg` | AboutPage (LinkedIn profil fotoğrafları) |
| AI ekip avatarları | `public/team/*.png` | AboutPage |
| Eğitim fotoğrafları | `public/images/egitimler/` | CorporateTrainingsPage ("Eğitimlerimizden kareler" galerisi) |
| Creator portre | `public/portrait.png` | CollaborationsPage |
| Media kit banner | `public/mediakit-banner.png` | CollaborationsPage |
| Viral arka plan videoları | `public/videos/reel*.mp4` | CollaborationsPage (ViralReelCard bileşeni) |

## 🌐 i18n — Çoklu Dil Sistemi

> **⚠️ KRİTİK KURAL:** Bu sitede metin değişikliği yapıldığında 4 dil dosyasının tümü güncellenmelidir. Detay: aşağıdaki "i18n Değişiklik Kuralları" bölümü.

### Desteklenen Diller
| Kod | Dil | Dosya | Bayrak |
|---|---|---|---|
| `tr` | Türkçe (varsayılan) | `src/i18n/locales/tr.json` | 🇹🇷 |
| `en` | İngilizce | `src/i18n/locales/en.json` | 🇬🇧 |
| `zh` | Çince (Basitleştirilmiş) | `src/i18n/locales/zh.json` | 🇨🇳 |
| `es` | İspanyolca | `src/i18n/locales/es.json` | 🇪🇸 |

### Teknik Altyapı
- **React Context + JSON** — Harici kütüphane yok, custom lightweight çözüm
- **Otomatik dil algılama:** `navigator.language` → prefix match (ör. `zh-CN` → `zh`)
- **Tercih saklama:** `localStorage` key: `[isim]-ai-lang`
- **Fallback sırası:** localStorage → navigator.language → English (`en`)
- **Çeviri erişimi:** `const { t } = useTranslation()` → `t('hero.title')`
- **Dot-notation key resolution:** Nested JSON'a `t('collaborations.heroSubtitle')` ile erişim
- **Fallback mekanizma:** Key bulunamazsa → İngilizce locale → key string döner

### i18n Değişiklik Kuralları (ZORUNLU)

Bu sitede **herhangi bir metin değişikliği** yapıldığında:

1. **Önce Türkçe** (`tr.json`) güncellenir
2. **Sonra diğer 3 dil** (`en.json`, `zh.json`, `es.json`) eşlenecek şekilde güncellenir
3. **Tarayıcıda 4 dil test edilir** — her birinde doğru metin göründüğü doğrulanır
4. **Yeni bir component/sayfa eklendiğinde:** Tüm text `t()` ile sarmalanır, 4 locale dosyasına key eklenir

### i18n Dosya Haritası (Tüm Component → Locale Key Eşleşmeleri)

| Component | JSON Key Prefix |
|---|---|
| `Navbar.tsx` | `nav.*` |
| `Footer.tsx` | `footer.*` |
| `HeroSectionElevate.tsx` | `hero.*` |
| `ProductsSection.tsx` | `products.*` |
| `ServicesSection.tsx` | `services.*` |
| `SolutionsPage.tsx` | `solutions.*` |
| `AboutPage.tsx` | `about.*` |
| `AIFactoryPage.tsx` | `aiFactory.*` |
| `CollaborationsPage.tsx` | `collaborations.*` |
| `CorporateTrainingsPage.tsx` | `corporateTrainings.*` |

## 📝 Son Değişiklikler (22 Mart 2026)

### 🚀 Cloudflare'den Netlify Otonomisine Geçiş (MCP)
- **Altyapı Migrasyonu:** Cloudflare Pages'in Next.js SSR ve API projelerinde yarattığı "Statik Export" kısıtlamaları tamamen kaldırılarak projede tam kapsamlı **Netlify Otonomisine** geçildi.
- **Agent Integrasyonu:** Netlify MCP sunucusu Antigravity sistemine bağlandı. AI ajanı, site yapılandırmasını otopilotta yönetiyor.
- **SSL ve Custom Domain:** `KISISEL_WEBSITE_BURAYA` özel alan adı başarıyla Cloudflare DNS üzerinden yönetilerek (Proxy kapalı - DNS Only olarak) Netlify Let's Encrypt sunucularına bağlandı ve SSL tam aktif hale getirildi.

### 🎨 Tailwind CSS v4 & Next.js 15 Optimizasyonları
- **Purge/Source Düzeltmesi:** Tailwind CSS v4 ortamında dinamik sınıf yapılandırmaları ve utility class'ların Cloudflare/Vercel build esnasında kaybolması/kırılması (purged) sorunu giderildi. Global css içine `@source "../";` eklenerek src/ bileşenlerinin izlenmesi garantiye alındı.
- **Dinamik Optimizasyon:** `images: { unoptimized: true }` korundu ancak genel `output: 'export'` kısıtlaması temizlenerek (Netlify destekli) Server-Side Rendering (SSR) kapıları tamamen açıldı.
- **Tasarım İyileştirmeleri:** "İş Birlikleri", "Kurumsal Eğitimler" ve "AI Factory" sayfalarındaki Glassmorfizm, Bento kartlar ve Hero Section tasarımları Cloudflare build engine engellerinden kurtarılarak %100 orijinal stiliyle yayına alındı.

## 📝 Son Değişiklikler (İçerik Geçmişi — 21 Mart 2026)

### 🌐 i18n — 4 Dil Desteği (YENİ)
- **Custom i18n sistemi** — React Context + JSON locale dosyaları
- **LanguageSwitcher** — Navbar'da glassmorphism dropdown (bayrak ikonları ile)
- **Otomatik browser dili algılama** + localStorage ile tercih saklama
- **11 component güncellendi** — Tüm hardcoded Türkçe text `t()` fonksiyonu ile sarmalandı
- **160+ çeviri anahtarı** — Her dil dosyasında tam kapsam

### Navigasyon Değişiklikleri
- **Yeni menü yapısı:** Çözümler (dropdown), Eğitimler (dropdown), İş Birlikleri, Hakkımızda
- **Çözümler dropdown:** Artifex Campus + Hizmetler → ayrı bölüm olarak SolutionsPage'de
- **Eğitimler dropdown:** AI Factory + Kurumsal Eğitimler → ayrı sayfalar olarak

### Yeni Sayfalar
- **AIFactoryPage.tsx** — AI Factory eğitim platformu (İndigo/mor renk şeması)
- **CorporateTrainingsPage.tsx** — Kurumsal eğitim referansları + `EMAIL_ADRESI_BURAYA` iletişim CTA
  - Logo sistemi: Lokal dosya varsa kullan (`object-contain`), yoksa Google Favicon API fallback
  - Türkiye Finans ve GittiGidiyor logoları lokal dosya olarak eklendi
  - "Eğitimlerimizden kareler" fotoğraf galerisi eklendi (3 fotoğraf grid)

### İçerik Değişiklikleri
- **ServicesSection** — Eğitim referansları kaldırıldı (CorporateTrainingsPage'e taşındı)
- **SolutionsPage** — Artifex Campus başlığı "Tak-çıkar AI çözümleri" olarak değiştirildi, "Çok Yakında" butonu
- **CollaborationsPage** — PieChart ve Globe arka plan ikonları kaldırıldı
- **AboutPage** — Tüm 6 insan ekip üyesine LinkedIn profil fotoğrafları eklendi (Ceren, Sarper, Ece, Berke, Savaş, Okan)

### 🚀 Blog Sistemi ve Next.js App Router Entegrasyonu
- **App Router Dönüşümü** — Vite/React mimarisinden tam teşekküllü Next.js App Router yapısına geçiş yapıldı (SEO Native).
- **Blog MDX Altyapısı** — `/blog` ve `/blog/[slug]` sayfaları eklendi. `src/content/blog` klasöründeki MDX dosyaları otomatik okunur.
- **Kapak Görseli AI Pipeline** — `Blog_Yazici/fetch_and_resize_cover.py` eklendi. Bu adım; ImgBB + Kie AI (Nano Banana 2) kullanarak Google Drive'daki rastgele kapak resimlerini outpaint edip 16:9 formatlı muazzam webp dosyalarına çevirir.
- **Navigasyon ve UI İyileştirmeleri** — Blog butonu Navbar'ın en sağına eklendi, Blog post içi geri dönüş aksiyonları ana sayfaya bağlandı.

### 🛠️ Next.js Migrasyon Hataları ve Deployment Düzeltmeleri
- **Deployment ("Beyaz Ekran" Hatası) Çözümü** — Vite altyapısından Next.js App Router yapısına geçerken oluşan sözdizimi ve routing hataları nedeniyle Cloudflare Pages üzerinde failed build olan "beyaz ekran" hatası tamamen giderildi (`npm run build` stabilitesi sağlandı).
- **Sayfa Restorasyonları** — Yanlış migrate edilmiş olan `SolutionsPage` (Çözümler) ve `AboutPage` (Hakkımızda) sayfaları eski Vite versiyonundan (animasyonlar, orijinal arayüz, insan ekip üyeleri ve geçişler) manuel kurtarıldı ve tam uyumlu hale getirildi.
- **Görsel Yolu (Path) Hataları** — `HeroSectionElevate.tsx`, `ProductsSection.tsx` ve diğer sayfalardaki görsel yollarında meydana gelen "çift slash" (`//`) veya eksik root slash hataları giderilerek resimlerin ve background dosyalarının Next.js componentlerinde sorunsuz yüklenmesi sağlandı.
- **Creator Portresi ve Eksik Componentler** — Kullanıcı portresi ve "Eğitim & Danışmanlık Referansları" gibi spesifik alanlar eski build referanslarından alınarak kayıpsız yerine konuldu.

### Bekleyen İşler
- [x] Netlify MCP Entegrasyonu & Cloudflare migrasyonunun tamamlanması
- [x] Next.js `output: 'export'` kısıtlamasının kaldırılması ve SSR aktivasyonu

---

**[İSİM] AI** © 2026 — [İSİM SOYAD]
