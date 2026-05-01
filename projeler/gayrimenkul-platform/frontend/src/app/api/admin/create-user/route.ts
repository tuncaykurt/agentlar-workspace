import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'

// Admin API: Yeni danışman/broker hesabı oluşturur
// Sadece admin rolündeki kullanıcılar çağırabilir
export async function POST(req: NextRequest) {
  try {
    // 1) İsteği yapan kullanıcının admin olduğunu doğrula
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 401 })
    }

    const { data: caller } = await supabase
      .from('consultants')
      .select('role')
      .eq('user_id', user.id)
      .single()

    if (caller?.role !== 'admin') {
      return NextResponse.json({ error: 'Bu işlem için admin yetkisi gerekiyor.' }, { status: 403 })
    }

    // 2) İstek gövdesini al
    const body = await req.json()
    const { full_name, email, password, role, phone } = body

    if (!full_name || !email || !password) {
      return NextResponse.json({ error: 'Ad, e-posta ve şifre zorunludur.' }, { status: 400 })
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'Şifre en az 8 karakter olmalıdır.' }, { status: 400 })
    }

    // 3) Supabase Admin client (service role) ile kullanıcı oluştur
    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data: newAuthUser, error: authError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // E-posta onayı gerekmeden aktif
    })

    if (authError) {
      // E-posta zaten kayıtlıysa anlamlı mesaj ver
      if (authError.message.includes('already registered')) {
        return NextResponse.json({ error: 'Bu e-posta adresi zaten kayıtlı.' }, { status: 409 })
      }
      return NextResponse.json({ error: authError.message }, { status: 400 })
    }

    if (!newAuthUser?.user?.id) {
      return NextResponse.json({ error: 'Kullanıcı oluşturulamadı.' }, { status: 500 })
    }

    // 4) consultants tablosuna kaydet
    // (014_user_registration_trigger.sql var, trigger zaten eklemiş olabilir)
    // Trigger yoksa veya eksikse manuel olarak ekle
    const { data: existingConsultant } = await adminClient
      .from('consultants')
      .select('id')
      .eq('user_id', newAuthUser.user.id)
      .single()

    if (!existingConsultant) {
      const { error: insertErr } = await adminClient.from('consultants').insert({
        user_id: newAuthUser.user.id,
        full_name,
        email,
        phone: phone || null,
        role: role || 'consultant',
        is_active: true,
        commission_rate: 50,
      })
      if (insertErr) {
        return NextResponse.json({ error: `Auth hesabı oluşturuldu fakat consultant kaydı başarısız: ${insertErr.message}` }, { status: 500 })
      }
    } else {
      // Trigger oluşturduysa sadece rol/isim güncelle
      await adminClient
        .from('consultants')
        .update({ full_name, phone: phone || null, role: role || 'consultant' })
        .eq('user_id', newAuthUser.user.id)
    }

    return NextResponse.json({
      success: true,
      message: `${full_name} (${role}) başarıyla oluşturuldu.`,
      userId: newAuthUser.user.id,
    })
  } catch (err: any) {
    console.error('[create-user]', err)
    return NextResponse.json({ error: err.message || 'Sunucu hatası' }, { status: 500 })
  }
}
