import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/email'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = adminClient()

  const { data: lead, error: leadErr } = await supabase
    .from('marketing_leads')
    .select('*')
    .eq('id', id)
    .single()
  if (leadErr || !lead) return NextResponse.json({ error: 'Lead bulunamadı' }, { status: 404 })

  if (lead.converted_to_client_id) {
    return NextResponse.json({ error: 'Bu lead zaten müşteriye dönüştürülmüş', client_id: lead.converted_to_client_id }, { status: 400 })
  }

  const clientPayload = {
    full_name: lead.full_name || lead.company || lead.email || 'İsimsiz Lead',
    email: lead.email,
    phone: lead.phone,
    client_type: 'buyer',
    lead_status: 'new',
    source: 'other',
    source_detail: `Pazarlama lead'i: ${lead.source}`,
    notes: [lead.notes, lead.title, lead.company].filter(Boolean).join(' • '),
    tags: lead.tags,
    assigned_consultant_id: lead.consultant_id,
  }

  const { data: client, error: clientErr } = await supabase
    .from('clients')
    .insert(clientPayload)
    .select()
    .single()

  if (clientErr) return NextResponse.json({ error: clientErr.message }, { status: 500 })

  await supabase
    .from('marketing_leads')
    .update({ converted_to_client_id: client.id, updated_at: new Date().toISOString() })
    .eq('id', id)

  return NextResponse.json({ client })
}
