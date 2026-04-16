'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Menu, X, ChevronDown } from 'lucide-react'
import { useTranslation } from '@/i18n/i18n'
import { LanguageSwitcher } from './LanguageSwitcher'
import Link from 'next/link'

export function Navbar() {
  const { t } = useTranslation();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const dropdownTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [isTrainingDropdownOpen, setIsTrainingDropdownOpen] = useState(false);
  const trainingDropdownRef = useRef<HTMLDivElement>(null);
  const trainingDropdownTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
      if (trainingDropdownRef.current && !trainingDropdownRef.current.contains(e.target as Node)) {
        setIsTrainingDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleDropdownEnter = () => {
    if (dropdownTimeout.current) clearTimeout(dropdownTimeout.current);
    setIsDropdownOpen(true);
  };

  const handleDropdownLeave = () => {
    dropdownTimeout.current = setTimeout(() => setIsDropdownOpen(false), 200);
  };

  const handleTrainingDropdownEnter = () => {
    if (trainingDropdownTimeout.current) clearTimeout(trainingDropdownTimeout.current);
    setIsTrainingDropdownOpen(true);
  };

  const handleTrainingDropdownLeave = () => {
    trainingDropdownTimeout.current = setTimeout(() => setIsTrainingDropdownOpen(false), 200);
  };

  return (
    <motion.nav 
      initial={{ y: -100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      className={`fixed top-0 w-full z-50 flex justify-center transition-all duration-500 ${
        isScrolled ? 'pt-3' : 'pt-6'
      } px-4 sm:px-6`}
    >
      <div className="flex items-center justify-between w-full max-w-[1240px] bg-[#0c0c14]/40 backdrop-blur-xl border border-white/[0.08] rounded-full px-4 sm:px-5 py-2.5 shadow-[0_8px_32px_rgba(0,0,0,0.12)]">
        
        {/* Left Side: Logo + Links */}
        <div className="flex items-center gap-8 lg:gap-12">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 group shrink-0 pl-2">
            <span className="text-xl font-bold tracking-tight text-white">
              [isim]<span className="text-gradient-accent">.ai</span>
            </span>
          </Link>
          
          {/* Desktop Menu */}
          <div className="hidden md:flex items-center gap-1">
            {/* Çözümler — Dropdown */}
            <div 
              ref={dropdownRef}
              className="relative"
              onMouseEnter={handleDropdownEnter}
              onMouseLeave={handleDropdownLeave}
            >
              <button
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="flex items-center gap-1 text-sm font-medium text-gray-300 hover:text-white px-3 py-2 rounded-lg hover:bg-white/[0.04] transition-all duration-300"
              >
                {t('nav.solutions')}
                <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-300 ${isDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              <AnimatePresence>
                {isDropdownOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.96 }}
                    transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                    className="absolute top-full left-0 mt-2 w-56 bg-[#0c0c14]/95 backdrop-blur-xl border border-white/[0.08] rounded-xl overflow-hidden shadow-2xl shadow-black/40"
                  >
                    <Link
                      href="/cozumler/artifex-campus"
                      onClick={() => setIsDropdownOpen(false)}
                      className="flex flex-col px-5 py-3.5 hover:bg-white/[0.04] transition-all duration-300 border-b border-white/[0.04]"
                    >
                      <span className="text-sm font-medium text-white">{t('nav.artifexCampus')}</span>
                      <span className="text-xs text-gray-500 mt-0.5">{t('nav.artifexCampusDesc')}</span>
                    </Link>
                    <Link
                      href="/cozumler/hizmetler"
                      onClick={() => setIsDropdownOpen(false)}
                      className="flex flex-col px-5 py-3.5 hover:bg-white/[0.04] transition-all duration-300"
                    >
                      <span className="text-sm font-medium text-white">{t('nav.services')}</span>
                      <span className="text-xs text-gray-500 mt-0.5">{t('nav.servicesDesc')}</span>
                    </Link>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Eğitimler — Dropdown */}
            <div 
              ref={trainingDropdownRef}
              className="relative"
              onMouseEnter={handleTrainingDropdownEnter}
              onMouseLeave={handleTrainingDropdownLeave}
            >
              <button
                onClick={() => setIsTrainingDropdownOpen(!isTrainingDropdownOpen)}
                className="flex items-center gap-1 text-sm font-medium text-gray-300 hover:text-white px-3 py-2 rounded-lg hover:bg-white/[0.04] transition-all duration-300"
              >
                {t('nav.trainings')}
                <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-300 ${isTrainingDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              <AnimatePresence>
                {isTrainingDropdownOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.96 }}
                    transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                    className="absolute top-full left-0 mt-2 w-64 bg-[#0c0c14]/95 backdrop-blur-xl border border-white/[0.08] rounded-xl overflow-hidden shadow-2xl shadow-black/40"
                  >
                    <Link
                      href="/egitimler/ai-factory"
                      onClick={() => setIsTrainingDropdownOpen(false)}
                      className="flex flex-col px-5 py-3.5 hover:bg-white/[0.04] transition-all duration-300 border-b border-white/[0.04]"
                    >
                      <span className="text-sm font-medium text-white">{t('nav.aiFactory')}</span>
                      <span className="text-xs text-gray-500 mt-0.5">{t('nav.aiFactoryDesc')}</span>
                    </Link>
                    <Link
                      href="/egitimler/kurumsal-egitimler"
                      onClick={() => setIsTrainingDropdownOpen(false)}
                      className="flex flex-col px-5 py-3.5 hover:bg-white/[0.04] transition-all duration-300"
                    >
                      <span className="text-sm font-medium text-white">{t('nav.corporateTrainings')}</span>
                      <span className="text-xs text-gray-500 mt-0.5">{t('nav.corporateTrainingsDesc')}</span>
                    </Link>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* İş Birlikleri */}
            <Link 
              href="/isbirlikleri"
              className="text-sm font-medium text-gray-300 hover:text-white px-3 py-2 rounded-lg hover:bg-white/[0.04] transition-all duration-300"
            >
              {t('nav.collaborations')}
            </Link>

            {/* Hakkımızda */}
            <Link 
              href="/hakkimizda"
              className="text-sm font-medium text-gray-300 hover:text-white px-3 py-2 rounded-lg hover:bg-white/[0.04] transition-all duration-300"
            >
              {t('nav.about')}
            </Link>

            {/* Blog */}
            <Link 
              href="/blog"
              className="text-sm font-medium text-gray-300 hover:text-white px-3 py-2 rounded-lg hover:bg-white/[0.04] transition-all duration-300"
            >
              Blog
            </Link>
          </div>
        </div>

        {/* Right Side: Language Switcher + Mobile Menu Button */}
        <div className="flex items-center gap-2">
          {/* Desktop Language Switcher */}
          <div className="hidden md:block">
            <LanguageSwitcher />
          </div>

          {/* Mobile Menu Toggle */}
          <div className="md:hidden flex items-center pr-1">
            <button 
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="text-gray-300 hover:text-white transition-colors p-2"
            >
              {isMobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="md:hidden absolute top-[calc(100%+12px)] w-[calc(100%-2rem)] max-w-sm mx-auto left-4 right-4 bg-[#0c0c14]/95 backdrop-blur-xl border border-white/[0.08] rounded-2xl p-4 shadow-2xl"
          >
            <div className="flex flex-col space-y-1">
              <div className="px-3 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em]">{t('nav.solutions')}</div>
              <Link 
                href="/cozumler/artifex-campus"
                className="text-gray-300 hover:text-white font-medium px-4 py-2.5 rounded-lg hover:bg-white/[0.04] transition-all"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Artifex Campus
              </Link>
              <Link 
                href="/cozumler/hizmetler"
                className="text-gray-300 hover:text-white font-medium px-4 py-2.5 rounded-lg hover:bg-white/[0.04] transition-all"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                {t('nav.services')}
              </Link>

              <div className="h-px bg-white/[0.08] my-3 mx-2" />

              <div className="px-3 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em]">{t('nav.trainings')}</div>
              <Link 
                href="/egitimler/ai-factory"
                className="text-gray-300 hover:text-white font-medium px-4 py-2.5 rounded-lg hover:bg-white/[0.04] transition-all"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                AI Factory
              </Link>
              <Link 
                href="/egitimler/kurumsal-egitimler"
                className="text-gray-300 hover:text-white font-medium px-4 py-2.5 rounded-lg hover:bg-white/[0.04] transition-all"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                {t('nav.corporateTrainings')}
              </Link>

              <div className="h-px bg-white/[0.08] my-3 mx-2" />

              <Link 
                href="/isbirlikleri"
                className="text-gray-300 hover:text-white font-medium px-4 py-2.5 rounded-lg hover:bg-white/[0.04] transition-all"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                {t('nav.collaborations')}
              </Link>
              <Link 
                href="/hakkimizda"
                className="text-gray-300 hover:text-white font-medium px-4 py-2.5 rounded-lg hover:bg-white/[0.04] transition-all"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                {t('nav.about')}
              </Link>

              <div className="h-px bg-white/[0.08] my-3 mx-2" />

              <Link 
                href="/blog"
                className="text-gray-300 hover:text-white font-medium px-4 py-2.5 rounded-lg hover:bg-white/[0.04] transition-all"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Blog
              </Link>

              <div className="h-px bg-white/[0.08] my-3 mx-2" />
              
              {/* Mobile Language Switcher */}
              <LanguageSwitcher mobile />

            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  );
}
