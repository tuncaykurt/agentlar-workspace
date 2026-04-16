'use client'

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';

import tr from './locales/tr.json';
import en from './locales/en.json';
import zh from './locales/zh.json';
import es from './locales/es.json';

// ─── Types ──────────────────────────────────────────────────────────────────────
export type Language = 'en' | 'tr' | 'zh' | 'es';

export const LANGUAGES: { code: Language; label: string; flag: string; nativeName: string }[] = [
  { code: 'en', label: 'EN', flag: '🇬🇧', nativeName: 'English' },
  { code: 'tr', label: 'TR', flag: '🇹🇷', nativeName: 'Türkçe' },
  { code: 'zh', label: 'ZH', flag: '🇨🇳', nativeName: '中文' },
  { code: 'es', label: 'ES', flag: '🇪🇸', nativeName: 'Español' },
];

type TranslationMap = Record<string, unknown>;

const locales: Record<Language, TranslationMap> = { tr, en, zh, es };

const STORAGE_KEY = '[isim]_ai_lang';

// ─── Detect browser language ────────────────────────────────────────────────────
function detectLanguage(): Language {
  if (typeof window === 'undefined') return 'en';
  
  // 1. Check localStorage
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && stored in locales) return stored as Language;
  } catch { /* ignore */ }

  // 2. Check navigator.language
  if (typeof navigator !== 'undefined') {
    const browserLang = navigator.language?.toLowerCase() || '';
    if (browserLang.startsWith('tr')) return 'tr';
    if (browserLang.startsWith('zh')) return 'zh';
    if (browserLang.startsWith('es')) return 'es';
    if (browserLang.startsWith('en')) return 'en';
  }

  // 3. Default fallback
  return 'en';
}

// ─── Context ────────────────────────────────────────────────────────────────────
interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
}

const LanguageContext = createContext<LanguageContextType>({
  language: 'en',
  setLanguage: () => {},
});

// ─── Provider ───────────────────────────────────────────────────────────────────
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>('en');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setLanguageState(detectLanguage());
    setMounted(true);
  }, []);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    try { localStorage.setItem(STORAGE_KEY, lang); } catch { /* ignore */ }
  }, []);

  // Update <html lang> and document title on language change
  useEffect(() => {
    if (!mounted) return;
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : language;
    const meta = locales[language]?.meta as { title?: string; description?: string } | undefined;
    if (meta?.title) document.title = meta.title;
    const descTag = document.querySelector('meta[name="description"]');
    if (descTag && meta?.description) {
      descTag.setAttribute('content', meta.description);
    }
  }, [language, mounted]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}

// ─── Hooks ──────────────────────────────────────────────────────────────────────
export function useLanguage() {
  return useContext(LanguageContext);
}

/**
 * Translation hook. Returns a `t` function that resolves dot-notation keys.
 * Example: `t('nav.solutions')` → "Solutions"
 */
export function useTranslation() {
  const { language, setLanguage } = useContext(LanguageContext);
  const translations = locales[language] || locales.en;

  const t = useCallback((key: string): string => {
    const parts = key.split('.');
    let value: unknown = translations;
    for (const part of parts) {
      if (value && typeof value === 'object' && part in (value as Record<string, unknown>)) {
        value = (value as Record<string, unknown>)[part];
      } else {
        // Fallback to English
        let fallback: unknown = locales.en;
        for (const p of parts) {
          if (fallback && typeof fallback === 'object' && p in (fallback as Record<string, unknown>)) {
            fallback = (fallback as Record<string, unknown>)[p];
          } else {
            return key; // key not found anywhere
          }
        }
        return typeof fallback === 'string' ? fallback : key;
      }
    }
    return typeof value === 'string' ? value : key;
  }, [language, translations]);

  return { t, language, setLanguage };
}
