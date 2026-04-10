# Document Agent — Rules

## CAN
- `documents` tablosunu okuyabilir ve güncelleyebilir
- Supabase Storage'a PDF yükleyebilir
- DocuSign API envelope oluşturabilir ve durumunu sorgulayabilir
- n8n belge bildirimi webhook'larını tetikleyebilir
- `outputs/` ve `journal/` klasörlerine yazabilir

## CANNOT
- Şablon dışı sözleşme metni oluşturamaz — Human'a danışılır
- İmzasız belgeyi 'signed' olarak işaretleyemez
- Müşteri verilerini journal'a yazamaz (KVKK)
- `knowledge/` dosyalarına yazamaz

## Handoff Kuralları
| Durum | Nereye |
|-------|--------|
| Müşteriye imza linki gönderilecek | → communication-agent (WA mesajı için) |
| Belge imzalandı, komisyon hesaplanacak | → finance-agent |
| Şablon dışı özel belge talep edildi | → Human |
| DocuSign API erişilemiyor | → Human (ACIL) |
