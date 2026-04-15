import { getPostBySlug, getPosts } from '@/lib/mdx'
import { notFound } from 'next/navigation'
import { MDXRemote } from 'next-mdx-remote/rsc'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowLeft, Calendar, Clock } from 'lucide-react'
import type { Metadata } from 'next'

// Next.js params type for Next.js 15+ dynamic routes (often requires resolution)
export async function generateMetadata(
  props: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const params = await props.params;
  const post = getPostBySlug(params.slug)
  
  if (!post) {
    return { title: 'Bulunamadı' }
  }

  return {
    title: post.title,
    description: post.excerpt,
    openGraph: {
      title: post.title,
      description: post.excerpt,
      type: 'article',
      publishedTime: post.date,
      url: `https://[WEB_SİTESİ]/blog/${post.slug}`,
      images: post.coverImage ? [
        {
          url: `https://[WEB_SİTESİ]${post.coverImage}`,
          width: 1200,
          height: 630,
          alt: post.title,
        }
      ] : [],
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.excerpt,
      images: post.coverImage ? [`https://[WEB_SİTESİ]${post.coverImage}`] : [],
    }
  }
}

export const dynamicParams = false

export async function generateStaticParams() {
  const posts = getPosts()
  return posts.map((post) => ({
    slug: post.slug,
  }))
}

const components = {
  // Custom MDX Components can be added here
  img: (props: any) => (
    <span className="block relative w-full mt-10 mb-10 overflow-hidden rounded-2xl border border-white/10 shadow-[0_0_40px_rgba(0,0,0,0.5)]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img {...props} className="w-full h-auto object-cover m-0 rounded-2xl" alt={props.alt || ''} />
    </span>
  ),
  a: (props: any) => (
    <a {...props} className="text-electric-blue hover:text-accent-purple transition-colors border-b border-electric-blue/30 hover:border-accent-purple" target="_blank" rel="noopener noreferrer" />
  ),
  h2: (props: any) => (
    <h2 {...props} className="text-3xl font-bold text-white mt-16 mb-6 tracking-tight flex items-center gap-3">
      <span className="text-electric-blue opacity-50 text-2xl font-normal select-none">#</span>
      {props.children}
    </h2>
  ),
  h3: (props: any) => (
    <h3 {...props} className="text-2xl font-bold text-gray-100 mt-12 mb-4 tracking-tight" />
  ),
  ul: (props: any) => (
    <ul {...props} className="space-y-3 my-6 text-gray-300 list-none pl-0" />
  ),
  li: (props: any) => (
    <li {...props} className="flex gap-3 items-start relative before:content-[''] before:w-1.5 before:h-1.5 before:rounded-full before:bg-electric-blue before:top-2.5 before:relative before:shrink-0" />
  ),
  blockquote: (props: any) => (
    <blockquote {...props} className="border-l-4 border-accent-purple bg-accent-purple/5 p-6 rounded-r-xl my-8 italic text-gray-300 font-medium" />
  ),
  pre: (props: any) => (
    <div className="relative group my-8">
      <div className="absolute -inset-0.5 bg-gradient-to-r from-electric-blue/20 to-accent-purple/20 rounded-2xl blur opacity-30 group-hover:opacity-100 transition duration-1000 group-hover:duration-200" />
      <pre {...props} className="relative bg-[#050508] p-6 rounded-xl border border-white/10 overflow-x-auto text-sm" />
    </div>
  )
}

export default async function BlogPost(
    props: { params: Promise<{ slug: string }> }
) {
  const params = await props.params;
  const post = getPostBySlug(params.slug)

  if (!post) {
    notFound()
  }

  const dateFormatted = new Date(post.date).toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  })

  return (
    <article className="min-h-screen bg-[#050508] pb-24">
      {/* Blog Article Progress Bar Component (Optional for future) */}
      
      {/* Hero Header Section */}
      <div className="relative w-full border-b border-white/5 bg-[#0a0a14] overflow-hidden">
        {/* Glow Effects */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-electric-blue/10 blur-[120px] rounded-[100%] pointer-events-none" />
        
        {/* Cover Image Background (Heavy Blur) */}
        {post.coverImage && (
          <div className="absolute inset-0 opacity-20 hidden md:block select-none pointer-events-none">
            <Image src={post.coverImage} alt="" fill className="object-cover blur-3xl scale-110" priority />
            <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a14]/50 via-[#0a0a14]/80 to-[#050508]" />
          </div>
        )}

        <div className="max-w-[900px] mx-auto px-4 sm:px-6 relative z-10 pt-20 pb-12">
          
          <Link href="/blog" className="inline-flex items-center gap-2 text-sm font-medium text-gray-400 hover:text-white transition-colors mb-12 group p-2 -ml-2 rounded-lg hover:bg-white/5">
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            Blog'a Dön
          </Link>

          {/* Tags */}
          {post.tags && post.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-6">
              {post.tags.map(tag => (
                <span key={tag} className="px-3 py-1 bg-white/5 border border-white/10 text-electric-blue rounded-full text-xs font-semibold uppercase tracking-wider">
                  {tag}
                </span>
              ))}
            </div>
          )}

          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white tracking-tight mb-8 leading-[1.1]">
            {post.title}
          </h1>

          <div className="flex flex-wrap items-center gap-6 text-sm font-medium text-gray-400 border-t border-white/10 pt-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-electric-blue to-accent-purple p-[1px]">
                {/* Minimal Author Avatar Fallback */}
                <div className="w-full h-full rounded-full bg-[#050508] flex items-center justify-center font-bold text-white text-xs">
                  DÖ
                </div>
              </div>
              <div>
                <div className="text-white">[İSİM SOYAD]</div>
                <div className="text-xs text-gray-500">AI Architect</div>
              </div>
            </div>

            <div className="w-px h-8 bg-white/10 hidden md:block" />

            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-electric-blue/80" />
              <span>{dateFormatted}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-accent-purple/80" />
              <span>{post.readingTime}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="max-w-[900px] mx-auto px-4 sm:px-6 pt-12">
        {/* Cover Image Feature (Optional render if it exists) */}
        {post.coverImage && (
          <div className="relative w-full aspect-[21/9] md:aspect-[2.35/1] rounded-3xl overflow-hidden shadow-2xl shadow-black/50 mb-16 border border-white/10">
            <Image
              src={post.coverImage}
              alt={post.title}
              fill
              className="object-cover"
              priority
            />
            {/* Subtle inner shadow for depth */}
            <div className="absolute inset-0 ring-1 ring-inset ring-white/10 rounded-3xl pointer-events-none" />
          </div>
        )}

        <div className="prose-blog prose-lg w-full max-w-none">
          <MDXRemote source={post.content} components={components} />
        </div>
        
        {/* Bottom Call to Action */}
        <div className="mt-20 pt-10 border-t border-white/10">
          <div className="bg-gradient-to-br from-white/5 to-transparent border border-white/10 rounded-3xl p-8 md:p-12 text-center relative overflow-hidden">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[100px] bg-electric-blue/10 blur-[50px] pointer-events-none" />
            <h4 className="text-2xl font-bold text-white mb-4 relative z-10">Kendi AI Sisteminizi Kurmaya Hazır mısınız?</h4>
            <Link href="/" className="relative z-10 inline-flex items-center justify-center px-8 py-4 text-sm font-bold text-white bg-white/10 hover:bg-white/20 border border-white/20 rounded-2xl transition-all hover:scale-105 active:scale-95">
              [İSİM] AI Ana Sayfaya Dön
            </Link>
          </div>
        </div>
      </div>
    </article>
  )
}
