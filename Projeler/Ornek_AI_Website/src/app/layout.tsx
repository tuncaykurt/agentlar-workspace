import type { Metadata } from 'next'
import { DM_Sans, Space_Grotesk } from 'next/font/google'
import { LanguageProvider } from '@/i18n/i18n'
import { Navbar } from '@/components/layout/Navbar'
import { Footer } from '@/components/layout/Footer'
import './globals.css'

const dmSans = DM_Sans({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-dm-sans',
  display: 'swap',
})

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-space-grotesk',
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL('https://[WEB_SİTESİ]'),
  title: {
    default: '[WEB_SİTESİ] — Yapay Zeka Eğitmen & Builder',
    template: '%s | [WEB_SİTESİ]',
  },
  description: 'Yapay zeka eğitmeni & builder. İşletmeler için AI otomasyon çözümleri, girişimciler için AI Factory topluluğu.',
  keywords: ['yapay zeka', 'AI eğitim', 'otomasyon', '[isim] özeren', 'AI Factory', 'kurumsal eğitim', 'artificial intelligence', 'yapay zeka danışmanlık'],
  authors: [{ name: '[İSİM SOYAD]' }],
  creator: '[WEB_SİTESİ]',
  openGraph: {
    type: 'website',
    locale: 'tr_TR',
    url: 'https://[WEB_SİTESİ]',
    siteName: '[WEB_SİTESİ]',
    title: '[WEB_SİTESİ] — Yapay Zeka Eğitmen & Builder',
    description: 'Yapay zeka eğitmeni & builder. İşletmeler için AI otomasyon çözümleri, girişimciler için AI Factory topluluğu.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: '[WEB_SİTESİ] — Yapay Zeka Eğitmen & Builder',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: '[WEB_SİTESİ] — Yapay Zeka Eğitmen & Builder',
    description: 'Yapay zeka eğitmeni & builder. İşletmeler için AI otomasyon çözümleri.',
    images: ['/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  alternates: {
    canonical: 'https://[WEB_SİTESİ]',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="tr" className={`${dmSans.variable} ${spaceGrotesk.variable}`} suppressHydrationWarning>
      <head>
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
      </head>
      <body className="min-h-screen bg-gray-950 text-white font-sans selection:bg-purple-500/30">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'Organization',
              name: '[WEB_SİTESİ]',
              url: 'https://[WEB_SİTESİ]',
              logo: 'https://[WEB_SİTESİ]/favicon.svg',
              founder: {
                '@type': 'Person',
                name: '[İSİM SOYAD]',
                jobTitle: 'AI Eğitmen & Builder',
              },
              sameAs: [
                'https://www.instagram.com/[SOSYAL_MEDYA_KULLANICI]/',
                'https://youtube.com/@[SOSYAL_MEDYA_KULLANICI]',
                'https://tiktok.com/@[SOSYAL_MEDYA_KULLANICI]',
              ],
              description: 'Yapay zeka eğitmeni & builder. İşletmeler için AI otomasyon çözümleri, girişimciler için AI Factory topluluğu.',
            }),
          }}
        />
        <LanguageProvider>
          <Navbar />
          <main className="pt-20">
            {children}
          </main>
          <Footer />
        </LanguageProvider>
      </body>
    </html>
  )
}
