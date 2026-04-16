---
description: proje-gorsellestir - Bir otomasyon veya yazılım projesini şık bir HTML adımlı akış grafiğine çevir.
---

> **🤖 Agent:** Bu workflow `_agents/yayinla-paylas/AGENT.md` agent'ının **Görselleştirme akışının** bir parçasıdır.
> Bağımsız olarak `/proje-gorsellestir` komutuyla da çalışabilir.

Bu komut çağrıldığında, hedeflenen proje klasörü veya içeriği için `_skills/proje-gorsellestirici/SKILL.md` yönergelerini takip ederek premium bir "Proje Akışı" HTML arayüzü dosyası oluşturmalısın.

1. Kullanıcıdan bir proje yolu veya projenin açıklaması verildiyse bunu analiz et.
2. Eğer gerekiyorsa ilgili klasörün ne işe yaradığını anlamak için kısa bir `list_dir` veya `view_file` yap.
3. `proje-gorsellestirici` becerisini kullanarak `template.html` dosyasını `view_file` ile oku.
4. Elde ettiğin proje bilgisiyle teknik olmayan, müşteriye ve izleyiciye dönük bir dil kurgula. HTML içerisindeki değişkenleri (Başlık, açıklama ve veri dizisi) değiştir.
5. Yeni içeriği, ilgili proje klasörüne `Sistem_Nasil_Calisir.html` benzeri kullanıcı dostu bir adla kaydet.
