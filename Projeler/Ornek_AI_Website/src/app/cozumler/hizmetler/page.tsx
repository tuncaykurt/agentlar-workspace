import { ServicesSection } from '@/components/sections/ServicesSection'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Hizmetler',
  description: 'İşletmeniz için özel yapay zeka ajanları ve otomasyon hizmetleri tasarlıyoruz.',
}

export default function ServicesPage() {
  return (
    <div className="min-h-screen bg-[#050508]">
      <ServicesSection />
    </div>
  )
}
