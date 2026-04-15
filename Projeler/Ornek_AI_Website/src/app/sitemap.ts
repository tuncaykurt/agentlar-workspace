import { MetadataRoute } from 'next'
import { getPosts } from '@/lib/mdx'

export const dynamic = 'force-static'

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://[WEB_SİTESİ]'
  const posts = getPosts()

  // Blog post URLs
  const blogUrls = posts.map((post) => ({
    url: `${baseUrl}/blog/${post.slug}`,
    lastModified: new Date(post.date),
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }))

  // Static URLs
  const staticUrls = [
    '',
    '/blog',
    '/cozumler/artifex-campus',
    '/cozumler/hizmetler',
    '/egitimler/ai-factory',
    '/egitimler/kurumsal-egitimler',
    '/isbirlikleri',
    '/hakkimizda',
  ].map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: new Date(),
    changeFrequency: route === '' ? 'weekly' as const : 'monthly' as const,
    priority: route === '' ? 1 : 0.9,
  }))

  return [...staticUrls, ...blogUrls]
}
