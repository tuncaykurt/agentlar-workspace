'use client'

import { motion } from 'framer-motion'
import { useRef } from 'react'
import type { MouseEvent } from 'react'
import { ArrowRight, ExternalLink } from 'lucide-react'
import { useTranslation } from '@/i18n/i18n'
import Link from 'next/link'

const fadeUp = {
  hidden: { opacity: 0, y: 50, filter: 'blur(4px)' },
  visible: (i: number) => ({
    opacity: 1, y: 0, filter: 'blur(0px)',
    transition: { duration: 0.7, delay: i * 0.15, ease: [0.16, 1, 0.3, 1] }
  })
};

interface ProductCardProps {
  headline: string;
  description: string;
  tag: string;
  buttonLabel: string;
  href: string;
  external?: boolean;
  accentColor: string;
  glowColor: string;
  imageSrc: string;
  isPrimary?: boolean;
  custom: number;
}

function ProductCard({ headline, description, tag, buttonLabel, href, external, glowColor, imageSrc, isPrimary, custom }: ProductCardProps) {
  const cardRef = useRef<HTMLAnchorElement>(null);

  const handleMouse = (e: MouseEvent) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    cardRef.current.style.setProperty('--mouse-x', `${x}%`);
    cardRef.current.style.setProperty('--mouse-y', `${y}%`);
  };

  const cardClasses = `group flex flex-col h-[520px] rounded-[2rem] p-5 overflow-hidden relative transition-all duration-500 hover:-translate-y-2 ${
    isPrimary 
      ? 'bg-gradient-to-br from-[#7e22ce] to-[#581c87] border-none shadow-[0_8px_30px_rgba(126,34,206,0.3)]' 
      : 'bg-[#0f0f12] border border-white/10 hover:border-white/20 hover:shadow-[0_8px_30px_rgba(0,0,0,0.5)]'
  }`;

  const content = (
    <>
      {/* Background glow on hover */}
      <div
        className="absolute -top-20 left-1/2 -translate-x-1/2 w-[200px] h-[200px] rounded-full blur-[80px] opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none"
        style={{ background: glowColor }}
      />
      
      {/* Top Header Row (Tag & Arrow) */}
      <div className="flex items-center justify-between w-full mb-5 z-10 relative">
        <div 
          className={`px-4 py-1.5 text-xs font-semibold rounded-full border transition-colors ${
            isPrimary 
              ? 'border-white/30 text-white bg-white/10' 
              : 'border-white/10 text-gray-300 bg-white/5 group-hover:bg-white/10 group-hover:text-white'
          }`}
        >
          {tag}
        </div>
        <div 
          className={`w-9 h-9 rounded-full flex items-center justify-center transition-all duration-300 ${
            isPrimary 
              ? 'bg-white text-[#6b21a8] group-hover:scale-110 shadow-lg' 
              : 'bg-white/5 text-white border border-white/10 group-hover:bg-white group-hover:text-black group-hover:scale-110'
          }`}
        >
          {external ? <ExternalLink className="w-4 h-4" /> : <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />}
        </div>
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col mb-5">
        <h3 className="text-2xl font-bold text-white mb-3 leading-tight tracking-tight font-display">{headline}</h3>
        <p className={`text-[15px] leading-relaxed line-clamp-3 ${isPrimary ? 'text-purple-100/90' : 'text-gray-400 group-hover:text-gray-300 transition-colors'}`}>
          {description}
        </p>
      </div>

      {/* Image Container */}
      <div className="relative w-full aspect-square rounded-2xl overflow-hidden mt-auto bg-black/50 border border-white/5">
        <div className={`absolute inset-0 z-10 bg-gradient-to-t ${isPrimary ? 'from-[#581c87]/90 via-[#581c87]/20' : 'from-[#0f0f12]/90 via-[#0f0f12]/20'} to-transparent opacity-80`} />
        {imageSrc ? (
          <img 
            src={imageSrc} 
            alt={headline} 
            loading="lazy"
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" 
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white/80 animate-spin" />
          </div>
        )}

        {/* CTA Button overlay at bottom of image */}
        <div className="absolute bottom-4 left-4 right-4 z-20">
          <div className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 backdrop-blur-sm ${
            isPrimary
              ? 'bg-white/20 text-white border border-white/30 group-hover:bg-white/30'
              : 'bg-white/10 text-white/80 border border-white/10 group-hover:bg-white/20 group-hover:text-white'
          }`}>
            {buttonLabel}
            {external ? <ExternalLink className="w-3.5 h-3.5" /> : <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />}
          </div>
        </div>
      </div>
    </>
  );

  if (external) {
    return (
      <motion.a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        ref={cardRef}
        variants={fadeUp}
        custom={custom}
        onMouseMove={handleMouse}
        className={cardClasses}
      >
        {content}
      </motion.a>
    );
  }

  return (
    <motion.div
      ref={cardRef as React.Ref<HTMLDivElement>}
      variants={fadeUp}
      custom={custom}
      onMouseMove={handleMouse}
      className={cardClasses}
    >
      <Link href={href} className="absolute inset-0 z-30" />
      {content}
    </motion.div>
  );
}

export function ProductsSection() {
  const { t } = useTranslation();

  const products = [
    {
      headline: t('products.card2Headline'),
      description: t('products.card2Desc'),
      tag: t('products.card2Tag'),
      buttonLabel: t('products.card2Button'),
      href: '/cozumler#hizmetler',
      external: false,
      accentColor: '#a855f7',
      glowColor: 'rgba(168, 85, 247, 0.12)',
      imageSrc: '/images/products/kurumsal_holding.webp',
      isPrimary: true,
    },
    {
      headline: t('products.card1Headline'),
      description: t('products.card1Desc'),
      tag: t('products.card1Tag'),
      buttonLabel: t('products.card1Button'),
      href: '/cozumler/artifex-campus',
      external: false,
      accentColor: '#7c3aed',
      glowColor: 'rgba(124, 58, 237, 0.15)',
      imageSrc: '/images/products/isletme_kobi_real2.webp',
      isPrimary: false,
    },
    {
      headline: t('products.card4Headline'),
      description: t('products.card4Desc'),
      tag: t('products.card4Tag'),
      buttonLabel: t('products.card4Button'),
      href: '/isbirlikleri',
      external: false,
      accentColor: '#ec4899',
      glowColor: 'rgba(236, 72, 153, 0.12)',
      imageSrc: '/images/products/marka_isbirligi.webp',
      isPrimary: false,
    },
    {
      headline: t('products.card3Headline'),
      description: t('products.card3Desc'),
      tag: t('products.card3Tag'),
      buttonLabel: t('products.card3Button'),
      href: 'https://www.skool.com/yapay-zeka-factory/about?ref=044f39496d4f45fab11775bcefe4b7f4',
      external: true,
      accentColor: '#00d4ff',
      glowColor: 'rgba(0, 212, 255, 0.12)',
      imageSrc: '/images/products/girisimci_real2.webp',
      isPrimary: false,
    },
  ];

  return (
    <section id="products" className="py-24 relative">
      <div className="section-divider max-w-5xl mx-auto mb-24" />
      
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.3 }}
          className="text-center max-w-3xl mx-auto mb-16"
        >
          <motion.span variants={fadeUp} custom={0} className="inline-block text-electric-blue text-sm font-semibold tracking-[0.2em] uppercase mb-4">
            {t('products.sectionTag')}
          </motion.span>
          <motion.h2 variants={fadeUp} custom={1} className="text-4xl md:text-5xl font-bold mb-5 tracking-tight">
            {t('products.sectionTitle')}{' '}
            <span className="text-gradient-accent">{t('products.sectionTitleHighlight')}</span>
          </motion.h2>
          <motion.p variants={fadeUp} custom={2} className="text-gray-400 text-lg leading-relaxed">
            {t('products.sectionDesc')}
          </motion.p>
        </motion.div>

        {/* Product Cards Grid */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
        >
          {products.map((product, i) => (
            <ProductCard key={i} {...product} custom={i} />
          ))}
        </motion.div>
      </div>
    </section>
  );
}
