import nodemailer, { Transporter } from 'nodemailer'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

export interface SmtpConfig {
  host: string
  port: number
  user: string
  pass: string
  fromName: string
}

function unquote(v: unknown): string {
  let s = String(v ?? '')
  while (s.startsWith('"') && s.endsWith('"') && s.length > 1) s = s.slice(1, -1)
  return s
}

export async function loadSmtpConfig(supabase: SupabaseClient): Promise<SmtpConfig | null> {
  const { data: rows } = await supabase
    .from('settings')
    .select('key, value')
    .in('key', ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_from_name'])

  const map: Record<string, string> = {}
  for (const r of rows || []) map[r.key] = unquote(r.value)

  if (!map.smtp_host || !map.smtp_user || !map.smtp_pass) return null

  return {
    host: map.smtp_host,
    port: parseInt(map.smtp_port || '587', 10),
    user: map.smtp_user,
    pass: map.smtp_pass,
    fromName: map.smtp_from_name || 'Ambiance Gayrimenkul',
  }
}

export function buildTransporter(cfg: SmtpConfig): Transporter {
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    auth: { user: cfg.user, pass: cfg.pass },
  })
}

export function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

const VAR_RE = /\{(\w+)\}/g
export function renderTemplate(template: string, vars: Record<string, string | undefined>): string {
  return template.replace(VAR_RE, (_, k) => vars[k] ?? '')
}

export function wrapHtmlWithFooter(html: string, opts: { unsubscribeUrl?: string; pixelUrl?: string }) {
  const footer = opts.unsubscribeUrl
    ? `<div style="margin-top:24px;padding-top:16px;border-top:1px solid #eee;font-size:11px;color:#888;font-family:sans-serif;">
        Bu e-posta tarafınıza pazarlama amacıyla gönderilmiştir.
        <a href="${opts.unsubscribeUrl}" style="color:#888;">Listeden çık</a>
      </div>`
    : ''
  const pixel = opts.pixelUrl ? `<img src="${opts.pixelUrl}" width="1" height="1" style="display:none" alt="" />` : ''
  return `<div style="max-width:640px;margin:0 auto;">${html}${footer}${pixel}</div>`
}

export interface EmailRecipient {
  email: string
  name?: string
  vars?: Record<string, string | undefined>
}

export interface SendBatchResult {
  sent: number
  failed: number
  results: Array<{ email: string; ok: boolean; messageId?: string; error?: string }>
}

export async function sendBatchEmails(params: {
  transporter: Transporter
  fromName: string
  fromAddress: string
  subject: string
  htmlTemplate: string
  recipients: EmailRecipient[]
  unsubscribeBaseUrl?: string
  pixelBaseUrl?: string
  campaignId?: string
  delayMs?: number
}): Promise<SendBatchResult> {
  const out: SendBatchResult = { sent: 0, failed: 0, results: [] }
  const delay = params.delayMs ?? 800

  for (const r of params.recipients) {
    try {
      const vars = r.vars ?? {}
      const html = renderTemplate(params.htmlTemplate, vars)
      const subject = renderTemplate(params.subject, vars)

      const unsubUrl = params.unsubscribeBaseUrl
        ? `${params.unsubscribeBaseUrl}?email=${encodeURIComponent(r.email)}${params.campaignId ? `&c=${params.campaignId}` : ''}`
        : undefined
      const pixelUrl = params.pixelBaseUrl && params.campaignId
        ? `${params.pixelBaseUrl}?email=${encodeURIComponent(r.email)}&c=${params.campaignId}`
        : undefined

      const wrapped = wrapHtmlWithFooter(html, { unsubscribeUrl: unsubUrl, pixelUrl })

      const info = await params.transporter.sendMail({
        from: `"${params.fromName}" <${params.fromAddress}>`,
        to: r.name ? `"${r.name}" <${r.email}>` : r.email,
        subject,
        html: wrapped,
        headers: unsubUrl ? { 'List-Unsubscribe': `<${unsubUrl}>` } : undefined,
      })

      out.sent += 1
      out.results.push({ email: r.email, ok: true, messageId: info.messageId })
    } catch (e) {
      out.failed += 1
      out.results.push({ email: r.email, ok: false, error: e instanceof Error ? e.message : 'unknown' })
    }
    if (delay > 0) await new Promise(res => setTimeout(res, delay))
  }
  return out
}
