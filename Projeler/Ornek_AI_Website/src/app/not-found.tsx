import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="pt-40 pb-20 min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-white mb-4">404</h1>
        <h2 className="text-2xl font-semibold text-gray-300 mb-8">Sayfa Bulunamadı</h2>
        <p className="text-gray-400 max-w-md mx-auto mb-8">
          Aradığınız sayfa silinmiş, adı değiştirilmiş veya geçici olarak kullanım dışı olabilir.
        </p>
        <Link 
          href="/" 
          className="inline-block bg-electric-blue hover:bg-blue-600 text-white font-medium px-8 py-3 rounded-full transition-all"
        >
          Ana Sayfaya Dön
        </Link>
      </div>
    </div>
  );
}

