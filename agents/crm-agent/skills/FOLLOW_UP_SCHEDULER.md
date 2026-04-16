# Skill: FOLLOW_UP_SCHEDULER

## Purpose
Günlük vadesi gelen takipleri tespit et ve n8n üzerinden WhatsApp/e-posta gönderimini tetikle.

## Serves Goals
- Takip tamamlanma oranı >%85
- Müşteri iletişim sıklığı 7 günde ≥1

## Inputs
- Supabase: `follow_ups` WHERE `status = 'pending' AND due_at <= now()`
- Supabase: `clients` (müşteri adı ve telefonu için JOIN)
- `MEMORY.md` — En etkili gönderim saatleri

## Process
1. Supabase'den bugün vadesi gelen follow_up'ları çek (n8n HTTP node ile)
2. Her follow_up için:
   a. Müşteri adını ve kanalı kontrol et (whatsapp / email / sms)
   b. Mesaj template'ini `custom_message` varsa onu, yoksa `message_template` alanını kullan
   c. `{name}`, `{property_title}` gibi placeholder'ları doldur
3. n8n webhook'unu tetikle: `POST /webhook/send-follow-up` (payload: client_id, channel, message, consultant_id)
4. n8n mesajı gönderir ve geri döner → follow_up.status = 'sent', sent_at = now() yap
5. interactions tablosuna otomatik log düşür (n8n bunu yapar)
6. Gönderilemeyen mesajları logla

## Outputs
- `outputs/YYYY-MM-DD_crm_follow_up_report.md` (gönderilen / başarısız listesi)
- Journal girişi (özet: X mesaj gönderildi, Y başarısız)

## Quality Bar
- Tüm 'pending' follow_up'lar işleme alınmalı
- Hiçbir müşteri 2 kez aynı anda tetiklenmemeli
- Hata olursa 'failed' olarak işaretle, 'pending' bırakma

## Tools
- n8n webhook: `/webhook/send-follow-up`
- Evolution API (n8n üzerinden WhatsApp)
- Supabase REST API

## Integration
- INTERACTION_REPORTER bu skill'in çıktısını haftalık raporda kullanır
- CONTACT_MANAGER yeni müşteri eklenince otomatik ilk follow_up oluşturur
