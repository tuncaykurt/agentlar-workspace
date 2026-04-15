import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Hakkımızda',
  description: '[WEB_SİTESİ] ekibi ile tanışın. İnsan ve yapay zeka entegrasyonuyla çalışan hibrid takımımız ve vizyonumuz.',
  openGraph: {
    title: 'Hakkımızda | [WEB_SİTESİ]',
    description: '[WEB_SİTESİ] ekibi ile tanışın. İnsan ve yapay zeka entegrasyonuyla çalışan hibrid takımımız ve vizyonumuz.',
  }
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
