// Gayrimenkul Platform — TypeScript Tipler
// Supabase şemasına göre oluşturulmuştur

export type UserRole = 'admin' | 'manager' | 'consultant' | 'broker'
export type ClientType = 'buyer' | 'seller' | 'both' | 'investor' | 'tenant' | 'landlord' | 'network'
export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'negotiating' | 'won' | 'lost' | 'dormant'
export type PropertyStatus = 'active' | 'under_offer' | 'sold' | 'rented' | 'withdrawn'
export type PropertyType = 'apartment' | 'villa' | 'land' | 'commercial' | 'office' | 'shop' | 'warehouse' | 'detached_house' | 'field'
export type ListingSource = 'manual' | 'sahibinden' | 'cb_com_tr' | 'hepsiemlak' | 'emlakjet' | 'zingat' | 'referral' | 'walk_in' | 'other'
export type InteractionChannel = 'whatsapp' | 'email' | 'call_inbound' | 'call_outbound' | 'sms' | 'meeting' | 'note'
export type DocumentType = 'authorization' | 'sales_contract' | 'rental_contract' | 'offer_letter' | 'showing_agreement' | 'sales_closing' | 'other'
export type SignatureStatus = 'draft' | 'sent' | 'viewed' | 'signed' | 'declined' | 'expired'
export type SocialPlatform = 'instagram' | 'facebook' | 'linkedin' | 'twitter'
export type PostStatus = 'draft' | 'scheduled' | 'posted' | 'failed'
export type CommissionStatus = 'pending' | 'confirmed' | 'paid' | 'cancelled'
export type ExpenseCategory = 'marketing' | 'transport' | 'office' | 'training' | 'meal' | 'gift' | 'other'

export interface Consultant {
  id: string
  user_id: string
  full_name: string
  email: string
  phone?: string
  role: UserRole
  commission_rate: number
  profile_photo_url?: string
  tax_number?: string
  bio?: string
  authorization_doc_url?: string
  tax_certificate_url?: string
  id_front_url?: string
  id_back_url?: string
  certifications: Certification[]
  id_number?: string
  address?: string
  instagram_handle?: string
  facebook_page?: string
  linkedin_url?: string
  wa_instance?: string
  wa_phone?: string
  evolution_instance_key?: string
  wa_connected_at?: string
  ticari_yetki_belgesi_no?: string
  office_phone?: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Certification {
  name: string
  expires_at: string
  doc_url?: string
}

export interface Client {
  id: string
  full_name: string
  salutation?: string
  phone?: string
  email?: string
  tc_no?: string
  address?: string
  birth_date?: string
  client_type: ClientType
  assigned_consultant_id?: string
  lead_status: LeadStatus
  source?: ListingSource
  budget_min?: number
  budget_max?: number
  preferred_cities?: string[]
  preferred_districts?: string[]
  preferred_property_types?: PropertyType[]
  min_m2?: number
  max_m2?: number
  min_rooms?: number
  notes?: string
  tags?: string[]
  is_active: boolean
  last_contacted_at?: string
  created_at: string
  // İlişkili veriler (JOIN ile)
  consultant?: Consultant
}

export interface Property {
  id: string
  title: string
  description?: string
  price?: number
  price_negotiable: boolean
  currency: string
  city?: string
  district?: string
  neighborhood?: string
  address?: string
  latitude?: number
  longitude?: number
  property_type: PropertyType
  status: PropertyStatus
  m2_gross?: number
  m2_net?: number
  room_count?: string
  bathroom_count?: number
  floor?: number
  total_floors?: number
  age?: number
  heating_type?: string
  deposit?: number
  dues?: number
  features: string[]
  photos: string[]
  source: ListingSource
  source_url?: string
  source_listing_id?: string
  assigned_consultant_id?: string
  seller_client_id?: string
  view_count: number
  is_active: boolean
  listed_at: string
  sold_at?: string
  created_at: string
  // İlişkili veriler
  consultant?: Consultant
  seller?: Client
}

export interface Interaction {
  id: string
  client_id: string
  consultant_id?: string
  property_id?: string
  channel: InteractionChannel
  direction: 'inbound' | 'outbound' | 'internal'
  content?: string
  duration_seconds?: number
  recording_url?: string
  created_at: string
  // İlişkili veriler
  client?: Client
  consultant?: Consultant
  property?: Property
}

export interface FollowUp {
  id: string
  client_id: string
  consultant_id?: string
  property_id?: string
  due_at: string
  channel: InteractionChannel
  message_template?: string
  custom_message?: string
  status: 'pending' | 'sent' | 'done' | 'cancelled'
  sent_at?: string
  notes?: string
  created_at: string
  // İlişkili veriler
  client?: Client
}

export interface Commission {
  id: string
  property_id?: string
  consultant_id?: string
  office_id?: string
  brand_id?: string
  sale_price: number
  total_commission_rate: number
  total_commission_amount?: number
  hq_share_rate?: number
  hq_share_amount?: number
  office_share_rate?: number
  office_share_amount?: number
  consultant_share_rate?: number
  consultant_share_amount?: number
  co_consultant_id?: string
  co_consultant_share_rate?: number
  co_consultant_share_amount?: number
  status: CommissionStatus
  paid_at?: string
  notes?: string
  created_at: string
}

// ─── Multi-tenant: Brands / Offices / Memberships ──────────────────────────────

export interface Brand {
  id: string
  name: string
  hq_share_rate: number
  hq_contact_name?: string
  hq_contact_email?: string
  hq_contact_phone?: string
  notes?: string
  created_at: string
  updated_at: string
}

export interface Office {
  id: string
  brand_id?: string
  name: string
  address?: string
  phone?: string
  email?: string
  tax_no?: string
  logo_url?: string
  default_office_share_rate: number
  default_consultant_share_rate: number
  default_total_commission_rate: number
  is_active: boolean
  created_at: string
  updated_at: string
  brand?: Brand
}

export interface CommissionRateRequest {
  id: string
  membership_id: string
  office_id: string
  consultant_id: string
  requested_by_id: string
  proposed_rate: number
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
  resolved_at?: string
  
  // İlişkili veriler
  membership?: OfficeMembership
  consultant?: Consultant
  requested_by?: Consultant
}

export interface OfficeMembership {
  id: string
  consultant_id: string
  office_id: string
  role: UserRole
  commission_rate_override?: number
  start_date: string
  end_date?: string
  end_reason?: string
  notes?: string
  created_at: string
  consultant?: Consultant
  office?: Office
}

// ─── Sales Closing (satış kapatma belgesi) ─────────────────────────────────────

export type SalesClosingStatus = 'pending' | 'filled' | 'sent' | 'signed' | 'cancelled'
export type SalesClosingPropertyKind = 'ev_villa' | 'apt' | 'ofis' | 'dukkan' | 'bina' | 'arazi'

export interface SalesClosing {
  id: string
  property_id?: string
  office_id?: string
  brand_id?: string
  consultant_id?: string
  co_consultant_id?: string
  // Mevcut client_id (eski) — alıcı için kullanılıyordu, yeni alanlar buyer_client_id / seller_client_id
  client_id?: string
  buyer_client_id?: string
  seller_client_id?: string
  commission_id?: string
  document_id?: string

  // Aracılık ve ilan bilgileri
  agency_contract_no?: string
  agency_contract_date?: string
  system_listing_no?: string
  external_listing_no?: string

  // Gayrimenkul (snapshot)
  property_kind?: SalesClosingPropertyKind
  property_address?: string
  property_district?: string
  property_city?: string
  tapu_pafta?: string
  tapu_ada?: string
  tapu_parsel?: string

  // Satıcı (snapshot)
  seller_name?: string
  seller_tc?: string
  seller_address?: string
  seller_phone?: string

  // Alıcı (snapshot)
  buyer_name?: string
  buyer_tc?: string
  buyer_address?: string
  buyer_phone?: string

  // Satış işlemi
  transaction_date?: string
  sale_amount?: number
  seller_fee_amount?: number
  seller_fee_rate?: number
  buyer_fee_amount?: number
  buyer_fee_rate?: number
  service_fee?: number       // toplam = seller_fee + buyer_fee
  consultant_name_snapshot?: string

  // Dağılım
  hq_share_rate?: number
  hq_share_amount?: number
  office_share_rate?: number
  office_share_amount?: number
  consultant_share_rate?: number
  consultant_share_amount?: number
  co_consultant_share_rate?: number
  co_consultant_share_amount?: number

  // Akış
  status: SalesClosingStatus
  notes?: string
  filled_at?: string
  filled_by?: string
  signed_at?: string
  pdf_url?: string
  signed_pdf_url?: string
  created_at: string
  updated_at: string

  // İlişkili veriler (JOIN ile)
  property?: Property
  office?: Office
  brand?: Brand
  consultant?: Consultant
  co_consultant?: Consultant
  buyer?: Client
  seller?: Client
}

export interface Expense {
  id: string
  consultant_id: string
  office_id?: string
  amount: number
  category: ExpenseCategory
  description: string
  receipt_url?: string
  expense_date: string
  is_approved?: boolean
  approved_at?: string
  is_recurring: boolean
  recurring_day?: number
  parent_expense_id?: string
  month_tag?: string
  notes?: string
  created_at: string
}

export interface Document {
  id: string
  doc_type: DocumentType
  title: string
  client_id?: string
  property_id?: string
  consultant_id?: string
  template_name?: string
  pdf_url?: string
  signed_pdf_url?: string
  docusign_envelope_id?: string
  signature_status: SignatureStatus
  sent_at?: string
  signed_at?: string
  expires_at?: string
  created_at: string
}

export interface SocialPost {
  id: string
  consultant_id: string
  property_id?: string
  platform: SocialPlatform
  content_text?: string
  hashtags?: string[]
  image_urls?: string[]
  video_url?: string
  status: PostStatus
  scheduled_at?: string
  posted_at?: string
  platform_post_id?: string
  created_at: string
}

export type CampaignChannel = 'whatsapp' | 'email' | 'linkedin' | 'sms'
export type AudienceSource = 'clients' | 'leads' | 'mixed'

export interface Campaign {
  id: string
  name: string
  consultant_id: string
  channel: CampaignChannel
  message_template: string
  subject?: string
  html_template?: string
  from_name?: string
  audience_source: AudienceSource
  lead_filter?: { city?: string; district?: string; source?: string; tags?: string[] }
  property_id?: string
  status: 'draft' | 'scheduled' | 'sending' | 'completed' | 'cancelled'
  scheduled_at?: string
  target_count: number
  sent_count: number
  failed_count: number
  opened_count: number
  clicked_count: number
  created_at: string
}

export type LeadSource =
  | 'apify_google_maps'
  | 'apify_linkedin_people'
  | 'apify_linkedin_company'
  | 'apify_emlak'
  | 'manual_csv'
  | 'manual'

export interface MarketingLead {
  id: string
  full_name?: string
  email?: string
  phone?: string
  company?: string
  title?: string
  industry?: string
  city?: string
  district?: string
  linkedin_url?: string
  website?: string
  source: LeadSource
  source_detail?: string
  enrichment_data?: Record<string, unknown>
  tags?: string[]
  kvkk_consent: boolean
  unsubscribed: boolean
  unsubscribed_at?: string
  bounced: boolean
  last_contacted_at?: string
  contact_count: number
  converted_to_client_id?: string
  scrape_job_id?: string
  consultant_id?: string
  notes?: string
  created_at: string
  updated_at: string
}

export type ScrapeJobType =
  | 'google_maps'
  | 'linkedin_people'
  | 'linkedin_company'
  | 'linkedin_message'

export interface LeadScrapeJob {
  id: string
  job_type: ScrapeJobType
  actor_id: string
  input: Record<string, unknown>
  apify_run_id?: string
  apify_dataset_id?: string
  status: 'pending' | 'running' | 'succeeded' | 'failed'
  result_count: number
  imported_count: number
  cost_usd?: number
  error_message?: string
  consultant_id?: string
  started_at?: string
  completed_at?: string
  created_at: string
}
