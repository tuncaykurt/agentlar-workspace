/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  async rewrites() {
    // /api/* artık app/api/[...path]/route.ts catch-all proxy tarafından handle ediliyor
    // Sadece WebSocket rewrite gerekli
    const backendUrl = (process.env.BACKEND_URL || "http://backend:8000").replace(/\/api\/?$/, "")
    return [
      {
        source: '/ws/:path*',
        destination: `${backendUrl}/ws/:path*`,
      },
    ]
  },
}

module.exports = nextConfig
