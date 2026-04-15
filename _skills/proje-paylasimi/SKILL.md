---
name: Öğrenciler İçin Proje Paylaşımı
description: Projeler klasörü altındaki bir projeyi, Antigravity kullanan öğrencilerin sorunsuz ve güvenli bir şekilde kendi bilgisayarlarında çalıştırabilmesi için temizler, paketler ve paylaşıma hazır hale getirir.
---

## Açıklama
Bu skill, öğretmenin geliştirdiği bir projeyi, öğrencilerin kendi Antigravity ortamlarında anında çalıştırabilmesi için bir dışa aktarım (export) klasörü oluşturur. Temel amaç; çalışabilirliği garanti altına almak, öğretmen'in API ve gizli bilgilerini silerek güvenlik sağlamak ve dışarıdan bağımlı olunan tüm dosyaları proje içine dahil etmektir.

## ⚠️ Güvenlik ve Temizlik Çerçevesi (Çok Önemli)
- `.env` gizli ortam dosyaları silinmeli, yerine `.env.example` oluşturulmalıdır.
- Kodların veya konfigürasyon dosyalarının içindeki sabit (hardcoded) API anahtarları (`sk-...`, `AIza...`, şifreler) ve veritabanı bağlantı metinleri bulunarak `BURAYA_KENDI_API_KEYINIZI_YAZIN` gibi yer tutucularla (placeholder) değiştirilmelidir.
- `.git`, `__pycache__`, `.venv`, `.DS_Store`, `token.json`, `credentials.json` (içi dolu ise) gibi gereksiz veya özel dosyalar **kesinlikle** dışa aktarılmamalıdır.

## 📦 Bağımlılıkların Sağlanması (Çok Önemli)
- Proje içerisindeki Python kodları taranarak, projenin klasörü dışından (örneğin `../OrtakKlasor/utils.py`) içeri aktarılan (import edilen) fonksiyon ve dosyalar tespit edilmelidir.
- Eğer proje dışında kalan ama çalışması için gereken dosyalar varsa, bu dosyalar dışa aktarılan projenin içine kopyalanmalı ve import yolları (path) yeni düzene göre kodun içinde düzeltilmelidir.
- Mevcut Python kodları taranıp hangi dış kütüphanelerin kullanıldığı tespit edilerek, sadece o projenin ihtiyaç duyduğu güncel bir `requirements.txt` dosyası oluşturulmalıdır.

## Adımlar
1. **Hedef ve Çıktı Klasörünün Belirlenmesi**
   - Kaynak Klasör: `Projeler/[Proje Adı]`
   - Hedef Klasör: `Paylasilan_Projeler/[Proje Adı]_Taslak`
   - Hedef klasör (eğer yoksa) oluşturulmalı ve kaynak kodlar dikkatlice buraya aktarılmalıdır.

2. **Temizlik ve Gizlilik**
   - Yukarıdaki *Güvenlik ve Temizlik Çerçevesi* kurallarını harfiyen uygulayarak yeni kopyalanan klasördeki şifre/api anahtarı barındıran yerleri placeholder ile değiştir.
   - Hassas log veya data dosyalarını (`.csv`, `.json`, vb. içinde özel müşteri verisi varsa) temizle veya dummy (örnek) data ile değiştir.

3. **Bağımlılık (Dependency) Kontrolü ve Optimizasyon**
   - Projenin Python dosyalarındaki tüm modül içe aktarmaları (import'lar) incelenir. 
   - Projenin dışına çıkan dosya/modül varsa, o dosyanın kopyasını hedef projenin içine (örn. `utils/` altına) koy ve import kodlarını buna göre güncelle.
   - Pipreqs, ast veya manuel tarama ile `requirements.txt` dosyasını oluştur.

4. **Kullanım Kılavuzu Hazırlanması**
   - Hedef klasörün içine bir `KURULUM_REHBERI.md` veya `README.md` dosyası oluştur.
   - Bu dosyada öğrencinin kendi Antigravity asistanına söylemesi gereken prompt'u (örneğin: `"Antigravity, bu klasördeki projeyi çalıştırmak istiyorum. Önce requirements.txt'yi kur ve ardından gerekli API keylerini .env içerisine girmek için benden iste."`) belirt.
   - Projenin amacını ve nasıl çalıştırılacağını basitçe açıkla.

5. **Sonuç (Zip veya Doğrudan Paylaşım)**
   - Klasör tümüyle hazır hale getirildikten sonra işlemi raporla. İşlem tamamlandığında, Antigravity kullanıcıya hazır olan klasör dizinini ve kontrol etmesi gerekenleri iletir. Dilerse ziplenebilir.

## Çıktı Formatı
İşlem bittikten sonra Antigravity şu şekilde rapor vermelidir:
- Hedef klasör yolu.
- Dışarıdan koparıp içine dahil edilen bağımlılıklar (varsa).
- Temizlenen/sansürlenen API key ve özel dosyalar listesi.
- Öğrenciler için hazırlanan prompt/rehberin başarı durumu.
