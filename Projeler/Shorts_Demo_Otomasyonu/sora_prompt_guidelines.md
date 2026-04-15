# Sora & Sora 2 Prompt Engineering Guidelines

Bu doküman, özellikle Sora 2 (Kie AI) ve Fal AI gibi gelişmiş text-to-video modellerinde başarılı, tutarlı ve fizik hataları en aza indirilmiş videolar elde etmek için yapılan araştırmalar sonucu derlenmiştir. Botun prompt üreten yapay zeka asistanının bu kuralları sıkı bir şekilde takip etmesi çok kritiktir.

## 1. Hikaye Panosu (Storyboard) Gibi Düşünün
- **Tek Çekimde Tek Net Aksiyon (Kritik):** Aynı sahnede çok fazla karmaşık eylemin (örneğin "köpek zıplar, eti kapar, sonra arkasına bakar ve kaçarken peşinden biri koşar") aynı anda veya peş peşe verilmesi fiziksel deformasyonlara (etin boşlukta asılı kalması vs.) neden olur.
- Hedeflenen aksiyonu temiz ve anlaşılır şekilde ifade edin. Olayları basitleştirerek tek bir ana odağa indirin.

## 2. Somut ve Detaylı Betimlemeler
- **Mekan ve Atmosfer:** Videonun nerede geçtiğini, günün hangi saati olduğunu, ışıklandırmayı ve hava durumunu mutlaka belirtin.
  - *Örnek:* "A cozy, dimly lit kitchen at night with soft light escaping from a semi-open refrigerator."
- **Özneler:** Karakterlerin veya hayvanların dış görünüşlerini (renk, doku, vücut dili) net tanımlayın.
- **Kamera Açıları ve Dil:** "Cinematic, low-angle shot, static camera" gibi kesin komutlar kullanın. Kameranın çok fazla hareket etmesi (hem dolly-in yapıp hem pan yapması vb.) görüntünün bozulmasına yol açabilir.

## 3. Fiziksel Etkileşimlerin Sınırları
- AI video modelleri nesnelerin birbiriyle temas ettiği sahnelerde (örn: ağızla bir şey tutmak, el sıkışmak, yemek yemek) zorlanır.
- **Tutarsızlıkları Önlemek İçin:** "Köpek masadan eti ısırarak alır" yerine, "Köpek iştahla masadaki ete doğru hamle yapar, kameranın açısı köpeğin heyecanlı yüzüne odaklanır" gibi sonucun net görünmediği ama hissettirildiği daha güvenli, "tease" eden açılar veya basitleştirilmiş fiziksel eylemler tercih edilmelidir. 

## 4. Kullanıcı Deneyimi (Frictionless Prompting)
- Kullanıcı sadece "köpek videosu" veya "uçan araba" yazsa bile asistan, ona "daha fazla detay ver" DEMEMELİDİR. 
- Asistan, bu kısa terimi alır ve kendi yaratıcılığını (bu dokümandaki kurallar çerçevesinde) kullanarak doğrudan harika ve detaylı bir İngilizce prompt uydurur. Kıvrımları, ışığı, kamerayı asistan belirler, kullanıcıyı yormaz.

## 5. İdeal Prompt Yapısı
1. **Genel Çekim / Stil:** (Örn: POV bodycam footage / Cinematic wide shot)
2. **Ortam ve Işık:** (Örn: Neon-lit cyberpunk alley, raining, neon reflections on puddles)
3. **Özne ve Tek Eylem:** (Örn: A golden retriever excitedly barking at a floating glowing orb)
4. **Kamera Hareketi / Detay:** (Örn: Slight handheld motion, shallow depth of field)
