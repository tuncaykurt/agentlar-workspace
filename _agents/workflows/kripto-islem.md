---
description: Coinbase AgentKit kullanarak on-chain işlemler (transfer, swap, stake) yap ve portföy yönet.
---

# Kripto İşlem — On-Chain Action

Bu workflow, agent'ın sadece fiyat izlemekle kalmayıp, belirlenen stratejiye göre on-chain aksiyon almasını sağlar.

## Bağlam
- **Araçlar:** 
  - `Coinbase AgentKit` (CDP SDK)
  - `Pyth/Chainlink` (Fiyat feed'leri için)
- **Ağ:** Base (Varsayılan), Ethereum, Polygon.
- **Güvenlik:** Tüm işlemler öncelikle simüle edilir ve ardından onay mekanizmasına sunulur.

## Adımlar

1. **İşlem Niyetini Belirle**
   - Aksiyon: (Transfer, Swap, Mint, Stake)
   - Varlık: (ETH, USDC, vb.)
   - Miktar: (Örn: "Cüzdandaki USDC'nin %10'u ile ETH al")

2. **Cüzdan Durumunu Kontrol Et**
   - Bakiyeyi sorgula.
   - Gas ücretlerini (Gwei) ve ağ yoğunluğunu kontrol et.

3. **İşlemi Hazırla ve Simüle Et**
   - AgentKit aracılığıyla işlem objesini oluştur.
   - Mevcut ağ koşullarında işlemin başarılı olup olmayacağını test et.

4. **Kullanıcı Onayı Al (Zorunlu)**
   - İşlem detaylarını (Miktar, Gas, Hedef Adres) net bir şekilde raporla.
   - Onay gelmeden `execute` komutunu çalıştırma.

5. **İşlemi Gerçekleştir ve Takip Et**
   - İşlemi ağa gönder.
   - Transaction Hash (TX ID) al ve `journal/crypto_transactions.md` dosyasına kaydet.
   - İşlem "Confirmed" olana kadar bekle.

## Çıktı Formatı

```markdown
### ⛓️ On-Chain İşlem Raporu — [Tarih]

**Durum:** [SUCCESS / PENDING / FAILED]
**Aksiyon:** Swap 100 USDC -> ETH
**Ağ:** Base Mainnet
**TX Hash:** [Link to Explorer](https://basescan.org/tx/...)

**Özet:**
İşlem başarıyla tamamlandı. Cüzdan yeni bakiyesi: X ETH.
```

---

> [!CAUTION]
> Gerçek varlıklarla işlem yaparken cüzdan anahtarlarınızın (CDP API Keys) asla `.env` dışında bir yere kaydedilmediğinden ve agent'ın bu anahtarları dışarı sızdırmayacağından emin olun.
