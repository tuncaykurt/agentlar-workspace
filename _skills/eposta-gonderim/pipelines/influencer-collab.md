# Influencer / İçerik Üreticisi İş Birliği Pipeline

**Senaryo:** `lead-generation` skill'i ile bulunmuş bir içerik üreticisi (Instagram, TikTok, YouTube) listesine marka iş birliği veya ürün tanıtım teklifi iletilmesi.

## 📥 Girdi Gereksinimleri
Kullanılacak CSV dosyası şu kolonlara sahip olmalıdır:
- `Name` veya `Username`
- `Email`
- `Platform` (Instagram, TikTok vb.)
- `Bio` veya `Followers` (LLM için bağlam)

## 🔄 Akış

1. **Hazırlık:**
   - Hedef CSV dosyasını (`Projeler/X/influencer_listesi.csv`) belirle.
   - Sadece `Outreach_Status` kısmı boş veya `Pending` olan satırları filtrele.

2. **Kişiselleştirme (LLM Adımı):**
   - Bu kitle daha az kurumsal bir dil bekler. Samimi ama profesyonel (saygılı bir "sen" dili) kullanılmalıdır.
   - İçerik üreticisinin Platformuna veya Bio metnine gönderme yap.
   - Örnek icebreaker: *"[Platform]'daki içeriklerinizi bir süredir takip ediyorum, özellikle [Bio'dan bir konu] alanındaki paylaşımlarınızın enerjisini çok beğendim."*

3. **Gönderim (Script Adımı):**
   - Oluşturulan e-postayı HTML formatında `scripts/send_email.py` komutuna ver.
   - **Komut Örneği:**
     ```bash
     python3 _skills/eposta-gonderim/scripts/send_email.py \
       --to "influencer@ex.com" \
       --subject "İş Birliği: [Marka Adı] X [Kişi Adı]" \
       --body "<p>Icebreaker...</p><p>Markamızın elçisi olmak ister misin? vs...</p>" \
       --csv "Projeler/X/influencer_listesi.csv" \
       --row_id 5
     ```

4. **Takip ve Raporlama:**
   - Script, listeyi `Sent` olarak işaretler.
   - Influencer tarafında geri dönüş oranı (% yanıt) genellikle daha yüksek olduğundan, `Outreach_Date` üzerinden 7 gün geçip yanıt vermeyenler için "Follow-up" (ikinci bir mail) akışı planlanabilir.
