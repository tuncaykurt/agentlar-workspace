'use client';

export default function KVKKPolitikasiPage() {
  return (
    <div className="pt-32 pb-20 min-h-screen">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className="text-3xl md:text-4xl font-bold mb-8 text-white">Gizlilik ve KVKK Politikası</h1>
        <div className="prose prose-invert prose-lg max-w-none space-y-6 text-gray-300 leading-relaxed">

          <p className="text-gray-400 text-sm">Son güncelleme: 22 Mart 2026</p>

          <h2 className="text-xl font-semibold text-white mt-8">1. Veri Sorumlusu</h2>
          <p>
            6698 sayılı Kişisel Verilerin Korunması Kanunu (&quot;KVKK&quot;) kapsamında,
            veri sorumlusu sıfatıyla <strong className="text-white">[WEB_SİTESİ]</strong> olarak
            kişisel verilerinizi aşağıda açıklanan amaçlar çerçevesinde ve mevzuata uygun
            şekilde işlemekteyiz.
          </p>

          <h2 className="text-xl font-semibold text-white mt-8">2. Toplanan Kişisel Veriler</h2>
          <p>Site&apos;yi kullanımınız sırasında aşağıdaki kategorilerde kişisel verileriniz işlenebilir:</p>
          <ul className="list-disc list-inside space-y-2">
            <li><strong className="text-white">Kimlik Bilgileri:</strong> Ad, soyad</li>
            <li><strong className="text-white">İletişim Bilgileri:</strong> E-posta adresi, telefon numarası</li>
            <li><strong className="text-white">İşlem Güvenliği:</strong> IP adresi, giriş/çıkış log kayıtları</li>
            <li><strong className="text-white">Finansal Bilgiler:</strong> Ödeme bilgileri (kredi kartı bilgileri doğrudan işlenmez, ödeme altyapısı tarafından güvenli şekilde yönetilir)</li>
            <li><strong className="text-white">Pazarlama:</strong> Çerez verileri, tercih/ilgi alanı bilgileri</li>
          </ul>

          <h2 className="text-xl font-semibold text-white mt-8">3. Verilerin İşlenme Amaçları</h2>
          <p>Kişisel verileriniz aşağıdaki amaçlarla işlenmektedir:</p>
          <ul className="list-disc list-inside space-y-2">
            <li>Üyelik işlemlerinin gerçekleştirilmesi ve yönetimi</li>
            <li>Satın alınan hizmetlerin sunulması ve faturalandırma</li>
            <li>Müşteri destek hizmetlerinin sağlanması</li>
            <li>Yasal yükümlülüklerin yerine getirilmesi</li>
            <li>Hizmet kalitesinin ölçülmesi ve iyileştirilmesi</li>
            <li>Açık rızanız doğrultusunda pazarlama ve iletişim faaliyetleri</li>
          </ul>

          <h2 className="text-xl font-semibold text-white mt-8">4. Verilerin Aktarılması</h2>
          <p>
            Kişisel verileriniz, KVKK&apos;nın 8. ve 9. maddelerinde belirtilen şartlara uygun olarak:
          </p>
          <ul className="list-disc list-inside space-y-2">
            <li>Yasal zorunluluk halinde yetkili kamu kurum ve kuruluşlarına</li>
            <li>Ödeme işlemleri için anlaşmalı ödeme kuruluşlarına</li>
            <li>Hizmet altyapısı sağlayıcılarına (sunucu, e-posta vb.)</li>
          </ul>
          <p>aktarılabilir. Yurt dışına veri aktarımı durumunda, KVKK&apos;nın öngördüğü güvenceler sağlanır.</p>

          <h2 className="text-xl font-semibold text-white mt-8">5. Çerez (Cookie) Politikası</h2>
          <p>
            Site&apos;de kullanıcı deneyimini iyileştirmek ve analitik veriler toplamak amacıyla
            çerezler kullanılmaktadır. Çerezler hakkında detaylı bilgi:
          </p>
          <ul className="list-disc list-inside space-y-2">
            <li><strong className="text-white">Zorunlu Çerezler:</strong> Site&apos;nin düzgün çalışması için gerekli temel çerezler</li>
            <li><strong className="text-white">Analitik Çerezler:</strong> Ziyaretçi istatistikleri ve kullanım analizi (Google Analytics vb.)</li>
            <li><strong className="text-white">Tercih Çerezleri:</strong> Dil seçimi gibi kullanıcı tercihlerinin saklanması</li>
          </ul>
          <p>Tarayıcı ayarlarınızdan çerezleri devre dışı bırakabilirsiniz.</p>

          <h2 className="text-xl font-semibold text-white mt-8">6. Veri Saklama Süresi</h2>
          <p>
            Kişisel verileriniz, işleme amacının gerektirdiği süre boyunca ve ilgili mevzuatın
            öngördüğü yasal saklama süreleri dahilinde muhafaza edilir. Saklama süresi sona
            erdiğinde verileriniz silinir, yok edilir veya anonim hale getirilir.
          </p>

          <h2 className="text-xl font-semibold text-white mt-8">7. Veri Sahibi Hakları</h2>
          <p>KVKK&apos;nın 11. maddesi kapsamında aşağıdaki haklara sahipsiniz:</p>
          <ul className="list-disc list-inside space-y-2">
            <li>Kişisel verilerinizin işlenip işlenmediğini öğrenme</li>
            <li>İşlenmişse buna ilişkin bilgi talep etme</li>
            <li>İşlenme amacını ve amaca uygun kullanılıp kullanılmadığını öğrenme</li>
            <li>Yurt içinde veya yurt dışında aktarılan üçüncü kişileri bilme</li>
            <li>Eksik veya yanlış işlenmiş verilerin düzeltilmesini isteme</li>
            <li>KVKK&apos;nın 7. maddesi kapsamında silinmesini veya yok edilmesini isteme</li>
            <li>İşlenen verilerin münhasıran otomatik sistemler vasıtasıyla analiz edilmesi suretiyle aleyhinize bir sonucun ortaya çıkmasına itiraz etme</li>
            <li>Kanuna aykırı olarak işlenmesi sebebiyle zarara uğramanız halinde zararın giderilmesini talep etme</li>
          </ul>

          <h2 className="text-xl font-semibold text-white mt-8">8. Güvenlik Önlemleri</h2>
          <p>
            Kişisel verilerinizin güvenliğini sağlamak amacıyla SSL şifreleme, güvenlik duvarı,
            erişim sınırlandırma ve düzenli güvenlik güncellemeleri gibi teknik ve idari
            tedbirler alınmaktadır.
          </p>

          <h2 className="text-xl font-semibold text-white mt-8">9. İletişim</h2>
          <p>
            KVKK kapsamındaki haklarınızı kullanmak veya konuyla ilgili sorularınız için{' '}
            <a href="mailto:[isim]@[WEB_SİTESİ]" className="text-electric-blue hover:underline">
              [isim]@[WEB_SİTESİ]
            </a>{' '}
            adresinden bize ulaşabilirsiniz. Başvurularınız en geç 30 gün içinde yanıtlanacaktır.
          </p>

        </div>
      </div>
    </div>
  );
}
