/**
 * Catch-all API Route — /api/* → Backend Proxy
 *
 * Tüm /api/* isteklerini backend'e proxy eder.
 * redirect: "follow" ile 307 redirect'ler server-side takip edilir,
 * internal URL'ler (http://backend:8000) tarayıcıya ASLA sızmaz.
 */
import { NextRequest, NextResponse } from "next/server"

const BACKEND = (process.env.BACKEND_URL || "http://backend:8000").replace(/\/api\/?$/, "")

async function proxy(req: NextRequest, { params }: { params: { path: string[] } }) {
  const search = req.nextUrl.search ?? ""
  const pathname = req.nextUrl.pathname.replace(/^\/api\/api\//, "/api/")
  const targetUrl = `${BACKEND}${pathname}${search}`

  let body: ArrayBuffer | null = null
  if (req.method !== "GET" && req.method !== "HEAD") {
    body = await req.arrayBuffer()
  }

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
      // @ts-ignore
      cache: "no-store",
      redirect: "follow",
    })

    const resHeaders = new Headers()
    backendRes.headers.forEach((value, key) => {
      if (!["transfer-encoding", "connection"].includes(key.toLowerCase())) {
        resHeaders.set(key, value)
      }
    })

    const resBody = await backendRes.arrayBuffer()
    return new NextResponse(resBody, {
      status: backendRes.status,
      headers: resHeaders,
    })
  } catch (err) {
    console.error(`[API Proxy] ${req.method} ${targetUrl} → Hata:`, err)
    return NextResponse.json(
      { detail: "Backend'e ulaşılamıyor." },
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
