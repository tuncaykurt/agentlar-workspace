import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'AI Factory',
  description: 'Yapay Zeka Otomasyonları satarak gelir elde etmeyi öğrenin. Bireysel girişimciler ve freelancerlar için kullanıma hazır sistemler.',
  openGraph: {
    title: 'AI Factory | [WEB_SİTESİ]',
    description: 'Yapay Zeka Otomasyonları satarak gelir elde etmeyi öğrenin. Bireysel girişimciler ve freelancerlar için kullanıma hazır sistemler.',
  }
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
