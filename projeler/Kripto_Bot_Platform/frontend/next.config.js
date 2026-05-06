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
    // Trailing /api strip et — BACKEND_URL=http://backend:8000/api gibi hatalı env'lere karşı
    const backendUrl = (process.env.BACKEND_URL || "http://backend:8000").replace(/\/api\/?$/, "")
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
      {
        source: '/ws/:path*',
        destination: `${backendUrl}/ws/:path*`,
      },
    ]
  },
}

module.exports = nextConfig
