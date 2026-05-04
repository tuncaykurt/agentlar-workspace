import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/email'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  if (!id) {
    return NextResponse.json({ error: 'ID is required' }, { status: 400 })
  }

  const supabase = adminClient()
  const { data: research, error } = await supabase
    .from('property_researches')
    .select(`
      *,
      consultants(*)
    `)
    .eq('id', id)
    .single()

  if (error || !research) {
    return NextResponse.json({ 
      error: 'Report not found', 
      details: error?.message,
      requested_id: id 
    }, { status: 404 })
  }

  return NextResponse.json(research)
}
