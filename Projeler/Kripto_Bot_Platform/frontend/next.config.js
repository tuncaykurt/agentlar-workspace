/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Backend'e CORS sorunu olmadan proxy — browser sadece :3000'e istek atar
  async rewrites() {
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || "http://backend:8000"
    return [
      {
        source: "/api/:path*",
        destination: `${backendUrl}/api/:path*`,
      },
      // WebSocket: http:// ile yazılmalı, Next.js upgrade'i otomatik yapar
      {
        source: "/ws/:path*",
        destination: `${backendUrl}/ws/:path*`,
      },
    ]
  },
}

module.exports = nextConfig
