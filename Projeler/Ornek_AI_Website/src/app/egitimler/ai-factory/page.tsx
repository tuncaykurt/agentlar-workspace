'use client'

import { motion } from 'framer-motion'
import { ArrowUpRight } from 'lucide-react'

export default function AIFactoryPage() {
  return (
    <div className="pt-32 pb-24 relative min-h-screen flex flex-col items-center justify-center">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-500/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <span className="inline-block text-indigo-400 text-sm font-semibold tracking-[0.2em] uppercase mb-4">
            AI Factory
          </span>
          <h1 className="text-4xl md:text-6xl font-bold mb-6 tracking-tight text-white">
            Yapay Zeka Otomasyonları Satarak{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-600">Gelir Elde Etmeyi Öğren</span>
          </h1>
          <p className="text-gray-400 text-lg md:text-xl leading-relaxed mb-10 max-w-2xl mx-auto">
            Bireysel girişimciler ve freelancerlar için kullanıma hazır otomasyon sistemleri sunan premium topluluk. Kendi işinizi kurun ve yapay zeka devriminde yerinizi alın.
          </p>
          <a 
            href="https://www.skool.com/yapay-zeka-factory/about?ref=044f39496d4f45fab11775bcefe4b7f4"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-xl text-lg font-bold text-white bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 transition-all duration-300 shadow-lg shadow-indigo-500/25"
          >
            Topluluğa Katıl <ArrowUpRight className="w-5 h-5" />
          </a>
        </motion.div>
      </div>
    </div>
  )
}
