import type { Metadata } from "next"
import "./globals.css"
import NavClient from "@/components/NavClient"

export const metadata: Metadata = {
  title: "KriptoBot — Otomatik Trading Platformu",
  description: "Kripto trading bot platformu",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body className="bg-slate-950 text-white h-screen overflow-hidden flex flex-col">
        <NavClient />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </body>
    </html>
  )
}
