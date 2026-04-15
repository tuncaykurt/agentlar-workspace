'use client'

import { motion } from 'framer-motion'
import { useRef, useState } from 'react'
import type { MouseEvent } from 'react'
import { GraduationCap, Building, Target, Presentation, Briefcase, Zap, CheckCircle2 } from 'lucide-react'

const fadeUp = {
  hidden: { opacity: 0, y: 50, filter: 'blur(4px)' },
  visible: (i: number) => ({
    opacity: 1, y: 0, filter: 'blur(0px)',
    transition: { duration: 0.7, delay: i * 0.12, ease: [0.16, 1, 0.3, 1] }
  })
}

const educationClients = [
  {
    name: 'Türkiye Finans Katılım Bankası',
    desc: 'İkişer defa iki günlük yapay zeka araçları ve otomasyon workshopu düzenlendi.',
    gradient: 'from-emerald-500 to-teal-600',
    bgGlow: 'rgba(52, 211, 153, 0.12)',
    logoDomain: 'turkiyefinans.com.tr',
    logo: '/images/logos/turkiye-finans-logo.png'
  },
  {
    name: 'Misyon Bankası',
    desc: '6 saatlik online eğitim serisi (5 seans, 120 katılımcı) düzenlendi. Personel ile bire bir danışmanlık gerçekleştirildi.',
    gradient: 'from-slate-400 to-slate-600',
    bgGlow: 'rgba(148, 163, 184, 0.12)',
    logoDomain: 'misyon.com.tr'
  },
  {
    name: 'Başkent Üniversitesi',
    desc: 'Yapay zeka araçları eğitimi düzenlendi.',
    gradient: 'from-red-500 to-rose-600',
    bgGlow: 'rgba(239, 68, 68, 0.12)',
    logoDomain: 'baskent.edu.tr'
  },
  {
    name: 'Udemy',
    desc: '45.000+ öğrenciye eğitim verildi.',
    gradient: 'from-violet-500 to-purple-700',
    bgGlow: 'rgba(139, 92, 246, 0.12)',
    logoDomain: 'udemy.com',
    logo: '/images/logos/udemy-logo.png'
  },
  {
    name: 'GittiGidiyor',
    desc: 'GittiGidiyor Akademi\'nin tek resmi eğitmeni olarak satıcı eğitimleri düzenlendi.',
    gradient: 'from-orange-500 to-amber-600',
    bgGlow: 'rgba(249, 115, 22, 0.12)',
    logoDomain: 'gittigidiyor.com',
    logo: '/images/logos/gittigidiyor-logo.png'
  },
  {
    name: 'Trendyol',
    desc: 'Trendyol\'da mağaza açma ve satıcı olma eğitimi 15.000+ öğrenciye ulaştı.',
    gradient: 'from-orange-600 to-red-500',
    bgGlow: 'rgba(234, 88, 12, 0.12)',
    logoDomain: 'trendyol.com'
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
      className="bento-card !rounded-3xl group relative overflow-hidden p-8 border border-white/5 bg-[#0a0a0f] hover:border-white/10"
    >
      {/* Top accent */}
      <div
        className="absolute -top-px left-[15%] right-[15%] h-[1px] opacity-40 group-hover:opacity-100 transition-opacity duration-500"
        style={{ background: `linear-gradient(90deg, transparent, ${client.bgGlow.replace('0.12', '0.9')}, transparent)` }}
      />
      {/* Background glow on hover */}
      <div
        className="absolute -top-10 -right-10 w-[180px] h-[180px] rounded-full blur-[80px] opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none"
        style={{ background: client.bgGlow }}
      />

      <div className="relative z-10">
        {/* Icon + Name */}
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
        <h4 className="text-xl font-bold text-white mb-3">{client.name}</h4>
        <p className="text-gray-400 text-base leading-relaxed">{client.desc}</p>
      </div>
    </motion.div>
  )
}

export default function CorporateTrainingsPage() {
  const benefits = [
    "Çalışan verimliliğinde 3 kata varan artış",
    "Operasyonel süreçlerde yapay zekâ entegrasyonu",
    "Maliyetleri düşüren otomasyon sistemleri",
    "Sektörünüze özel AI kullanım haritaları",
  ]

  const features = [
    {
      icon: <Building className="w-8 h-8 text-electric-blue" />,
      title: "Şirkete Özel Müfredat",
      desc: "Standart eğitimler yerine şirketinize, departmanlarınıza ve hedeflerinize özel bir içerik hazırlıyoruz."
    },
    {
      icon: <Target className="w-8 h-8 text-[#f97316]" />,
      title: "Uygulamalı Dönüşüm",
      desc: "Sadece teorik anlatım değil, çalışanlarınızın anında kullanabileceği pratik araçlarla sahaya iniyoruz."
    },
    {
      icon: <Presentation className="w-8 h-8 text-accent-purple" />,
      title: "Yönetici Vizyonu",
      desc: "Karar alıcılar için yapay zekâyı stratejik bir büyüme argümanı olarak nasıl kullanacaklarını aktarıyoruz."
    }
  ]

  return (
    <div className="pt-32 pb-24 relative min-h-screen bg-[#050508] overflow-hidden">
      {/* Background Header Glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-accent-purple/5 blur-[120px] rounded-[100%] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        
        {/* Hero Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center mb-32">
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          >
            <span className="inline-block px-4 py-2 rounded-full bg-accent-purple/10 border border-accent-purple/20 text-accent-purple text-sm font-bold tracking-wider mb-6 uppercase">
              Kurumsal Eğitimler
            </span>
            <h1 className="text-4xl md:text-5xl font-bold text-white tracking-tight mb-8 leading-[1.1]">
              Şirketinizi <span className="text-gradient-accent">Yapay Zekâ</span> <br />
              Çağına Taşıyın
            </h1>
            <p className="text-gray-400 text-lg md:text-xl leading-relaxed mb-10">
              Uluslararası holdinglerden KOBİ'lere kadar her ölçekte şirketin yapay zekâ entegrasyonu sürecine liderlik ediyoruz. Ekibinizi AI ile tanıştırın, rekabette yıllarca öne geçin.
            </p>
            
            <ul className="space-y-4 mb-12">
              {benefits.map((benefit, i) => (
                <li key={i} className="flex items-center gap-3 text-gray-300">
                  <div className="w-6 h-6 rounded-full bg-white/5 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-4 h-4 text-accent-purple" />
                  </div>
                  <span>{benefit}</span>
                </li>
              ))}
            </ul>
            
            <a 
              href="mailto:[isim]@[WEB_SİTESİ]"
              className="inline-flex items-center justify-center px-8 py-4 text-base font-bold text-white bg-gradient-to-r from-accent-purple to-electric-blue hover:from-accent-violet hover:to-electric-blue border border-transparent rounded-2xl transition-all hover:scale-105 active:scale-95 shadow-[0_0_30px_rgba(124,58,237,0.3)] hover:shadow-[0_0_50px_rgba(124,58,237,0.5)]"
            >
              Kurumsal Talep Oluştur
            </a>
          </motion.div>
          
          <motion.div
            initial={{ opacity: 0, scale: 0.9, filter: 'blur(10px)' }}
            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
            transition={{ duration: 1, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="relative"
          >
            <div className="relative aspect-square w-full max-w-[500px] mx-auto rounded-[3rem] overflow-hidden border border-white/10 shadow-[0_0_60px_rgba(124,58,237,0.15)] bg-[#0c0c14]">
              {/* Fallback pattern or generic building image for hero, since actual kurumsal_holding.jpg might be missing */}
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/40 to-purple-900/40 opacity-80 mix-blend-luminosity" />
              
              <div className="absolute inset-0 bg-[url('/images/egitimler/egitim2.webp')] bg-cover bg-center opacity-70 hover:opacity-90 transition-all duration-1000" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#050508] via-[#050508]/40 to-[#050508]/20" />
              
              <div className="absolute bottom-10 left-10 right-10 flex flex-col items-center p-6 rounded-2xl bg-black/60 backdrop-blur-md border border-white/10">
                <div className="flex -space-x-4 mb-3">
                  <div className="w-12 h-12 rounded-full border-2 border-black bg-gradient-to-br from-electric-blue to-accent-purple flex items-center justify-center text-white"><Briefcase size={20} /></div>
                  <div className="w-12 h-12 rounded-full border-2 border-black bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center text-white"><Zap size={20} /></div>
                  <div className="w-12 h-12 rounded-full border-2 border-black bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center text-white"><Target size={20} /></div>
                </div>
                <p className="text-white text-sm font-semibold text-center">Geleceğin organizasyon yapısını birlikte kuralım.</p>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Kurumlar Grid */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.1 }}
          className="mb-32"
        >
          <motion.div variants={fadeUp} custom={0} className="text-center max-w-3xl mx-auto mb-14">
            <div className="flex items-center gap-3 justify-center mb-4">
              <GraduationCap className="w-5 h-5 text-accent-purple" />
              <span className="text-sm font-semibold text-gray-500 uppercase tracking-[0.2em]">Referanslar</span>
            </div>
            <motion.h3 variants={fadeUp} custom={1} className="text-3xl md:text-5xl font-bold tracking-tight mb-6 text-white">
              Birlikte çalıştığımız{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent-purple to-electric-blue">kurumlar</span>
            </motion.h3>
            <motion.p variants={fadeUp} custom={2} className="text-gray-400 text-lg leading-relaxed">
              Türkiye'nin önde gelen kurum ve kuruluşlarına yapay zeka eğitimleri ve danışmanlık hizmetleri sunduk.
            </motion.p>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.1 }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            {educationClients.map((client, i) => (
              <RefCard key={client.name} client={client} index={i} />
            ))}
          </motion.div>
        </motion.div>

        {/* Eğitimlerimizden Kareler (Gallery) */}
        <div className="mb-32 relative">
          <motion.div 
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center max-w-3xl mx-auto mb-14"
          >
             <h3 className="text-3xl font-bold text-white mb-4">Eğitimlerimizden Kareler</h3>
             <p className="text-gray-400 text-lg">Katılımcıların yapay zeka araçlarını canlı olarak deneyimlediği uygulamalı workshop süreçlerimizden görüntüler.</p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative z-10">
             <motion.div 
               initial={{ opacity: 0, x: -30 }} 
               whileInView={{ opacity: 1, x: 0 }} 
               viewport={{ once: true }}
               className="relative h-64 md:h-full rounded-3xl overflow-hidden border border-white/10 group"
             >
               <img src="/images/egitimler/egitim1.webp" alt="Kurumsal Eğitim" loading="lazy" className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-all duration-700" />
               <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-6">
                 <span className="text-white font-medium">Uygulamalı Atölye</span>
               </div>
             </motion.div>
             <div className="grid grid-cols-1 gap-6">
               <motion.div 
                 initial={{ opacity: 0, x: 30 }} 
                 whileInView={{ opacity: 1, x: 0 }} 
                 viewport={{ once: true }}
                 transition={{ delay: 0.2 }}
                 className="relative h-64 rounded-3xl overflow-hidden border border-white/10 group"
               >
                 <img src="/images/egitimler/egitim2.webp" alt="Kurumsal Eğitim" loading="lazy" className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-all duration-700" style={{ objectPosition: 'center 65%' }} />
                 <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-6">
                   <span className="text-white font-medium">İnteraktif Sunum</span>
                 </div>
               </motion.div>
               <motion.div 
                 initial={{ opacity: 0, x: 30 }} 
                 whileInView={{ opacity: 1, x: 0 }} 
                 viewport={{ once: true }}
                 transition={{ delay: 0.4 }}
                 className="relative h-64 rounded-3xl overflow-hidden border border-white/10 group bg-white/[0.02]"
               >
                 <img src="/images/egitimler/egitim3.webp" alt="Kurumsal Eğitim" loading="lazy" className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-all duration-700" style={{ objectPosition: 'center 75%' }} />
                 <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-6">
                   <span className="text-white font-medium">Birebir Danışmanlık</span>
                 </div>
               </motion.div>
             </div>
          </div>
        </div>

        {/* Features Grid */}
        <div className="mb-20">
          <motion.h3 
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center text-3xl font-bold text-white mb-16"
          >
            Neden Bizi Seçmelisiniz?
          </motion.h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {features.map((feature, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: i * 0.15, ease: [0.16, 1, 0.3, 1] }}
                className="bento-card group"
              >
                <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-8 group-hover:scale-110 transition-transform duration-500">
                  {feature.icon}
                </div>
                <h3 className="text-2xl font-bold text-white mb-4 tracking-tight">{feature.title}</h3>
                <p className="text-gray-400 leading-relaxed text-sm">
                  {feature.desc}
                </p>
              </motion.div>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
