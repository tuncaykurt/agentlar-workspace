const API_BASE = typeof window === "undefined" 
  ? (process.env.BACKEND_URL || "http://backend:8000") + "/api"
  : "/api"

function getWsBase() {
  if (typeof window === "undefined") return (process.env.BACKEND_URL || "http://backend:8000").replace("http", "ws")
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:"
  return `${proto}//${window.location.host}`
}

async function handleResponse(r: Response) {
  if (!r.ok) {
    const data = await r.json().catch(() => null)
    let detail = data?.detail
    if (Array.isArray(detail)) {
      detail = detail.map((e: { msg?: string }) => e?.msg ?? JSON.stringify(e)).join(", ")
    }
    throw new Error(detail ?? `API ${r.status}: ${r.statusText}`)
  }
  return r.json()
}

export const api = {
  get: (path: string) =>
    fetch(`${API_BASE}${path}`).then(handleResponse),

  post: (path: string, body: unknown) =>
    fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(handleResponse),

  patch: (path: string, body: unknown) =>
    fetch(`${API_BASE}${path}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(handleResponse),

  delete: (path: string) =>
    fetch(`${API_BASE}${path}`, { method: "DELETE" }).then(handleResponse),
}

export async function publicPost(path: string, body: unknown) {
  const r = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!r.ok) {
    const data = await r.json().catch(() => ({ detail: r.statusText }))
    throw new Error(data?.detail ?? `API ${r.status}`)
  }
  return r.json()
}

export function createMarketWS(symbol: string, onMessage: (data: unknown) => void) {
  const ws = new WebSocket(`${getWsBase()}/ws/market?symbol=${encodeURIComponent(symbol)}`)
  ws.onmessage = (e) => onMessage(JSON.parse(e.data))
  return ws
}

export function createBotWS(botId: number, onMessage: (data: unknown) => void) {
  const ws = new WebSocket(`${getWsBase()}/ws/bot/${botId}`)
  ws.onmessage = (e) => onMessage(JSON.parse(e.data))
  return ws
}

export const API_URL = API_BASE
export const WS_URL = ""
