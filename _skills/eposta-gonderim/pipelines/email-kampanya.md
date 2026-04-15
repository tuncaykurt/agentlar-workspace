# E-posta Kampanya Pipeline

Bu pipeline **herhangi bir outreach senaryosu** için kullanılır: satış teklifi, iş birliği, davet, tanışma, etkinlik çağrısı vb. Senaryo fark etmez; akış her zaman aynıdır.

---

## 📥 Girdi

Bir CSV veya JSON dosyası. Zorunlu kolon sadece `Email`'dir. Diğer kolonlar (Name, Company, Platform, Bio, Web URL vb.) icebreaker kalitesini artırır ama zorunlu değildir.

---

## 🔄 Akış

### 1. Hazırlık
- Kullanıcıdan **hedef dosya yolunu** ve **ne hakkında outreach yapılacağını** (tek cümle bağlam) al.
- CSV'yi oku. `Outreach_Status` kolonu varsa sadece boş veya `Pending` satırları filtrele.

### 2. Ton Belirleme
Kullanıcının bağlamına göre tonu belirle:

| Bağlam | Hitap | Örnek Icebreaker |
|--------|-------|-------------------|
| Kurumsal / B2B | "Sayın [İsim] Bey/Hanım" | "Web sitenizde [detay]'ı inceledim, [sektör] alanındaki çalışmalarınız dikkatimi çekti." |
| Influencer / İçerik Üreticisi | "Merhaba [İsim]" | "[Platform]'daki içeriklerinizi takip ediyorum, [konu] paylaşımlarınız çok başarılı." |
| Genel Networking / Davet | "Merhaba [İsim]" | "[Ortak nokta]'dan yola çıkarak size ulaşmak istedim." |

**Her durumda SKILL.md'deki Türkçe kurallarına uy.**

### 3. Kişiselleştirme (LLM)
Her satır için:
- CSV'deki mevcut verileri (Name, Company, Bio, Web URL vb.) bağlam olarak kullan.
- Kullanıcının verdiği "outreach amacı" ile birleştirerek kısa, doğal Türkçe bir e-posta oluştur.
- **Konu satırı + HTML gövdesi** şeklinde üret.

### 4. Gönderim
```bash
python3 _skills/eposta-gonderim/scripts/send_email.py \
  --to "hedef@email.com" \
  --subject "Konu satırı" \
  --body "<p>Icebreaker + Ana mesaj</p>" \
  --csv "Projeler/X/liste.csv" \
  --row_id 3
```

### 5. Raporlama
Kampanya bitince kullanıcıya kısa özet ver:
- Toplam lead sayısı
- Kaçına gönderildi
- Kaçı atlandı (e-posta eksik, daha önce gönderilmiş vb.)
