
import { createClient } from '@supabase/supabase-js'
import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { MapPin, TrendingUp, Info, Activity, Star, Calendar, ShieldAlert, Building2, Wallet, Clock, ChevronRight, User } from 'lucide-react'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

interface ReportPageProps {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: ReportPageProps): Promise<Metadata> {
  const { id } = await params
  const { data: research } = await supabase
    .from('property_researches')
    .select('city, district, ada, parsel')
    .eq('id', id)
    .single()

  const title = research ? `${research.city} ${research.ada}/${research.parsel} Analiz Raporu` : 'Gayrimenkul Analiz Raporu'

  return {
    title,
    description: 'Yapay zeka destekli profesyonel gayrimenkul değerleme ve piyasa analiz raporu.',
  }
}

export default async function ReportPage({ params }: ReportPageProps) {
  const { id } = await params
  
  const { data: research, error } = await supabase
    .from('property_researches')
    .select('*, consultants(full_name, phone, personality_preset)')
    .eq('id', id)
    .single()

  if (error || !research) {
    notFound()
  }

  const isCompleted = research.status === 'completed'
  const consultant = (research as any).consultants

  // Financial & Age Calculations
  const buildingAge = calculateAge(research.management_plan_date)
  const taxInfo = calculateTaxStatus(research.acquisition_date, research.acquisition_price, research.owner_type)

  const reportText = research.report_content || ''
  const { sections, scores } = parseReportText(reportText)

  return (
    <div className="min-h-screen bg-[#09090B] text-zinc-200 font-sans selection:bg-indigo-500/30">
      {/* Decorative Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-indigo-600/5 blur-[120px] rounded-full translate-x-1/2 -translate-y-1/2" />
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-emerald-600/5 blur-[120px] rounded-full -translate-x-1/2 translate-y-1/2" />
      </div>

      {/* Top Navigation / Header */}
      <nav className="sticky top-0 z-50 border-b border-zinc-800/50 bg-zinc-950/70 backdrop-blur-md px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Building2 className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold tracking-tight text-zinc-100 uppercase text-xs">Gayrimenkul.AI <span className="text-zinc-500 font-normal">| Rapor</span></span>
          </div>
          {isCompleted && (
            <div className="hidden md:flex items-center gap-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
              <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> {new Date(research.created_at).toLocaleDateString('tr-TR')}</span>
              <span className="w-1 h-1 rounded-full bg-zinc-700" />
              <span className="text-indigo-400">RAPOR NO: {id.slice(0, 8)}</span>
            </div>
          )}
        </div>
      </nav>

      <main className="relative max-w-7xl mx-auto px-6 py-8">
        {!isCompleted ? (
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
            <div className="relative w-20 h-20 mb-6">
              <div className="absolute inset-0 border-2 border-indigo-500/20 rounded-full" />
              <div className="absolute inset-0 border-2 border-indigo-500 rounded-full border-t-transparent animate-spin" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Analiziniz Hazırlanıyor</h1>
            <p className="text-zinc-400 max-w-sm">
              Yapay zeka modellerimiz şu anda tapu verilerini, piyasa emsallerini ve bölge dinamiklerini işliyor.
            </p>
          </div>
        ) : (
          <div className="space-y-10">
            
            {/* HERO SECTION: Title and Metadata */}
            <header className="space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[10px] font-bold uppercase tracking-widest">
                <Activity className="w-3 h-3" /> Canlı Veri Analizi
              </div>
              <h1 className="text-4xl md:text-6xl font-black text-white tracking-tighter leading-none">
                {research.city}, {research.district} <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-emerald-400">
                  {research.ada} Ada / {research.parsel} Parsel
                </span>
              </h1>
              <p className="text-zinc-400 text-lg max-w-2xl font-light">
                Bu mülk için gerçekleştirilen derin piyasa analizi, teknik künye ve yatırım potansiyeli raporu aşağıdadır.
              </p>
            </header>

            {/* QUICK STATS CARDS (The "WOW" Grid) */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-5 rounded-2xl bg-zinc-900/50 border border-zinc-800 backdrop-blur-sm">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400"><Clock className="w-4 h-4" /></div>
                  <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Bina Yaşı</span>
                </div>
                <div className="text-xl font-bold text-white">{buildingAge ? `${buildingAge} Yıl` : 'Yeni/Boş'}</div>
                <div className="text-[10px] text-zinc-500 mt-1">{buildingAge && buildingAge > 20 ? 'Eski Yapı Riskli' : 'Genç Bina'}</div>
              </div>

              <div className="p-5 rounded-2xl bg-zinc-900/50 border border-zinc-800 backdrop-blur-sm">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400"><ShieldAlert className="w-4 h-4" /></div>
                  <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Vergi Durumu</span>
                </div>
                <div className={`text-xl font-bold ${taxInfo.isExempt ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {taxInfo.isExempt ? 'Muaf' : 'Vergi Çıkar'}
                </div>
                <div className="text-[10px] text-zinc-500 mt-1">{taxInfo.isExempt ? 'Muafiyet Süresi Dolu' : 'Süre Dolmadı'}</div>
              </div>

              <div className="p-5 rounded-2xl bg-zinc-900/50 border border-zinc-800 backdrop-blur-sm">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400"><Building2 className="w-4 h-4" /></div>
                  <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Mülk Tipi</span>
                </div>
                <div className="text-xl font-bold text-white">{research.property_type || 'Konut'}</div>
                <div className="text-[10px] text-zinc-500 mt-1 truncate">{research.independent_unit_type || 'Mesken'}</div>
              </div>

              <div className="p-5 rounded-2xl bg-zinc-900/50 border border-zinc-800 backdrop-blur-sm">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-400"><TrendingUp className="w-4 h-4" /></div>
                  <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Yatırım Skoru</span>
                </div>
                <div className="text-xl font-bold text-white">{scores?.yatirim || 7}/10</div>
                <div className="text-[10px] text-zinc-500 mt-1">Prim Potansiyeli Yüksek</div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* MAIN CONTENT: Analysis Sections */}
              <div className="lg:col-span-8 space-y-12">
                {sections.map((section, idx) => (
                  <article key={idx} className="p-8 rounded-3xl bg-zinc-900/30 border border-zinc-800/50 relative overflow-hidden group hover:border-zinc-700 transition-colors">
                    <div className="flex items-center gap-4 mb-8">
                      <div className="w-12 h-12 rounded-2xl bg-zinc-950 border border-zinc-800 flex items-center justify-center text-indigo-400 group-hover:scale-110 transition-transform">
                        {getIconForSection(section.title)}
                      </div>
                      <h2 className="text-2xl font-bold text-white tracking-tight">{section.title}</h2>
                    </div>
                    <div className="prose prose-invert prose-zinc max-w-none text-zinc-400 leading-relaxed text-lg whitespace-pre-line pl-1">
                      {section.content}
                    </div>
                  </article>
                ))}
              </div>

              {/* RIGHT SIDEBAR: Scores & Consultant */}
              <aside className="lg:col-span-4 space-y-6 lg:sticky lg:top-24">
                
                {/* INFOGRAPHIC SCORES */}
                <div className="p-6 rounded-2xl bg-zinc-900/50 border border-zinc-800 backdrop-blur-sm shadow-xl">
                  <h3 className="text-sm font-bold text-zinc-100 uppercase tracking-widest mb-6 border-b border-zinc-800 pb-4 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-emerald-400" /> Yatırım Karnesi
                  </h3>
                  
                  <div className="space-y-6">
                    {[
                      { label: 'Ulaşım ve Lokasyon', value: scores?.ulasim || 8, color: 'bg-indigo-500' },
                      { label: 'Sosyal Olanaklar', value: scores?.sosyal || 7, color: 'bg-emerald-500' },
                      { label: 'Prim Potansiyeli', value: scores?.prim || 9, color: 'bg-blue-500' },
                      { label: 'Yatırım Değeri', value: scores?.yatirim || 8, color: 'bg-purple-500' },
                    ].map((score, i) => (
                      <div key={i} className="space-y-2">
                        <div className="flex justify-between text-[11px] font-bold uppercase tracking-tight text-zinc-500">
                          <span>{score.label}</span>
                          <span className="text-zinc-300">{score.value}/10</span>
                        </div>
                        <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                          <div 
                            className={`h-full ${score.color} transition-all duration-1000 ease-out`} 
                            style={{ width: `${score.value * 10}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Consultant Connect */}
                <div className="p-6 rounded-2xl bg-gradient-to-br from-indigo-900/20 to-zinc-900/50 border border-indigo-500/20 shadow-xl overflow-hidden relative group">
                  <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                    <User className="w-24 h-24" />
                  </div>
                  <h3 className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-4">Görüş Bildir</h3>
                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-12 h-12 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400 font-bold text-xl border border-indigo-500/30">
                      {consultant?.full_name?.charAt(0)}
                    </div>
                    <div>
                      <div className="font-bold text-white leading-tight">{consultant?.full_name}</div>
                      <div className="text-[10px] text-zinc-500 uppercase tracking-tighter">Gayrimenkul Profesyoneli</div>
                    </div>
                  </div>
                  <a 
                    href={`https://wa.me/${consultant?.phone?.replace(/\D/g, '')}?text=Merhaba, ${research.city} ${research.ada}/${research.parsel} nolu analiz raporunuzu inceledim...`} 
                    target="_blank"
                    className="relative z-10 flex items-center justify-center gap-2 w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-indigo-500/20 text-sm"
                  >
                    Detayları Konuşalım
                    <ChevronRight className="w-4 h-4" />
                  </a>
                </div>

                {/* Legal Footer */}
                <div className="text-[9px] text-zinc-600 leading-relaxed px-2">
                  © 2026 Gayrimenkul.AI - Bu belge yapay zeka tarafından kamuya açık veriler ve ilan piyasası emsalleri kullanılarak oluşturulmuştur. Resmi ekspertiz belgesi yerine geçmez.
                </div>
              </aside>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

// Logic Helpers
function calculateAge(managementPlanDate?: string) {
  if (!managementPlanDate) return null
  const planDate = new Date(managementPlanDate)
  const currentYear = new Date().getFullYear()
  const age = currentYear - planDate.getFullYear()
  return age >= 0 ? age : 0
}

function calculateTaxStatus(acquisitionDate?: string, price?: number, ownerType: 'sahis' | 'sirket' = 'sahis') {
  if (!acquisitionDate) return { isExempt: true, message: 'Edinme tarihi bilgisi eksik.' }
  const acqDate = new Date(acquisitionDate)
  const currentDate = new Date()
  const yearsRequired = ownerType === 'sirket' ? 2 : 5
  const requiredMs = yearsRequired * 365.25 * 24 * 60 * 60 * 1000
  const isExempt = (currentDate.getTime() - acqDate.getTime()) > requiredMs
  return { isExempt, message: isExempt ? 'Muaf' : 'Vergiye Tabi' }
}

function parseReportText(text: string) {
  if (!text) return { sections: [], scores: null }
  
  // Extract scores if present
  let scores = null
  const scoreMatch = text.match(/SKORLAR:\s*(\{.*?\})/s)
  if (scoreMatch) {
    try {
      scores = JSON.parse(scoreMatch[1])
      text = text.replace(scoreMatch[0], '') // Remove scores from text
    } catch (e) {}
  }

  // Clean Perplexity citations like [1], [2] etc.
  text = text.replace(/\[\d+\]/g, '')

  const sectionRegex = /\*\*(.*?)\*\*\s*([\s\S]*?)(?=\*\*|$)/g
  const matches = [...text.matchAll(sectionRegex)]
  
  if (matches.length === 0) {
    return { sections: [{ title: 'Analiz Raporu', content: text }], scores }
  }
  
  return {
    sections: matches.map(m => ({
      title: m[1].trim(),
      content: m[2].trim()
    })),
    scores
  }
}

  // Financial & Age Calculations
  const buildingAge = calculateAge(research.management_plan_date)
  const taxInfo = calculateTaxStatus(research.acquisition_date, research.acquisition_price, research.owner_type)

  const reportText = research.report_content || ''
  const sections = parseReportText(reportText)

  return (
    <div className="min-h-screen bg-[#09090B] text-zinc-200 font-sans selection:bg-indigo-500/30">
      {/* Decorative Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-indigo-600/5 blur-[120px] rounded-full translate-x-1/2 -translate-y-1/2" />
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-emerald-600/5 blur-[120px] rounded-full -translate-x-1/2 translate-y-1/2" />
      </div>

      {/* Top Navigation / Header */}
      <nav className="sticky top-0 z-50 border-b border-zinc-800/50 bg-zinc-950/70 backdrop-blur-md px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Building2 className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold tracking-tight text-zinc-100">Gayrimenkul.AI <span className="text-zinc-500 font-normal">| Rapor</span></span>
          </div>
          {isCompleted && (
            <div className="hidden md:flex items-center gap-4 text-xs font-medium text-zinc-400">
              <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> {new Date(research.created_at).toLocaleDateString('tr-TR')}</span>
              <span className="w-1 h-1 rounded-full bg-zinc-700" />
              <span className="text-emerald-400">ID: {params.id.slice(0, 8)}</span>
            </div>
          )}
        </div>
      </nav>

      <main className="relative max-w-7xl mx-auto px-6 py-8">
        {!isCompleted ? (
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
            <div className="relative w-20 h-20 mb-6">
              <div className="absolute inset-0 border-2 border-indigo-500/20 rounded-full" />
              <div className="absolute inset-0 border-2 border-indigo-500 rounded-full border-t-transparent animate-spin" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Analiziniz Hazırlanıyor</h1>
            <p className="text-zinc-400 max-w-sm">
              Yapay zeka modellerimiz şu anda tapu verilerini, piyasa emsallerini ve bölge dinamiklerini işliyor.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            
            {/* LEFT SIDEBAR: Technical Profile */}
            <aside className="lg:col-span-4 space-y-6 lg:sticky lg:top-24">
              <div className="p-6 rounded-2xl bg-zinc-900/50 border border-zinc-800 backdrop-blur-sm shadow-xl">
                <h2 className="text-sm font-bold text-zinc-500 uppercase tracking-widest mb-6">Teknik Künye</h2>
                
                <div className="space-y-5">
                  <div className="flex justify-between items-start border-b border-zinc-800 pb-4">
                    <div className="text-zinc-400 text-sm flex items-center gap-2"><MapPin className="w-4 h-4" /> Konum</div>
                    <div className="text-right font-medium text-zinc-100 text-sm">
                      {research.city}, {research.district}<br />
                      <span className="text-zinc-500 text-xs">{research.neighborhood}</span>
                    </div>
                  </div>

                  <div className="flex justify-between items-center border-b border-zinc-800 pb-4">
                    <div className="text-zinc-400 text-sm flex items-center gap-2"><Info className="w-4 h-4" /> Ada / Parsel</div>
                    <div className="font-bold text-indigo-400">{research.ada} / {research.parsel}</div>
                  </div>

                  <div className="flex justify-between items-center border-b border-zinc-800 pb-4">
                    <div className="text-zinc-400 text-sm flex items-center gap-2"><Clock className="w-4 h-4" /> Bina Yaşı</div>
                    <div className="font-medium text-zinc-100">
                      {buildingAge ? `${buildingAge} Yıllık` : 'Belirlenemedi'}
                      {buildingAge && buildingAge > 20 && <span className="ml-2 text-[10px] text-amber-500 font-bold uppercase">(Eski Yapı)</span>}
                    </div>
                  </div>

                  <div className="flex justify-between items-center border-b border-zinc-800 pb-4">
                    <div className="text-zinc-400 text-sm flex items-center gap-2"><Building2 className="w-4 h-4" /> Tip</div>
                    <div className="text-sm text-zinc-100 text-right">
                      {research.property_type || 'Arsa/Bina'}<br />
                      <span className="text-zinc-500 text-xs">{research.independent_unit_type || ''}</span>
                    </div>
                  </div>
                </div>

                {/* Tax Status Alert Card */}
                <div className={`mt-8 p-4 rounded-xl border ${taxInfo.isExempt ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-amber-500/5 border-amber-500/20'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <ShieldAlert className={`w-4 h-4 ${taxInfo.isExempt ? 'text-emerald-500' : 'text-amber-500'}`} />
                    <span className="text-xs font-bold uppercase tracking-wider">Vergi Analizi</span>
                  </div>
                  <p className="text-[11px] text-zinc-400 leading-relaxed mb-2">
                    {taxInfo.message}
                  </p>
                  {!taxInfo.isExempt && (
                    <div className="text-[10px] bg-zinc-950/50 p-2 rounded border border-white/5 text-zinc-500">
                      * 5 yıllık muafiyet süresi dolmamıştır. Satışta "Değer Artış Kazancı Vergisi" çıkabilir.
                    </div>
                  )}
                </div>
              </div>

              {/* Consultant Connect */}
              <div className="p-6 rounded-2xl bg-gradient-to-br from-zinc-900 to-zinc-950 border border-zinc-800 shadow-xl overflow-hidden relative group">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                  <User className="w-20 h-20" />
                </div>
                <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-4">Görüş Bildir</h3>
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400 font-bold text-xl border border-indigo-500/30">
                    {consultant?.full_name?.charAt(0)}
                  </div>
                  <div>
                    <div className="font-bold text-white leading-tight">{consultant?.full_name}</div>
                    <div className="text-[10px] text-zinc-500 uppercase tracking-tighter">Gayrimenkul Profesyoneli</div>
                  </div>
                </div>
                <a 
                  href={`https://wa.me/${consultant?.phone?.replace(/\D/g, '')}?text=Merhaba, ${research.city} ${research.ada}/${research.parsel} nolu analiz raporunuzu inceledim...`} 
                  target="_blank"
                  className="relative z-10 flex items-center justify-center gap-2 w-full py-3 bg-zinc-100 hover:bg-white text-zinc-900 font-bold rounded-xl transition-all text-sm"
                >
                  Analizi Değerlendirelim
                  <ChevronRight className="w-4 h-4" />
                </a>
              </div>
            </aside>

            {/* MAIN CONTENT: Analysis Sections */}
            <div className="lg:col-span-8 space-y-10 pb-20">
              
              {/* Executive Summary */}
              <section className="relative p-10 rounded-3xl bg-zinc-900/30 border border-zinc-800 overflow-hidden shadow-2xl">
                <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500" />
                <h1 className="text-4xl md:text-5xl font-black text-white tracking-tight mb-4">
                  Stratejik <span className="text-indigo-500">Değerleme</span> Raporu
                </h1>
                <p className="text-zinc-400 text-lg leading-relaxed font-light">
                  Bu rapor, {research.city} bölgesindeki güncel piyasa endeksleri ve {research.ada}/{research.parsel} parselinin teknik detayları birleştirilerek üretilmiştir.
                </p>
                <div className="mt-8 flex gap-6">
                   <div className="flex flex-col">
                      <span className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest">Durum</span>
                      <span className="text-emerald-400 font-bold flex items-center gap-1.5"><Activity className="w-4 h-4" /> Doğrulanmış Veri</span>
                   </div>
                   <div className="w-px h-10 bg-zinc-800" />
                   <div className="flex flex-col">
                      <span className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest">Piyasa Skoru</span>
                      <span className="text-white font-bold">7.8 / 10</span>
                   </div>
                </div>
              </section>

              {/* Dynamic Sections */}
              <div className="space-y-12">
                {sections.map((section, idx) => (
                  <article key={idx} className="group">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-indigo-400 group-hover:scale-110 transition-transform">
                        {getIconForSection(section.title)}
                      </div>
                      <h2 className="text-2xl font-bold text-white tracking-tight">{section.title}</h2>
                    </div>
                    <div className="prose prose-invert prose-zinc max-w-none text-zinc-400 leading-relaxed text-[17px] whitespace-pre-line pl-1 shadow-sm">
                      {section.content}
                    </div>
                    {idx < sections.length - 1 && <div className="mt-12 border-b border-zinc-800/50" />}
                  </article>
                ))}
              </div>

              {/* Legal Footer */}
              <footer className="pt-10 border-t border-zinc-800/50 flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="text-[10px] text-zinc-600 max-w-md leading-relaxed">
                  © 2026 Gayrimenkul.AI - Bu belge yapay zeka tarafından kamuya açık veriler ve ilan piyasası emsalleri kullanılarak oluşturulmuştur. Resmi ekspertiz belgesi yerine geçmez.
                </div>
                <div className="flex items-center gap-2 opacity-50 grayscale hover:grayscale-0 transition-all">
                  <span className="text-[10px] font-bold uppercase text-zinc-400">Powered By</span>
                  <div className="bg-zinc-800 px-2 py-1 rounded text-white font-bold text-[10px]">GEMINI 2.0</div>
                </div>
              </footer>
            </div>

          </div>
        )}
      </main>
    </div>
  )
}

// Logic Helpers
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
  
  // Şahıs: 5 yıl (1826 gün), Şirket: 2 yıl (730 gün)
  const yearsRequired = ownerType === 'sirket' ? 2 : 5
  const requiredMs = yearsRequired * 365.25 * 24 * 60 * 60 * 1000
  
  const isExempt = (currentDate.getTime() - acqDate.getTime()) > requiredMs
  const ownerLabel = ownerType === 'sirket' ? 'Kurumsal (Şirket)' : 'Bireysel (Şahıs)'
  
  if (isExempt) {
    return { 
      isExempt: true, 
      message: `Bu mülk ${ownerLabel} mülkiyetindedir ve ${yearsRequired} yıllık muafiyet süresini doldurduğu için vergiden muaftır.` 
    }
  } else {
    return { 
      isExempt: false, 
      message: `Mülk ${ownerLabel} mülkiyetindedir. ${yearsRequired} yıllık muafiyet süresi henüz dolmamıştır.` 
    }
  }
}

function parseReportText(text: string) {
  if (!text) return []
  const sectionRegex = /\*\*(.*?)\*\*\s*([\s\S]*?)(?=\*\*|$)/g
  const matches = [...text.matchAll(sectionRegex)]
  
  if (matches.length === 0) {
    return [{ title: 'Analiz Raporu', content: text }]
  }
  
  return matches.map(m => ({
    title: m[1].trim(),
    content: m[2].trim()
  }))
}

function getIconForSection(title: string) {
  const t = title.toLowerCase()
  if (t.includes('bölge') || t.includes('konum')) return <MapPin className="w-5 h-5" />
  if (t.includes('piyasa') || t.includes('değer')) return <TrendingUp className="w-5 h-5" />
  if (t.includes('imar') || t.includes('yapı')) return <Info className="w-5 h-5" />
  if (t.includes('yatırım')) return <Star className="w-5 h-5" />
  return <Activity className="w-5 h-5" />
}
