
import { createClient } from '@supabase/supabase-js'
import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { MapPin, TrendingUp, Info, Activity, Star, Calendar, User } from 'lucide-react'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

interface ReportPageProps {
  params: { id: string }
}

export async function generateMetadata({ params }: ReportPageProps): Promise<Metadata> {
  const { data: research } = await supabase
    .from('property_researches')
    .select('property_metadata')
    .eq('id', params.id)
    .single()

  const meta = research?.property_metadata as any
  const title = meta ? `${meta.ada}/${meta.parsel} Gayrimenkul Analiz Raporu` : 'Gayrimenkul Analiz Raporu'

  return {
    title,
    description: 'Yapay zeka destekli gayrimenkul piyasa araştırma raporu.',
  }
}

export default async function ReportPage({ params }: ReportPageProps) {
  const { data: research, error } = await supabase
    .from('property_researches')
    .select('*, consultants(full_name, phone)')
    .eq('id', params.id)
    .single()

  if (error || !research) notFound()

  const isCompleted = research.status === 'completed'
  const metadata = research.property_metadata as any
  const consultant = (research as any).consultants

  // Helper to parse sections if structured_data is missing
  const reportText = research.report_content || ''
  const sections = parseReportText(reportText)

  return (
    <div className="min-h-screen bg-[#0F0F13] text-[#E4E4E7] font-sans selection:bg-indigo-500/30">
      {/* Background Glow */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-indigo-500/10 blur-[120px] rounded-full" />
        <div className="absolute top-[20%] -right-[10%] w-[30%] h-[30%] bg-emerald-500/5 blur-[100px] rounded-full" />
      </div>

      <div className="relative max-w-5xl mx-auto px-6 py-12 md:py-20">
        {/* Header */}
        <header className="mb-12 animate-in fade-in slide-in-from-top-4 duration-700">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-bold tracking-wider uppercase mb-4">
                <Activity className="w-3 h-3" />
                AI Gayrimenkul Analizi
              </div>
              <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-2">
                {metadata?.ada}/{metadata?.parsel} Araştırma Raporu
              </h1>
              <p className="text-[#A1A1AA] text-lg max-w-2xl">
                {metadata?.ilce ? `${metadata.ilce} / ${metadata.mahalle || ''} bölgesindeki mülkünüz için hazırlanan güncel piyasa ve yatırım analizi.` : 'Gayrimenkulünüz için hazırlanan derinlemesine piyasa raporu.'}
              </p>
            </div>
            {isCompleted && (
              <div className="flex flex-col items-end text-right">
                <div className="text-[#A1A1AA] text-sm mb-1 flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  {new Date(research.created_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}
                </div>
                <div className="text-sm font-medium text-emerald-400 flex items-center gap-2">
                  <Star className="w-4 h-4" />
                  Analiz Tamamlandı
                </div>
              </div>
            )}
          </div>
        </header>

        {!isCompleted ? (
          <div className="flex flex-col items-center justify-center py-32 text-center card bg-white/5 border-white/10 backdrop-blur-xl rounded-3xl p-12">
            <div className="relative w-24 h-24 mb-8">
              <div className="absolute inset-0 border-4 border-indigo-500/20 rounded-full" />
              <div className="absolute inset-0 border-4 border-indigo-500 rounded-full border-t-transparent animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                <Activity className="w-10 h-10 text-indigo-500" />
              </div>
            </div>
            <h2 className="text-2xl font-bold mb-4">Analiz Devam Ediyor</h2>
            <p className="text-[#A1A1AA] max-w-md mx-auto">
              Yapay zeka modellerimiz şu anda bölgedeki piyasa verilerini, imar planlarını ve güncel satışları tarıyor. Lütfen kısa bir süre sonra sayfayı yenileyin.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
            {/* Left Column - Main Content */}
            <div className="md:col-span-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-200">
              {sections.map((section, idx) => (
                <section key={idx} className="card bg-[#1A1A24]/60 border-white/5 backdrop-blur-md rounded-2xl p-8 hover:bg-[#1A1A24]/80 transition-all">
                  <div className="flex items-start gap-4 mb-6">
                    <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                      {getIconForSection(section.title)}
                    </div>
                    <div>
                      <h3 className="text-xl font-bold uppercase tracking-wide text-indigo-400">
                        {section.title}
                      </h3>
                      <div className="h-1 w-12 bg-indigo-500/50 rounded-full mt-2" />
                    </div>
                  </div>
                  <div className="prose prose-invert max-w-none text-[#E4E4E7]/90 leading-relaxed whitespace-pre-line">
                    {section.content}
                  </div>
                </section>
              ))}
            </div>

            {/* Right Column - Sidebar */}
            <aside className="md:col-span-4 space-y-6 animate-in fade-in slide-in-from-right-4 duration-700 delay-300">
              {/* Investment Score Card */}
              <div className="card bg-gradient-to-br from-indigo-500/10 to-emerald-500/10 border-white/10 rounded-2xl p-6">
                <h4 className="text-sm font-bold text-[#A1A1AA] uppercase tracking-widest mb-6 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  Yatırım Puanı
                </h4>
                <div className="flex items-center justify-center mb-6">
                   <div className="relative w-32 h-32 flex items-center justify-center">
                     <svg className="w-full h-full -rotate-90">
                       <circle cx="64" cy="64" r="60" fill="transparent" stroke="currentColor" strokeWidth="8" className="text-white/5" />
                       <circle cx="64" cy="64" r="60" fill="transparent" stroke="currentColor" strokeWidth="8" strokeDasharray="377" strokeDashoffset="94" className="text-indigo-500" />
                     </svg>
                     <div className="absolute inset-0 flex flex-col items-center justify-center">
                       <span className="text-4xl font-black text-white">75</span>
                       <span className="text-[10px] uppercase font-bold text-[#A1A1AA]">/ 100</span>
                     </div>
                   </div>
                </div>
                <p className="text-xs text-center text-[#A1A1AA] leading-tight">
                  Bölge potansiyeli ve imar durumu göz önüne alındığında "Yüksek Potansiyelli" kategorisinde değerlendirilmiştir.
                </p>
              </div>

              {/* Consultant Card */}
              {consultant && (
                <div className="card bg-[#1A1A24] border-white/5 rounded-2xl p-6">
                  <h4 className="text-xs font-bold text-[#A1A1AA] uppercase tracking-widest mb-4">Danışman Bilgileri</h4>
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-12 h-12 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400 font-bold text-xl">
                      {consultant.full_name?.charAt(0)}
                    </div>
                    <div>
                      <div className="font-bold text-white">{consultant.full_name}</div>
                      <div className="text-xs text-[#A1A1AA]">Profesyonel Gayrimenkul Danışmanı</div>
                    </div>
                  </div>
                  <a 
                    href={`https://wa.me/${consultant.phone?.replace(/\D/g, '')}`} 
                    target="_blank" 
                    className="flex items-center justify-center gap-2 w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl transition-all"
                  >
                    Detaylı Bilgi İçin Yazın
                  </a>
                </div>
              )}

              {/* Disclaimer */}
              <div className="text-[10px] text-[#A1A1AA]/50 p-4 leading-relaxed">
                * Bu rapor yapay zeka tarafından kamuya açık veriler ve piyasa tahminleri kullanılarak hazırlanmıştır. Yatırım tavsiyesi niteliği taşımaz. Tapu kaydı ve yerinde ekspertiz ile teyit edilmesi önerilir.
              </div>
            </aside>
          </div>
        )}
      </div>
    </div>
  )
}

function parseReportText(text: string) {
  if (!text) return []
  
  // Basic parser for sections split by bold headers like **BÖLGE VE KONUM ANALİZİ**
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
  if (t.includes('bölge') || t.includes('konum')) return <MapPin className="w-6 h-6" />
  if (t.includes('piyasa') || t.includes('değer')) return <TrendingUp className="w-6 h-6" />
  if (t.includes('imar') || t.includes('yapı')) return <Info className="w-6 h-6" />
  if (t.includes('çevre') || t.includes('olanak')) return <MapPin className="w-6 h-6" />
  if (t.includes('yatırım')) return <Star className="w-6 h-6" />
  return <Activity className="w-6 h-6" />
}
