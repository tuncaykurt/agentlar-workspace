import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/email'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const email = url.searchParams.get('email')?.toLowerCase().trim()
  const campaignId = url.searchParams.get('c')
  if (!email) return new NextResponse('Geçersiz istek', { status: 400 })

  const supabase = adminClient()
  await supabase
    .from('marketing_unsubscribes')
    .upsert({ email, campaign_id: campaignId, reason: 'one_click' }, { onConflict: 'email' })

  await supabase
    .from('marketing_leads')
    .update({ unsubscribed: true, unsubscribed_at: new Date().toISOString() })
    .eq('email', email)

  return new NextResponse(
    `<!DOCTYPE html><html lang="tr"><meta charset="utf-8"><title>Listeden çıkış</title>
    <body style="font-family:sans-serif;max-width:520px;margin:80px auto;padding:24px;text-align:center;">
      <h2>İletişim listesinden çıkarıldınız</h2>
      <p>${email} adresine artık pazarlama e-postası göndermeyeceğiz.</p>
      <p style="color:#888;font-size:13px;">Bu işlemi yanlışlıkla yaptıysanız bizimle iletişime geçebilirsiniz.</p>
    </body></html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  )
}
