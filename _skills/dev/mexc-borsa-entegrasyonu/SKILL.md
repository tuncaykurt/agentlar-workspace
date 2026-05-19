---
name: MEXC Borsa Entegrasyonu
description: MEXC Global borsası için API üzerinden emir iletimi, pozisyon yönetimi ve Hedge Mode (Çift Yönlü Pozisyon) entegrasyonu sağlayan teknik rehber ve yetenek.
---

## Açıklama

Bu skill, Antigravity'nin MEXC Global borsası ile otonom olarak etkileşime girmesini sağlar. Spot v3 ve Vadeli İşlemler (Futures/Contract) v1 API'lerini kullanarak ticaret stratejilerini uygular. Özellikle **Hedge Mode** (aynı anda hem Long hem Short pozisyon taşıma) desteği ile gelişmiş risk yönetimi sunar.

## Kaynaklar

- **Resmî Dokümantasyon:** [MEXC Futures API Docs](https://mexcdevelop.github.io/apidocs/contract_v1_en/)
- **GitHub Reposu:** [mexcdevelop/apidocs](https://github.com/mexcdevelop/apidocs)
- **SDK:** [mexcdevelop/mexc-api-sdk](https://github.com/mexcdevelop/mexc-api-sdk) (Python, Node.js, Go destekli)

## Önemli Parametreler (Hedge Mode)

Hedge modunda işlem yaparken emir gönderiminde `positionIdx` parametresi kritik öneme sahiptir:

| Değer | İşlev |
|-------|-------|
| `positionIdx=1` | Long (Uzun) pozisyon açar veya kapatır. |
| `positionIdx=2` | Short (Kısa) pozisyon açar veya kapatır. |
| `positionIdx=0` | One-Way (Tek Yönlü) modda kullanılır. |

## API Kullanım Örnekleri

### 1. Pozisyon Modunu Sorgulama
Pozisyon modu genellikle hesap düzeyinde ayarlanır. Mevcut modu `/api/v1/contract/position_mode` (GET) üzerinden kontrol edebilirsiniz.

### 2. Hedge Modunda Emir Verme (Market Order)
Aşağıdaki payload ile aynı anda hem Long hem Short pozisyon açılabilir:

**Long Giriş:**
```json
{
  "symbol": "BTC_USDT",
  "side": "Buy",
  "positionIdx": 1,
  "type": "Market",
  "vol": "0.01"
}
```

**Short Giriş:**
```json
{
  "symbol": "BTC_USDT",
  "side": "Sell",
  "positionIdx": 2,
  "type": "Market",
  "vol": "0.01"
}
```

## Gereksinimler

- `mexc-api-sdk` paketinin yüklü olması (Python için: `pip install pymexc` veya resmî SDK repo kullanımı).
- `_knowledge/credentials/master.env` içinde `MEXC_API_KEY` ve `MEXC_SECRET_KEY` tanımlı olması.
- API anahtarının "Futures" (Vadeli İşlemler) iznine sahip olması.

## Adımlar

1. Borsa hesabında "Hedge Mode"un aktif olduğundan emin ol (Uygulama/Web üzerinden bir kez ayarlanması yeterlidir).
2. `master.env`'den kimlik bilgilerini yükle.
3. `/api/v1/contract/order/submit` endpoint'ini kullanarak uygun `positionIdx` ile emirleri ilet.
4. WebSocket üzerinden pozisyon güncellemelerini takip et.
