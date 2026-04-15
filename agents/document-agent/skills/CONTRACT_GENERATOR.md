# Skill: CONTRACT_GENERATOR

## Purpose
Veritabanı verilerini kullanarak sözleşme/yetki belgesi HTML şablonunu doldur, PDF'e çevir ve DocuSign'a gönder.

## Serves Goals
- Şablon kullanım oranı >%90
- DocuSign teslim başarısı >%98

## Inputs
- Supabase: `documents` (type, client_id, property_id, template_data)
- `data/imports/templates/authorization.html` — Yetki belgesi şablonu
- `data/imports/templates/sales_contract.html` — Satış sözleşmesi şablonu
- `data/imports/templates/rental_contract.html` — Kira sözleşmesi şablonu

## Process
1. document.type'a göre doğru şablonu seç
2. template_data JSON'ından değerleri çek
3. HTML şablonundaki `{{field_name}}` placeholder'ları doldur
4. n8n webhook: `POST /webhook/generate-pdf` → HTML → PDF (Puppeteer ile)
5. PDF'i Supabase Storage'a yükle → documents.pdf_url güncelle
6. DocuSign envelope oluştur:
   - Signer: client (email ve isim)
   - CC: consultant (bilgi için)
   - İmza alanı: PDF'in imza bölümüne yerleştir
7. Envelope ID'yi kaydet: documents.docusign_envelope_id
8. documents.status = 'sent', documents.sent_at = now()

## Outputs
- PDF dosyası (Supabase Storage)
- DocuSign envelope
- Güncellenmiş documents kaydı

## Quality Bar
- Tüm zorunlu alanlar dolu olmalı (boş alan varsa Human'a sor)
- PDF boyutu <5MB olmalı
- DocuSign linki müşterinin e-postasına ve WA'ya gönderilmeli

## Tools
- n8n webhook: `/webhook/generate-pdf`
- DocuSign API (n8n üzerinden)
- Supabase Storage API

## Şablon Zorunlu Alanları (Yetki Belgesi)
```
{{client_full_name}}, {{client_id_number}}, {{client_phone}}
{{property_address}}, {{property_type}}, {{price}}
{{consultant_full_name}}, {{consultant_phone}}, {{office_name}}
{{authorization_duration}}, {{commission_rate}}
{{date}}
```
