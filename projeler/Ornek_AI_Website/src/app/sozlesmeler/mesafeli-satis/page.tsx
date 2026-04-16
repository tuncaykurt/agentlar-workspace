'use client';

export default function MesafeliSatisSozlesmesiPage() {
  return (
    <div className="pt-32 pb-20 min-h-screen">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className="text-3xl md:text-4xl font-bold mb-8 text-white">Mesafeli Satış Sözleşmesi</h1>
        <div className="prose prose-invert prose-lg max-w-none space-y-6 text-gray-300 leading-relaxed">

          <p className="text-gray-400 text-sm">Son güncelleme: 22 Mart 2026</p>

          <h2 className="text-xl font-semibold text-white mt-8">1. Taraflar</h2>
          <p>
            <strong className="text-white">Satıcı:</strong><br />
            Ticari Unvan: [WEB_SİTESİ]<br />
            E-posta: [isim]@[WEB_SİTESİ]<br />
            Web: https://[WEB_SİTESİ]
          </p>
          <p>
            <strong className="text-white">Alıcı:</strong><br />
            Sipariş esnasında belirtilen ad, soyad, adres ve iletişim bilgileri.
          </p>

          <h2 className="text-xl font-semibold text-white mt-8">2. Sözleşmenin Konusu</h2>
          <p>
            İşbu Mesafeli Satış Sözleşmesi, 6502 sayılı Tüketicinin Korunması Hakkında Kanun ve
            Mesafeli Sözleşmeler Yönetmeliği hükümlerine uygun olarak, Alıcı&apos;nın elektronik
            ortamda satışa sunulan dijital ürün ve hizmetleri satın almasına ilişkin tarafların
            hak ve yükümlülüklerini düzenler.
          </p>

          <h2 className="text-xl font-semibold text-white mt-8">3. Sözleşme Konusu Ürün/Hizmet Bilgileri</h2>
          <p>
            Satın alınan ürün/hizmetin türü, niteliği, adedi ve satış fiyatı (KDV dahil),
            sipariş özeti sayfasında ve Alıcı&apos;ya gönderilen onay e-postasında belirtilmiştir.
          </p>
          <p>Sunulan dijital ürün ve hizmetler:</p>
          <ul className="list-disc list-inside space-y-2">
            <li>Yapay zeka eğitim paketleri (online kurs, workshop, webinar)</li>
            <li>AI otomasyon çözüm paketleri (Artifex Campus ürünleri)</li>
            <li>AI Factory topluluk üyelikleri</li>
            <li>Danışmanlık ve mentorluk hizmetleri</li>
          </ul>

          <h2 className="text-xl font-semibold text-white mt-8">4. Ödeme ve Teslimat</h2>
          <ul className="list-disc list-inside space-y-2">
            <li>Ödemeler kredi kartı, banka kartı veya EFT/havale yoluyla gerçekleştirilir.</li>
            <li>Dijital ürünler ve hizmetler, ödemenin onaylanmasının ardından elektronik ortamda teslim edilir.</li>
            <li>Erişim bilgileri, Alıcı&apos;nın kayıtlı e-posta adresine gönderilir.</li>
          </ul>

          <h2 className="text-xl font-semibold text-white mt-8">5. Cayma Hakkı</h2>
          <p>
            Mesafeli Sözleşmeler Yönetmeliği&apos;nin 15. maddesi uyarınca; elektronik ortamda
            anında ifa edilen hizmetler ve tüketiciye anında teslim edilen gayri maddi mallarda
            cayma hakkı kullanılamaz.
          </p>
          <p>
            Dijital içerik hizmetlerinde (online kurslar, eğitim paketleri vb.), içeriğe erişim
            sağlandığı andan itibaren cayma hakkı sona erer. Alıcı, sipariş sürecinde bu
            durumu kabul ettiğini onaylar.
          </p>
          <p>
            Henüz erişim sağlanmamış ürünlerde, ödeme tarihinden itibaren 14 gün içinde cayma
            hakkı kullanılabilir.
          </p>

          <h2 className="text-xl font-semibold text-white mt-8">6. Genel Hükümler</h2>
          <ul className="list-disc list-inside space-y-2">
            <li>Alıcı, sipariş onayı vererek işbu Sözleşme şartlarını kabul etmiş sayılır.</li>
            <li>Satıcı, mücbir sebep hallerinde yükümlülüklerini ifa etmekten kurtulur.</li>
            <li>İşbu Sözleşme&apos;den doğan uyuşmazlıklarda Tüketici Hakem Heyetleri ve Tüketici Mahkemeleri yetkilidir.</li>
          </ul>

          <h2 className="text-xl font-semibold text-white mt-8">7. İletişim</h2>
          <p>
            Sözleşme ile ilgili her türlü soru ve talepleriniz için{' '}
            <a href="mailto:[isim]@[WEB_SİTESİ]" className="text-electric-blue hover:underline">
              [isim]@[WEB_SİTESİ]
            </a>{' '}
            adresinden bize ulaşabilirsiniz.
          </p>

        </div>
      </div>
    </div>
  );
}
