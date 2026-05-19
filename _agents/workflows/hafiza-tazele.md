---
description: Pinecone ve yerel hafıza kullanarak agent'ın geçmiş bilgilerini ve müşteri tercihlerini güncelle.
---

# Hafıza Tazele — Agent Memory

Bu workflow, agent'ın geçmiş etkileşimlerden öğrendiği bilgileri yapılandırarak "unutmasını" engeller.

## Bağlam
- **Araçlar:** 
  - `Pinecone` (Vektör tabanlı hafıza)
  - `Knowledge/Hafiza/` (Yerel markdown dosyaları)
- **Hedef:** Müşteri tercihleri, stratejik kararlar ve öğrenilmiş dersler.

## Adımlar

1. **Yeni Bilgileri Tara**
   - Son konuşmalarda veya workflow çıktılarında öğrenilen kritik bilgileri tespit et.
   - Örn: "Müşteri sadece nakit alım yapmak istiyor" veya "BTC 60k altına inerse strateji değişir".

2. **Bilgiyi Kategorize Et**
   - `Müşteri Bilgisi`
   - `Strateji/Kural`
   - `Piyasa Insight'ı`

3. **Vektör Veritabanını Güncelle (Pinecone)**
   - Bilgiyi embedding haline getirip Pinecone indexine gönder.
   - Bu sayede benzer bir konu açıldığında agent otomatik olarak bu bilgiyi hatırlar.

4. **Yerel Hafıza Dosyasını Güncelle**
   - `knowledge/hafiza/main_memory.md` dosyasına insan tarafından okunabilir bir özet ekle.

5. **Eski/Yanlış Bilgileri Temizle**
   - Çelişen veya güncelliğini yitirmiş bilgileri "Arşivle".

## Çıktı Formatı

```markdown
# 🧠 Hafıza Güncelleme Özeti — [Tarih]

### ✅ Eklenen Yeni Bilgiler
- **Müşteri X:** Dubai South bölgesine odaklandı.
- **Strateji:** Stop-loss %3'ten %2.5'e çekildi.

### 🧹 Temizlenen Bilgiler
- Eski ödeme planı (Proje Y) güncellendi.

### 📍 Durum
Pinecone Sync: **Başarılı**
Yerel Dosya Sync: **Başarılı**
```
