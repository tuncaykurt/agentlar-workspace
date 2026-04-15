import { createClient } from '@supabase/supabase-js'
import PiyasaClient from './PiyasaClient'

export const dynamic = 'force-dynamic'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

export default async function PiyasaPage() {
  const supabase = getSupabase()


  const { data: listings, count } = await supabase
    .from('market_listings')
    .select('*', { count: 'estimated' })
    .order('created_at', { ascending: false })
    .limit(50)

  const { data: stats } = await supabase
    .from('market_listings')
    .select('contact_status')

  const statusCounts = {
    new: 0, contacted: 0, interested: 0, converted: 0, stale: 0,
  }
  for (const row of stats || []) {
    const s = row.contact_status as keyof typeof statusCounts
    if (s in statusCounts) statusCounts[s]++
  }

  return (
    <PiyasaClient
      listings={listings || []}
      totalCount={count || 0}
      statusCounts={statusCounts}
    />
  )
}
