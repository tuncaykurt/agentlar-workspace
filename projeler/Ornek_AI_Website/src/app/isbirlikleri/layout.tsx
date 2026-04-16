import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'İş Birlikleri',
  description: 'Marka işbirliklerimiz, sosyal medya erişim istatistiklerimiz, hedef kitle analizimiz ve birlikte çalıştığımız kurumlar.',
  openGraph: {
    title: 'İş Birlikleri | [WEB_SİTESİ]',
    description: 'Marka işbirliklerimiz, sosyal medya erişim istatistiklerimiz, hedef kitle analizimiz ve birlikte çalıştığımız kurumlar.',
  }
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
