import Link from 'next/link'
import Image from 'next/image'
import { Calendar, Clock } from 'lucide-react'
import type { Post } from '@/lib/mdx'

export function BlogCard({ post }: { post: Post }) {
  // Format date correctly (e.g., "16 Mart 2026")
  const dateFormatted = new Date(post.date).toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  return (
    <Link href={`/blog/${post.slug}`} className="group block">
      <article className="bento-card !p-0 h-full flex flex-col group-hover:border-electric-blue/30 transition-all duration-300">
        
        {/* Image Container */}
        {post.coverImage && (
          <div className="relative w-full aspect-video overflow-hidden bg-[#0c0c14]">
            <Image
              src={post.coverImage}
              alt={post.title}
              fill
              className="object-cover transition-transform duration-700 group-hover:scale-105 opacity-90 group-hover:opacity-100"
              sizes="(max-w-768px) 100vw, (max-w-1200px) 50vw, 33vw"
            />
          </div>
        )}
        
        {/* Content */}
        <div className="p-6 md:p-8 flex flex-col flex-1">
          {/* Metadata */}
          <div className="flex items-center gap-4 text-xs font-medium text-gray-400 mb-4">
            <div className="flex items-center gap-1.5 bg-white/5 py-1 px-2.5 rounded-full border border-white/10">
              <Calendar className="w-3.5 h-3.5 text-electric-blue" />
              <span>{dateFormatted}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-gray-500" />
              <span>{post.readingTime}</span>
            </div>
          </div>

          <h3 className="text-xl md:text-2xl font-bold text-white mb-3 tracking-tight group-hover:text-electric-blue transition-colors line-clamp-2">
            {post.title}
          </h3>
          
          <p className="text-gray-400 text-sm leading-relaxed mb-6 line-clamp-3">
            {post.excerpt}
          </p>

          <div className="mt-auto flex items-center justify-between pt-4 border-t border-white/5">
            <span className="text-sm font-semibold text-white group-hover:text-electric-blue transition-colors flex items-center gap-2">
              Okumaya başla
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="transform group-hover:translate-x-1 transition-transform" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14"></path>
                <path d="m12 5 7 7-7 7"></path>
              </svg>
            </span>
            
            {/* Tags */}
            {post.tags && post.tags.length > 0 && (
              <div className="flex gap-2">
                {post.tags.slice(0, 2).map((tag, i) => (
                  <span key={i} className="text-[10px] uppercase font-bold tracking-wider text-gray-500">
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

      </article>
    </Link>
  );
}
