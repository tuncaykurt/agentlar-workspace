# Skill: CONTACT_MANAGER

## Purpose
Yeni müşterileri sisteme ekle, mevcut kayıtları güncelle ve alıcı-portföy eşleştirme kriterlerini yönet.

## Serves Goals
- Lead dönüşüm oranı >%15
- Pasif müşteri tespiti %100

## Inputs
- `data/imports/new_clients.csv` — Danışman tarafından bırakılan yeni müşteri listesi
  Format: `full_name, phone, email, client_type, notes, assigned_consultant_email`
- Supabase: `clients` tablosu (duplicate kontrolü için)

## Process
1. `data/imports/new_clients.csv` dosyasını kontrol et
2. Dosya varsa:
   a. Her satır için telefon/e-posta üzerinden duplicate kontrolü yap
   b. Yeni kayıtları Supabase `clients` tablosuna ekle
   c. İlk follow_up oluştur: due_at = bugün + 1 gün, message_template = karşılama şablonu
   d. n8n webhook tetikle: `/webhook/new-client-welcome` (WA karşılama mesajı)
   e. CSV dosyasını `data/imports/processed/YYYY-MM-DD_new_clients.csv` olarak arşivle
3. 30+ gün sessiz müşterileri tespit et:
   a. `interactions` tablosundan son iletişim tarihine bak
   b. 30+ gün geçmişse danışmana uyarı follow_up oluştur
4. Journal'a özet yaz

## Outputs
- Yeni follow_up kayıtları (Supabase)
- `outputs/YYYY-MM-DD_crm_import_log.md` (eklenen/atlanan kayıt sayısı)
- n8n karşılama mesajı tetiklemesi

## Quality Bar
- Duplicate telefon/e-posta kesinlikle eklenmemeli
- Her yeni müşteri için en az 1 follow_up oluşturulmalı
- Import sonrası CSV dosyası processed/ klasörüne taşınmalı

## Tools
- Supabase REST API
- n8n webhook: `/webhook/new-client-welcome`
