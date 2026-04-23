'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'

interface FeatureState {
  loading: boolean
  role: string
  isAdmin: boolean
  enabledFeatures: string[]
  creditBalance: number
  creditCostPerDocument: number
  consultantId: string | null
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
  isActive: true, // Default to true to prevent flickering before load
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
