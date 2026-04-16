# Skill: EXPENSE_TRACKER

## Purpose
Danışman giderlerini takip et, onay sürecini yönet ve haftalık gider özeti oluştur.

## Serves Goals
- Gider onay süresi <2 gün
- Gider şeffaflığı <%5 onaysız

## Inputs
- Supabase: `expenses WHERE is_approved IS NULL`

## Process
1. Onay bekleyen giderleri çek
2. Kaç gündür bekliyor hesapla
3. 2+ gün bekleyenler → yöneticiye WA hatırlatma (n8n webhook)
4. 5+ gün bekleyenler → ACIL eskalasyon
5. Haftalık özet üret: kategori bazlı toplam, onaylanan/reddedilen/bekleyen sayısı

## Outputs
- `outputs/YYYY-MM-DD_expense_weekly.md`
- n8n webhook: `/webhook/expense-reminder`

## Quality Bar
- Hiçbir gider 5 günden fazla onaysız kalmamalı
