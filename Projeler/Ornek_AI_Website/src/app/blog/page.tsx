import { getPosts } from '@/lib/mdx'
import { BlogCard } from '@/components/blog/BlogCard'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Blog',
  description: 'Yapay zeka asistanları, otomasyonlar ve teknoloji dünyasındaki en son yenilikler hakkında makaleler.',
}

export default function BlogPage() {
  const posts = getPosts()

  return (
    <div className="min-h-screen bg-[#050508] relative pt-12 pb-24">
      {/* Background Glows */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-electric-blue/5 blur-[120px] rounded-[100%] pointer-events-none" />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        
        {/* Header Section */}
        <div className="max-w-3xl mb-16 md:mb-24">
          <span className="inline-block text-electric-blue text-sm font-semibold tracking-[0.2em] uppercase mb-4">
            [İSİM].AI BLOG
          </span>
          <h1 className="text-4xl md:text-6xl font-bold text-white tracking-tight mb-6">
            Yeni Nesil Teknolojileri <br className="hidden md:block" />
            <span className="text-gradient-accent">Keşfedin</span>
          </h1>
          <p className="text-gray-400 text-lg md:text-xl leading-relaxed max-w-2xl">
            Yapay zeka asistanları, otonom agent'lar ve işletmeniz için kaldıraç yaratacak teknolojiler hakkında en güncel yazılar.
          </p>
        </div>

        {/* Blog Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
          {posts.map((post) => (
            <BlogCard key={post.slug} post={post} />
          ))}
          {posts.length === 0 && (
            <div className="col-span-full py-20 text-center text-gray-500 bg-white/[0.02] border border-white/5 rounded-3xl backdrop-blur-sm">
              <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-6 text-gray-600">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8l-4 4"/></svg>
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Henüz yazı eklenmedi</h3>
              <p className="max-w-sm mx-auto">İlk blog yazımız üzerinde çalışıyoruz. Çok yakında burada olacak.</p>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
