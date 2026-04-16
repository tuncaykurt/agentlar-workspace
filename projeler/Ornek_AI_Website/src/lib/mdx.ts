import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'
import readingTime from 'reading-time'

const postsDirectory = path.join(process.cwd(), 'src/content/blog')

export interface Post {
  slug: string
  title: string
  date: string
  coverImage?: string
  excerpt: string
  content: string
  readingTime: string
  tags?: string[]
}

// Get all posts, sorted by date
export function getPosts(): Post[] {
  // Check if directory exists, if not create it returning empty array
  if (!fs.existsSync(postsDirectory)) {
    fs.mkdirSync(postsDirectory, { recursive: true })
    return []
  }

  const fileNames = fs.readdirSync(postsDirectory)
  const allPostsData = fileNames
    .filter((fileName) => fileName.endsWith('.md') || fileName.endsWith('.mdx'))
    .map((fileName) => {
      // Remove ".mdx" from file name to get slug
      const slug = fileName.replace(/\.mdx?$/, '')

      // Read markdown file as string
      const fullPath = path.join(postsDirectory, fileName)
      const fileContents = fs.readFileSync(fullPath, 'utf8')

      // Use gray-matter to parse the post metadata section
      const matterResult = matter(fileContents)

      // Calculate reading time
      const stats = readingTime(matterResult.content)

      return {
        slug,
        title: matterResult.data.title || slug.replace(/-/g, ' '),
        date: matterResult.data.date || new Date().toISOString(),
        coverImage: matterResult.data.coverImage,
        excerpt: matterResult.data.excerpt || '',
        tags: matterResult.data.tags || [],
        content: matterResult.content,
        readingTime: Math.ceil(stats.minutes) + ' dk okuma',
      } as Post
    })

  // Sort posts by date
  return allPostsData.sort((a, b) => {
    if (a.date < b.date) {
      return 1
    } else {
      return -1
    }
  })
}

// Get single post by slug
export function getPostBySlug(slug: string): Post | null {
  try {
    let fullPath = path.join(postsDirectory, `${slug}.mdx`)
    if (!fs.existsSync(fullPath)) {
      fullPath = path.join(postsDirectory, `${slug}.md`)
    }
    
    if (!fs.existsSync(fullPath)) {
      return null
    }

    const fileContents = fs.readFileSync(fullPath, 'utf8')
    const matterResult = matter(fileContents)
    const stats = readingTime(matterResult.content)

    return {
      slug,
      title: matterResult.data.title || slug.replace(/-/g, ' '),
      date: matterResult.data.date || new Date().toISOString(),
      coverImage: matterResult.data.coverImage,
      excerpt: matterResult.data.excerpt || '',
      tags: matterResult.data.tags || [],
      content: matterResult.content,
      readingTime: Math.ceil(stats.minutes) + ' dk okuma',
    } as Post
  } catch (e) {
    return null
  }
}
