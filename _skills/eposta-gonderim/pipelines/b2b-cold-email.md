# B2B Cold Email Pipeline

**Senaryo:** `lead-generation` skill'i ile bulunmuş bir şirket listesine (E-ticaret ajansları, Emlak ofisleri vb.) profesyonel bir hizmet/ürün teklifi iletilmesi.

## 📥 Girdi Gereksinimleri
Kullanılacak CSV dosyası şu kolonlara sahip olmalıdır (En azından E-posta zorunludur):
- `Name` (Kişi adı)
- `Company` (Şirket adı)
- `Email` (Hedef e-posta adresi)
- `Web URL` (Veya LinkedIn - LLM için bağlam)

## 🔄 Akış

1. **Hazırlık:**
   - Hedef CSV dosyasını (`Projeler/X/lead_listesi.csv`) belirle.
   - Sadece `Outreach_Status` kısmı boş veya `Pending` olan satırları filtrele.

2. **Kişiselleştirme (LLM Adımı):**
   - Her lead için, kullanıcının belirttiği teklifi ve şirketin `Web URL` veya `Company` bilgisini kullanarak **gerçekçi, çeviri kokmayan, 2 cümlelik profesyonel bir Türkçe açılış** oluştur.
   - Örnek icebreaker: *"Geçen hafta yayınladığınız [Şirket Adı] Q3 raporunu inceledim, özellikle e-ticaret tarafındaki büyümeniz çok etkileyici."*

3. **Gönderim (Script Adımı):**
   - Oluşturulan e-postayı `scripts/send_email.py` kullanarak gönder.
   - **Komut Örneği:**
     ```bash
     python3 _skills/eposta-gonderim/scripts/send_email.py \
       --to "alice@ex.com" \
       --subject "E-ticaret Çözüm Ortaklığı" \
       --body "<p>Icebreaker...</p><p>Asıl teklif...</p>" \
       --csv "Projeler/X/lead_listesi.csv" \
       --row_id 5
     ```
   
4. **Takip ve Raporlama:**
   - Script, CSV'yi otomatik olarak `Outreach_Status: Sent` ve tarihi ile güncelleyecektir.
   - Kullanıcıya başarı oranını raporla (Örn: "20 lead'in 18'ine gönderildi, 2'si e-posta eksikliğinden atlandı").
