"use client"

import React, { useState, useEffect, use } from 'react'
import { notFound } from 'next/navigation'
import { 
  MapPin, TrendingUp, Info, Activity, Star, Calendar, 
  ShieldAlert, Building2, Wallet, Clock, ChevronRight, 
  User, Sun, Moon, Phone, Mail, LayoutGrid, 
  Navigation, Hospital, GraduationCap, School, 
  Download, Share2, Briefcase, Calculator,
  MessageSquare, FileText
} from 'lucide-react'

export default function ReportPage({ params }: { params: any }) {
  const [id, setId] = useState<string | null>(null)
  const [research, setResearch] = useState<any>(null)
  const [isDarkMode, setIsDarkMode] = useState(true)
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('ozet')



  useEffect(() => {
    // Handle both Promise and plain object params (Next.js 14/15 compatibility)
    if (params instanceof Promise) {
      params.then(p => setId(p.id))
    } else if (params && params.id) {
      setId(params.id)
    } else if (typeof (params as any)?.then === 'function') {
      (params as any).then((p: any) => setId(p.id))
    }
  }, [params])

  useEffect(() => {
    if (!id) return

    const fetchResearch = async () => {
      try {
        const response = await fetch(`/api/report/${id}`)
        if (response.ok) {
          const data = await response.json()
          setResearch(data)
        } else {
          const errData = await response.json()
          console.error('API Error:', errData)
        }
      } catch (err) {
        console.error('Fetch Error:', err)
      } finally {
        setIsLoading(false)
      }
    }

    fetchResearch()
  }, [id])

  if (!isLoading && !research) {
    notFound()
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#09090B] flex flex-col items-center justify-center text-center">
        <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-zinc-500 font-medium">Analiz Dosyası Yükleniyor...</p>
      </div>
    )
  }

  const isCompleted = research?.status === 'completed'
  const consultant = research?.consultants
  const reportText = research?.report_content || ''
  
  // Data Extraction
  const { sections, scores, valuation } = parseReportText(reportText)
  const buildingAge = calculateAge(research?.management_plan_date)
  const taxInfo = calculateTaxStatus(research?.acquisition_date, research?.acquisition_price, research?.owner_type)
  const spendingData = calculateSpendingData(valuation?.min || '0')

  return (
    <div className={`min-h-screen transition-colors duration-500 font-sans selection:bg-indigo-500/30 ${isDarkMode ? 'bg-[#09090B] text-zinc-100' : 'bg-zinc-50 text-zinc-900'}`}>
      
      {/* THEME TOGGLE */}
      <button 
        onClick={() => setIsDarkMode(!isDarkMode)}
        className={`fixed top-6 right-6 z-[100] p-3 rounded-full shadow-2xl transition-all hover:scale-110 active:scale-95 ${isDarkMode ? 'bg-zinc-800 text-yellow-400 border border-zinc-700' : 'bg-white text-indigo-600 border border-zinc-200'}`}
      >
        {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
      </button>

      {/* BACKGROUND DECORATION */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none opacity-50">
        <div className={`absolute top-0 right-0 w-[600px] h-[600px] blur-[150px] rounded-full translate-x-1/2 -translate-y-1/2 transition-colors duration-1000 ${isDarkMode ? 'bg-indigo-600/10' : 'bg-indigo-400/10'}`} />
        <div className={`absolute bottom-0 left-0 w-[600px] h-[600px] blur-[150px] rounded-full -translate-x-1/2 translate-y-1/2 transition-colors duration-1000 ${isDarkMode ? 'bg-purple-600/10' : 'bg-purple-400/10'}`} />
      </div>

      <main className="max-w-[480px] mx-auto px-5 pt-8 pb-32 relative z-10 space-y-8">
        
        {/* 1. CONSULTANT PROFILE CARD */}
        <section className={`p-8 rounded-[40px] text-center space-y-6 relative overflow-hidden transition-all duration-500 ${isDarkMode ? 'bg-zinc-900/40 border border-zinc-800/50 backdrop-blur-xl' : 'bg-white border border-zinc-200 shadow-2xl'}`}>
          <div className="relative inline-block">
            <div className={`w-32 h-32 rounded-full mx-auto p-1 border-2 transition-colors ${isDarkMode ? 'border-indigo-500/50' : 'border-indigo-200'}`}>
              <div className="w-full h-full rounded-full bg-zinc-800 flex items-center justify-center overflow-hidden border-4 border-zinc-900">
                <div className="w-full h-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-4xl font-black">
                  {consultant?.full_name?.charAt(0) || 'D'}
                </div>
              </div>
            </div>
            <div className="absolute bottom-1 right-1 w-7 h-7 bg-emerald-500 border-4 border-zinc-900 rounded-full flex items-center justify-center shadow-lg">
              <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
            </div>
          </div>
          
          <div>
            <h2 className="text-2xl font-black tracking-tight">{consultant?.full_name || 'Danışman Adı'}</h2>
            <p className={`text-sm font-medium mt-1 ${isDarkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>Profesyonel Gayrimenkul Danışmanı</p>
            <div className={`inline-flex items-center gap-1.5 px-3 py-1 mt-3 rounded-full text-[10px] font-bold uppercase tracking-wider ${isDarkMode ? 'bg-zinc-800 text-zinc-400' : 'bg-zinc-100 text-zinc-500'}`}>
              <MapPin className="w-3 h-3" /> {research?.city || 'Konum'}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <a href={`tel:${consultant?.phone}`} className={`flex items-center justify-center gap-2 py-3 rounded-2xl font-bold text-sm transition-all ${isDarkMode ? 'bg-zinc-800 hover:bg-zinc-700 text-white' : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-900'}`}>
              <Phone className="w-4 h-4" /> Ara
            </a>
            <a href={`mailto:${consultant?.email}`} className={`flex items-center justify-center gap-2 py-3 rounded-2xl font-bold text-sm transition-all ${isDarkMode ? 'bg-zinc-800 hover:bg-zinc-700 text-white' : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-900'}`}>
              <Mail className="w-4 h-4" /> E-posta
            </a>
          </div>
          
          <button className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-2xl transition-all shadow-xl shadow-indigo-500/20 text-sm flex items-center justify-center gap-2 group">
            <MessageSquare className="w-4 h-4 transition-transform group-hover:scale-110" /> 
            <span>WhatsApp ile İletişime Geç</span>
          </button>
        </section>

        {/* 2. REPORT HEADER */}
        <section className="space-y-4 px-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-500">Gayrimenkul.AI</span>
            <span className={`text-[10px] font-medium ${isDarkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>Rapor No: {id?.slice(0, 8).toUpperCase()}</span>
          </div>
          <h1 className="text-5xl font-black leading-[0.9] tracking-tighter">
            Stratejik <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 to-purple-500">Değerleme</span> <br />
            Raporu
          </h1>
          <p className={`text-lg font-medium leading-relaxed ${isDarkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>
            {research?.city} / {research?.district} bölgesinde yer alan mülkün güncel piyasa analizi ve yatırım projeksiyonu.
          </p>
          <div className="flex gap-3 pt-2">
            <button className={`flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold text-sm bg-indigo-600 text-white shadow-lg shadow-indigo-600/20 hover:scale-[1.02] active:scale-[0.98] transition-all`}>
              <Download className="w-4 h-4" /> PDF İndir
            </button>
            <button className={`flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold text-sm ${isDarkMode ? 'bg-zinc-900 border border-zinc-800' : 'bg-white border border-zinc-200 shadow-sm'} hover:scale-[1.02] transition-all`}>
              <Share2 className="w-4 h-4" /> Paylaş
            </button>
          </div>
        </section>

        {/* 3. INVESTMENT POTENTIAL CIRCLE */}
        <section className={`p-8 rounded-[40px] text-center transition-all ${isDarkMode ? 'bg-zinc-900/40 border border-zinc-800/50' : 'bg-white border border-zinc-200 shadow-xl'}`}>
          <h3 className={`text-[10px] font-black uppercase tracking-widest mb-8 ${isDarkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>YATIRIM POTANSİYELİ</h3>
          <div className="relative w-48 h-48 mx-auto flex items-center justify-center">
            <svg className="w-full h-full -rotate-90">
              <circle cx="96" cy="96" r="88" stroke="currentColor" strokeWidth="12" fill="transparent" className={`${isDarkMode ? 'text-zinc-800' : 'text-zinc-100'}`} />
              <circle 
                cx="96" cy="96" r="88" stroke="url(#gradient)" strokeWidth="12" fill="transparent" 
                strokeDasharray="553" strokeDashoffset={553 - (553 * (scores?.yatirim || 7.8)) / 10}
                strokeLinecap="round" className="transition-all duration-1000 ease-out"
              />
              <defs>
                <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#6366f1" />
                  <stop offset="100%" stopColor="#a855f7" />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-6xl font-black tracking-tighter">{scores?.yatirim || '7.8'}</span>
              <span className="text-[10px] font-bold text-zinc-500 uppercase mt-1">Skor</span>
            </div>
          </div>
          <p className="mt-8 font-extrabold text-xl">Güçlü Yatırım Sinyali</p>
          <p className={`text-xs mt-2 px-6 leading-relaxed ${isDarkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>
            Bu mülk, bölgedeki emsal satışlara ve gelecek projeksiyonlarına göre yüksek kazanç vaat ediyor.
          </p>
        </section>

        {/* 4. PROPERTY DETAILS GRID */}
        <section className={`p-8 rounded-[40px] space-y-8 transition-all ${isDarkMode ? 'bg-zinc-900/40 border border-zinc-800/50' : 'bg-white border border-zinc-200 shadow-xl'}`}>
          <div className="flex items-center justify-between mb-2">
            <h3 className={`text-sm font-black uppercase tracking-widest ${isDarkMode ? 'text-white' : 'text-zinc-900'}`}>Teknik Özellikler</h3>
            <Info className="w-4 h-4 text-zinc-500" />
          </div>
          
          <div className="grid grid-cols-1 gap-6">
            <DetailRow icon={<MapPin />} label="Konum" value={`${research?.city}, ${research?.district}`} isDark={isDarkMode} />
            <DetailRow icon={<Building2 />} label="Mülk Tipi" value={research?.property_type || 'Konut / Ticari'} isDark={isDarkMode} />
            <DetailRow icon={<LayoutGrid />} label="Ada / Parsel" value={`${research?.ada} / ${research?.parsel}`} isDark={isDarkMode} />
            <DetailRow icon={<Clock />} label="Bina Yaşı" value={buildingAge ? `${buildingAge} Yıl` : 'Belirlenmedi'} isDark={isDarkMode} />
          </div>
        </section>

        {/* 5. MARKET PRICE RANGE */}
        <section className={`p-8 rounded-[40px] transition-all overflow-hidden relative shadow-2xl ${isDarkMode ? 'bg-indigo-600/10 border border-indigo-500/20' : 'bg-indigo-50 border border-indigo-100'}`}>
          <div className="absolute top-0 right-0 p-4">
            <span className="px-3 py-1 bg-indigo-500 text-white text-[10px] font-black rounded-full uppercase tracking-widest">PİYASA DEĞERİ</span>
          </div>
          
          <div className="space-y-1">
            <span className="text-4xl font-black tracking-tighter text-indigo-500">
              {valuation?.min} - {valuation?.max}
            </span>
            <span className={`block text-lg font-bold ${isDarkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>TRY</span>
          </div>
          
          <div className="mt-6 pt-6 border-t border-indigo-500/10 space-y-4">
            <div className="flex justify-between items-end">
              <div>
                <span className={`text-[10px] font-bold uppercase tracking-widest ${isDarkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>TAHMİNİ BİRİM FİYAT</span>
                <div className="text-xl font-black">{valuation?.unitPrice || '18.5k'} <span className="text-xs font-medium text-zinc-500">TL/m²</span></div>
              </div>
              <div className="text-right">
                <div className="flex items-center gap-1.5 justify-end text-emerald-500 font-bold text-sm">
                  <TrendingUp className="w-4 h-4" /> Yükselen Trend
                </div>
              </div>
            </div>
            
            <div className="h-2 w-full bg-zinc-800/20 rounded-full overflow-hidden">
              <div className="h-full bg-indigo-500 w-[75%] rounded-full shadow-lg shadow-indigo-500/50" />
            </div>
          </div>
        </section>

        {/* 6. VALUE INCREASE CHART (CSS BARS) */}
        <section className={`p-8 rounded-[40px] transition-all ${isDarkMode ? 'bg-zinc-900/40 border border-zinc-800/50' : 'bg-white border border-zinc-200 shadow-xl'}`}>
          <div className="flex justify-between items-start mb-10">
            <div>
              <h3 className="text-sm font-black uppercase tracking-widest text-zinc-500 mb-1">DEĞER PROJEKSİYONU</h3>
              <div className="text-3xl font-black text-emerald-500">+%182</div>
              <span className="text-[10px] font-medium text-zinc-500 uppercase">Gelecek 5 Yıl Tahmini Artış</span>
            </div>
          </div>
          
          <div className="flex items-end justify-between h-40 gap-3">
            {[30, 45, 40, 60, 55, 85, 100].map((h, i) => (
              <div key={i} className="flex-1 group relative">
                <div 
                  className={`w-full rounded-2xl transition-all duration-700 ease-out hover:opacity-80 cursor-pointer ${i === 6 ? 'bg-indigo-500 shadow-lg shadow-indigo-500/30' : 'bg-indigo-500/20'}`}
                  style={{ height: `${h}%` }}
                />
                <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[8px] font-black text-zinc-500 tracking-tighter">202{4+i}</div>
              </div>
            ))}
          </div>
        </section>

        {/* 7. HARCAMA VE VERGİ VERİLERİ (Requested) */}
        <section className={`p-8 rounded-[40px] transition-all ${isDarkMode ? 'bg-zinc-900/40 border border-zinc-800/50' : 'bg-white border border-zinc-200 shadow-xl'}`}>
          <h3 className={`text-sm font-black uppercase tracking-widest mb-6 ${isDarkMode ? 'text-white' : 'text-zinc-900'}`}>Alım/Satım Analizi</h3>
          
          <div className="space-y-4">
            <div className={`p-5 rounded-3xl ${isDarkMode ? 'bg-zinc-950/50 border border-zinc-800' : 'bg-zinc-50 border border-zinc-100'}`}>
              <div className="flex items-center gap-3 mb-4">
                <Calculator className="w-5 h-5 text-indigo-500" />
                <span className="text-xs font-black uppercase tracking-wider">Tahmini Masraflar</span>
              </div>
              <div className="space-y-3">
                <SpendingRow label="Tapu Harcı (%4)" value={spendingData.tapuHarci} isDark={isDarkMode} />
                <SpendingRow label="Emlak Komisyonu (%2)" value={spendingData.komisyon} isDark={isDarkMode} />
                <SpendingRow label="Döner Sermaye / Masraf" value="8.500 TL" isDark={isDarkMode} />
                <div className="pt-3 mt-3 border-t border-zinc-800 flex justify-between items-center">
                  <span className="text-xs font-black uppercase">TOPLAM EK MALİYET</span>
                  <span className="text-lg font-black text-indigo-500">{spendingData.toplam}</span>
                </div>
              </div>
            </div>

            <div className={`p-5 rounded-3xl border transition-all ${taxInfo.isExempt ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-amber-500/5 border-amber-500/20'}`}>
              <div className="flex items-center gap-3 mb-3">
                <ShieldAlert className={`w-5 h-5 ${taxInfo.isExempt ? 'text-emerald-500' : 'text-amber-500'}`} />
                <span className="text-xs font-black uppercase tracking-wider">Vergi Durumu</span>
              </div>
              <p className={`text-xs leading-relaxed ${isDarkMode ? 'text-zinc-400' : 'text-zinc-600'}`}>
                {taxInfo.message}
              </p>
            </div>
          </div>
        </section>

        {/* 8. NEARBY POINTS OF INTEREST */}
        <section className="space-y-4">
          <h3 className={`px-2 text-[10px] font-black uppercase tracking-[0.2em] ${isDarkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>ÇEVRESEL AVANTAJLAR</h3>
          <div className="grid grid-cols-2 gap-4">
            <PoiCard icon={<Navigation className="w-4 h-4 text-indigo-400" />} title="Ulaşım" dist="500m" isDark={isDarkMode} />
            <PoiCard icon={<Briefcase className="w-4 h-4 text-emerald-400" />} title="Merkez" dist="1.2km" isDark={isDarkMode} />
            <PoiCard icon={<GraduationCap className="w-4 h-4 text-amber-400" />} title="Eğitim" dist="2.5km" isDark={isDarkMode} />
            <PoiCard icon={<Hospital className="w-4 h-4 text-purple-400" />} title="Sağlık" dist="800m" isDark={isDarkMode} />
          </div>
        </section>

        {/* 9. REPORT CONTENT SECTIONS (Cleaned) */}
        <section className="space-y-6">
          <h3 className={`px-2 text-[10px] font-black uppercase tracking-[0.2em] ${isDarkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>DETAYLI ANALİZ NOTLARI</h3>
          <div className="space-y-4">
            {sections.map((sec, i) => (
              <div key={i} className={`p-8 rounded-[40px] space-y-4 transition-all ${isDarkMode ? 'bg-zinc-900/40 border border-zinc-800/50' : 'bg-white border border-zinc-200 shadow-xl'}`}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-500">
                    <FileText className="w-5 h-5" />
                  </div>
                  <h4 className="text-lg font-black tracking-tight">{sec.title}</h4>
                </div>
                <p className={`text-sm leading-relaxed whitespace-pre-line ${isDarkMode ? 'text-zinc-400' : 'text-zinc-600'}`}>
                  {cleanCitations(sec.content)}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* 10. ADA/PARSEL VIEW */}
        <section className={`rounded-[40px] overflow-hidden relative group transition-all h-[400px] ${isDarkMode ? 'bg-zinc-900 border border-zinc-800' : 'bg-white shadow-2xl border border-zinc-200'}`}>
          <div className="w-full h-full bg-zinc-800 flex items-center justify-center relative">
             <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent z-10" />
             <div className="absolute inset-0 opacity-40 bg-[url('https://images.unsplash.com/photo-1524813092622-4997c28c502c?q=80&w=2000')] bg-cover bg-center" />
             
             <div className="absolute bottom-0 left-0 right-0 p-8 z-20 flex justify-between items-end">
               <div>
                 <h4 className="text-white font-black text-2xl leading-tight">Parsel <br /> Konumu</h4>
                 <p className="text-indigo-400 text-[10px] uppercase font-bold mt-2 tracking-widest">{research?.ada} Ada / {research?.parsel} Parsel</p>
               </div>
               <a 
                 href={`https://www.google.com/maps/search/?api=1&query=${research?.city}+${research?.district}+${research?.ada}+ada+${research?.parsel}+parsel`}
                 target="_blank"
                 className="px-6 py-4 bg-white text-black font-black rounded-2xl text-xs uppercase tracking-widest hover:scale-110 active:scale-95 transition-all shadow-2xl shadow-black/50"
               >
                 Haritada Aç
               </a>
             </div>
          </div>
        </section>

        {/* LEGAL FOOTER */}
        <footer className="px-4 py-10 text-center space-y-4">
          <div className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest leading-loose">
            © 2026 GAYRİMENKUL.AI <br />
            BU ANALİZ YAPAY ZEKA TARAFINDAN OLUŞTURULMUŞTUR. <br />
            RESMİ EKSPERTİZ BELGESİ DEĞİLDİR.
          </div>
          <div className="flex items-center justify-center gap-3 opacity-30">
            <div className="h-px w-8 bg-zinc-800" />
            <Building2 className="w-4 h-4" />
            <div className="h-px w-8 bg-zinc-800" />
          </div>
        </footer>

      </main>

      {/* BOTTOM NAVIGATION (Fixed Mobile) */}
      <nav className={`fixed bottom-0 left-0 right-0 z-[100] border-t px-8 py-6 transition-all duration-500 ${isDarkMode ? 'bg-zinc-950/80 backdrop-blur-2xl border-zinc-800 text-zinc-500' : 'bg-white/80 backdrop-blur-2xl border-zinc-200 text-zinc-400'} md:hidden`}>
        <div className="max-w-[480px] mx-auto flex items-center justify-between">
          <NavItem icon={<LayoutGrid />} label="Özet" isActive={activeTab === 'ozet'} onClick={() => setActiveTab('ozet')} />
          <NavItem icon={<Activity />} label="Analiz" isActive={activeTab === 'analiz'} onClick={() => setActiveTab('analiz')} />
          <NavItem icon={<TrendingUp />} label="Piyasa" isActive={activeTab === 'piyasa'} onClick={() => setActiveTab('piyasa')} />
          <NavItem icon={<User />} label="İletişim" isActive={activeTab === 'profil'} onClick={() => setActiveTab('profil')} />
        </div>
      </nav>

    </div>
  )
}

// UI HELPER COMPONENTS
function DetailRow({ icon, label, value, isDark }: { icon: React.ReactNode, label: string, value: string, isDark: boolean }) {
  return (
    <div className="flex items-center gap-5">
      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-colors ${isDark ? 'bg-zinc-800 text-indigo-400' : 'bg-indigo-50 text-indigo-600'}`}>
        {React.cloneElement(icon as React.ReactElement, { className: 'w-5 h-5' })}
      </div>
      <div>
        <span className={`text-[10px] font-bold uppercase tracking-widest block mb-0.5 ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>{label}</span>
        <span className="text-base font-black tracking-tight">{value}</span>
      </div>
    </div>
  )
}

function SpendingRow({ label, value, isDark }: { label: string, value: string, isDark: boolean }) {
  return (
    <div className="flex justify-between items-center text-xs">
      <span className={isDark ? 'text-zinc-500 font-medium' : 'text-zinc-500 font-medium'}>{label}</span>
      <span className="font-bold">{value}</span>
    </div>
  )
}

function PoiCard({ icon, title, dist, isDark }: { icon: React.ReactNode, title: string, dist: string, isDark: boolean }) {
  return (
    <div className={`p-5 rounded-[32px] border transition-all hover:scale-105 active:scale-95 cursor-pointer ${isDark ? 'bg-zinc-900/50 border-zinc-800' : 'bg-white border-zinc-200 shadow-md'}`}>
      <div className={`w-10 h-10 rounded-2xl flex items-center justify-center mb-4 ${isDark ? 'bg-zinc-950 text-indigo-400' : 'bg-indigo-50 text-indigo-600'}`}>
        {icon}
      </div>
      <div className="text-sm font-black tracking-tight">{title}</div>
      <div className="text-[10px] font-bold text-indigo-500 mt-1 uppercase tracking-widest">{dist}</div>
    </div>
  )
}

function NavItem({ icon, label, isActive, onClick }: { icon: React.ReactNode, label: string, isActive?: boolean, onClick?: () => void }) {
  return (
    <div onClick={onClick} className={`flex flex-col items-center gap-1.5 cursor-pointer transition-all ${isActive ? 'text-indigo-500 scale-110' : 'hover:text-zinc-200'}`}>
      {React.cloneElement(icon as React.ReactElement, { className: 'w-6 h-6' })}
      <span className="text-[8px] font-black uppercase tracking-[0.2em]">{label}</span>
    </div>
  )
}

// LOGIC HELPERS
function calculateAge(managementPlanDate?: string) {
  if (!managementPlanDate) return null
  const planDate = new Date(managementPlanDate)
  const currentYear = new Date().getFullYear()
  const age = currentYear - planDate.getFullYear()
  return age >= 0 ? age : 0
}

function calculateTaxStatus(acquisitionDate?: string, price?: number, ownerType: 'sahis' | 'sirket' = 'sahis') {
  if (!acquisitionDate) return { isExempt: true, message: 'Edinme tarihi bilgisi eksik, vergi muafiyeti teyit edilemedi.' }
  
  const acqDate = new Date(acquisitionDate)
  const currentDate = new Date()
  
  const yearsRequired = ownerType === 'sirket' ? 2 : 5
  const requiredMs = yearsRequired * 365.25 * 24 * 60 * 60 * 1000
  
  const isExempt = (currentDate.getTime() - acqDate.getTime()) > requiredMs
  const ownerLabel = ownerType === 'sirket' ? 'Kurumsal (Şirket)' : 'Bireysel (Şahıs)'
  
  if (isExempt) {
    return { 
      isExempt: true, 
      message: `Bu mülk ${ownerLabel} mülkiyetindedir ve ${yearsRequired} yıllık muafiyet süresini doldurduğu için satıldığında Gelir Vergisi (Değer Artış Kazancı) muafiyet kapsamındadır.` 
    }
  } else {
    return { 
      isExempt: false, 
      message: `Mülk ${ownerLabel} mülkiyetindedir. ${yearsRequired} yıllık muafiyet süresi henüz dolmamıştır. Satış durumunda kar üzerinden vergi çıkabilir.` 
    }
  }
}

function calculateSpendingData(minPriceStr: string) {
  const numericPrice = parseFloat(minPriceStr.replace(/[^0-9.]/g, '')) * (minPriceStr.toLowerCase().includes('m') ? 1000000 : 1)
  const tapuHarci = numericPrice * 0.04
  const komisyon = numericPrice * 0.02
  const toplam = tapuHarci + komisyon + 8500

  const format = (val: number) => val >= 1000000 ? (val/1000000).toFixed(1) + 'M TL' : (val/1000).toFixed(0) + 'k TL'

  return {
    tapuHarci: format(tapuHarci),
    komisyon: format(komisyon),
    toplam: format(toplam)
  }
}

function cleanCitations(text: string) {
  return text.replace(/\[\d+\]/g, '').trim()
}

function parseReportText(text: string) {
  if (!text) return { sections: [], scores: null, valuation: null }
  
  let scores = { yatirim: 7.8 }
  let valuation = { min: '2.5M', max: '3.2M', unitPrice: '18.5k' }

  // Extract JSON scores if present
  const scoreMatch = text.match(/SKORLAR:\s*(\{.*?\})/s)
  if (scoreMatch) {
    try {
      scores = JSON.parse(scoreMatch[1])
      text = text.replace(scoreMatch[0], '')
    } catch (e) {}
  }

  // Extract Price Range
  const priceMatch = text.match(/(\d+[.,]?\d*\s*[MkK]?)\s*-\s*(\d+[.,]?\d*\s*[MkK]?)/)
  if (priceMatch) {
    valuation.min = priceMatch[1]
    valuation.max = priceMatch[2]
  }

  const sectionRegex = /\*\*(.*?)\*\*\s*([\s\S]*?)(?=\*\*|$)/g
  const matches = [...text.matchAll(sectionRegex)]
  
  return {
    sections: matches.map(m => ({
      title: m[1].trim(),
      content: m[2].trim()
    })),
    scores,
    valuation
  }
}
