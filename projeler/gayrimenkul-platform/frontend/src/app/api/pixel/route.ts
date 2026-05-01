import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/email'

const GIF_1x1 = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64',
)

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const email = url.searchParams.get('email')?.toLowerCase().trim()
  const campaignId = url.searchParams.get('c')

  if (email && campaignId) {
    const supabase = adminClient()
    await supabase
      .from('campaign_logs')
      .update({ opened_at: new Date().toISOString() })
      .eq('campaign_id', campaignId)
      .eq('email', email)
      .is('opened_at', null)

    try {
      await supabase.rpc('exec_sql', {
        sql: `UPDATE campaigns SET opened_count = opened_count + 1 WHERE id = '${campaignId}'`,
      })
    } catch { /* ignore */ }
  }

  return new NextResponse(GIF_1x1, {
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      'Pragma': 'no-cache',
    },
  })
}
