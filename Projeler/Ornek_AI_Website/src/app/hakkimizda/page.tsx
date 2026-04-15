'use client';

import { motion } from 'framer-motion';
import { useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import { Bot, User } from 'lucide-react';
import { useTranslation } from '@/i18n/i18n';

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

const teamMembers = [
  { name: 'Ceren', role: 'Partnership Manager', type: 'human' as const, initial: 'C', color: 'from-pink-500 to-rose-600', avatar: '/images/team/ceren.webp' },
  { name: 'Sarper', role: 'Social Media Ads Manager', type: 'human' as const, initial: 'S', color: 'from-blue-500 to-indigo-600', avatar: '/images/team/sarper.webp' },
  { name: 'Ece', role: 'Sales Specialist', type: 'human' as const, initial: 'E', color: 'from-purple-500 to-violet-600', avatar: '/images/team/ece.webp' },
  { name: 'Berke', role: 'Video Editor', type: 'human' as const, initial: 'B', color: 'from-orange-500 to-amber-600', avatar: '/images/team/berke.webp' },
  { name: 'Savaş', role: 'B2B Operations Lead', type: 'human' as const, initial: 'S', color: 'from-teal-500 to-emerald-600', avatar: '/images/team/savas.webp' },
  { name: 'Okan', role: 'B2B Automation Lead', type: 'human' as const, initial: 'O', color: 'from-cyan-500 to-blue-600', avatar: '/images/team/okan.webp' },
  { name: 'Bobby', role: 'Designer', type: 'ai' as const, initial: '🎨', color: 'from-pink-400 to-purple-500', avatar: '/team/bobby_ai.webp' },
  { name: 'Gipsy', role: 'Web Site Developer', type: 'ai' as const, initial: '💻', color: 'from-cyan-400 to-blue-500', avatar: '/team/gipsy_ai.webp' },
  { name: 'Daisy', role: 'Customer Support', type: 'ai' as const, initial: '💬', color: 'from-green-400 to-emerald-500', avatar: '/team/daisy_ai.webp' },
  { name: 'Joshua', role: 'Lead Generation', type: 'ai' as const, initial: '🎯', color: 'from-amber-400 to-orange-500', avatar: '/team/joshua_ai.webp' },
];

export default function AboutPage() {
  const { t } = useTranslation();
  return (
    <div className="pt-24 pb-12">
      <section className="py-12 relative" id="about">
        
        {/* Background Elements */}
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-accent-purple/5 blur-[150px] rounded-full pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-electric-blue/5 blur-[120px] rounded-full pointer-events-none" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.3 }}
            className="text-center max-w-3xl mx-auto mb-16"
          >
            <motion.span variants={fadeUp} custom={0} className="inline-block text-electric-blue text-sm font-semibold tracking-[0.2em] uppercase mb-4">
              {t('about.sectionTag')}
            </motion.span>
            <motion.h2 variants={fadeUp} custom={1} className="text-3xl md:text-5xl font-bold mb-5 tracking-tight">
              {t('about.sectionTitle')}{' '}
              <span className="text-gradient-accent">{t('about.sectionTitleHighlight')}</span>
            </motion.h2>
            <motion.p variants={fadeUp} custom={2} className="text-gray-400 text-lg leading-relaxed">
              {t('about.sectionDesc')}
            </motion.p>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.05 }}
            className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4"
          >
            {teamMembers.map((member, i) => (
              <motion.div
                key={member.name}
                variants={scaleIn}
                custom={i}
                className="bento-card !rounded-3xl !p-5 text-center group relative overflow-hidden bg-white/5 border border-white/5 backdrop-blur-sm"
              >
                {member.type === 'ai' && (
                  <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent" />
                )}

                <div className={`w-14 h-14 rounded-2xl ${
                  member.avatar ? '' : `bg-gradient-to-br ${member.color} shadow-lg`
                } flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform duration-500`}>
                  {member.avatar ? (
                    <img src={member.avatar} alt={member.name} loading="lazy" className="w-full h-full object-cover rounded-2xl shadow-lg border border-white/10" />
                  ) : member.type === 'ai' ? (
                    <span className="text-xl">{member.initial}</span>
                  ) : (
                    <span className="text-lg font-bold text-white">{member.initial}</span>
                  )}
                </div>

                <h4 className="text-sm font-bold text-white mb-1">{member.name}</h4>
                <p className="text-[10px] text-gray-500 leading-tight mb-2">{member.role}</p>

                <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-medium ${
                  member.type === 'ai' 
                    ? 'bg-cyan-500/10 border border-cyan-500/20 text-cyan-400'
                    : 'bg-blue-500/10 border border-blue-500/20 text-blue-400'
                }`}>
                  {member.type === 'ai' ? <Bot className="w-2.5 h-2.5" /> : <User className="w-2.5 h-2.5" />}
                  {member.type === 'ai' ? t('about.aiLabel') : t('about.humanLabel')}
                </div>
              </motion.div>
            ))}
          </motion.div>

        </div>
      </section>
    </div>
  );
}
