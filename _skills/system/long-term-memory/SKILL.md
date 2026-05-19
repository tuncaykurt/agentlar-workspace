---
name: Long Term Memory
description: Pinecone ve yerel dosyalarla agent'ın geçmişini hatırda tutmasını sağlar.
---

# Long Term Memory Skill

Bu yetenek, Antigravity'nin her konuşmada sıfırdan başlamak yerine geçmişten ders çıkarmasını sağlar.

## Kullanım Senaryoları
- Müşterinin "Dün konuştuğumuz şu projeyi sevmedim" demesini hatırlama.
- Geçmişte başarısız olan outreach mesajlarını tekrar göndermeme.

## Teknik Detaylar
- **Pinecone:** Vektör tabanlı benzerlik araması (Semantic search).
- **Local JSON:** Sık kullanılan değişkenler ve sabit veriler.

## Adımlar
1. Her workflow bitişinde "Key Takeaways" (Anahtar Çıkarımlar) üret.
2. Bu çıkarımları Pinecone indexine `upsert` et.
3. Bir sonraki görevde, konuyla ilgili geçmiş "Context"i sorgula.
