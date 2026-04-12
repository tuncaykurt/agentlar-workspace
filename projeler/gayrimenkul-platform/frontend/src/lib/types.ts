// Gayrimenkul Platform — TypeScript Tipler
// Supabase şemasına göre oluşturulmuştur

export type UserRole = 'admin' | 'manager' | 'consultant'
export type ClientType = 'buyer' | 'seller' | 'both' | 'investor' | 'tenant' | 'landlord' | 'network'
export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'negotiating' | 'won' | 'lost' | 'dormant'
export type PropertyStatus = 'active' | 'under_offer' | 'sold' | 'rented' | 'withdrawn'
export type PropertyType = 'apartment' | 'villa' | 'land' | 'commercial' | 'office' | 'shop' | 'warehouse' | 'detached_house'
export type ListingSource = 'manual' | 'sahibinden' | 'cb_com_tr' | 'hepsiemlak' | 'emlakjet' | 'zingat' | 'referral' | 'walk_in' | 'other'
export type InteractionChannel = 'whatsapp' | 'email' | 'call_inbound' | 'call_outbound' | 'sms' | 'meeting' | 'note'
export type DocumentType = 'authorization' | 'sales_contract' | 'rental_contract' | 'offer_letter' | 'other'
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
  instagram_handle?: string
  facebook_page?: string
  linkedin_url?: string
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
  features: string[]
  photos: string[]
  source: ListingSource
  source_url?: string
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
  sale_price: number
  total_commission_rate: number
  total_commission_amount?: number
  office_share_amount?: number
  consultant_share_rate?: number
  consultant_share_amount?: number
  status: CommissionStatus
  paid_at?: string
  notes?: string
  created_at: string
}

export interface Expense {
  id: string
  consultant_id: string
  amount: number
  category: ExpenseCategory
  description: string
  receipt_url?: string
  expense_date: string
  is_approved?: boolean
  approved_at?: string
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

export interface Campaign {
  id: string
  name: string
  consultant_id: string
  message_template: string
  status: 'draft' | 'scheduled' | 'sending' | 'completed' | 'cancelled'
  scheduled_at?: string
  target_count: number
  sent_count: number
  failed_count: number
  created_at: string
}
