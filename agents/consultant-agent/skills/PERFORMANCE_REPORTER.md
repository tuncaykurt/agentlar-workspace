# Skill: PERFORMANCE_REPORTER

## Purpose
Her danışman için aylık performans raporu ve takım geneli özet oluştur.

## Serves Goals
- Aylık performans raporu %100 zamanında

## Inputs
- Supabase: Önceki aya ait `commissions`, `interactions`, `follow_ups`, `clients`
- Supabase: `consultants` listesi

## Process
1. Danışman bazında hesapla:
   - Toplam satış sayısı ve tutarı
   - Toplam komisyon geliri
   - Müşteri iletişim sayısı (kanal bazlı)
   - Follow_up tamamlanma oranı
   - Yeni müşteri sayısı
   - Aktif portföy sayısı
2. Önceki ayla kıyasla (MEMORY.md'den)
3. Takım geneli özeti oluştur
4. Markdown raporları üret (bireysel + genel)
5. n8n webhook: danışmanlara bireysel, admin'e genel WA özeti

## Outputs
- `outputs/YYYY-MM-DD_consultant_performance_[name].md` (kişi bazlı)
- `outputs/YYYY-MM-DD_team_overview.md` (genel)
- Journal girişi (anonim metrikler)

## Quality Bar
- Sayılar Supabase verisiyle doğrulanmış olmalı
- Bireysel rapor danışmana özel (başkasının verisi yok)
- Ayın 2'si 09:00'a kadar hazır
