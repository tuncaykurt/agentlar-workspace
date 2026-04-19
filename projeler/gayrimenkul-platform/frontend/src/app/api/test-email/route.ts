import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import nodemailer from 'nodemailer'

export async function POST(req: NextRequest) {
  try {
    const { to } = await req.json()
    if (!to) return NextResponse.json({ error: 'to alanı gerekli' }, { status: 400 })

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )

    const { data: rows } = await supabase
      .from('settings')
      .select('key, value')
      .in('key', ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_from_name'])

    const smtp: Record<string, string> = {}
    for (const row of rows || []) {
      let val = String(row.value || '')
      while (val.startsWith('"') && val.endsWith('"') && val.length > 1) {
        val = val.slice(1, -1)
      }
      smtp[row.key] = val
    }

    if (!smtp.smtp_host || !smtp.smtp_user || !smtp.smtp_pass) {
      return NextResponse.json({
        error: 'SMTP ayarları eksik',
        debug: { host: smtp.smtp_host || null, user: smtp.smtp_user || null, passLen: smtp.smtp_pass?.length || 0 }
      }, { status: 400 })
    }

    const port = parseInt(smtp.smtp_port || '587')
    const transporter = nodemailer.createTransport({
      host: smtp.smtp_host,
      port,
      secure: port === 465,
      auth: { user: smtp.smtp_user, pass: smtp.smtp_pass },
    })

    // Verify connection
    await transporter.verify()

    const fromName = smtp.smtp_from_name || 'Ambiance Gayrimenkul'
    const info = await transporter.sendMail({
      from: `"${fromName}" <${smtp.smtp_user}>`,
      to,
      subject: 'Test Mail - Gayrimenkul Platform',
      html: `<div style="font-family:sans-serif;padding:24px;">
        <h2 style="color:#2563eb;">Mail Testi Basarili!</h2>
        <p>Bu bir test mailidir. SMTP ayarlariniz dogru calisiyor.</p>
        <p style="color:#999;font-size:12px;margin-top:16px;">${fromName}</p>
      </div>`,
    })

    return NextResponse.json({ success: true, messageId: info.messageId })
  } catch (e) {
    return NextResponse.json({
      error: e instanceof Error ? e.message : 'Bilinmeyen hata',
    }, { status: 500 })
  }
}
