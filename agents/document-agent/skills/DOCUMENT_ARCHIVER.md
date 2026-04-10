# Skill: DOCUMENT_ARCHIVER

## Purpose
İmzalanan belgeleri Supabase Storage'a arşivle ve tüm taraflara bildirim gönder.

## Serves Goals
- Belge arşiv doğruluğu %100

## Inputs
- DocuSign: completed envelope (signed PDF URL)
- Supabase: `documents` (ilgili kayıt)

## Process
1. DocuSign'dan imzalanmış PDF'i indir
2. Supabase Storage'a yükle: `documents/signed/YYYY-MM-DD_[type]_[client_name].pdf`
3. documents.signed_pdf_url güncelle
4. documents.signed_at = now()
5. documents.signature_status = 'signed'
6. n8n webhook: tüm taraflara WA bildirimi + PDF linki
7. Journal'a yaz (anonim: "Yetki belgesi imzalandı - şehir/tarih")

## Outputs
- İmzalanmış PDF → Supabase Storage
- Güncellenmiş documents kaydı
- WA bildirimleri (consultant + client)
- Journal girişi

## Quality Bar
- PDF'in gerçekten imzalandığını DocuSign'dan doğrula
- Arşiv yolunu tutarlı format: `documents/signed/YYYY-MM-DD_[type]_[id].pdf`
- Hiçbir imzalı belge kaybolmamalı
