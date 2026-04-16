'use client';

import { motion, useScroll, useTransform } from 'framer-motion';
import { useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import {
  Instagram, Youtube, Facebook, Users, GraduationCap,
  Mail, ArrowUpRight, Eye, ExternalLink, Heart,
  Globe, BarChart3, Activity, PieChart, Sparkles
} from 'lucide-react';

// ─── Custom Icons ──────────────────────────────────────────────────────────────
function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 0 0-.79-.05A6.34 6.34 0 0 0 3.15 15a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.6a8.2 8.2 0 0 0 4.76 1.52V6.69h-1z" />
    </svg>
  );
}

function SkoolIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

// ─── Animation Variants ────────────────────────────────────────────────────────
const fadeUp = {
  hidden: { opacity: 0, y: 50, filter: 'blur(4px)' },
  visible: (i: number) => ({
    opacity: 1, y: 0, filter: 'blur(0px)',
    transition: { duration: 0.7, delay: i * 0.1, ease: [0.16, 1, 0.3, 1] }
  })
};

const scaleIn = {
  hidden: { opacity: 0, scale: 0.8 },
  visible: (i: number) => ({
    opacity: 1, scale: 1,
    transition: { duration: 0.6, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }
  })
};

// ─── Counter Animation ─────────────────────────────────────────────────────────
function AnimatedCounter({ target, suffix = '', decimals = 0 }: { target: number; suffix?: string, decimals?: number }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const hasAnimated = useRef(false);

  const startCounting = () => {
    if (hasAnimated.current) return;
    hasAnimated.current = true;
    const duration = 2000;
    const steps = 60;
    const increment = target / steps;
    let current = 0;
    const timer = setInterval(() => {
      current += increment;
      if (current >= target) {
        setCount(target);
        clearInterval(timer);
      } else {
        setCount(current);
      }
    }, duration / steps);
  };

  const formatNumber = (num: number) => {
    return Number(num).toLocaleString('tr-TR', { maximumFractionDigits: decimals, minimumFractionDigits: decimals });
  };

  return (
    <motion.span
      ref={ref}
      onViewportEnter={startCounting}
      viewport={{ once: true }}
    >
      {formatNumber(count)}{suffix}
    </motion.span>
  );
}

// ─── Bento Card ─────────────────────────────────────────────────────────────────
function BentoCard({ children, className = '', custom = 0 }: { children: React.ReactNode; className?: string; custom?: number }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const handleMouse = (e: MouseEvent) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    cardRef.current.style.setProperty('--mouse-x', `${x}%`);
    cardRef.current.style.setProperty('--mouse-y', `${y}%`);
  };

  return (
    <motion.div
      ref={cardRef}
      variants={fadeUp}
      custom={custom}
      onMouseMove={handleMouse}
      className={`bento-card ${className}`}
    >
      {children}
    </motion.div>
  );
}

// ─── Social Media Platform Data ────────────────────────────────────────────────
const platforms = [
  {
    name: 'Instagram',
    handle: '@[SOSYAL_MEDYA_KULLANICI]',
    followers: '200.000+',
    icon: <Instagram className="w-6 h-6" />,
    gradient: 'from-pink-500 to-purple-600',
    bgGlow: 'rgba(236, 72, 153, 0.15)',
    textColor: 'text-pink-400',
    href: 'https://www.instagram.com/[SOSYAL_MEDYA_KULLANICI]/',
    metric: 'Takipçi',
    engagementLabel: 'Erişim / Post',
    engagementValue: '50.000+'
  },
  {
    name: 'TikTok',
    handle: '@[SOSYAL_MEDYA_KULLANICI]',
    followers: '37.000+',
    icon: <TikTokIcon className="w-6 h-6" />,
    gradient: 'from-cyan-400 to-blue-600',
    bgGlow: 'rgba(0, 212, 255, 0.15)',
    textColor: 'text-cyan-400',
    href: 'https://tiktok.com/@[SOSYAL_MEDYA_KULLANICI]',
    metric: 'Takipçi',
    engagementLabel: 'Ort. İzlenme',
    engagementValue: '100.000+'
  },
  {
    name: 'YouTube',
    handle: '@[SOSYAL_MEDYA_KULLANICI]',
    followers: '43.000+',
    icon: <Youtube className="w-6 h-6" />,
    gradient: 'from-red-500 to-orange-600',
    bgGlow: 'rgba(239, 68, 68, 0.15)',
    textColor: 'text-red-400',
    href: 'https://youtube.com/@[SOSYAL_MEDYA_KULLANICI]',
    metric: 'Abone',
    engagementLabel: 'Ort. İzlenme',
    engagementValue: '25.000+'
  },
  {
    name: 'Facebook',
    handle: '[İSİM SOYAD]',
    followers: '15.000+',
    icon: <Facebook className="w-6 h-6" />,
    gradient: 'from-blue-500 to-blue-700',
    bgGlow: 'rgba(59, 130, 246, 0.15)',
    textColor: 'text-blue-400',
    href: 'https://www.facebook.com/profile.php?id=61561973441859',
    metric: 'Takipçi',
    engagementLabel: 'Ort. Etkileşim',
    engagementValue: '5.000+'
  },
  {
    name: 'Udemy',
    handle: '[İSİM SOYAD]',
    followers: '45.000+',
    icon: <GraduationCap className="w-6 h-6" />,
    gradient: 'from-violet-500 to-purple-700',
    bgGlow: 'rgba(139, 92, 246, 0.15)',
    textColor: 'text-violet-400',
    href: 'https://www.udemy.com/course/ai-yapay-zeka-uzmanligi-chatgpt-midjourney-dalle-ve-fazlasi/?referralCode=906FDE49207D6106DCBF',
    metric: 'Öğrenci',
    engagementLabel: 'Eğitmen Puanı',
    engagementValue: '4.7 ⭐'
  },
  {
    name: 'Skool',
    handle: 'AI Factory',
    followers: '500+',
    icon: <SkoolIcon className="w-6 h-6" />,
    gradient: 'from-emerald-400 to-teal-600',
    bgGlow: 'rgba(52, 211, 153, 0.15)',
    textColor: 'text-emerald-400',
    href: 'https://www.skool.com/yapay-zeka-factory/about?ref=044f39496d4f45fab11775bcefe4b7f4',
    metric: 'Üye',
    engagementLabel: 'Topluluk',
    engagementValue: 'Premium'
  }
];

// ─── Highlight Stats ────────────────────────────────────────────────────────────
const highlightStats = [
  { icon: <Eye className="w-5 h-5" />, value: 10, suffix: 'M+', label: 'Aylık Ort. İzlenme', color: 'from-cyan-500 to-blue-600' },
  { icon: <Heart className="w-5 h-5" />, value: 300, suffix: '.000+', label: 'Aylık Etkileşim', color: 'from-pink-500 to-rose-600' },
  { icon: <Users className="w-5 h-5" />, value: 300, suffix: '.000+', label: 'Toplam Takipçi', color: 'from-violet-500 to-purple-600' },
  { icon: <Activity className="w-5 h-5" />, value: 100, suffix: 'M+', label: 'Toplam İzlenme', color: 'from-amber-400 to-orange-500' },
];

// ─── Demographics Data ─────────────────────────────────────────────────────────
const ageData = [
  { label: '18-24', value: 31.1, color: 'bg-blue-500' },
  { label: '25-34', value: 41.2, color: 'bg-purple-500' },
  { label: '35-44', value: 14.4, color: 'bg-pink-500' },
  { label: '45-54', value: 5.5, color: 'bg-orange-500' },
];

const countryData = [
  { label: 'Türkiye', value: 88.8, flag: '🇹🇷' },
  { label: 'Azerbaycan', value: 3.0, flag: '🇦🇿' },
  { label: 'Almanya', value: 1.6, flag: '🇩🇪' },
  { label: 'Kıbrıs', value: 0.7, flag: '🇨🇾' },
];

const virals = [
  { brand: 'Nim AI', views: '9.5M', type: 'Organik + Paid', href: 'https://www.instagram.com/reel/ORNEK_REEL_ID_2/', videoUrl: '/videos/reel1.mp4', gradient: 'from-violet-600 via-purple-500 to-fuchsia-500', iconBg: 'bg-violet-500/30' },
  { brand: 'Emergent AI', views: '3.8M', type: 'Organik', href: 'https://www.instagram.com/reel/ORNEK_REEL_ID_4/', videoUrl: '/videos/reel2.mp4', gradient: 'from-cyan-500 via-blue-600 to-indigo-600', iconBg: 'bg-cyan-500/30' },
  { brand: 'Aithor', views: '2.0M', type: 'Organik', href: 'https://www.instagram.com/reel/DKHLswaK4Tj/', videoUrl: '/videos/reel3.mp4', gradient: 'from-emerald-500 via-teal-500 to-cyan-500', iconBg: 'bg-emerald-500/30' },
  { brand: 'Creatify', views: '1.7M', type: 'Organik + Paid', href: 'https://www.instagram.com/reel/DJoR2pJqpHt/', videoUrl: '/videos/reel4.mp4', gradient: 'from-orange-500 via-rose-500 to-pink-600', iconBg: 'bg-orange-500/30' },
  { brand: 'Creati', views: '1.4M', type: 'Organik + Paid', href: 'https://www.instagram.com/reel/DNNcKWwq--T/', videoUrl: '/videos/reel5.mp4', gradient: 'from-pink-500 via-purple-600 to-blue-600', iconBg: 'bg-pink-500/30' },
  { brand: 'Kimi AI', views: '2.0M', type: 'Organik', href: 'https://www.instagram.com/reel/DUXxKHVCgW6/', videoUrl: '/videos/reel6.mp4', gradient: 'from-amber-500 via-orange-500 to-red-500', iconBg: 'bg-amber-500/30' },
];

const brands = ['CapCut', 'VidAU', 'Lexi', 'KickResume', 'TopView', 'Higgsfield'];

// ─── Viral Reel Card Component ─────────────────────────────────────────────────
// Instagram embeds (blockquote, iframe, /embed/) are all blocked for Reels.
// Premium poster card design with gradient background + play button overlay + background video.
// Clicking opens the Reel directly on Instagram.
function ViralReelCard({ brand, views, type, gradient, href, videoUrl }: {
  brand: string;
  views: string;
  type: string;
  gradient: string;
  href: string;
  videoUrl?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="group relative rounded-3xl overflow-hidden block cursor-pointer bg-black"
      style={{ aspectRatio: '9/16' }}
    >
      {/* Animated gradient border glow */}
      <div className={`absolute -inset-[1px] bg-gradient-to-br ${gradient} rounded-3xl opacity-30 group-hover:opacity-70 transition-opacity duration-500 blur-[2px]`} />

      {/* Dark card container */}
      <div className="relative h-full rounded-3xl overflow-hidden bg-[#0a0a0f] border border-white/[0.06]">

        {/* Background Video */}
        {videoUrl && (
          <video
            src={videoUrl}
            autoPlay
            loop
            muted
            playsInline
            className="absolute inset-0 w-full h-full object-cover opacity-50 group-hover:opacity-60 transition-opacity duration-700"
          />
        )}

        {/* Gradient background fill overlay */}
        <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-40 group-hover:opacity-60 mix-blend-color transition-opacity duration-700`} />

        {/* Decorative light blobs */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-[15%] left-[10%] w-32 h-32 rounded-full bg-white/[0.06] blur-2xl group-hover:bg-white/[0.12] transition-all duration-700" />
          <div className="absolute bottom-[25%] right-[5%] w-24 h-24 rounded-full bg-white/[0.04] blur-xl group-hover:bg-white/[0.08] transition-all duration-700" />
        </div>

        {/* Grid pattern overlay */}
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
            backgroundSize: '24px 24px',
          }}
        />

        {/* Center content — Instagram icon + play button */}
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
          <Instagram className="w-8 h-8 text-white/40 mb-4 group-hover:text-white/70 transition-colors duration-300" />
          <div className="relative">
            {/* Pulse ring */}
            <div className="absolute inset-0 w-16 h-16 rounded-full bg-white/10 animate-ping" style={{ animationDuration: '2.5s' }} />
            {/* Play button */}
            <div className="relative w-16 h-16 rounded-full bg-white/15 backdrop-blur-md border border-white/25 flex items-center justify-center group-hover:bg-white/25 group-hover:scale-110 group-hover:border-white/40 transition-all duration-300">
              <svg className="w-7 h-7 text-white fill-white ml-0.5 drop-shadow-lg" viewBox="0 0 24 24">
                <polygon points="5 3 19 12 5 21 5 3"/>
              </svg>
            </div>
          </div>
          <span className="mt-4 text-[10px] text-white/40 font-medium uppercase tracking-[0.2em] group-hover:text-white/80 transition-colors duration-300">
            Reels'i İzle
          </span>
        </div>

        {/* Top badge — view count */}
        <div className="absolute top-3 left-3 z-20 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/10">
          <Eye className="w-3 h-3 text-white/80" />
          <span className="text-xs font-bold text-white">{views}</span>
        </div>

        {/* Bottom overlay with brand info + type */}
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 via-black/40 to-transparent z-20">
          <h3 className="text-sm font-bold text-white mb-0.5 drop-shadow-md">{brand}</h3>
          <div className="text-[10px] text-white/50 font-medium uppercase tracking-wider">
            {type}
          </div>
        </div>

        {/* Hover inner glow */}
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-3xl"
          style={{ boxShadow: 'inset 0 0 80px rgba(255,255,255,0.08)' }}
        />
      </div>
    </a>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
export default function CollaborationsPage() {
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"]
  });
  const bgY = useTransform(scrollYProgress, [0, 1], [0, 150]);
  const textY = useTransform(scrollYProgress, [0, 1], [0, -50]);

  return (
    <div>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/*  HERO — MEDIA KIT BANNER                                            */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <section ref={heroRef} className="relative min-h-[85vh] flex items-center justify-center overflow-hidden" id="collaborations">
        {/* Background — Clean Premium Gradient */}
        <motion.div
          style={{ y: bgY }}
          className="absolute inset-0"
        >
          {/* Base gradient */}
          <div className="absolute inset-0" style={{
            background: 'radial-gradient(ellipse 80% 60% at 30% 40%, rgba(124, 58, 237, 0.08) 0%, transparent 60%), radial-gradient(ellipse 60% 50% at 70% 60%, rgba(236, 72, 153, 0.06) 0%, transparent 50%), linear-gradient(180deg, #050508 0%, #0a0a12 50%, #050508 100%)'
          }} />
          {/* Subtle floating orbs */}
          <div className="absolute top-[20%] left-[15%] w-[300px] h-[300px] rounded-full blur-[120px] opacity-60 pointer-events-none" style={{ background: 'rgba(124, 58, 237, 0.06)' }} />
          <div className="absolute bottom-[10%] right-[20%] w-[250px] h-[250px] rounded-full blur-[100px] opacity-50 pointer-events-none" style={{ background: 'rgba(236, 72, 153, 0.05)' }} />
          <div className="absolute inset-0 bg-gradient-to-b from-[#050508]/30 via-transparent to-[#050508]" />
        </motion.div>

        {/* Grid overlay */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `
              linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)
            `,
            backgroundSize: '60px 60px',
            opacity: 0.5,
          }}
        />

        {/* Content */}
        <motion.div style={{ y: textY }} className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Left: Text */}
          <div>
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full mb-6 border border-white/[0.08] bg-white/[0.03] backdrop-blur-md">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-pink-500 opacity-60" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-pink-500" />
                </span>
                <span className="text-gray-400 text-xs font-medium tracking-[0.18em] uppercase">
                  Creator Media Kit
                </span>
              </div>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
              className="font-display text-4xl sm:text-5xl md:text-7xl font-bold tracking-[-0.03em] leading-[1.05] text-white mb-4"
            >
              [İSİM]
              <span className="text-gradient-accent block sm:inline"> Özeren</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="text-gray-400 text-lg md:text-xl max-w-lg leading-relaxed mb-8"
            >
              AI odaklı içerik üreticisi ve teknoloji eğitmeni. Viral potansiyeli yüksek inovatif içeriklerle markanızı milyonlara ulaştırın.
            </motion.p>

            {/* Quick Stats Row */}
            <motion.div
              initial="hidden"
              animate="visible"
              className="grid grid-cols-2 sm:grid-cols-4 gap-3"
            >
              {highlightStats.map((stat, i) => (
                <motion.div
                  key={stat.label}
                  variants={scaleIn}
                  custom={i + 3}
                  className="text-center p-3 rounded-2xl bg-white/[0.03] border border-white/[0.06] backdrop-blur-sm relative overflow-hidden group"
                >
                  <div className={`absolute inset-0 bg-gradient-to-b ${stat.color} opacity-0 group-hover:opacity-10 transition-opacity duration-500`} />
                  <div className={`inline-flex p-1.5 rounded-lg bg-gradient-to-r ${stat.color} mb-2 relative z-10`}>
                    {stat.icon}
                  </div>
                  <div className="text-xl sm:text-2xl font-bold text-white relative z-10">
                    {typeof stat.value === 'number' && stat.value < 10 && !Number.isInteger(stat.value) ? stat.value : <AnimatedCounter target={stat.value} suffix={stat.suffix} decimals={!Number.isInteger(stat.value) ? 1 : 0} />}
                    {typeof stat.value === 'number' && stat.value < 10 && !Number.isInteger(stat.value) && stat.suffix}
                  </div>
                  <div className="text-[10px] sm:text-xs text-gray-500 font-medium uppercase tracking-wider relative z-10">{stat.label}</div>
                </motion.div>
              ))}
            </motion.div>
          </div>

          {/* Right: Creator Photo */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, x: 50 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            transition={{ duration: 0.9, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="relative hidden lg:flex justify-center"
          >
            {/* Glow behind photo */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-[400px] h-[400px] rounded-full blur-[120px]"
                style={{ background: 'radial-gradient(circle, rgba(236,72,153,0.15) 0%, rgba(124,58,237,0.1) 50%, transparent 70%)' }}
              />
            </div>
            
            {/* Orbit ring */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-[380px] h-[380px] rounded-full border border-white/[0.06]" style={{ animation: 'spin 30s linear infinite' }}>
                <div className="absolute w-2 h-2 rounded-full bg-pink-500" style={{ top: -4, left: '50%', marginLeft: -4, boxShadow: '0 0 12px rgba(236,72,153,0.6)' }} />
              </div>
            </div>

            <img
              src="/portrait_hero_v4.webp"
              alt="[İSİM SOYAD]"
              loading="lazy"
              className="relative z-10 w-[340px] h-[340px] object-cover rounded-3xl border border-white/[0.08]"
              style={{ boxShadow: '0 40px 100px rgba(0,0,0,0.5), 0 0 60px rgba(124,58,237,0.1)' }}
            />
          </motion.div>
        </motion.div>

        {/* Bottom gradient */}
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#050508] to-transparent pointer-events-none z-20" />
      </section>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/*  AUDIENCE DEMOGRAPHICS                                               */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <section className="py-12 relative z-10 -mt-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.3 }}
            className="grid grid-cols-1 md:grid-cols-3 gap-6"
          >
            {/* Gender Dist */}
            <BentoCard custom={1} className="!rounded-3xl !p-8 relative overflow-hidden backdrop-blur-xl bg-white/[0.02] border border-white/[0.05]">
              <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                <Users className="w-5 h-5 text-pink-400" />
                Cinsiyet Dağılımı
              </h3>
              
              <div className="flex items-end gap-6 mb-4">
                <div className="w-full">
                  <div className="flex justify-between text-sm mb-2 font-medium">
                    <span className="text-white">Erkek</span>
                    <span className="text-accent-blue">83.7%</span>
                  </div>
                  <div className="h-3 bg-white/[0.05] rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      whileInView={{ width: '83.7%' }}
                      transition={{ duration: 1, delay: 0.2 }}
                      className="h-full bg-gradient-to-r from-blue-600 to-cyan-400 rounded-full"
                    />
                  </div>
                </div>
              </div>
              
              <div className="flex items-end gap-6">
                <div className="w-full">
                  <div className="flex justify-between text-sm mb-2 font-medium">
                    <span className="text-white">Kadın</span>
                    <span className="text-pink-400">16.3%</span>
                  </div>
                  <div className="h-3 bg-white/[0.05] rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      whileInView={{ width: '16.3%' }}
                      transition={{ duration: 1, delay: 0.3 }}
                      className="h-full bg-gradient-to-r from-pink-600 to-purple-400 rounded-full"
                    />
                  </div>
                </div>
              </div>
            </BentoCard>

            {/* Age Dist */}
            <BentoCard custom={2} className="!rounded-3xl !p-8 relative overflow-hidden backdrop-blur-xl bg-white/[0.02] border border-white/[0.05]">
              <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-purple-400" />
                Yaş Dağılımı
              </h3>
              
              <div className="space-y-4">
                {ageData.map((item, i) => (
                  <div key={item.label}>
                    <div className="flex justify-between text-sm mb-1.5">
                      <span className="text-gray-300">{item.label}</span>
                      <span className="text-white font-medium">%{item.value}</span>
                    </div>
                    <div className="h-2 bg-white/[0.05] rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        whileInView={{ width: `${item.value}%` }}
                        transition={{ duration: 1, delay: 0.2 + (i * 0.1) }}
                        className={`h-full ${item.color} rounded-full`}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </BentoCard>

            {/* Geography */}
            <BentoCard custom={3} className="!rounded-3xl !p-8 relative overflow-hidden backdrop-blur-xl bg-white/[0.02] border border-white/[0.05]">
              <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                <Globe className="w-5 h-5 text-green-400" />
                Coğrafya
              </h3>
              
              <div className="grid grid-cols-2 gap-4">
                {countryData.map((country, i) => (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 + (i * 0.1) }}
                    key={country.label} 
                    className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.04] flex flex-col justify-between"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-2xl">{country.flag}</span>
                      <span className="text-white font-bold text-lg">%{country.value}</span>
                    </div>
                    <div className="text-xs text-gray-400 font-medium uppercase tracking-wider">{country.label}</div>
                  </motion.div>
                ))}
              </div>
            </BentoCard>

          </motion.div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/*  PREVIOUS COLLABORATIONS / VIRALS — VIDEO EMBEDS                     */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <section className="py-24 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.3 }}
            className="text-center max-w-3xl mx-auto mb-16"
          >
            <motion.span variants={fadeUp} custom={0} className="inline-block text-purple-500 text-sm font-semibold tracking-[0.2em] uppercase mb-4">
              Öne Çıkan Çalışmalar
            </motion.span>
            <motion.h2 variants={fadeUp} custom={1} className="text-3xl md:text-5xl font-bold mb-5 tracking-tight">
              Milyonlarca İzlenen <span className="text-gradient-accent">Viral İçerikler</span>
            </motion.h2>
            <motion.p variants={fadeUp} custom={2} className="text-gray-400 text-lg leading-relaxed">
              Dünyanın önde gelen yapay zeka markalarıyla gerçekleştirdiğimiz ve milyonlarca izlenmeye ulaşan projelerimizden bazıları.
            </motion.p>
          </motion.div>

          {/* Viral Reels Grid — Instagram Embeds */}
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.05 }}
            className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 sm:gap-5 mb-16"
          >
            {virals.map((item, i) => (
              <motion.div
                key={i}
                variants={fadeUp}
                custom={i}
                style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.3)' }}
                whileHover={{ scale: 1.03, y: -4 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              >
                <ViralReelCard
                  brand={item.brand}
                  views={item.views}
                  type={item.type}
                  gradient={item.gradient}
                  href={item.href}
                  videoUrl={item.videoUrl}
                />
              </motion.div>
            ))}
          </motion.div>

          {/* Other Partners Bar */}
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeUp}
            className="flex flex-wrap justify-center items-center gap-4 sm:gap-8 opacity-70"
          >
            <span className="text-gray-500 text-sm font-semibold uppercase tracking-widest mr-4 hidden md:block">
              Diğer İş Birlikleri:
            </span>
            {brands.map((brand) => (
              <div key={brand} className="text-xl font-bold text-gray-400 hover:text-white transition-colors cursor-default">
                {brand}
              </div>
            ))}
          </motion.div>

        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/*  SOCIAL MEDIA PLATFORMS — BENTO GRID                                 */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <section className="py-24 relative bg-[#050508]/50">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-purple-900/5 to-transparent pointer-events-none" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.3 }}
            className="text-center max-w-3xl mx-auto mb-16"
          >
            <motion.span variants={fadeUp} custom={0} className="inline-block text-cyan-400 text-sm font-semibold tracking-[0.2em] uppercase mb-4">
              Platform Erişimi
            </motion.span>
            <motion.h2 variants={fadeUp} custom={1} className="text-3xl md:text-5xl font-bold mb-5 tracking-tight">
              Tüm platformlarda{' '}
              <span className="text-gradient-accent">aktif kitle</span>
            </motion.h2>
            <motion.p variants={fadeUp} custom={2} className="text-gray-400 text-lg leading-relaxed">
              6 farklı platformda, yapay zeka ve teknolojiye tutkulu yüz binlerce takipçiye aynı anda ulaşma imkanı.
            </motion.p>
          </motion.div>

          {/* Bento Grid */}
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.1 }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
          >
            {platforms.map((platform, i) => (
              <BentoCard key={platform.name} custom={i} className="!rounded-3xl group relative overflow-hidden backdrop-blur-xl bg-white/[0.02] border border-white/[0.05]">
                {/* Top accent line */}
                <div
                  className="absolute -top-px left-[15%] right-[15%] h-[1px] opacity-40 group-hover:opacity-100 transition-opacity duration-500"
                  style={{ background: `linear-gradient(90deg, transparent, ${platform.bgGlow.replace('0.15', '1')}, transparent)` }}
                />

                {/* Background glow on hover */}
                <div
                  className="absolute -top-10 -right-10 w-[180px] h-[180px] rounded-full blur-[80px] opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none"
                  style={{ background: platform.bgGlow }}
                />

                <div className="relative z-10">
                  {/* Header */}
                  <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-3">
                      <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${platform.gradient} flex items-center justify-center text-white shadow-lg`}>
                        {platform.icon}
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-white">{platform.name}</h3>
                        <p className="text-xs text-gray-500">{platform.handle}</p>
                      </div>
                    </div>
                    <a
                      href={platform.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-gray-500 hover:text-white hover:border-white/[0.15] transition-all duration-300"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>

                  {/* Main Number */}
                  <div className="mb-4">
                    <div className="text-3xl font-extrabold text-white tracking-tight">{platform.followers}</div>
                    <div className="text-xs text-gray-500 font-medium uppercase tracking-wider">{platform.metric}</div>
                  </div>

                  {/* Engagement Metric */}
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.04]">
                    <Heart className="w-3.5 h-3.5 text-gray-500" />
                    <span className="text-xs text-gray-400">{platform.engagementLabel}:</span>
                    <span className={`text-xs font-semibold ${platform.textColor}`}>{platform.engagementValue}</span>
                  </div>
                </div>
              </BentoCard>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/*  İLETİŞİM CTA                                                       */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <section className="py-24 relative" id="contact">
        <div className="section-divider max-w-5xl mx-auto mb-24" />
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="bento-card !rounded-3xl !p-12 md:!p-16 text-center relative overflow-hidden"
          >
            {/* Top accent */}
            <div className="absolute top-0 left-[10%] right-[10%] h-[1px] bg-gradient-to-r from-transparent via-pink-500/40 to-transparent" />
            
            {/* Background glow */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[400px] h-[200px] bg-pink-500/5 blur-[100px] rounded-full pointer-events-none" />
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[300px] h-[150px] bg-accent-purple/5 blur-[80px] rounded-full pointer-events-none" />
            
            <div className="relative z-10">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-6 border border-pink-500/20 bg-pink-500/5">
                <Sparkles className="w-3.5 h-3.5 text-pink-400" />
                <span className="text-pink-400 text-xs font-semibold tracking-wider uppercase">Sponsorluk & İş Birliği</span>
              </div>

              <h3 className="text-3xl md:text-4xl font-bold text-white mb-4 tracking-tight">
                Birlikte Büyüyelim
              </h3>
              <p className="text-gray-400 mb-10 max-w-xl mx-auto leading-relaxed">
                Yapay zeka ve teknoloji odağındaki içeriklerimizle markanızı doğru kitleye ulaştırmak için
                <strong className="text-white"> marka iş birlikleri </strong>
                sürecimizi inceleyebilirsiniz.
              </p>

              <a 
                href="mailto:ceren@[WEB_SİTESİ]" 
                className="group relative inline-flex items-center gap-3 px-10 py-4 rounded-2xl font-bold text-lg bg-gradient-to-r from-pink-500/20 to-accent-purple/20 border border-pink-500/30 hover:border-pink-500/60 transition-all duration-500 hover:shadow-[0_0_50px_rgba(236,72,153,0.2)] z-10"
              >
                <Mail className="w-5 h-5 text-pink-400" />
                <span>ceren@[WEB_SİTESİ]</span>
                <ArrowUpRight className="w-5 h-5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </a>
            </div>
          </motion.div>
        </div>
      </section>

    </div>
  );
}
