---
name: Document Intelligence (Docling)
description: Karmaşık PDF ve broşürlerden yapılandırılmış (structured) veri çıkarma.
---

## Açıklama
IBM Docling motorunu kullanarak, görsellerle dolu emlak broşürlerini, teknik şartnameleri ve ROI tablolarını Agent'ın anlayabileceği temiz Markdown veya JSON formatına dönüştürür.

## Adımlar
1. **Döküman Yükleme:** İşlenecek PDF dosyasını `_temp_repo/` veya ilgili proje klasörüne al.
2. **Docling İşleme:** `docling` kütüphanesini kullanarak dökümanı parse et.
3. **Veri Ayıklama:** Tablo verilerini (Fiyat listeleri, ödeme planları) ve teknik detayları ayıkla.

## Kullanım Örneği
```bash
# Python script içinde
from docling.document_converter import DocumentConverter
converter = DocumentConverter()
result = converter.convert("brochure.pdf")
print(result.document.export_to_markdown())
```

## Çıktı Formatı
- Proje Adı
- Geliştirici (Developer)
- Ödeme Planı Özeti
- Metrekare Fiyat Analizi
