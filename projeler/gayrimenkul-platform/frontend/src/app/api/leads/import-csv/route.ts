import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/email'

interface CsvRow { [k: string]: string }

function parseCSV(text: string): CsvRow[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return []
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase())
  const rows: CsvRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i])
    const row: CsvRow = {}
    headers.forEach((h, idx) => { row[h] = (cells[idx] || '').trim() })
    rows.push(row)
  }
  return rows
}

function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') { inQuotes = !inQuotes; continue }
    if (c === ',' && !inQuotes) { out.push(cur); cur = ''; continue }
    cur += c
  }
  out.push(cur)
  return out
}

export async function POST(req: NextRequest) {
  const { csv, source = 'manual_csv', defaultCity, consultantId } = await req.json()
  if (!csv || typeof csv !== 'string') {
    return NextResponse.json({ error: 'csv alanı gerekli' }, { status: 400 })
  }

  const rows = parseCSV(csv)
  if (rows.length === 0) return NextResponse.json({ error: 'CSV boş veya geçersiz' }, { status: 400 })

  const supabase = adminClient()
  const leads = rows.map(r => ({
    full_name: r.full_name || r.name || r.ad_soyad,
    email: (r.email || r.eposta || '').toLowerCase().trim() || null,
    phone: (r.phone || r.telefon || '').trim() || null,
    company: r.company || r.sirket,
    title: r.title || r.unvan,
    industry: r.industry || r.sektor,
    city: r.city || r.sehir || defaultCity,
    district: r.district || r.ilce,
    linkedin_url: r.linkedin || r.linkedin_url,
    website: r.website || r.web,
    source,
    consultant_id: consultantId,
    enrichment_data: {},
  })).filter(l => l.email || l.phone || l.linkedin_url)

  if (leads.length === 0) {
    return NextResponse.json({ error: 'Geçerli e-posta/telefon/linkedin içeren satır yok' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('marketing_leads')
    .upsert(leads, { onConflict: 'email', ignoreDuplicates: true })
    .select()

  if (error) return NextResponse.json({ error: error.message, sample: leads[0] }, { status: 500 })

  return NextResponse.json({
    imported: data?.length || 0,
    total: rows.length,
    skipped: rows.length - (data?.length || 0),
  })
}
