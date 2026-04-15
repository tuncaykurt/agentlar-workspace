'use client';

import { useState, useRef, useEffect } from 'react';
import { useTranslation, type Language } from '@/i18n/i18n';
import { Globe, Check, ChevronDown } from 'lucide-react';

const languages: { code: Language; name: string; flag: string }[] = [
  { code: 'tr', name: 'Türkçe', flag: '🇹🇷' },
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'zh', name: '中文', flag: '🇨🇳' },
  { code: 'es', name: 'Español', flag: '🇪🇸' },
];

export function LanguageSwitcher({ mobile = false }: { mobile?: boolean }) {
  const { language, setLanguage } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Default to tr initially to prevent hydration mismatch
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (!mobile) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [mobile]);

  const handleMouseEnter = () => {
    if (mobile) return;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setIsOpen(true);
  };

  const handleMouseLeave = () => {
    if (mobile) return;
    timeoutRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 200);
  };

  const handleLanguageSelect = (code: Language) => {
    setLanguage(code);
    setIsOpen(false);
  };

  const currentLang = languages.find(l => l.code === language) || languages[0];

  if (mobile) {
    return (
      <div className="py-2">
        <div className="flex items-center gap-2 px-4 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em] mb-1">
          <Globe className="w-3.5 h-3.5" />
          <span>Language: {mounted.current ? currentLang.name : 'Türkçe'}</span>
        </div>
        <div className="grid grid-cols-2 gap-2 px-3">
          {languages.map((lang) => (
            <button
              key={lang.code}
              onClick={() => handleLanguageSelect(lang.code)}
              className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-all ${
                (mounted.current ? language === lang.code : lang.code === 'tr')
                  ? 'bg-electric-blue/10 text-electric-blue border border-electric-blue/20'
                  : 'text-gray-400 hover:text-white hover:bg-white/[0.04] border border-transparent'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-base">{lang.flag}</span>
                <span className="font-medium">{lang.name}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Desktop Version
  return (
    <div 
      className="relative" 
      ref={dropdownRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-gray-300 hover:text-white hover:bg-white/[0.04] transition-all duration-300"
      >
        <Globe className="w-4 h-4 opacity-70" />
        <span className="uppercase">{mounted.current ? language : 'TR'}</span>
        <ChevronDown className={`w-3.5 h-3.5 opacity-50 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-48 bg-[#0c0c14]/95 backdrop-blur-xl border border-white/[0.08] rounded-xl shadow-2xl py-2 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
          {languages.map((lang) => (
            <button
              key={lang.code}
              onClick={() => handleLanguageSelect(lang.code)}
              className="w-full flex items-center justify-between px-4 py-2.5 text-sm transition-colors hover:bg-white/[0.04]"
            >
              <div className="flex items-center gap-3">
                <span className="text-lg leading-none">{lang.flag}</span>
                <span className={`font-medium ${(mounted.current ? language === lang.code : lang.code === 'tr') ? 'text-white' : 'text-gray-400'}`}>
                  {lang.name}
                </span>
              </div>
              {(mounted.current ? language === lang.code : lang.code === 'tr') && (
                <Check className="w-4 h-4 text-electric-blue" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
