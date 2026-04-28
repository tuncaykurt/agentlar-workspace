'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import {
  LayoutDashboard, Users, Building2, DollarSign,
  MessageSquare, Megaphone, FileText, Share2,
  UserCircle, Settings, LogOut, BookUser, Menu, X,
  Store, TrendingUp, Coins,
} from 'lucide-react'
import { useFeatures } from '@/lib/features'
import { ThemeToggle } from '@/lib/theme'

// featureKey maps to feature_config.feature_key in DB
const navItems = [
  { href: '/dashboard',      label: 'Dashboard',          icon: LayoutDashboard, featureKey: 'dashboard' },
  { href: '/crm',            label: 'CRM',                icon: Users,           featureKey: 'crm' },
  { href: '/rehber',         label: 'Rehber',             icon: BookUser,        featureKey: 'rehber' },
  { href: '/portfolio',      label: 'Portföy',            icon: Building2,       featureKey: 'portfolio' },
  { href: '/sahibinden',     label: 'Sahibinden İlanlar', icon: Store,           featureKey: 'sahibinden' },
  { href: '/finance',        label: 'Finans',             icon: DollarSign,      featureKey: 'finance' },
  { href: '/communications', label: 'İletişim',           icon: MessageSquare,   featureKey: 'communications' },
  { href: '/campaigns',      label: 'Kampanyalar',        icon: Megaphone,       featureKey: 'campaigns' },
  { href: '/documents',      label: 'Belgeler',           icon: FileText,        featureKey: 'documents' },
  { href: '/social',         label: 'Sosyal Medya',       icon: Share2,          featureKey: 'social' },
  { href: '/piyasa',         label: 'Piyasa',             icon: TrendingUp,      featureKey: 'piyasa' },
]

const bottomItems = [
  { href: '/profile', label: 'Profilim', icon: UserCircle },
  { href: '/admin',   label: 'Yönetim',  icon: Settings },
]

/** Nav links — shared between desktop sidebar and mobile drawer */
function SidebarLinks({ onNav }: { onNav?: () => void }) {
  const pathname = usePathname()
  const router = useRouter()
  const { hasFeature, isAdmin, creditBalance, loading } = useFeatures()

  async function handleSignOut() {
    onNav?.()
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  const visibleItems = navItems.filter(item => hasFeature(item.featureKey))

  // Only admin sees the admin panel
  const visibleBottom = bottomItems.filter(item => {
    if (item.href === '/admin') return isAdmin || loading
    return true
  })

  return (
    <>
      {/* Scrollable nav — flex-1 fills remaining height */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {visibleItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            onClick={onNav}
            className={`sidebar-link ${pathname.startsWith(href) ? 'active' : ''}`}
          >
            <Icon size={18} />
            {label}
          </Link>
        ))}
      </nav>

      {/* Bottom items — always visible, never scrolled away */}
      <div className="flex-shrink-0 px-3 py-4 border-t border-sidebar-border space-y-1">
        {/* Credit balance */}
        {!isAdmin && !loading && (
          <div className="flex items-center gap-2 px-3 py-2 mb-1 rounded-lg bg-surface-container-highest/30">
            <Coins size={15} className="text-tertiary" />
            <span className="text-xs text-sidebar-text">Kredi:</span>
            <span className="text-xs font-semibold text-tertiary">{creditBalance}</span>
          </div>
        )}
        {visibleBottom.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            onClick={onNav}
            className={`sidebar-link ${pathname.startsWith(href) ? 'active' : ''}`}
          >
            <Icon size={18} />
            {label}
          </Link>
        ))}
        <button
          className="sidebar-link w-full text-left"
          onClick={handleSignOut}
        >
          <LogOut size={18} />
          Çıkış
        </button>
      </div>
    </>
  )
}

export default function Sidebar() {
  const [open, setOpen] = useState(false)

  return (
    <>
      {/* ─── DESKTOP sidebar (md+) ──────────────────────────────────────── */}
      <aside className="hidden md:flex flex-col flex-shrink-0 w-64 h-screen sticky top-0 bg-sidebar overflow-hidden">
        {/* Logo */}
        <div className="flex-shrink-0 px-6 py-5 border-b border-sidebar-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <Building2 size={18} className="text-on-primary" />
              </div>
              <div>
                <p className="text-on-primary font-semibold text-sm leading-none">
                  {process.env.NEXT_PUBLIC_OFFICE_NAME || 'Gayrimenkul'}
                </p>
                <p className="text-sidebar-text text-xs mt-0.5">Platform</p>
              </div>
            </div>
            <ThemeToggle />
          </div>
        </div>
        <SidebarLinks />
      </aside>

      {/* ─── MOBILE top header bar (hamburger) ──────────────────────────── */}
      <header className="md:hidden fixed top-0 inset-x-0 z-30 flex items-center gap-3 px-4 h-14 bg-sidebar border-b border-sidebar-border">
        <button
          onClick={() => setOpen(true)}
          className="p-1.5 -ml-1.5 text-sidebar-text hover:text-on-primary rounded-lg"
          aria-label="Menüyü aç"
        >
          <Menu size={22} />
        </button>
        <div className="flex items-center gap-2 flex-1">
          <div className="w-6 h-6 bg-primary rounded flex items-center justify-center">
            <Building2 size={13} className="text-on-primary" />
          </div>
          <span className="text-on-primary font-semibold text-sm">
            {process.env.NEXT_PUBLIC_OFFICE_NAME || 'Gayrimenkul'}
          </span>
        </div>
        <ThemeToggle />
      </header>

      {/* ─── MOBILE backdrop ──────────────────────────────────────────── */}
      {open && (
        <div
          className="md:hidden fixed inset-0 z-40"
          style={{ background: 'var(--backdrop)' }}
          onClick={() => setOpen(false)}
        />
      )}

      {/* ─── MOBILE slide-in drawer ──────────────────────────────────── */}
      <aside
        className={`
          md:hidden fixed inset-y-0 left-0 z-50
          flex flex-col w-72 bg-sidebar shadow-ambient
          transition-transform duration-200 ease-design
          ${open ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        {/* Drawer header with close button */}
        <div className="flex-shrink-0 px-5 py-4 border-b border-sidebar-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <Building2 size={18} className="text-on-primary" />
            </div>
            <div>
              <p className="text-on-primary font-semibold text-sm leading-none">
                {process.env.NEXT_PUBLIC_OFFICE_NAME || 'Gayrimenkul'}
              </p>
              <p className="text-sidebar-text text-xs mt-0.5">Platform</p>
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="p-1.5 text-sidebar-text hover:text-on-primary rounded-lg"
            aria-label="Kapat"
          >
            <X size={18} />
          </button>
        </div>

        <SidebarLinks onNav={() => setOpen(false)} />
      </aside>
    </>
  )
}
