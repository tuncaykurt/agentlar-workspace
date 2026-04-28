'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'

export interface ConsultantData {
  id: string
  full_name: string
  wa_phone?: string
  office_phone?: string
  ticari_yetki_belgesi_no?: string
  phone?: string
  email?: string
  address?: string
  role?: string
}

interface FeatureState {
  loading: boolean
  role: string
  isAdmin: boolean
  enabledFeatures: string[]
  creditBalance: number
  creditCostPerDocument: number
  consultantId: string | null
  consultantData: ConsultantData | null
  isActive: boolean
  hasFeature: (key: string) => boolean
  refreshFeatures: () => Promise<void>
  deductCredit: (amount: number) => void
}

const FeatureContext = createContext<FeatureState>({
  loading: true,
  role: 'consultant',
  isAdmin: false,
  enabledFeatures: [],
  creditBalance: 0,
  creditCostPerDocument: 1,
  consultantId: null,
  consultantData: null,
  isActive: true,
  hasFeature: () => false,
  refreshFeatures: async () => {},
  deductCredit: () => {},
})

export function FeatureProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [role, setRole] = useState('consultant')
  const [isAdmin, setIsAdmin] = useState(false)
  const [enabledFeatures, setEnabledFeatures] = useState<string[]>([])
  const [creditBalance, setCreditBalance] = useState(0)
  const [creditCostPerDocument, setCreditCostPerDocument] = useState(1)
  const [consultantId, setConsultantId] = useState<string | null>(null)
  const [consultantData, setConsultantData] = useState<ConsultantData | null>(null)
  const [isActive, setIsActive] = useState(true)

  async function fetchFeatures() {
    try {
      const res = await fetch('/api/features')
      if (!res.ok) return
      const data = await res.json()
      setRole(data.role || 'consultant')
      setIsAdmin(data.is_admin || false)
      setEnabledFeatures(data.enabled_features || [])
      setCreditBalance(data.credit_balance ?? 0)
      setCreditCostPerDocument(data.credit_cost_per_document ?? 1)
      setConsultantId(data.consultant_id || null)
      setIsActive(data.is_active ?? true)
      if (data.consultant_id) {
        setConsultantData({
          id: data.consultant_id,
          full_name: data.consultant_full_name || '',
          wa_phone: data.consultant_wa_phone,
          office_phone: data.consultant_office_phone,
          ticari_yetki_belgesi_no: data.consultant_ticari_yetki_belgesi_no,
          phone: data.consultant_phone,
          email: data.consultant_email,
          address: data.consultant_address,
          role: data.role,
        })
      }
    } catch {
      // silent fail — will show all features as fallback
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchFeatures().then(() => {
      // Auto-grant initial credits on first load (no-op if already granted)
      fetch('/api/credits/init', { method: 'POST' }).catch(() => {})
    })
  }, [])

  function hasFeature(key: string): boolean {
    if (loading) return true // Show while loading to prevent flash
    if (isAdmin) return true
    return enabledFeatures.includes(key)
  }

  function deductCredit(amount: number) {
    setCreditBalance(prev => prev - amount)
  }

  return (
    <FeatureContext.Provider value={{
      loading,
      role,
      isAdmin,
      enabledFeatures,
      creditBalance,
      creditCostPerDocument,
      consultantId,
      consultantData,
      isActive,
      hasFeature,
      refreshFeatures: fetchFeatures,
      deductCredit,
    }}>
      {children}
    </FeatureContext.Provider>
  )
}

export function useFeatures() {
  return useContext(FeatureContext)
}
