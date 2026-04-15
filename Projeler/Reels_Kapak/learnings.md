# Kapak Fotoğrafı Öğrenimler (Learnings)

Bu dosya, kullanıcı feedback'lerinden çıkarılan öğrenimleri içerir. 
Tüm prompt'lar ve değerlendirmeler bu kurallara uymalıdır.

## 🔴 KRİTİK KURALLAR

### 1. Instagram 4:5 (2/3) Güvenli Bölge - YAZI KONUMU
- Instagram profil grid'inde kapak fotoğraflarının **üstü ve altı kırpılır** (9:16 → 4:5 oranına indirgenir).
- Bu nedenle yazı ASLA görselin en üstüne veya en altına yerleştirilmemelidir.
- **Güvenli bölge**: Görselin dikey merkezine yakın, yani yükseklin %25 ile %75 arasına yerleştirilmelidir.
- **En iyi konum**: Dikey olarak merkez veya merkezin hafif altı (%40-%65 arası).
- Üst %20 ve alt %20 bölgesi "tehlikeli bölge"dir — yazı buraya konulmamalıdır.

### 2. Yazı Tekrarı YASAKTIR
- AI bazen metni iki kere render eder (üst üste veya alt alta).
- Prompt'ta bu açıkça belirtilmelidir: "Write the text ONLY ONCE. Do NOT repeat or duplicate the text."
- Değerlendirme aşamasında yazı tekrarı tespit edilirse skor 0 olmalıdır.

### 3. Yazı Boyutu - KOCAMAN VE OKUNAKLI
- Sosyal medyada küçük ekranlarda kapak görülür. Yazı HER ZAMAN büyük olmalıdır.
- Minimum: Görselin genişliğinin %60-80'ini kaplamalıdır.
- İdeal: 2-4 kelimelik metin, 2 satıra bölünerek büyük punto ile yazılmalıdır.
- Bir satırda çok fazla karakter varsa (6+ karakter kelimelerde 3+ kelime), iki satıra bölünmelidir.
- Referans: Buzzy 1 Kapak 1 stili → metin devasa, net, okunabilir.

### 4. Yazı Dili - SADECE TÜRKÇE
- Kapak metninde İngilizce kelime ASLA olmamalıdır.
- Prompt'taki talimat metni İngilizce olabilir, ama görsele render edilecek metin %100 Türkçe olmalıdır.
- "EXACTLY", "THE", "AND" gibi İngilizce contamination meydana gelirse skor 0 olmalıdır.
- AI'ya prompt içinde şunu ekle: "The text language is Turkish. Do NOT include any English words in the rendered text."

### 5. Görsel-Metin Tutarlılığı
- Kapak üzerindeki metin ile görseldeki sahne/aksiyon birbiriyle uyumlu olmalıdır.
- Örnek KÖTÜ: "SEN UYU O ÇALIŞSIN" yazıyoruz ama görselde kişi oturup telefona bakıyor (uyumuyor).
- Örnek İYİ: "SEN UYU O ÇALIŞSIN" → Görselde kişi rahat bir şekilde uyuyor veya yatakta, arka planda bilgisayar/robot çalışıyor.
- Prompt'ta sahne açıklamasını metin içeriğine göre ayarla.

### 6. Kişi/Konu Yakınlığı
- Kişi/konu görselde çok uzaktan çekilmemeli. 
- Sosyal medya küçük ekranlarda görüntülenir, kişi yakın plan olmalıdır.
- İdeal: Yarım boy (belden yukarısı) veya göğsünden yukarısı çekim.
- Full-body uzak çekimler KAÇINILMALIDIR (Abacus 6 Kapak 3 hatası).

### 7. Yüz Kimliği (cref) Tutarlılığı
- AI'ın referans kişiyi ([İSİM]) düzgün render etmesi kritik.
- Eğer AI farklı bir kişi üretiyorsa, bu tespit edilmeli ve yeniden üretilmelidir.
- Vision değerlendirmesinde "Does the person match the reference photo?" kontrolü eklenmeli.

### 8. Video Adı ≠ Kapak Metni — KRİTİK!
- Notion'daki video isimleri (örn: "Typeless 5", "Meshy 4", "Kimi 4") tamamen **dahili takip isimleridir**.
- Bu isimler, videonun konusuyla doğrudan ilişkili DEĞİLDİR.
- "Typeless 5" → Typeless isimli AI aracının 5. tanıtım videosu demek, "tipsiz 5" veya "tarzsız 5" DEĞİL.
- Kapak metni oluştururken video adı ASLA kullanılmamalıdır.
- **Mutlaka videonun Notion sayfasındaki script/senaryo içeriği okunmalı** ve içerik bazlı bir Türkçe hook üretilmelidir.
- Eğer script mevcut değilse, kullanıcıya sorulmalı veya videonun konusu araştırılmalıdır.
- **Hata örneği**: "Typeless 5" → Kapak metni "TİPSİZ 5" olarak üretildi. BU KATEGORİK OLARAK YANLIŞ.
- **Doğru yaklaşım**: Script'te "Sekreterinizi kovabilirsiniz / Avukatların en büyük derdi çözüldü" yazıyor → Kapak metni: "SEKRETERİNİ KOV" veya "AVUKATIN SIRRI" gibi olmalıydı.

### 9. Metin Render Edilmemesi (Boş Kapak) — KRİTİK!
- Bazı üretimlerde kapak görseli oluşuyor ama üzerinde HİÇBİR METİN yazılmıyor.
- Vision değerlendirmesinde bu durum tespit edilirse skor 0 olmalıdır.
- Prompt'ta "The text MUST be clearly visible and readable" ifadesi eklenmeli.
- Değerlendirme kriterlerine "text_present" (metin var mı?) checkboxu eklenmeli.
- **Hata örnekleri**: Typeless 4 Kapak 2 (metin yok), Meshy 5 Kapak 3 (metin yok).

### 10. Görsel Yaratıcılığı — Klişelerden Kaçın
- AI her zaman aynı kalıplara düşebilir (kişi bilgisayar ekranına bakıyor, ekranda bir uygulama görünüyor).
- Daha yaratıcı görseller üretilmeli:
  - 3D karakter videoları için: Karakter bilgisayar ekranında değil, **gerçek boyutta, canlıymış gibi** gösterilebilir.
  - Ürün tanıtım videoları için: Ürünü kutunun dışında, gerçek hayatta kullanılırken göster.
  - Genel olarak "ekranı gösteren kişi" klişesinden kaçın.
- **İyi örnek**: KickResume 6 — CV'yi çöpten kurtarma metaforu, yaratıcı ve dikkat çekici.
- **ALTIN ÖRNEK**: Typeless 3 Kapak 2 (v2) — "KLAVYEYİ ÇÖPE AT" metniyle bir dağ gibi yığılmış klavyelerin üzerinde kişi duruyor. Gerçek bir fiziksel metafor! Çok yaratıcı ve dikkat çekici.
- **Kaçınılması gereken**: Her seferinde aynı "kişi bilgisayar başında" sahnesi.

### 11. Yazı Boyutu Kalibrasyonu
- Yazı boyutu "görselin genişliğinin %60-80'i" hedeflenmeli ama görsel bağlamına göre ince ayar yapılabilir.
- 2 kelimelik metinler (örn: "KOMİSYONA SON") biraz daha BÜYÜK olabilir.
- 3-4 kelimelik metinler (örn: "TASARIMCIYA PARA VERME") görselin bütünlüğünü bozmadan okunabilir boyutta olmalı.
- Metnin görseldeki kişiyi/konuyu ezmemesi önemli, ama okunabilirlik her zaman önceliklidir.

### 12. Arka Plan Karmaşıklığı — Kişi Tanınabilir Olmalı
- Kapak fotoğrafında kullanıcının ([İSİM]) görselden **kolayca ayırt edilebilmesi** zorunludur.
- Arka plan çok fazla element/obje içeriyorsa, kişi kaybolur ve kapak amacına ulaşmaz.
- **Kaçınılması gereken**: Alttan veya arkadan gelen çok yoğun, karmaşık elementler (parçacıklar, patlayan objeler, çok sayıda obje) kişiyi görsel gürültüye boğuyor.
- **Doğru yaklaşım**: Arka plan dramatik olabilir ama kişi her zaman en öne çıkan element olmalı. Depth of field, blur veya ışıklandırma ile kişi vurgulanmalı.
- **Hata örneği**: Typeless 5 Kapak 3 (v2) — alt kısımda çok fazla element var, kişi arka plandan kolay ayırt edilemiyor.
- **İyi örnek**: Typeless 3 Kapak 2 (v2) — kişi klavyelerin üzerinde net bir şekilde duruyor, arka plan dramatik ama kişi baskın.

### 13. Metin Okunabilirliği — Aşırı Net Olmalı
- Metin sadece "var" olmamalı, göz metne çok rahatlıkla takılmalıdır.
- Metin ile arka plan arasında yüksek kontrast mutlaka olmalıdır (koyu arka plan + beyaz/sarı metin veya metin üzerinde shadow/glow).
- Göz metni "seçmek" için çaba sarf etmemeli — metin ilk bakışta apaçık okunmalı.
- **ALTIN REFERANS**: Typeless 3 Kapak 2 (v2) — metin aşırı net, göz çok rahat seçiyor. Kontrast mükemmel.

## ✅ BEĞENİLEN ÖĞELER (Korumamız Gerekenler)

### ⭐ ALTIN REFERANSLAR (En Çok Beğenilenler)
1. **Typeless 3 Kapak 2 (v2)**: "KLAVYEYİ ÇÖPE AT" — klavye dağının üzerinde duran kişi. Metin aşırı net okunuyor. Görsel metafor mükemmel. Kişi belirgin. **EN İYİ KAPAKLARdan biri.**
2. **Buzzy 1 Kapak 1**: Yazı çok rahat okunuyor, boyutu çok iyi, arka plandan güzel ayrışıyor. ALTIN REFERANS.
3. **KickResume 6 kapak yaklaşımı**: "CV'Nİ ÇÖPTEN KURTAR" — hem metin hem görsel yaratıcılık mükemmel. Metafor kullanımı çok başarılı. 3/3 kapak başarılı.

### ✅ Diğer Başarılı Örnekler
4. **Verdent 2 Kapak 3**: Ekran üstü metin stili, okunuyor, konum iyi.
5. **Cinematic, moody atmosfer**: Genel olarak ışıklandırma ve atmosfer güzel.
6. **Bold sans-serif, all-caps font**: Bu doğru yaklaşım, devam etmeliyiz.
7. **Meshy 5 Kapak 1-2**: "TASARIMCIYA PARA VERME" metni güzel. Yazı boyutu Kapak 1'de ideal.
8. **Typeless 5 (v2)**: "SEKRETERİNİ KOV" — script içeriğinden doğru hook üretildi. 3/3 kapak 10/10 skor aldı.
9. **Typeless 4 Kapak 2 (v2)**: "DİL BİLMEYE SON" — metin başarıyla render edildi, önceki boş kapak problemi aşıldı.
10. **Typeless 3 (v2)**: "KLAVYEYİ ÇÖPE AT" — tüm versiyonda yazı doğru Türkçe, hiçbirinde video adı kullanılmadı. Önceki "tipsiz 3" / "tarzsız 3" hatası aşıldı.

## 📐 TEKNİK SAFE ZONE HESAPLAMASI

Instagram 9:16 (1080x1920) → 4:5 crop (1080x1350):
- Üstten kırpılan: (1920 - 1350) / 2 = 285px
- Alttan kırpılan: 285px
- Güvenli metin alanı: y=285 ile y=1635 arası (1080x1350 merkez alan)
- En güvenli metin pozisyonu: y=500 ile y=1200 arası (tam merkez)

### 14. Konsept-Varyasyon Yaklaşımı — Çoklu Konsept Zorunlu!
- Eskiden: 1 konsept belirleyip 3 farklı varyasyon (kamera açısı/tema) yapıyorduk.
- **Yeni yaklaşım**: 2-3 FARKLI konsept belirle, her konsept için 2 varyasyon yap.
- Minimum: 2 konsept × 2 varyasyon = **4 kapak**
- İsteğe bağlı: 3 konsept × 2 varyasyon = **6 kapak**
- **Konsept** = farklı bir hook/angle/mesaj (ör: "FİLTREYİ SİL" vs "1 FOTO 10 ÜLKEye")
- **Varyasyon** = aynı konseptin farklı görsel temaları (ör: dramatik sahne vs minimal stil)
- Adlandırma: Konsept_1A, Konsept_1B, Konsept_2A, Konsept_2B (opsiyonel: 3A, 3B)
- **Neden**: Tek bir konsepte kilitlenmek riski azaltır. Farklı açılardan yaklaşarak en etkili hook'u bulmak gerekir.

### 15. Video Değer Önerisini Doğru Anlama — KRİTİK!
- Kapak metni üretmeden önce videonun **gerçek değer önerisini** doğru anlamak ZORUNLUDUR.
- Değer önerisi = "Bu videoyu izleyen kişi NE ÖĞRENECEK/KAZANACAK?"
- **Hata örneği**: Dzine AI videosu — video "image to image/video" özelliğiyle viral içerik nasıl yapılır öğretiyor. "Pasaportunu Yır" hook'u videonun değer önerisiyle alakasız.
- **Doğru yaklaşım**: Scriptin ana vaadini analiz et → hook bu vaade dayanmalı
  - Script "fotoğrafı farklı ülke stillerine dönüştür + video yap" → Hook: "1 FOTO 10 ÜLKE" veya "VİRAL VİDEO FORMÜLÜ" gibi olmalı
- Tool adı (ör: "Dzine") ASLA hook olmamalı, ama videonun ÖĞRETTİĞİ ŞEY hook olmalı.

### 16. Kıyafet Esnekliği — Konuya Göre Uygun Giyim
- Eski kural: "Her zaman casual/sweatshirt/hoodie giymeli, takım elbise YASAK" — **KALDIRILDI.**
- **Yeni kural**: Kıyafet, videonun konusuna ve tonuna göre esnek olmalıdır:
  - **Teknoloji/Günlük/Yaratıcı konular** → Streetwear, hoodie, t-shirt (casual)
  - **İş/Finans/Kurumsal konular** → Smart casual: koyu blazer, balıkçı yaka, koyu gömlek
  - **Motivasyon/Lüks/Premium konular** → Şık ve premium görünüm
- Kıyafet seçimi doğal ve konuyla uyumlu olmalı.
- Stock fotoğraf tarzı generic giyimden kaçınılmalı.
### 17. Yüz Kimliği Güçlendirmesi — Çoklu Referans GEREKLİ!
- Kie AI'ya (Nano Banana Pro) tek bir referans fotoğraf gönderildiğinde, model bu referansı **bazen yüz kimliği** olarak, bazen de **genel sahne/stil referansı** olarak yorumlayabilir.
- Bu durum, 3 varyasyondan birinde doğru kişi üretilirken diğerlerinde farklı bir kişi üretilmesine neden olur.
- **Çözüm 1 — Çoklu referans**: `image_input` parametresine 3 farklı cutout fotoğrafı gönder (1 ana + 2 ekstra). Bu, modelin yüz kimliğini daha güçlü kavramasını sağlar.
- **Çözüm 2 — Tutarlı cutout**: Bir videonun TÜM varyasyonlarında **AYNI** cutout fotoğrafı kullan. `random.choice` varyasyon döngüsünün **DIŞINDA** olmalı.
- **Çözüm 3 — Prompt güçlendirmesi**: Prompt'un başına "CRITICAL FACE IDENTITY INSTRUCTION" ekle, yüz özelliklerini (face shape, eyes, nose, mouth, jawline, skin tone, facial hair) tek tek belirt.
- **Hata örneği**: Tripo 3D 2 — Kapak 1 ve 2'de [İSİM] yerine farklı kişi üretildi, Kapak 3'te doğru kişi üretildi.
- **Neden**: Her variant için farklı random cutout seçiliyor + tek referans fotoğraf modelin yüzü öğrenmesi için yeterli olmuyordu.

### 18. Instagram Grid Sadeliği — THUMBNAIL TEST DÜŞÜNCESİ 🔴 KRİTİK!
- Instagram profilinde kapaklar küçük thumbnail olarak yan yana görüntülenir (~150x150px).
- Bu boyutta çok detaylı arka planlar **görsel gürültü** yaratır ve gözü yorar.
- **KURAL**: Arka planda maksimum **2-3 ana element** olmalı. Fazlası kirli görünür.
- **Depth of field / blur**: Arka plan elementleri varsa mutlaka blur/bokeh uygulanmalı, kişi net olmalı.
- Her kapağı tasarlarken şu soruyu sor: **"Bu 150x150 piksel karede nasıl görünür?"**
- **KÖTÜ ÖRNEK**: "1 FOTO 10 ÜLKE" eski versiyonu — 7-8 farklı karakter arka planı dolduruyor, grid'de birbirine karışıyor.
- **İYİ ÖRNEK**: "ÜCRETSİZ MİLYON İZLEN" — sade koyu arka plan, tek kişi + kalabalık (blur), çok temiz.
- **İYİ ÖRNEK**: "ASİSTANINI KOV" — kişi + masa + kağıtlar, o kadar. Grid'de çok net.
- Prompt'ta bu talimat verilmeli: "The background must be SIMPLE and CLEAN with maximum 2-3 main elements. The composition must work as a tiny ~150px thumbnail on Instagram grid. Avoid visual clutter."

### 19. Metin Boyutu Altın Standardı — "ÜCRETSİZ MİLYON İZLEN" Seviyesi 🔴 KRİTİK!
- Metin boyutu için artık tek bir referans standart var: **"ÜCRETSİZ MİLYON İZLEN"** kapağı.
- Bu kapakta metin görselin genişliğinin **~%80'ini** kaplıyor ve grid'de bile rahatça okunuyor.
- **HER KAPAKTA** metin bu boyuta ulaşmalı. Daha küçük metin = başarısız.
- Kısa metinler (2 kelime) → tek satırda çok büyük
- Orta metinler (3-4 kelime) → 2 satıra böl, her satır genişliğin %70-80'i
- **KÖTÜ ÖRNEK**: "TEK KİŞİLİK ORDU" eski versiyonu — konsept harika ama metin referanslara göre %30-40 daha küçük.
- **İYİ ÖRNEK**: "ASİSTANINI KOV" — "KOV" kelimesi çok büyük, hemen göze çarpıyor.
- Prompt'ta bu talimat verilmeli: "Text MUST be EXTREMELY LARGE — at the scale of a movie poster title. Each line must cover 75-80% of image width. Think billboard, not book cover."

### 20. Overlay Metin ZORUNLU — Sahne İçi Metin YETERSİZ! 🔴 KRİTİK!
- Kapak üzerinde mutlaka büyük, bold, overlay metin olmalı.
- Sahne içindeki metin (kağıt üstü yazı, ekran yazısı vb.) **asla yeterli değil** — grid boyutunda okunamaz.
- **KÖTÜ ÖRNEK**: Kağıttaki "Yüksek Komisyon Ücreti" — kağıdın üzerinde küçük yazı, grid'de görünmüyor.
- **DOĞRU**: Büyük, beyaz, bold sans-serif overlay metin, yüksek kontrast ile.

## ✅ BEĞENİLEN REFERANSLAR (v6 Güncellemesi — Mart 2026)

### ⭐⭐ ALTIN STANDART (Bu seviye hedeflenmeli)
1. **"ÜCRETSİZ MİLYON İZLEN"** — TÜM kapakların metin boyutu bu seviyede olmalı. Sade koyu arka plan, dev 3 satır metin, tek odak noktası. Grid'de mükemmel okunuyor. **EN İYİ KAPAK.**
2. **"ASİSTANINI KOV"** — "KOV" kelimesi dev boyutta. Sade, gerçekçi sahne (masa + kağıtlar). Okunabilirlik mükemmel. Grid'de temiz görünüyor.

### ⭐ ÇOK İYİ (Küçük iyileştirmelerle altın standarta ulaşabilir)
3. **"TEK KİŞİLİK ORDU"** — Konsept mükemmel (robot gölgesi), sahne çok güçlü. Tek sorun: metin biraz daha büyük olabilirdi.
4. **"SÖYLE, YAPSIN"** — Metin büyük ve okunabilir. Arka plan biraz daha sade olabilirdi ama genel olarak iyi.
5. **"MAAŞLAR BİTTİ"** — Metin büyük, atmosfer dramatik. Arka plandaki robot kolları biraz fazla detaylı.

### ❌ İYİLEŞTİRME GEREKTİREN KALIPLAR
- Arka planda 4+ detaylı element (samurai, firavun, muhafız, vb.) → görsel gürültü
- Sahne içi küçük metin (kağıt/ekran üstü) yeterli sayılması → overlay metin eksik
- "ÜCRETSİZ MİLYON İZLEN" seviyesine ulaşamayan metin boyutu

## 📅 VERSİYON GEÇMİŞİ

### v6 — 19 Mart 2026
- Instagram grid sadeliği: Max 2-3 arka plan elementi, blur zorunluluğu (Kural 18)
- Metin boyutu altın standardı: "ÜCRETSİZ MİLYON İZLEN" seviyesi hedef (Kural 19)
- Overlay metin zorunluluğu: Sahne içi küçük metin yetersiz (Kural 20)
- Beğenilen referanslar güncellendi (feedback klasöründen)
- Grid-test düşüncesi: "150x150px'de nasıl görünür?" sorusu eklendi
- Prompt'lara sadelik ve dev metin talimatları eklendi

### v5 — 17 Mart 2026
- Yüz kimliği güçlendirmesi: Çoklu referans fotoğraf + tutarlı cutout seçimi (Kural 17)
- Prompt'a "CRITICAL FACE IDENTITY INSTRUCTION" bloğu eklendi
- `extra_cutout_paths` parametresi tüm pipeline'lara eklendi (autonomous_cover_agent, main, batch)

### v4 — 15 Mart 2026
- Kıyafet esnekliği: Konuya göre uygun giyim seçimi (Kural 16)
- "Her zaman casual" zorunluluğu kaldırıldı, smart casual ve kurumsal seçenekler eklendi

### v3 — 12 Mart 2026
- Konsept-varyasyon yaklaşımı: 2-3 konsept × 2 varyasyon (Kural 14)
- Video değer önerisini doğru anlama zorunluluğu (Kural 15)
- Tek konsepte kilitlenme hatası düzeltildi (Dzine feedback)

### v2 — 11 Mart 2026
- Video adı yerine script içeriğinden metin üretme (Kural 8)
- Boş kapak tespiti ve retry (Kural 9)
- Görsel yaratıcılık teşviki ve klişe cezası (Kural 10)
- Arka plan karmaşıklığı kontrolü (Kural 12)
- Safety check: üretilen metnin video adına benzeyip benzemediği otomatik kontrol
- İngilizce kelime kontrolü genişletildi (ekrandaki yazılar dahil)
- Fallback metin artık "BUNU BİLMELİSİN" (video adı değil)

### v1 — İlk Sürüm
- Temel kurallar (1-7) oluşturuldu
- Instagram 4:5 safe zone hesaplaması
- Rourke style guide entegrasyonu
