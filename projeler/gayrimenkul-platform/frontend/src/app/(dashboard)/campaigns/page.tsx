'use client'

import { useState } from 'react'
import { Megaphone, Mail, Users, Search, Briefcase } from 'lucide-react'
import WhatsAppCampaignsTab from './_tabs/WhatsAppCampaignsTab'
import EmailCampaignsTab from './_tabs/EmailCampaignsTab'
import LeadsPoolTab from './_tabs/LeadsPoolTab'
import ScrapeJobsTab from './_tabs/ScrapeJobsTab'
import LinkedInOutreachTab from './_tabs/LinkedInOutreachTab'

const TABS = [
  { id: 'whatsapp', label: 'WhatsApp', icon: Megaphone },
  { id: 'email', label: 'Email', icon: Mail },
  { id: 'linkedin', label: 'LinkedIn', icon: Briefcase },
  { id: 'leads', label: 'Lead Havuzu', icon: Users },
  { id: 'scrape', label: 'Scrape İşleri', icon: Search },
] as const

type TabId = typeof TABS[number]['id']

export default function CampaignsPage() {
  const [tab, setTab] = useState<TabId>('whatsapp')

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-on-surface">Pazarlama & Kampanyalar</h1>
        <p className="text-on-surface-variant text-sm mt-1">
          WhatsApp, Email ve LinkedIn üzerinden çok kanallı pazarlama
        </p>
      </div>

      <div className="border-b border-outline mb-6 overflow-x-auto">
        <div className="flex gap-1 min-w-max">
          {TABS.map(t => {
            const Icon = t.icon
            const active = tab === t.id
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  active
                    ? 'border-primary text-primary'
                    : 'border-transparent text-on-surface-variant hover:text-on-surface'
                }`}
              >
                <Icon size={15} />
                {t.label}
              </button>
            )
          })}
        </div>
      </div>

      {tab === 'whatsapp' && <WhatsAppCampaignsTab />}
      {tab === 'email' && <EmailCampaignsTab />}
      {tab === 'linkedin' && <LinkedInOutreachTab />}
      {tab === 'leads' && <LeadsPoolTab />}
      {tab === 'scrape' && <ScrapeJobsTab />}
    </div>
  )
}
