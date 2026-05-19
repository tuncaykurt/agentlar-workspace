---
name: telefon-formatlayici
description: |
  Türkiye telefon numaralarını otomatik algılar, normalize eder ve uluslararası formata çevirir.
  Google Sheets/form verilerindeki eksik ülke kodu, başındaki sıfır gibi sorunları düzeltir.
  WhatsApp link üretimini de doğru yapar.
---

# 📱 Telefon Formatlayıcı — Türkiye Numarası Normalleştirme

Bu skill, farklı kaynaklardan (Google Forms, Sheets, Meta Lead Ads) gelen Türkiye telefon numaralarını
**otomatik olarak algılayıp uluslararası formata** çevirir.

---

## 🎯 Neden Gerekli?

Türk kullanıcılar telefon numaralarını farklı formatlarda yazarlar:

| Sheets'ten Gelen | Sorun | Doğru Format |
|---|---|---|
| `5348970627` | Ülke kodu yok | `+90 534 897 0627` |
| `05461383982` | Başında 0, ülke kodu yok | `+90 546 138 3982` |
| `p:+905321234567` | Prefix var | `+90 532 123 4567` |
| `+90 (532) 123-45-67` | Özel karakterler | `+90 532 123 4567` |
| `905321234567` | Doğru ama formatlanmamış | `+90 532 123 4567` |

**Yanlış formatlama → Yanlış WhatsApp linki → Müşteriye ulaşılmaz!**

---

## 🧠 Normalleştirme Algoritması

```
HAM NUMARA GELDİ
│
├── 1. Önişlem: Tüm özel karakterleri temizle (+, -, boşluk, parantez, p: prefix)
│   → Sadece rakamlar kalsın
│
├── 2. Başındaki 0'ı (yerel prefix) temizle
│   → 05348970627 → 5348970627
│
├── 3. Türk numarası mı kontrol et:
│   ├── 10 hane + 5 ile başlıyor → Mobil numara, ülke kodu eksik
│   │   → 90 + numara = 905348970627
│   │
│   ├── 12 hane + 90 ile başlıyor → Tam uluslararası format ✅
│   │   → Direkt kullan
│   │
│   ├── 11 hane + 90 ile başlıyor + ardından 5 → Mobil ama 1 hane eksik?
│   │   → Kontrol et, muhtemelen sabit hat
│   │
│   └── Hiçbiri değil → Formatla ama "kısa numara" uyarısı ver
│
├── 4. +90 5XX XXX XXXX formatına çevir
│
└── 5. WhatsApp link hesapla: https://wa.me/905XXXXXXXXX
```

---

## 📐 Kurallar ve Kararlar

### Türkiye Mobil Numara Yapısı
- **Ülke kodu:** `90`
- **Mobil prefix:** `5XX` (tüm GSM operatörleri)
- **Tam format:** `+90 5XX XXX XXXX` (12 hane, + hariç)
- **Yerel format:** `0 5XX XXX XXXX` (başta 0 ile)

### Otomatik Algılama Kuralları

| Hane Sayısı | Başlangıç | Yorum | İşlem |
|---|---|---|---|
| **10** | `5` | Mobil, ülke kodu eksik | `90` + numara |
| **11** | `05` | Yerel format | `0` kaldır, `90` + numara |
| **12** | `90` | Tam uluslararası | Direkt kullan |
| **13** | `090` | Yerel + ülke kodu | `0` kaldır |
| < 10 | herhangi | Eksik/hatalı numara | Olduğu gibi bırak, **log yaz** |

### Edge Cases
- `0000000000` → Test/sahte verisi, log yaz
- 8 hane veya daha az → Eksik numara, `+{numara}` olarak bırak
- `90` ile başlamayan 12+ haneli → Yabancı numara olabilir, `+{numara}` olarak bırak

---

## 💻 Referans Implementasyon

```python
import re

def clean_phone(raw_phone: str) -> str:
    """
    Türkiye telefon numarasını temizler ve uluslararası formata çevirir.
    
    Desteklenen giriş formatları:
      - 5348970627     → +90 534 897 0627
      - 05461383982    → +90 546 138 3982
      - p:+905321234567 → +90 532 123 4567
      - 905321234567   → +90 532 123 4567
      - +90 (532) 123-45-67 → +90 532 123 4567
    """
    phone = str(raw_phone or "")
    
    # 1. Prefix temizliği (p:+ gibi form prefixleri)
    phone = re.sub(r"^p:\+?", "", phone)
    
    # 2. Tüm non-digit karakterleri kaldır
    phone = re.sub(r"[^\d]", "", phone)
    
    if not phone:
        return ""
    
    # 3. Başındaki gereksiz sıfırları ele al
    #    090... → 90... (ülke kodu önünde sıfır)
    if phone.startswith("090") and len(phone) == 13:
        phone = phone[1:]  # → 905...
    
    # 4. Yerel format: 05XX... → 90 + 5XX...
    if phone.startswith("0") and len(phone) == 11:
        phone = "90" + phone[1:]
    
    # 5. Ülke kodsuz mobil: 5XX... (10 hane) → 90 + 5XX...
    if phone.startswith("5") and len(phone) == 10:
        phone = "90" + phone
    
    # 6. Doğru TR mobil: 905XXXXXXXX (12 hane) → formatlı çıktı
    if phone.startswith("90") and len(phone) == 12:
        return f"+{phone[:2]} {phone[2:5]} {phone[5:8]} {phone[8:]}"
    
    # 7. Diğer — olduğu gibi + prefixle döndür
    return f"+{phone}" if phone else ""


def build_whatsapp_link(phone: str) -> str:
    """
    Formatlanmış telefon numarasından WhatsApp linki üretir.
    
    Örnek: '+90 534 897 0627' → 'https://wa.me/905348970627'
    """
    if not phone:
        return ""
    digits = re.sub(r"[^\d]", "", phone)
    return f"https://wa.me/{digits}" if digits else ""
```

---

## 🧪 Test Matrisi

Skill'in doğru çalıştığını doğrulamak için aşağıdaki testleri kullan:

```python
test_cases = [
    # (giriş, beklenen telefon, beklenen WA link)
    ("5348970627",       "+90 534 897 0627", "https://wa.me/905348970627"),
    ("05461383982",      "+90 546 138 3982", "https://wa.me/905461383982"),
    ("p:+905321234567",  "+90 532 123 4567", "https://wa.me/905321234567"),
    ("905321234567",     "+90 532 123 4567", "https://wa.me/905321234567"),
    ("+90 (532) 123-45-67", "+90 532 123 4567", "https://wa.me/905321234567"),
    ("05305944682",      "+90 530 594 4682", "https://wa.me/905305944682"),
    ("0905321234567",    "+90 532 123 4567", "https://wa.me/905321234567"),
    ("",                 "",                  ""),
    (None,               "",                  ""),
]

for raw, expected_phone, expected_wa in test_cases:
    result = clean_phone(raw)
    wa = build_whatsapp_link(result)
    phone_ok = '✅' if result == expected_phone else '❌'
    wa_ok = '✅' if wa == expected_wa else '❌'
    print(f'{phone_ok} clean_phone("{raw}") → "{result}" (beklenen: "{expected_phone}")')
    print(f'{wa_ok} WhatsApp: {wa}')
```

---

## 📋 Kullanım Yerleri

Bu skill aşağıdaki projelerde referans alınır:

| Proje | Dosya | Fonksiyon |
|---|---|---|
| `Tele_Satis_CRM` | `data_cleaner.py` | `clean_phone()` |
| `Tele_Satis_CRM` | `notion_writer.py` | `_build_whatsapp_link()` |

---

## ⚠️ Dikkat Edilecekler

> [!IMPORTANT]
> WhatsApp linkleri **sadece rakam** içermelidir: `wa.me/905321234567`
> Başında `+` veya boşluk olursa link çalışmaz!

> [!WARNING]
> Sabit hat numaraları (2XX, 3XX, 4XX) farklı formatta olabilir.
> Bu skill sadece **mobil numaralara** (5XX) odaklanır.
