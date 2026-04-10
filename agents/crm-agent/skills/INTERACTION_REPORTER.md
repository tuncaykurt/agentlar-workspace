# Skill: INTERACTION_REPORTER

## Purpose
Haftalık müşteri iletişim geçmişi raporu oluştur; hangi danışmanın kaç müşteriyle temas kurduğunu göster.

## Serves Goals
- Müşteri iletişim sıklığı izleme
- Lead dönüşüm oranı takibi

## Inputs
- Supabase: `interactions` (son 7 gün)
- Supabase: `clients` (lead_status değişimleri)
- Supabase: `follow_ups` (tamamlanma oranı için)
- `MEMORY.md` — Önceki hafta karşılaştırması için

## Process
1. Son 7 günlük etkileşimleri danışman bazında grupla
2. Her danışman için hesapla:
   - Toplam iletişim sayısı (kanal bazlı dağılım)
   - Aktif müşteri sayısı (en az 1 iletişim olan)
   - Follow_up tamamlanma oranı
   - Lead status değişimleri (new→contacted→qualified gibi)
3. Genel ofis metrikleri hesapla
4. Önceki haftayla kıyasla (MEMORY.md'den)
5. Markdown rapor oluştur

## Outputs
- `outputs/YYYY-MM-DD_crm_weekly_summary.md`

  Format:
  ```
  # Haftalık CRM Özeti — YYYY-MM-DD

  ## Genel Tablo
  | Danışman | İletişim | Aktif Müşteri | Follow_up % | Yeni Lead |
  ...

  ## Bu Hafta Öne Çıkanlar
  - ...

  ## Dikkat Edilmesi Gerekenler
  - ...
  ```

- Journal girişi (özet)
- `MEMORY.md` güncelleme (trend onaylanmışsa)

## Quality Bar
- Her danışman için ayrı satır olmalı
- Sayılar Supabase verisiyle doğrulanmış olmalı
- Rapor her Pazartesi 09:00'a kadar hazır olmalı
