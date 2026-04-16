import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Hizmetler',
  description: '[WEB_SİTESİ] işletmelere yönelik profesyonel yapay zeka çözümleri ve hizmetleri.',
  openGraph: {
    title: 'Hizmetler | [WEB_SİTESİ]',
    description: '[WEB_SİTESİ] işletmelere yönelik profesyonel yapay zeka çözümleri ve hizmetleri.',
  }
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
