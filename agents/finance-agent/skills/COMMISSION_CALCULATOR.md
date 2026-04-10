# Skill: COMMISSION_CALCULATOR

## Purpose
Satış kapandığında toplam komisyonu hesapla, ofis ve danışman paylarını belirle ve kaydet.

## Serves Goals
- Komisyon hesaplama doğruluğu: 0 hata

## Inputs
- Supabase: `properties` (sale_price, assigned_consultant_id)
- Supabase: `consultants` (commission_rate)
- Supabase: `settings` (office_commission_rate)
- n8n webhook payload: `{ property_id, sale_price, co_consultant_id? }`

## Process
1. property_id ile mülk ve danışman bilgilerini çek
2. Hesaplama:
   ```
   total_commission = sale_price × (office_commission_rate / 100)
   consultant_share = total_commission × (consultant.commission_rate / 100)
   office_share = total_commission - consultant_share
   
   Eğer co_consultant varsa:
   co_share = consultant_share × (co_consultant_rate / 100)
   consultant_share = consultant_share - co_share
   ```
3. `commissions` tablosuna kaydet
4. property.status = 'sold', property.sold_at = now() yap
5. n8n webhook tetikle: `/webhook/commission-notify` (WA bildirimi için)

## Outputs
- Yeni `commissions` kaydı
- Güncellenmiş `properties` kaydı
- Journal girişi: "Satış kapandı: [şehir/ilçe], [fiyat], komisyon: [tutar]"

## Quality Bar
- Hesaplama her zaman 2 ondalık basamakla yapılmalı
- Sıfır veya negatif komisyon durumunda Human'a eskalasyon
- Her satış için mutlaka bir commission kaydı olmalı
