import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/email'

export async function GET(req: NextRequest) {
  const supabase = adminClient()
  const url = new URL(req.url)
  const city = url.searchParams.get('city')
  const source = url.searchParams.get('source')
  const search = url.searchParams.get('q')
  const limit = parseInt(url.searchParams.get('limit') || '200', 10)

  let q = supabase
    .from('marketing_leads')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (city) q = q.eq('city', city)
  if (source) q = q.eq('source', source)
  if (search) q = q.or(`full_name.ilike.%${search}%,email.ilike.%${search}%,company.ilike.%${search}%`)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ leads: data || [] })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const supabase = adminClient()

  const lead = {
    full_name: body.full_name,
    email: body.email?.toLowerCase().trim() || null,
    phone: body.phone?.trim() || null,
    company: body.company,
    title: body.title,
    industry: body.industry,
    city: body.city,
    district: body.district,
    linkedin_url: body.linkedin_url,
    website: body.website,
    source: body.source || 'manual',
    source_detail: body.source_detail,
    tags: body.tags || [],
    notes: body.notes,
    consultant_id: body.consultant_id,
    enrichment_data: body.enrichment_data || {},
  }

  const { data, error } = await supabase
    .from('marketing_leads')
    .insert(lead)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ lead: data })
}
