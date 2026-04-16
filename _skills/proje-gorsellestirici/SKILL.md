---
name: proje-gorsellestirici
description: Tamamlanmış bir projeyi veya otomasyon sürecini teknik olmayan, şık ve interaktif bir HTML arayüzüne (Nodes Graph) dönüştürür.
---

# Proje Görselleştirici (Project Visualizer)

**Amaç:** Kullanıcının geliştirdiği kod veya otomasyon tabanlı projeleri, sosyal medyada gösterilebilecek ve müşterilere (işletme sahiplerine) teslim edilebilecek **görsel, teknik olmayan, premium bir akış şemasına** dönüştürmek. Bu sayede kod ekranı yerine, uzay tuşuna basıldıkça sıra sıra yanan şık adımlar (node'lar) gösterilir.

## Yönergeler

Kullanıcı senden bir projenin görselleştirilmesini istediğinde şu adımları uygula:

1. **Projeyi Analiz Et:**
   - Hedef projenin çalışma prensibini anla.
   - Tamamen **günlük, ticari ve teknik olmayan** bir dil kullan. *Asla kodlama terimleri, API, Server vb. kelimeler kullanma.* Müşterinin veya sıradan bir izleyicinin anlayacağı benzetmeler kullan ("Sistem mailleri inceler", "Yapay zeka asistanı yanıtı hazırlar").

2. **Şablon Değişkenlerini Hazırla:**
   - **`{{PROJECT_NAME}}`**: Etkileyici bir başlık (Örn: "Otonom E-Posta Asistanı").
   - **`{{PROJECT_DESCRIPTION}}`**: Projenin sonucunu / faydasını özetleyen bir alt başlık.
   - **Adımlar (Nodes):** Projeyi 3 ila 6 temel adıma böl. Her adım için:
     - `title`: Adımın başlığı (örn: "Gelen Kutusu Taraması", "Sistemin Uyanması")
     - `desc`: Ne olduğunu anlatan basit bir metin.
     - `icon`: Uygun bir emoji (Örn: ⚡, ✉️, 🤖, 🧠, 🚀, ⚙️)
     - `subSteps`: İşlem yapıldığını gösteren animasyonlu alt başlıklar. Array halinde sırala. Kullanıcı Space tuşuyla bu adıma geçtiğinde, bu alt adımlar sanki ekranda o an o işlem gerçekleşiyormuş gibi (processing animasyonuyla) tek tek yanacaktır. Örn: "Mailler okunuyor", "Müşteri analiz ediliyor", vb. Teknik olmayan terimlerle 2-4 adet yazılmış olmalı.

3. **Şablonu Oku ve Birleştir:**
   - `_skills/proje-gorsellestirici/resources/template.html` şablonunu oku.
   - `{{PROJECT_NAME}}` ve `{{PROJECT_DESCRIPTION}}` placeholder'larını kendi oluşturduklarınla değiştir.
   - Dosya içindeki script etiketinin altında bulunan `/*__NODES_DATA__*/` ile `/*__NODES_DATA_END__*/` aralığını bularak, aradaki array yapısını tamamen silip, kendi hazırladığın adımları Javascript array formatında yaz:
   ```javascript
   [
       { 
           title: '...', 
           desc: '...', 
           icon: '...',
           subSteps: ['...', '...', '...'] // Alt adımları ekle. Açılış/Webhook düğümü gibi yerlerde boş dizi [] bırakabilirsin.
       },
       // diğer adımlar...
   ]
   ```

4. **Dosyayı Proje Klasörüne Kaydet:**
   - Sonuçta ortaya çıkan HTML dosyasını, hedef proje klasörüne `Proje_Akisi.html` veya `Sistem_Nasil_Calisir.html` ismiyle kaydet.

5. **Kullanıcı Bilgilendirmesi:**
   - Kullanıcıya işlemin tamamlandığını, dosyaya çift tıklayıp tarayıcıda açabileceğini ve videoda anlatım yaparken "Space" (boşluk) tuşu veya tıklama ile adımları sırayla nasıl gösterebileceğini bildir.
