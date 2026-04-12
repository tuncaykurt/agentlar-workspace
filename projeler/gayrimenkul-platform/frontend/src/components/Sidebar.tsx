'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Users,
  Building2,
  DollarSign,
  MessageSquare,
  Megaphone,
  FileText,
  Share2,
  UserCircle,
  Settings,
  LogOut,
  BookUser,
} from 'lucide-react'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/crm', label: 'CRM', icon: Users },
  { href: '/rehber', label: 'Rehber', icon: BookUser },
  { href: '/portfolio', label: 'Portföy', icon: Building2 },
  { href: '/finance', label: 'Finans', icon: DollarSign },
  { href: '/communications', label: 'İletişim', icon: MessageSquare },
  { href: '/campaigns', label: 'Kampanyalar', icon: Megaphone },
  { href: '/documents', label: 'Belgeler', icon: FileText },
  { href: '/social', label: 'Sosyal Medya', icon: Share2 },
]

const bottomItems = [
  { href: '/profile', label: 'Profilim', icon: UserCircle },
  { href: '/admin', label: 'Yönetim', icon: Settings },
]

export default function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-64 min-h-screen bg-slate-800 flex flex-col">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-slate-700">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
            <Building2 size={18} className="text-white" />
          </div>
          <div>
            <p className="text-white font-semibold text-sm leading-none">
              {process.env.NEXT_PUBLIC_OFFICE_NAME || 'Gayrimenkul'}
            </p>
            <p className="text-slate-400 text-xs mt-0.5">Platform</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`sidebar-link ${isActive ? 'active' : 'text-slate-400'}`}
            >
              <Icon size={18} />
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* Bottom */}
      <div className="px-3 py-4 border-t border-slate-700 space-y-1">
        {bottomItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`sidebar-link ${isActive ? 'active' : 'text-slate-400'}`}
            >
              <Icon size={18} />
              {item.label}
            </Link>
          )
        })}
        <button className="sidebar-link text-slate-400 w-full text-left">
          <LogOut size={18} />
          Çıkış
        </button>
      </div>
    </aside>
  )
}
