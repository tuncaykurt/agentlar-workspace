---
name: Vapi Voice AI
description: Sesli asistan yönetimi, otomatik arama ve müşteri lead kalifikasyonu.
---

## Açıklama
Vapi, AI agent'ların telefon üzerinden insanlarla konuşmasını sağlayan bir platformdur. Bu skill, Antigravity'nin emlak lead'lerini aramasını veya gelen aramaları bir "profesyonel emlak danışmanı" gibi karşılamasını sağlar.

## Kullanım Durumları
1. **Lead Kalifikasyonu:** Yeni bir lead geldiğinde otomatik aranıp bütçe ve tercihlerin sorulması.
2. **Randevu Planlama:** Uygun projeler için lansman randevusu alınması.
3. **Müşteri Desteği:** 7/24 genel soruların yanıtlanması.

## Adımlar
1. **Asistan Konfigürasyonu:** `VAPI_ASSISTANT_ID` kullanarak asistanın prompt'unu ve sesini (örn. English-US, Professional Female) belirle.
2. **Arama Başlatma:** Müşteri numarasını ve başlangıç mesajını (firstMessage) API'ye gönder.
3. **Transkript Analizi:** Arama bittiğinde transkripti oku ve önemli bilgileri (bütçe, bölge) Pinecone hafızasına kaydet.

## Örnek Prompt (Asistan İçin)
"You are a professional real estate consultant for Dubai properties. Your goal is to understand the customer's budget and preferred area (like Dubai Marina or Downtown). Be polite, expert-sounding, and helpful."

## Çıktı Formatı
Arama sonrası şu veriler toplanmalıdır:
- Müşteri İlgisi (Low/Medium/High)
- Tercih Edilen Bölge
- Bütçe Aralığı
- Notlar
