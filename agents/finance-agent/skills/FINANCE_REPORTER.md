# Skill: FINANCE_REPORTER

## Purpose
Aylık finansal özet raporu oluştur; ofis geliri, danışman komisyonları ve giderleri göster.

## Serves Goals
- Aylık rapor zamanında üretimi %100

## Inputs
- Supabase: Önceki aya ait `commissions`, `expenses` kayıtları
- Supabase: `consultants` listesi

## Process
1. Önceki ayın tarih aralığını belirle (1. - son gün)
2. Danışman bazında topla: toplam satış, komisyon, gider
3. Ofis geneli hesapla: toplam ciro, toplam komisyon geliri, toplam gider
4. Markdown rapor üret (her danışman için ayrı bölüm)
5. n8n webhook: `/webhook/monthly-report` → WA mesajı gönder (danışmanlara bireysel, yöneticiye özet)

## Outputs
- `outputs/YYYY-MM-MM_finance_monthly_report.md`
- `outputs/YYYY-MM-DD_commission_statement_[consultant_name].md` (kişi bazlı)

## Quality Bar
- Her danışman için ayrı bölüm
- Tüm sayılar Supabase verisiyle doğrulanmış
- Ayın 1'i 08:00'a kadar hazır
