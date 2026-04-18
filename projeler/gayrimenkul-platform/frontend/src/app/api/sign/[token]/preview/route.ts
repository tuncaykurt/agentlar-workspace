import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, key, { auth: { persistSession: false } })
}

function money(v: string | null | undefined) {
  if (!v) return '___'
  const n = parseFloat(String(v).replace(/[^0-9.]/g, ''))
  if (isNaN(n)) return String(v)
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(n)
}

function fmtDate(v: string | null | undefined) {
  if (!v) return '___'
  try { return new Date(v).toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' }) }
  catch { return v }
}

function numToWords(v: string | null | undefined): string {
  if (!v) return '___'
  const n = parseInt(String(v).replace(/[^0-9]/g, ''))
  if (isNaN(n) || n === 0) return 'sıfır'
  const ones = ['','bir','iki','üç','dört','beş','altı','yedi','sekiz','dokuz']
  const tens = ['','on','yirmi','otuz','kırk','elli','altmış','yetmiş','seksen','doksan']
  const cvt3 = (x: number): string => {
    if (x === 0) return ''
    let r = ''
    if (x >= 100) { r += (x >= 200 ? ones[Math.floor(x/100)] : '') + 'yüz'; x %= 100 }
    if (x >= 10) { r += tens[Math.floor(x/10)]; x %= 10 }
    if (x > 0) r += ones[x]
    return r
  }
  let x = n, r = ''
  if (x >= 1000000000) { r += cvt3(Math.floor(x/1000000000)) + 'milyar'; x %= 1000000000 }
  if (x >= 1000000) { r += cvt3(Math.floor(x/1000000)) + 'milyon'; x %= 1000000 }
  if (x >= 1000) { const t = Math.floor(x/1000); r += (t === 1 ? '' : cvt3(t)) + 'bin'; x %= 1000 }
  return r + cvt3(x)
}

function clientName(c?: { full_name: string; salutation?: string } | null) {
  if (!c) return '_______________'
  return `${c.salutation ? c.salutation + ' ' : ''}${c.full_name}`.trim()
}

type SigRow = { signer_role: string; status: string; signature_data: string | null; signature_type: string | null; signer_name: string }

function sigArea(signatures: SigRow[], role: string): string {
  const req = signatures.find(r => r.signer_role === role && r.status === 'signed')
  if (!req) return ''
  if (req.signature_type === 'drawn' && req.signature_data?.startsWith('data:image')) {
    return `<div style="margin:4px 0;"><img src="${req.signature_data}" alt="İmza" style="max-height:60px;max-width:180px;object-fit:contain;" /></div>`
  }
  if (req.signature_type === 'typed' && req.signature_data) {
    return `<div style="margin:4px 0;font-family:'Brush Script MT',cursive;font-size:22px;color:#1a237e;">${req.signature_data}</div>`
  }
  return ''
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function generateDocHTML(doc: any, settings: Record<string, string>, signatures: SigRow[] = []) {
  const data = (doc.template_data || {}) as Record<string, string | null>
  const officeName = settings.office_name || 'Ambiance Gayrimenkul'
  const officeLegalName = settings.office_legal_name || officeName
  const officeAddress = settings.office_address || ''
  const officeLogo = settings.office_logo || ''
  const officeMersis = settings.office_mersis || '0068090568900012'
  const today = new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' })

  const secondName = data.second_client_name || '_______________'
  const prop = doc.property
  const consultant = doc.consultant

  const letterhead = `
    <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:24px;padding-bottom:16px;border-bottom:1px solid #ccc;">
      <div style="flex:0 0 auto;">
        ${officeLogo
          ? `<img src="${officeLogo}" style="max-height:80px;max-width:220px;object-fit:contain;display:block;" />`
          : `<div style="font-weight:bold;font-size:16px;color:#111;">${officeName}</div>`}
      </div>
      <div style="text-align:right;font-size:12px;color:#333;line-height:1.8;max-width:300px;">
        <div style="font-weight:bold;font-size:13px;color:#111;">${officeLegalName}</div>
        ${officeAddress ? `<div style="color:#555;font-size:11.5px;">${officeAddress.replace(/\n/g, '<br>')}</div>` : ''}
        <div style="color:#777;font-size:11px;margin-top:2px;">Mersis No: ${officeMersis}</div>
      </div>
    </div>`

  const baseStyles = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html { overflow-x: hidden; }
    body { font-family: 'Times New Roman', Times, serif; max-width: 860px; margin: 0 auto; padding: 32px 28px; color: #111; font-size: 16px; line-height: 1.9; overflow-x: hidden; word-break: break-word; }
    h1 { font-size: 21px; text-align: center; text-transform: uppercase; letter-spacing: 3px; margin-bottom: 8px; }
    .sub { text-align: center; font-size: 15px; color: #555; margin-bottom: 6px; }
    .divider { border: none; border-top: 2px solid #111; margin: 14px 0 22px; }
    .tbl-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; width: 100%; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 14px; min-width: 0; }
    table td { padding: 5px 8px; vertical-align: top; font-size: 15px; word-break: break-word; }
    .sigs { display: flex; justify-content: space-around; margin-top: 52px; gap: 16px; flex-wrap: wrap; page-break-inside: avoid; }
    .sig { text-align: center; flex: 1; min-width: 120px; page-break-inside: avoid; }
    .sig-line { border-top: 1px solid #000; padding-top: 8px; font-size: 14px; min-height: 64px; }
    p { font-size: 16px; }
    @media screen and (max-width: 640px) {
      body { font-size: 16px; padding: 20px 16px; line-height: 1.85; }
      h1 { font-size: 19px; letter-spacing: 2px; margin-bottom: 6px; }
      .sub { font-size: 14px; }
      table td { font-size: 14px; padding: 6px 8px; }
      .sigs { flex-direction: column; gap: 24px; }
      .sig { min-width: unset; }
      .sig-line { font-size: 13px; }
      .auth-tbl td { font-size: 13px; padding: 5px 6px; }
      .kira-tbl td { font-size: 14px; padding: 6px 8px; }
      .kira-tbl td:first-child { width: auto; white-space: normal; }
      .sec-title { font-size: 14px; padding: 6px 10px; }
      .clause { font-size: 15px; line-height: 1.75; }
      .print-bar { justify-content: center; }
      .print-btn, .pdf-btn { font-size: 13px; padding: 10px 18px; }
    }
    @media screen and (max-width: 400px) {
      body { padding: 16px 12px; font-size: 15px; }
      h1 { font-size: 17px; letter-spacing: 1px; }
      table td { font-size: 13px; padding: 5px 6px; }
      .auth-tbl td { font-size: 12px; padding: 4px 5px; }
      .kira-tbl td { font-size: 13px; }
      .clause { font-size: 14px; }
    }
    .print-bar { display: flex; gap: 10px; justify-content: flex-end; margin-bottom: 20px; }
    .print-btn { background: #2563eb; color: #fff; border: none; padding: 10px 22px; border-radius: 8px; cursor: pointer; font-size: 14px; font-family: sans-serif; }
    .pdf-btn { background: #16a34a; color: #fff; border: none; padding: 10px 22px; border-radius: 8px; cursor: pointer; font-size: 14px; font-family: sans-serif; }
    @media print {
      .no-print { display: none !important; }
      @page { size: A4; margin: 8mm 6mm; }
      body { padding: 0 4px; font-size: 13px; max-width: 100%; }
      table td { font-size: 12px; }
      h1 { font-size: 16px; }
      .sig-area img { display: block !important; max-height: 56px !important; max-width: 180px !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }`

  const jsBlock = `<script>function pdfDownload(t,d){var el=document.createElement('style');el.id='__pdf_fit';el.textContent='@page{size:A4;margin:6mm 4mm}@media print{body{zoom:0.68;padding:10px 8px;max-width:100%;}}';document.head.appendChild(el);document.title=t;window.print();setTimeout(function(){var s=document.getElementById('__pdf_fit');if(s)s.parentNode.removeChild(s);},500);}<\/script>`

  // ── Sales contract ────────────────────────────────────────────────────────
  if (doc.doc_type === 'sales_contract') {
    const body = `
      <table style="margin-bottom:16px;font-size:15px;">
        <tr>
          <td style="font-weight:bold;width:130px;white-space:nowrap;padding:4px 6px;">SATICI</td>
          <td style="padding:4px 6px;">${clientName(doc.client)}${data.main_tc_no ? ' &bull; TC: ' + data.main_tc_no : ''}${doc.client?.phone ? ' &bull; Tel: ' + doc.client.phone : ''}${(data.main_address || doc.client?.address) ? '<br><span style="color:#555;">' + (data.main_address || doc.client?.address) + '</span>' : ''}</td>
        </tr>
        <tr>
          <td style="font-weight:bold;padding:4px 6px;">ALICI</td>
          <td style="padding:4px 6px;">${secondName}${data.second_tc_no ? ' &bull; TC: ' + data.second_tc_no : ''}${data.second_client_phone ? ' &bull; Tel: ' + data.second_client_phone : ''}${data.second_address ? '<br><span style="color:#555;">' + data.second_address + '</span>' : ''}</td>
        </tr>
        ${prop || data.ada ? `<tr><td style="font-weight:bold;padding:4px 6px;">TAŞINMAZ</td><td style="padding:4px 6px;">${prop ? [prop.title, prop.city, prop.district].filter(Boolean).join(' — ') : ''}${data.ada ? ' &bull; Ada: ' + data.ada + (data.parsel ? ' / Parsel: ' + data.parsel : '') + (data.pafta ? ' / Pafta: ' + data.pafta : '') : ''}</td></tr>` : ''}
      </table>
      <div style="line-height:1.9;font-size:15px;">
        <p style="margin-bottom:12px;text-align:justify;"><strong>1-</strong> ALICI ile SATICI yukarıda bahsi geçen gayrimenkulün satışı hususunda aşağıdaki şartlarla anlaşmayı kabul eder. SATICI, sahibi bulunduğu veya satmaya yetkili olduğu bu mülkün satışını <strong>${money(data.satis_bedeli)} (${numToWords(data.satis_bedeli)})</strong> olarak kabul etmiştir. Satış bedeline mahsuben ALICI'dan <strong>${money(data.kapora)}</strong> kaparo olarak alınmıştır.${data.hizmet_tapuda ? ` Hizmet bedelinin kalan <strong>${money(data.hizmet_tapuda)}</strong> Tapu işlemleri sırasında alınacaktır.` : ''} Satış bedelinin <strong>${money(data.pesin_odenen)}</strong> peşinen ödenmiş olup, geri kalanı da <strong>${money(data.tapuda_odenecek)}</strong> tapuda ödenecektir.</p>
        <p style="margin-bottom:12px;text-align:justify;"><strong>2-</strong> Bu anlaşma imzalandıktan sonra, Borçlar Kanununun ilgili maddesine göre taraflardan ALICI gayrimenkulü almaktan vazgeçtiği takdirde verdiği kaporayı geri almayacaktır.</p>
        <p style="margin-bottom:12px;text-align:justify;"><strong>3-</strong> ALICI ve SATICI kendilerine bu anlaşmayı sağlayan <strong>Coldwell Banker Ambiance Gayrimenkul</strong>'e işbu sözleşmenin imzalanmasıyla yukarıdaki satış bedeli üzerinden <strong>(%${data.komisyon_alici || '2'} + %${data.komisyon_satici || '2'}) + KDV</strong> komisyon ücretini hiçbir ihtara ve ihbara gerek kalmadan ödemeyi peşinen kabul ve taahhüt eder.</p>
        <p style="margin-bottom:12px;text-align:justify;"><strong>4-</strong> ALICI ve SATICI'nın her biri, daha sonra alım ve/veya satımdan vazgeçerlerse veya Coldwell Banker Ambiance Gayrimenkul'ün dışında gelişen herhangi bir nedenle tapudaki satışı gerçekleştiremezseler; vazgeçen ve/veya satışa engel çıkartan taraf hem kendi ödeyeceği, hem de diğer tarafın ödeyeceği komisyon ücretinin tamamını <strong>(% ${(parseFloat(String(data.komisyon_alici||2))+parseFloat(String(data.komisyon_satici||2))).toFixed(0)} + KDV)</strong> Coldwell Banker Ambiance Gayrimenkul'a ödemeyi peşinen kabul ve taahhüt eder.</p>
        <p style="margin-bottom:12px;text-align:justify;"><strong>5-</strong> Satıştan vazgeçen ve/veya satışa engel çıkartan tarafın diğer tarafa ödeyeceği ceza miktarı <strong>${money(data.ceza_miktari)}</strong>'dir.</p>
        <p style="margin-bottom:12px;text-align:justify;"><strong>6-</strong> Dijital olarak tanzim edilen işbu sözleşme yukarıdaki hükümler ve sözleşmeye eklenecek ekleri (var ise) ile birlikte geçerli olmak üzere taraflarca kayıtsız, şartsız kabul edilmiş olup, sözleşmeden doğacak ihtilaflarda merci T.C. Bursa mahkeme ve icra daireleri yetkilidir.</p>
        ${data.ozel_sartlar ? `<p style="margin-bottom:12px;text-align:justify;"><strong>EK MADDE:</strong> ${data.ozel_sartlar}</p>` : ''}
      </div>`

    const sigs = `
      <div class="sig"><div class="sig-line">${sigArea(signatures, 'main')}SATICI<br><strong>${clientName(doc.client)}</strong></div></div>
      <div class="sig"><div class="sig-line">${sigArea(signatures, 'second')}ALICI<br><strong>${secondName}</strong></div></div>
      <div class="sig"><div class="sig-line">${sigArea(signatures, 'consultant')}Danışman<br><strong>${consultant?.full_name || '___'}</strong><br>Ambiance Gayrimenkul</div></div>`

    return `<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>GAYRİMENKUL SATIŞ SÖZLEŞMESİ</title><style>${baseStyles}</style>${jsBlock}</head><body>
      <div class="no-print print-bar"><button class="print-btn" onclick="window.print()">🖨️ Yazdır</button><button class="pdf-btn" onclick="pdfDownload('Satış Sözleşmesi','sales_contract')">⬇️ PDF İndir</button></div>
      ${letterhead}
      <h1>GAYRİMENKUL SATIŞ SÖZLEŞMESİ</h1>
      <div class="sub">PROTOKOL YAZISI</div>
      <div class="sub">${fmtDate(new Date().toISOString())}</div>
      <hr class="divider">
      ${body}
      <div class="sigs">${sigs}</div>
    </body></html>`
  }

  // ── Rental contract ───────────────────────────────────────────────────────
  if (doc.doc_type === 'rental_contract') {
    const aylik = data.aylik_kira
    const yillik = aylik ? String(parseFloat(String(aylik).replace(/[^0-9.]/g,''))*12) : null

    const body = `
      <style>
        .kira-tbl { width:100%; border-collapse:collapse; font-size:15px; margin-bottom:16px; }
        .kira-tbl td { border:1px solid #000; padding:4px 8px; vertical-align:top; word-break:break-word; }
        .kira-tbl td:first-child { font-weight:bold; white-space:nowrap; width:220px; background:#f5f5f5; }
      </style>
      <div class="tbl-wrap"><table class="kira-tbl">
        <tr><td>KİRALANANIN ADRESİ</td><td>${data.kiralanan_adres || (prop ? [prop.address, prop.district, prop.city].filter(Boolean).join(', ') : '___')}</td></tr>
        <tr><td>KİRAYA VERENİN ADI SOYADI</td><td>${clientName(doc.client)}${doc.client?.phone ? ' — TEL: ' + doc.client.phone : ''}</td></tr>
        <tr><td>KİRACININ AD SOYADI ADRESİ</td><td>${secondName}${data.second_client_phone ? ' — TEL: ' + data.second_client_phone : ''}${data.kontrat_adres ? '<br>KONTRAT ADRESİ: ' + data.kontrat_adres : ''}</td></tr>
        <tr><td>AYLIK KİRA TUTARI</td><td>${money(aylik)} (${numToWords(aylik)} türk lirası)</td></tr>
        <tr><td>YILLIK KİRA TUTARI</td><td>${yillik ? money(yillik) + ' (' + numToWords(yillik) + ' türk lirası)' : '___'}</td></tr>
        <tr><td>DEPOZİTO</td><td>${money(data.depozito)}</td></tr>
        <tr><td>KİRANIN BAŞLANGICI</td><td>${fmtDate(data.kira_baslangic)}</td></tr>
        <tr><td>KİRANIN MÜDDETİ</td><td>${data.kira_suresi_ay || '12'} AY</td></tr>
        <tr><td>YILLIK KİRA ARTIŞ ORANI</td><td>${data.artis_orani || 'YILLIK TÜFE ORANINA GÖRE YAPILACAKTIR.'}</td></tr>
        <tr><td>KİRALANANIN KULLANIM AMACI</td><td>${data.kullanim_amaci || 'KONUT'}</td></tr>
        <tr><td>TESLİM ALINAN DEMİRBAŞ LİSTESİ</td><td>${data.demirbas_listesi || '---'}</td></tr>
      </table></div>`

    const sigs = `
      <div class="sig"><div class="sig-line">${sigArea(signatures, 'main')}KİRAYA VEREN<br><strong>${clientName(doc.client)}</strong></div></div>
      <div class="sig"><div class="sig-line">${sigArea(signatures, 'second')}KİRACI<br><strong>${secondName}</strong></div></div>
      <div class="sig"><div class="sig-line">${sigArea(signatures, 'consultant')}Danışman<br><strong>${consultant?.full_name || '___'}</strong><br>Ambiance Gayrimenkul</div></div>`

    return `<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>GAYRİMENKUL KİRA SÖZLEŞMESİ</title><style>${baseStyles}</style>${jsBlock}</head><body>
      <div class="no-print print-bar"><button class="print-btn" onclick="window.print()">🖨️ Yazdır</button><button class="pdf-btn" onclick="pdfDownload('Kira Sözleşmesi','rental_contract')">⬇️ PDF İndir</button></div>
      ${letterhead}
      <h1>GAYRİMENKUL KİRA SÖZLEŞMESİ</h1>
      <div class="sub">${today}</div>
      <hr class="divider">
      ${body}
      <div class="sigs">${sigs}</div>
    </body></html>`
  }

  // ── Authorization ─────────────────────────────────────────────────────────
  if (doc.doc_type === 'authorization') {
    const propType = (data.mulk_tipi || prop?.property_type || '')
    const chk = (c: boolean) => c ? '&#9745;' : '&#9744;'
    const typeMap: Record<string, string> = { apartment: 'Apt. Dairesi', detached_house: 'Ev', villa: 'Villa', commercial: 'İşyeri', shop: 'Dükkan', land: 'Arsa' }

    const sureSon = (() => {
      try {
        const d = new Date(data.baslangic_tarihi || new Date().toISOString())
        d.setDate(d.getDate() + parseInt(String(data.yetki_suresi_gun || '90')))
        return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' })
      } catch { return '___' }
    })()

    const body = `
      <style>
        .auth-tbl{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:0;}
        .auth-tbl td{border:1px solid #000;padding:6px 8px;vertical-align:middle;}
        .sec-title{background:#e0e0e0;font-weight:bold;font-size:12px;padding:6px 8px;border:1px solid #000;border-bottom:none;text-transform:uppercase;}
        .clause{font-size:10.5px;line-height:1.65;margin-bottom:5px;text-align:justify;}
      </style>
      <table class="auth-tbl" style="margin-bottom:0;">
        <tr>
          <td style="width:42%;vertical-align:top;padding:8px;border-right:2px solid #000;">
            ${logoHtml}
            <div style="margin-top:6px;font-size:9px;line-height:1.7;color:#222;">
              <strong style="font-size:10px;display:block;margin-bottom:2px;">${officeLegalName}</strong>
              ${officeAddress ? officeAddress.replace(/\n/g, '<br>') : ''}<br>
              <span style="color:#666;">Mersis No: ${officeMersis}</span>
            </div>
          </td>
          <td style="width:58%;padding:0;vertical-align:top;">
            <div style="background:#1a3a6b;color:#fff;text-align:center;padding:5px 8px;font-weight:bold;font-size:13px;letter-spacing:2px;">ARACILIK SÖZLEŞMESİ</div>
            <div style="padding:6px 8px;">
              <table style="width:100%;border-collapse:collapse;font-size:10px;">
                <tr><td style="font-weight:bold;width:85px;padding:2px 0;">AD SOYAD</td><td style="border-bottom:1px solid #bbb;padding:2px 4px;">${clientName(doc.client)}</td></tr>
                <tr><td style="font-weight:bold;padding:2px 0;">ADRESİ</td><td style="border-bottom:1px solid #bbb;padding:2px 4px;">${data.main_address || ''}</td></tr>
                <tr><td style="font-weight:bold;padding:2px 0;">TELEFON</td><td style="border-bottom:1px solid #bbb;padding:2px 4px;">${doc.client?.phone || ''}</td></tr>
                <tr><td style="font-weight:bold;padding:2px 0;">TC No</td><td style="border-bottom:1px solid #bbb;padding:2px 4px;">${data.main_tc_no || ''}</td></tr>
                <tr><td style="font-weight:bold;padding:2px 0;">e-mail</td><td style="border-bottom:1px solid #bbb;padding:2px 4px;">${data.main_email || doc.client?.email || ''}</td></tr>
              </table>
            </div>
          </td>
        </tr>
      </table>
      <div class="sec-title" style="margin-top:6px;">GAYRİMENKULE AİT BİLGİLER</div>
      <div class="tbl-wrap"><table class="auth-tbl">
        <tr>
          <td style="text-align:center;">${chk(propType==='detached_house')} Ev</td>
          <td style="text-align:center;">${chk(propType==='apartment')} Apt. Dairesi</td>
          <td style="text-align:center;">${chk(['commercial','office'].includes(propType))} İşyeri</td>
          <td style="text-align:center;">${chk(propType==='shop')} Dükkan</td>
          <td style="text-align:center;">${chk(propType==='villa')} Villa</td>
          <td style="text-align:center;">${chk(propType==='land')} Arsa</td>
          <td style="text-align:center;">${chk(!['detached_house','apartment','commercial','office','shop','villa','land'].includes(propType))} Diğer</td>
        </tr>
        <tr><td colspan="2" style="font-weight:bold;">Adresi</td><td colspan="5">${[prop?.address, prop?.district, prop?.city].filter(Boolean).join(', ') || '___'}</td></tr>
        <tr><td style="font-weight:bold;">Mahallesi</td><td colspan="2">${data.mahalle || '___'}</td><td style="font-weight:bold;">İlçesi</td><td>${data.ilce || prop?.district || '___'}</td><td style="font-weight:bold;">İli</td><td>${data.il || prop?.city || '___'}</td></tr>
        <tr><td colspan="2" style="font-weight:bold;">Tapu Kayıt Bilg.</td><td>Pafta: ${data.pafta || '___'}</td><td colspan="2">Ada: ${data.ada || '___'}</td><td colspan="2">Parsel: ${data.parsel || '___'}</td></tr>
        <tr><td colspan="2" style="font-weight:bold;">Diğer Özellikler</td><td colspan="5">${data.ozel_sartlar || ''}</td></tr>
      </table></div>
      <div class="sec-title" style="margin-top:6px;">YAPILACAK İŞLEME AİT BİLGİLER</div>
      <div class="tbl-wrap"><table class="auth-tbl">
        <tr>
          <td style="font-weight:bold;">${data.yetki_turu === 'Kiralama' ? 'Kira Bedeli' : 'Satış Tutarı'}</td>
          <td>${data.yetki_turu === 'Kiralama' ? (data.kira_bedeli ? money(data.kira_bedeli) + ' + KDV' : '___') : money(data.satis_tutari)} TL</td>
          <td style="font-weight:bold;">Ödeme Şekli</td>
          <td>${data.odeme_sekli || 'Nakit'}</td>
        </tr>
        <tr>
          <td style="font-weight:bold;">Komisyon Oranı</td>
          <td>%${data.komisyon_orani || '2'} + KDV (${data.komisyon_turu || 'Satıcıdan'})</td>
          <td style="font-weight:bold;">Gayrimenkul Danışmanı</td>
          <td>${consultant?.full_name || '___'}</td>
        </tr>
        <tr>
          <td style="font-weight:bold;">Yetki Türü</td>
          <td>${data.yetki_turu || 'Satış'}</td>
          <td style="font-weight:bold;">Süre</td>
          <td>${data.yetki_suresi_gun || '90'} gün (${fmtDate(data.baslangic_tarihi)} – ${sureSon})</td>
        </tr>
      </table></div>
      <div style="margin-top:8px;">
        <p class="clause"><strong>1. KONU:</strong> Müşteri ile ${officeName}, yukarıda belirtilen gayrimenkulün ${data.yetki_turu || 'satış'}ına aracılık edilmesi işlemi için karşılıklı olarak anlaşılmıştır.</p>
        <p class="clause"><strong>2. TANITIM YETKİSİ:</strong> Müşteri, gayrimenkulü ile ilgili olarak satış işlemi amacıyla internet, basın, yayın ve medyaya da dahil olmak üzere tanıtım faaliyetlerinde bulunması hakkında ve gayrimenkulün giriş müşahedesi yapılmasını Ambiance Gayrimenkul'e kabul ve taahhüt eder.</p>
        <p class="clause"><strong>3. YETKİ:</strong> Müşteri, gayrimenkulü ile ilgili olarak kendisine gelen tüm başvuruları Ambiance Gayrimenkul'e bildirmeyi ve sözleşme süresi dolmadan başka bir gayrimenkul şirketi ile çalışmamayı kabul ve taahhüt eder. Sözleşmeyi süresinden önce feshetmesi ya da başka bir şirkete sattırması halinde %${data.komisyon_orani || '2'} + KDV komisyon miktarını Ambiance Gayrimenkul'e ödemeyi kabul eder.</p>
        <p class="clause"><strong>4. İŞLEM YETKİSİ:</strong> Müşteri, gayrimenkulünün üzerinde işlem yapma yetkisi bulunmayan üçüncü kişilerin sebep olacağı zararı önlemek amacıyla Ambiance Gayrimenkul'in gerekli tedbirleri almasına izin vermeyi kabul eder.</p>
        <p class="clause"><strong>5. SÜRE:</strong> İşbu sözleşme imzalandığı tarihten itibaren <strong>${data.yetki_suresi_gun || '90'} gün</strong> süreyle geçerlidir. Bitiş: <strong>${sureSon}</strong>. Sözleşme süresi içinde taşınmaz satılır/kiralanırsa komisyon tutarı tahsil edilecektir.</p>
        <p class="clause"><strong>6. SÜRENİN BİTİMİ:</strong> Sözleşme süresinin dolmasından sonra ${data.yetki_suresi_gun || '90'} gün içinde Ambiance Gayrimenkul'in tanıştırdığı kişiyle işlem yapılması halinde komisyon miktarının 2 katı + KDV hizmet bedeli olarak ödenir.</p>
        <p class="clause"><strong>7. İHTİLAF:</strong> Bu sözleşmenin uygulanmasından doğacak uyuşmazlıklarda Bursa (Merkez) Mahkemeleri ve İcra Daireleri yetkilidir. Doğacak damga vergisi, resim, pul ve harçların tamamı müşteriye aittir.</p>
        ${data.ek_madde ? `<p class="clause"><strong>EK MADDE:</strong> ${data.ek_madde}</p>` : ''}
      </div>`

    const sigs = `
      <div class="sig"><div class="sig-line">${sigArea(signatures, 'main')}MÜŞTERİ<br><strong>${clientName(doc.client)}</strong></div></div>
      <div class="sig"><div class="sig-line">${sigArea(signatures, 'consultant')}GAYRİMENKUL DANIŞMANI<br><strong>${consultant?.full_name || '___'}</strong><br>Ambiance Adına İmza</div></div>`

    const logoHtml = officeLogo
      ? `<img src="${officeLogo}" style="max-height:100px;max-width:260px;object-fit:contain;display:block;" />`
      : `<div style="font-weight:bold;font-size:16px;color:#111;">${officeName}</div>`

    return `<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>ARACILIK SÖZLEŞMESİ</title><style>${baseStyles}</style>${jsBlock}</head><body>
      <div class="no-print print-bar"><button class="print-btn" onclick="window.print()">🖨️ Yazdır</button><button class="pdf-btn" onclick="pdfDownload('Aracılık Sözleşmesi','authorization')">⬇️ PDF İndir</button></div>
      <div style="margin-bottom:4px;">${logoHtml}</div>
      <h1>ARACILIK SÖZLEŞMESİ</h1>
      <div style="text-align:right;font-size:13px;color:#333;margin-bottom:2px;">Düzenlenme: ${today}</div>
      <hr class="divider">
      ${body}
      <div class="sigs">${sigs}</div>
    </body></html>`
  }

  // ── Offer letter ─────────────────────────────────────────────────────────
  if (doc.doc_type === 'offer_letter') {
    const body = `
      <table style="margin-bottom:16px;font-size:15px;">
        <tr><td style="font-weight:bold;width:160px;padding:4px 6px;">TEKLİF EDEN</td><td style="padding:4px 6px;">${clientName(doc.client)}${data.main_tc_no ? ' &bull; TC: ' + data.main_tc_no : ''}</td></tr>
        ${prop ? `<tr><td style="font-weight:bold;padding:4px 6px;">TAŞINMAZ</td><td style="padding:4px 6px;">${[prop.title, prop.district, prop.city].filter(Boolean).join(' — ')}</td></tr>` : ''}
        <tr><td style="font-weight:bold;padding:4px 6px;">TEKLİF BEDELİ</td><td style="padding:4px 6px;"><strong>${money(data.teklif_bedeli)}</strong></td></tr>
        ${data.gecerlilik_tarihi ? `<tr><td style="font-weight:bold;padding:4px 6px;">GEÇERLİLİK</td><td style="padding:4px 6px;">${fmtDate(data.gecerlilik_tarihi)}</td></tr>` : ''}
      </table>
      ${data.ozel_sartlar ? `<p style="margin-top:12px;font-size:15px;line-height:1.8;text-align:justify;"><strong>Özel Şartlar:</strong> ${data.ozel_sartlar}</p>` : ''}`

    const sigs = `
      <div class="sig"><div class="sig-line">${sigArea(signatures, 'main')}TEKLİF EDEN<br><strong>${clientName(doc.client)}</strong></div></div>
      <div class="sig"><div class="sig-line">${sigArea(signatures, 'consultant')}Danışman<br><strong>${consultant?.full_name || '___'}</strong><br>Ambiance Gayrimenkul</div></div>`

    return `<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>GAYRİMENKUL ALIM TEKLİF MEKTUBU</title><style>${baseStyles}</style>${jsBlock}</head><body>
      <div class="no-print print-bar"><button class="print-btn" onclick="window.print()">🖨️ Yazdır</button><button class="pdf-btn" onclick="pdfDownload('Teklif Mektubu','offer_letter')">⬇️ PDF İndir</button></div>
      ${letterhead}
      <h1>GAYRİMENKUL ALIM TEKLİF MEKTUBU</h1>
      <div class="sub">${fmtDate(new Date().toISOString())}</div>
      <hr class="divider">
      ${body}
      <div class="sigs">${sigs}</div>
    </body></html>`
  }

  // ── Fallback ──────────────────────────────────────────────────────────────
  return `<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Belge</title><style>${baseStyles}</style>${jsBlock}</head><body>
    <div class="no-print print-bar"><button class="print-btn" onclick="window.print()">🖨️ Yazdır</button><button class="pdf-btn" onclick="pdfDownload('Belge','other')">⬇️ PDF İndir</button></div>
    ${letterhead}
    <h1>${doc.title || 'BELGE'}</h1>
    <hr class="divider">
    <p style="text-align:center;color:#888;margin-top:40px;">Belge görüntülenemiyor.</p>
  </body></html>`
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string } }
) {
  const supabase = getServiceClient()

  const { data: sigReq, error } = await supabase
    .from('signature_requests')
    .select('id, document_id, status')
    .eq('token', params.token)
    .single()

  if (error || !sigReq) {
    return new NextResponse('Belge bulunamadı.', { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  }

  const [docRes, settingsRes, sigsRes] = await Promise.all([
    supabase
      .from('documents')
      .select('id, title, doc_type, template_data, client:clients(id, full_name, salutation, phone, address, email), property:properties(id, title, city, district, address, property_type), consultant:consultants(id, full_name)')
      .eq('id', sigReq.document_id)
      .single(),
    supabase
      .from('settings')
      .select('key, value')
      .in('key', ['office_name', 'office_legal_name', 'office_address', 'office_logo', 'office_mersis']),
    supabase
      .from('signature_requests')
      .select('signer_role, status, signature_data, signature_type, signer_name')
      .eq('document_id', sigReq.document_id),
  ])

  if (!docRes.data) {
    return new NextResponse('Belge verisi bulunamadı.', { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  }

  const settings: Record<string, string> = {}
  for (const row of settingsRes.data || []) {
    settings[row.key] = String(row.value || '').replace(/^"|"$/g, '')
  }

  const signatures = (sigsRes.data || []) as { signer_role: string; status: string; signature_data: string | null; signature_type: string | null; signer_name: string }[]

  const html = generateDocHTML(docRes.data, settings, signatures)
  return new NextResponse(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}
