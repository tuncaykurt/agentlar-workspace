'use client'

import { motion } from 'framer-motion'
import { useTranslation } from '@/i18n/i18n'

function Reveal({ children, delay = 0, className = '' }: {
  children: React.ReactNode; delay?: number; className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, delay, ease: [0.25, 1, 0.5, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function HeroSectionElevate({ bgImage }: { bgImage: string }) {
  const { t } = useTranslation();

  return (
    <section
      className="relative min-h-screen flex flex-col justify-center bg-cover bg-center bg-[#1a1110]"
      style={{ backgroundImage: `url('${bgImage}')` }}
      id="hero-elevate"
    >
      <div className="absolute inset-0 bg-gradient-to-r from-[#000000] via-[#000000]/60 to-transparent opacity-90" />

      <div className="relative z-10 w-full max-w-7xl mx-auto px-6 sm:px-8 lg:px-16 pt-24 pb-16">
        <div className="max-w-[42rem]">
          <Reveal delay={0.1}>
            <h1 className="font-display text-[clamp(2.5rem,5vw,5rem)] font-medium tracking-tight leading-[1.1] text-white mb-6">
              {t('hero.titleLine1')}
              <br />
              <span className="font-bold text-transparent bg-clip-text text-gradient-accent">{t('hero.titleHighlight')}</span>
            </h1>
          </Reveal>

          <Reveal delay={0.25}>
            <p className="text-gray-300 text-lg sm:text-slate-300 sm:text-xl font-light leading-relaxed mb-10 max-w-lg">
              {t('hero.subtitle')}
            </p>
          </Reveal>

          <Reveal delay={0.4}>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-12 border-t border-white/10 w-full mt-4">
              <div className="bg-white/5 backdrop-blur-sm border border-white/10 p-4 lg:p-5 rounded-xl h-full flex flex-col">
                <p className="text-[13px] lg:text-sm text-white font-bold mb-2 tracking-tight">{t('hero.stat1Title')}</p>
                <div className="text-xs text-gray-400 leading-relaxed">{t('hero.stat1Desc')}</div>
              </div>
              <div className="bg-white/5 backdrop-blur-sm border border-white/10 p-4 lg:p-5 rounded-xl h-full flex flex-col">
                <p className="text-[13px] lg:text-sm text-white font-bold mb-2 tracking-tight">{t('hero.stat2Title')}</p>
                <div className="text-xs text-gray-400 leading-relaxed">{t('hero.stat2Desc')}</div>
              </div>
              <div className="bg-white/5 backdrop-blur-sm border border-white/10 p-4 lg:p-5 rounded-xl h-full flex flex-col">
                <p className="text-[13px] lg:text-sm text-white font-bold mb-2 tracking-tight">{t('hero.stat3Title')}</p>
                <div className="text-xs text-gray-400 leading-relaxed">{t('hero.stat3Desc')}</div>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
