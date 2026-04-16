import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Kurumsal Eğitimler',
  description: 'Şirketinizi yapay zeka çağına taşıyın. Uluslararası holdinglerden KOBİ\'lere kadar her ölçekte şirkete özel AI eğitimleri.',
  openGraph: {
    title: 'Kurumsal Eğitimler | [WEB_SİTESİ]',
    description: 'Şirketinizi yapay zeka çağına taşıyın. Uluslararası holdinglerden KOBİ\'lere kadar her ölçekte şirkete özel AI eğitimleri.',
  }
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
