'use client'

import { motion } from 'framer-motion'
import { Search, Target, Settings, CheckCircle2, ArrowUpRight, Building2, GraduationCap } from 'lucide-react'
import { useRef, useState } from 'react'
import type { MouseEvent } from 'react'

const fadeUp = {
  hidden: { opacity: 0, y: 50, filter: 'blur(4px)' },
  visible: (i: number) => ({
    opacity: 1, y: 0, filter: 'blur(0px)',
    transition: { duration: 0.7, delay: i * 0.12, ease: [0.16, 1, 0.3, 1] }
  })
}

const steps = [
  { icon: <Search className="w-6 h-6" />, title: "Keşif & Analiz", desc: "Mevcut iş akışlarınızı birlikte dinliyor, AI ile optimize edilebilecek darboğazları tespit ediyoruz.", num: "01" },
  { icon: <Target className="w-6 h-6" />, title: "Sistem Tasarımı", desc: "İhtiyaçlarınıza en uygun yapay zeka araçlarını ve otomasyon senaryolarını birlikte haritalandırıyoruz.", num: "02" },
  { icon: <Settings className="w-6 h-6" />, title: "Kurulum & Entegrasyon", desc: "Sistemleri kuruyor, API bağlantılarını yapıyor ve birlikte test ediyoruz.", num: "03" },
  { icon: <CheckCircle2 className="w-6 h-6" />, title: "Eğitim & Teslim", desc: "Ekibinize sistemin nasıl kullanılacağını öğretiyor ve anahtar teslim bırakıyoruz.", num: "04" },
]

// ─── Hizmet Müşterileri (Logo Marquee) ─────────────────────────────────────────
const serviceClients = [
  { name: 'VARTUR', logo: '/images/logos/images (24).jpeg', invert: false },
  { name: 'musixXen', logo: '/images/logos/unnamed (4).jpg', invert: false },
  { name: 'CAM Hotel', logo: '/images/logos/cam-logo-new (3).webp', invert: false },
  { name: 'Rgwel', logo: '/images/logos/rgwel-logo.png', invert: false },
  { name: 'Forbest', logo: '/images/logos/images (8).png', invert: false },
  { name: 'Acarsan', logo: '/images/logos/356395_259272.webp', invert: false },
  { name: 'WeBee', logo: '/images/logos/images (8) copy.png', invert: false },
  { name: 'VoyantAI', logo: '/images/logos/Screenshot 2026-03-16 at 22.06.12.png', invert: false },
  { name: 'Udemy', logo: '/images/logos/Udemy_logo.svg (1).png', invert: true },
  { name: 'GittiGidiyor', logo: '/images/logos/images (8) copy 2.png', invert: false },
]

// ─── Hizmet Referansları ─────────────────────────────────────────

type ServiceClient = {
  name: string;
  desc: string;
  gradient: string;
  bgGlow: string;
  logoDomain?: string;
  logo?: string;
};

const educationClients: ServiceClient[] = [
  {
    name: 'Çam Hotel Termal Resort',
    desc: 'Instagram, WhatsApp ve Messenger mesajları yapay zeka tarafından 7/24 her dilde tam otomatik cevaplanmaktadır.',
    gradient: 'from-emerald-500 to-teal-600',
    bgGlow: 'rgba(52, 211, 153, 0.12)',
    logoDomain: 'camhotel.com',
    logo: '/images/logos/cam-logo-new (3).webp'
  },
  {
    name: 'Forbest',
    desc: '17 farklı mağazanın stok sistemi yapay zeka tarafından tam otomatik takip edilmekte; satın alım departmanına akıllı analizler üretip raporlanmaktadır.',
    gradient: 'from-slate-400 to-slate-600',
    bgGlow: 'rgba(148, 163, 184, 0.12)',
    logoDomain: 'forbest.com.tr',
    logo: '/images/logos/images (8).png'
  },
  {
    name: 'Voyant AI',
    desc: 'Haftalık performans raporları NETN otomasyonuyla tam otomatik hale getirildi.',
    gradient: 'from-violet-500 to-purple-700',
    bgGlow: 'rgba(139, 92, 246, 0.12)',
    logoDomain: 'voyant.ai',
    logo: '/images/logos/Screenshot 2026-03-16 at 22.06.12.png'
  },
  {
    name: 'Vartur',
    desc: 'WhatsApp otomasyonu sayesinde binlerce müşteriye her gün düzenli kontrol ettikleri kanaldan (WhatsApp\'tan) 50\'nin üzerinde reklam kampanyası düzenlendi.',
    gradient: 'from-orange-500 to-amber-600',
    bgGlow: 'rgba(249, 115, 22, 0.12)',
    logoDomain: 'vartur.com',
    logo: '/images/logos/images (24).jpeg'
  },
  {
    name: 'WeBee',
    desc: 'Otellerin sosyal medya mesajlarının tam otomatik cevaplandırıldığı yapay zeka ürünü, WeBee Insta adıyla yayınlandı.',
    gradient: 'from-cyan-500 to-blue-600',
    bgGlow: 'rgba(6, 182, 212, 0.12)',
    logoDomain: 'webee.com',
    logo: '/images/logos/images (8) copy.png'
  },
  {
    name: 'Sweatcoin App',
    desc: 'Influencer iletişim süreçlerinde Google Sheet, Notion ve Gmail entegrasyonlarıyla bütün iletişim süreçleri tam otomatikleştirildi.',
    gradient: 'from-orange-600 to-red-500',
    bgGlow: 'rgba(234, 88, 12, 0.12)',
    logoDomain: 'sweatco.in'
  },
]

function RefCard({ client, index }: { client: typeof educationClients[0]; index: number }) {
  const cardRef = useRef<HTMLDivElement>(null)
    const [imgError, setImgError] = useState(false)

  const handleMouse = (e: MouseEvent) => {
    if (!cardRef.current) return
    const rect = cardRef.current.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    cardRef.current.style.setProperty('--mouse-x', `${x}%`)
    cardRef.current.style.setProperty('--mouse-y', `${y}%`)
  }

  return (
    <motion.div
      ref={cardRef}
      variants={fadeUp}
      custom={index}
      onMouseMove={handleMouse}
      className="bento-card !rounded-3xl group relative overflow-hidden"
    >
      <div
        className="absolute -top-px left-[15%] right-[15%] h-[1px] opacity-40 group-hover:opacity-100 transition-opacity duration-500"
        style={{ background: `linear-gradient(90deg, transparent, ${client.bgGlow.replace('0.12', '0.9')}, transparent)` }}
      />
      <div
        className="absolute -top-10 -right-10 w-[180px] h-[180px] rounded-full blur-[80px] opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none"
        style={{ background: client.bgGlow }}
      />
      <div className="relative z-10">
        <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${client.gradient} flex items-center justify-center text-white shadow-lg mb-5 group-hover:scale-110 transition-transform duration-500 overflow-hidden`}>
          {client.logo ? (
            <img 
              src={client.logo} 
              alt={`${client.name} logo`} 
              className="w-full h-full object-contain bg-white p-2"
            />
          ) : !imgError && client.logoDomain ? (
            <img 
              src={`https://www.google.com/s2/favicons?domain=${client.logoDomain}&sz=128`} 
              alt={`${client.name} logo`} 
              className="w-full h-full object-cover bg-white p-1.5"
              onError={() => setImgError(true)}
            />
          ) : (
            <GraduationCap className="w-6 h-6" />
          )}
        </div>
        <h4 className="text-lg font-bold text-white mb-2">{client.name}</h4>
        <p className="text-gray-500 text-sm leading-relaxed">{client.desc}</p>
      </div>
    </motion.div>
  )
}

export function ServicesSection() {
  return (
    <section id="services" className="py-32 relative">
      <div className="section-divider max-w-5xl mx-auto mb-32" />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        <motion.div 
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.3 }}
          className="text-center max-w-3xl mx-auto mb-24"
        >
          <motion.span variants={fadeUp} custom={0} className="inline-block text-electric-blue text-sm font-semibold tracking-[0.2em] uppercase mb-4">
            Hizmetler
          </motion.span>
          <motion.h2 variants={fadeUp} custom={1} className="text-4xl md:text-6xl font-bold mb-6 tracking-tight text-white">
            Danışmanlık &{' '}
            <span className="text-gradient-accent">Otomasyon</span>
          </motion.h2>
          <motion.p variants={fadeUp} custom={2} className="text-gray-400 text-lg leading-relaxed">
            Sadece standart paketler değil, kurumsal firmalar ve hacimli operasyonlar 
            için terzi işi yapay zeka altyapılarını birlikte kuruyoruz.
          </motion.p>
        </motion.div>

        {/* Process Steps — Bento Style */}
        <motion.div 
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.1 }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-24"
        >
          {steps.map((step, i) => (
            <motion.div 
              key={i}
              variants={fadeUp}
              custom={i}
              className="bento-card !rounded-3xl group relative"
            >
              <span className="absolute top-4 right-4 text-5xl font-bold text-white/[0.03] group-hover:text-white/[0.06] transition-all duration-500">
                {step.num}
              </span>
              
              <div className="w-12 h-12 rounded-2xl bg-electric-blue/10 border border-electric-blue/20 flex items-center justify-center mb-6 text-electric-blue group-hover:scale-110 transition-transform duration-500">
                {step.icon}
              </div>
              <h4 className="text-lg font-bold text-white mb-3">{step.title}</h4>
              <p className="text-gray-500 text-sm leading-relaxed">{step.desc}</p>
            </motion.div>
          ))}
        </motion.div>

        {/* Logo Marquee */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.3 }}
          className="mb-32"
        >
          <motion.div variants={fadeUp} custom={0} className="flex items-center gap-3 justify-center mb-10">
            <Building2 className="w-4 h-4 text-electric-blue" />
            <span className="text-sm font-semibold text-gray-500 uppercase tracking-[0.2em]">Hizmet Verdiğimiz Markalar</span>
          </motion.div>

          <motion.div
            variants={fadeUp}
            custom={1}
            className="relative py-8 rounded-3xl overflow-hidden"
            style={{
              background: 'linear-gradient(135deg, rgba(255,255,255,0.015) 0%, rgba(0,212,255,0.02) 50%, rgba(124,58,237,0.015) 100%)',
              border: '1px solid rgba(255,255,255,0.04)',
            }}
          >
            <div className="absolute left-0 top-0 bottom-0 w-20 bg-gradient-to-r from-[#050508] to-transparent z-10 pointer-events-none" />
            <div className="absolute right-0 top-0 bottom-0 w-20 bg-gradient-to-l from-[#050508] to-transparent z-10 pointer-events-none" />

            <div className="flex animate-[marquee_30s_linear_infinite] hover:[animation-play-state:paused]">
              {[...serviceClients, ...serviceClients].map((client, i) => (
                <div
                  key={`${client.name}-${i}`}
                  className="flex-shrink-0 px-10 md:px-14 flex items-center justify-center"
                >
                  <img
                    src={client.logo}
                    alt={client.name}
                    className={`h-10 md:h-12 w-auto object-contain opacity-50 hover:opacity-100 transition-all duration-500 select-none ${client.invert ? 'invert' : ''}`}
                  />
                </div>
              ))}
            </div>
          </motion.div>
        </motion.div>

        {/* ═══════════════════════════════════════════════════════════════════════ */}
        {/*  ÇÖZÜM ORTAKLARIMIZ                                                   */}
        {/* ═══════════════════════════════════════════════════════════════════════ */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.1 }}
          className="mb-32"
        >
          <motion.div variants={fadeUp} custom={0} className="text-center max-w-3xl mx-auto mb-14">
            <div className="flex items-center gap-3 justify-center mb-4">
              <Building2 className="w-4 h-4 text-accent-purple" />
              <span className="text-sm font-semibold text-gray-500 uppercase tracking-[0.2em]">Çözüm Ortaklarımız</span>
            </div>
            <motion.h3 variants={fadeUp} custom={1} className="text-2xl md:text-4xl font-bold tracking-tight mb-4 text-white">
              Birlikte çalıştığımız{' '}
              <span className="text-gradient-accent">kurumlar</span>
            </motion.h3>
            <motion.p variants={fadeUp} custom={2} className="text-gray-400 leading-relaxed">
              Birlikte çalıştığımız markalar için geliştirdiğimiz yapay zeka çözümleri.
            </motion.p>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.1 }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
          >
            {educationClients.map((client, i) => (
              <RefCard key={client.name} client={client} index={i} />
            ))}
          </motion.div>
        </motion.div>

        {/* Contact CTA */}
        <motion.div 
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          id="contact"
          className="bento-card !rounded-3xl !p-12 md:!p-16 text-center max-w-4xl mx-auto relative overflow-hidden"
        >
          <div className="absolute top-0 left-[10%] right-[10%] h-[1px] bg-gradient-to-r from-transparent via-electric-blue/40 to-transparent" />
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[400px] h-[200px] bg-electric-blue/5 blur-[100px] rounded-full pointer-events-none" />
          
          <h3 className="text-3xl md:text-4xl font-bold text-white mb-5 tracking-tight relative z-10">
            Projeyi Birlikte İnşa Edelim
          </h3>
          <p className="text-gray-400 mb-10 max-w-xl mx-auto relative z-10 leading-relaxed">
            Hizmetlerimiz, danışmanlık talepleriniz veya marka işbirlikleri için 
            bizimle doğrudan iletişime geçebilirsiniz.
          </p>
          <a href="mailto:[isim]@[WEB_SİTESİ]" className="group relative inline-flex items-center gap-2 px-10 py-4 rounded-2xl font-bold text-lg bg-gradient-to-r from-electric-blue/20 to-accent-purple/20 border border-electric-blue/30 hover:border-electric-blue/60 transition-all duration-500 hover:shadow-[0_0_50px_rgba(0,212,255,0.2)] z-10 text-white">
            [isim]@[WEB_SİTESİ]
            <ArrowUpRight className="w-5 h-5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </a>
        </motion.div>
        
      </div>
    </section>
  )
}
