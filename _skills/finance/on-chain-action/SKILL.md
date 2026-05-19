---
name: On-Chain Action
description: Coinbase AgentKit kullanarak akıllı kontratlar ve cüzdanlar ile etkileşime girer.
---

# On-Chain Action Skill

Bu yetenek, agent'ın Web3 dünyasında aktif bir oyuncu olmasını sağlar.

## Kullanım Senaryoları
- Otomatik USDC/ETH swap'ları.
- Müşterilere on-chain ödül gönderimi.
- Stake/Unstake işlemleri.

## Teknik Detaylar
- **Framework:** Coinbase CDP SDK (AgentKit).
- **Ağlar:** Base, Ethereum, Sepolia.

## Güvenlik Protokolü
1. Cüzdan anahtarları asla loglanmaz.
2. Her işlem için "Simülasyon -> Rapor -> Onay" döngüsü işletilir.
3. Gas limitleri dinamik olarak kontrol edilir.
