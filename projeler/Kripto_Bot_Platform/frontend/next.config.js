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
    const backendUrl = (process.env.BACKEND_URL || "http://backend:8000").replace(/\/api\/?$/, "")
    return [
      {
        source: '/ws/:path*',
        destination: `${backendUrl}/ws/:path*`,
      },
    ]
  },
  experimental: {
    cpus: 1,
    workerThreads: false,
    memoryBasedWorkersCount: true,
  },
}

module.exports = nextConfig
