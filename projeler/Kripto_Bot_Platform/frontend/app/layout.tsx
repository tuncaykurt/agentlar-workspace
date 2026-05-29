import type { Metadata, Viewport } from "next"
import "./globals.css"
import NavClient from "@/components/NavClient"
import { PWARegister } from "@/components/PWARegister"
import { AuthProvider } from "@/components/AuthProvider"

export const metadata: Metadata = {
  title: "KriptoBot — Otomatik Trading Platformu",
  description: "Kripto trading bot platformu",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "KriptoBot",
  },
}

export const viewport: Viewport = {
  themeColor: "#3b82f6",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192.svg" />
      </head>
      <body className="bg-slate-950 text-white flex flex-col" style={{ height: "100dvh", overflow: "hidden" }}>
        <AuthProvider>
          <NavClient />
          <main className="flex-1 overflow-y-auto overscroll-contain">{children}</main>
          <PWARegister />
        </AuthProvider>
      </body>
    </html>
  )
}
