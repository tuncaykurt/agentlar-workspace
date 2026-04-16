# Skill: PROFILE_MANAGER

## Purpose
Danışman profil tamamlık oranını hesapla, eksik alanları tespit et ve tamamlamaları için hatırlatma gönder.

## Serves Goals
- Profil tamlık oranı >%95
- Belge uyum oranı >%90

## Inputs
- Supabase: `consultants` (tüm alanlar)

## Process
1. Zorunlu alanları kontrol et (her alan 10 puan):
   - full_name, phone, email (+10)
   - profile_photo_url (+10)
   - tax_number (+10)
   - authorization_doc_url (+10)
   - tax_certificate_url (+10)
   - id_front_url + id_back_url (+10)
   - bio (+10)
   - instagram_handle veya facebook_page (+10)
   - certifications (en az 1) (+10)
   - address (+10)
2. Puanı hesapla (0-100)
3. Puan < 70 olan danışmanlara WA hatırlatma
4. Genel profil tamlık oranı = ortalama puan
5. Rapor üret

## Outputs
- `outputs/YYYY-MM-DD_profile_completeness.md`
- WA hatırlatma (eksik alanlı danışmanlara)
- Journal girişi (genel oran)

## Quality Bar
- Her danışman için ayrı puan
- Eksik alanlar WA mesajında açıkça belirtilmeli
