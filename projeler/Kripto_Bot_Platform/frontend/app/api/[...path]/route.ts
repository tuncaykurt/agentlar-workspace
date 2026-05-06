/**
 * Catch-all API Route — /api/* → Backend Proxy
 *
 * Next.js standalone build'de rewrites() middleware'i bazen runtime'da
 * çalışmaz. Bu route handler her /api/* isteğini backend'e yönlendirir.
 *
 * BACKEND_URL env ile yapılandırılabilir (Coolify panelinden set edilebilir).
 * Varsayılan: http://backend:8000 (docker-compose servis adı)
 */
import { NextRequest, NextResponse } from "next/server"

// Trailing /api varsa strip et (ör: BACKEND_URL=http://backend:8000/api → http://backend:8000)
const BACKEND = (process.env.BACKEND_URL || "http://backend:8000").replace(/\/api\/?$/, "")

async function proxy(req: NextRequest, { params }: { params: { path: string[] } }) {
  const search = req.nextUrl.search ?? ""
  // req.nextUrl.pathname zaten /api/... içerir — BACKEND_URL ne olursa olsun çift prefix olmaz
  const targetUrl = `${BACKEND}${req.nextUrl.pathname}${search}`

  // Body okuma (GET/HEAD dışı)
  let body: BodyInit | null = null
  if (req.method !== "GET" && req.method !== "HEAD") {
    body = await req.arrayBuffer()
  }

  // Yönlendirme başlıkları (host hariç — backend kendi hostname'ini bilir)
  const headers = new Headers()
  req.headers.forEach((value, key) => {
    if (key.toLowerCase() !== "host") {
      headers.set(key, value)
    }
  })

  try {
    const backendRes = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: body ?? undefined,
      // @ts-ignore — Next.js fetch cache bypass
      cache: "no-store",
      redirect: "manual",
    })

    const resHeaders = new Headers()
    backendRes.headers.forEach((value, key) => {
      // Transfer-encoding ve connection başlıklarını geçirme
      if (!["transfer-encoding", "connection"].includes(key.toLowerCase())) {
        resHeaders.set(key, value)
      }
    })

    // Location başlığını düzelt (307/308 redirect'lerinde backend host'unu gizle)
    if (resHeaders.has("location")) {
      const location = resHeaders.get("location")
      if (location && location.startsWith(BACKEND)) {
        resHeaders.set("location", location.replace(BACKEND, ""))
      }
    }

    const resBody = await backendRes.arrayBuffer()
    return new NextResponse(resBody, {
      status: backendRes.status,
      headers: resHeaders,
    })
  } catch (err) {
    console.error(`[API Proxy] ${req.method} ${targetUrl} → Hata:`, err)
    return NextResponse.json(
      { detail: "Backend'e ulaşılamıyor. Lütfen servis durumunu kontrol edin." },
      { status: 502 }
    )
  }
}

export const GET     = proxy
export const POST    = proxy
export const PUT     = proxy
export const PATCH   = proxy
export const DELETE  = proxy
export const OPTIONS = proxy
