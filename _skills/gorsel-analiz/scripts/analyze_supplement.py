#!/usr/bin/env python3
"""
Görsel Analiz Skill — Supplement / Ürün Etiketi Analiz Motoru
==============================================================
Gemini 2.5 Flash ile ürün fotoğraflarından içerik tablosu, besin değerleri,
bileşim ve kullanım bilgilerini yapılandırılmış formatta çıkarır.

Kullanım:
    python3 analyze_supplement.py <image_path_or_dir> [--model gemini-2.5-flash] [--output json|markdown|text]
"""

import os
import sys
import json
import base64
import argparse
import logging
from pathlib import Path
from typing import Optional

# ── Logging ──
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("gorsel-analiz")

# ── Defaults ──
DEFAULT_MODEL = "gemini-2.5-flash"
FALLBACK_MODEL = "gemini-2.5-pro"

# ── Structured extraction prompt ──
SUPPLEMENT_ANALYSIS_PROMPT = """
Sen bir profesyonel ürün etiketi analizcisisin. Sana verilen fotoğrafta bir takviye edici gıda,
vitamin, supplement veya benzeri bir ürünün etiketi/ambalajı görünüyor.

Görevin: Fotoğraftaki TÜM bilgileri titizlikle oku ve aşağıdaki yapılandırılmış formatta çıkar.

## ÇIKARILACAK BİLGİLER:

### 1. ÜRÜN BİLGİSİ
- Ürün adı (tam isim)
- Marka
- Ürün türü (tablet, kapsül, toz, sıvı vb.)
- Porsiyon büyüklüğü (serving size)
- Toplam porsiyon/servis sayısı

### 2. İÇERİK TABLOSU (Supplement Facts / Besin Değerleri)
Her bir madde için:
- Madde adı (Türkçe ve varsa İngilizce)
- Miktar (mg, mcg, IU vb.)
- %BRD / %DV (Beslenme Referans Değeri / Daily Value)

Bu tabloyu eksiksiz ve düzgün formatlanmış olarak ver.

### 3. BİLEŞİM (Ingredients)
Tüm bileşenleri virgülle ayrılmış liste olarak ver.

### 4. KULLANIM ÖNERİSİ
- Önerilen kullanım şekli
- Günlük doz
- Kullanım koşulları/uyarıları

### 5. DİĞER BİLGİLER
- Üretici firma adı/adresi
- Sertifikalar (GMP, Halal, ISO vb.)
- Saklama koşulları
- Son kullanma tarihi (görünüyorsa)
- Barkod numarası (görünüyorsa)

## KURALLAR:
1. SADECE fotoğrafta açıkça okunan bilgileri yaz. Tahmin etme, uyarlama.
2. Okunamayan kısımlar için "[okunamadı]" yaz.
3. Fotoğrafta olmayan bölümler için "Bu bilgi fotoğrafta mevcut değil" yaz.
4. Sayısal değerleri tam olarak aktar (birim dahil).
5. Yanıtını Türkçe olarak ver.

## ÇIKTI FORMATI:
Yanıtını aşağıdaki JSON yapısında ver:

```json
{
  "urun_bilgisi": {
    "urun_adi": "",
    "marka": "",
    "urun_turu": "",
    "porsiyon_buyuklugu": "",
    "toplam_porsiyon": ""
  },
  "icerik_tablosu": [
    {
      "madde_adi": "",
      "madde_adi_en": "",
      "miktar": "",
      "birim": "",
      "brd_yuzde": ""
    }
  ],
  "bilesim": "",
  "kullanim_onerisi": {
    "onerilen_kullanim": "",
    "gunluk_doz": "",
    "uyarilar": ""
  },
  "diger_bilgiler": {
    "uretici": "",
    "sertifikalar": [],
    "saklama_kosullari": "",
    "son_kullanma_tarihi": "",
    "barkod": ""
  }
}
```
"""


def load_api_key() -> str:
    """master.env veya ortam değişkeninden API key yükle."""
    # 1. Ortam değişkeni
    key = os.environ.get("GEMINI_API_KEY")
    if key:
        return key

    # 2. master.env dosyası
    master_env_path = Path(__file__).resolve().parents[3] / "_knowledge" / "credentials" / "master.env"
    if master_env_path.exists():
        with open(master_env_path) as f:
            for line in f:
                line = line.strip()
                if line.startswith("GEMINI_API_KEY="):
                    return line.split("=", 1)[1].strip()

    raise EnvironmentError(
        "GEMINI_API_KEY bulunamadı. master.env dosyasını veya ortam değişkenini kontrol edin."
    )


def encode_image_to_base64(image_path: str) -> tuple[str, str]:
    """Görseli base64'e encode et ve MIME type belirle."""
    path = Path(image_path)
    suffix = path.suffix.lower()

    mime_map = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
        ".gif": "image/gif",
        ".heic": "image/heic",
        ".heif": "image/heif",
    }

    mime_type = mime_map.get(suffix, "image/jpeg")

    with open(path, "rb") as f:
        b64_data = base64.standard_b64encode(f.read()).decode("utf-8")

    return b64_data, mime_type


def analyze_image(
    image_path: str,
    model: str = DEFAULT_MODEL,
    custom_prompt: Optional[str] = None,
) -> dict:
    """
    Tek bir görseli Gemini Vision ile analiz et.

    Args:
        image_path: Görsel dosyasının yolu
        model: Kullanılacak Gemini modeli
        custom_prompt: Özel prompt (None ise varsayılan supplement prompt kullanılır)

    Returns:
        dict: Çıkarılan yapılandırılmış veri
    """
    from google import genai
    from google.genai import types

    api_key = load_api_key()
    client = genai.Client(api_key=api_key)

    # Görseli yükle
    b64_data, mime_type = encode_image_to_base64(image_path)

    prompt = custom_prompt or SUPPLEMENT_ANALYSIS_PROMPT

    logger.info(f"Analyzing: {Path(image_path).name} with model: {model}")

    response = client.models.generate_content(
        model=model,
        contents=[
            types.Content(
                parts=[
                    types.Part(text=prompt),
                    types.Part(
                        inline_data=types.Blob(
                            mime_type=mime_type,
                            data=base64.standard_b64decode(b64_data),
                        )
                    ),
                ]
            )
        ],
        config=types.GenerateContentConfig(
            temperature=0.1,  # Düşük sıcaklık = daha kesin okuma
            max_output_tokens=8192,
        ),
    )

    raw_text = response.text
    logger.info(f"Raw response length: {len(raw_text)} chars")

    # JSON çıkarma
    parsed = extract_json_from_response(raw_text)

    return {
        "dosya": Path(image_path).name,
        "model": model,
        "ham_cikti": raw_text,
        "yapilandirilmis_veri": parsed,
    }


def analyze_multiple_images(
    image_paths: list[str],
    model: str = DEFAULT_MODEL,
    custom_prompt: Optional[str] = None,
) -> dict:
    """
    Birden fazla görseli tek seferde Gemini Vision'a gönder.
    Aynı ürünün farklı yüzlerini analiz etmek için ideal.
    """
    from google import genai
    from google.genai import types

    api_key = load_api_key()
    client = genai.Client(api_key=api_key)

    prompt = custom_prompt or (
        "Sana aynı ürüne ait birden fazla fotoğraf veriyorum. "
        "Tüm fotoğraflardaki bilgileri birleştirerek TEK bir kapsamlı analiz yap.\n\n"
        + SUPPLEMENT_ANALYSIS_PROMPT
    )

    parts = [types.Part(text=prompt)]

    for img_path in image_paths:
        b64_data, mime_type = encode_image_to_base64(img_path)
        parts.append(
            types.Part(
                inline_data=types.Blob(
                    mime_type=mime_type,
                    data=base64.standard_b64decode(b64_data),
                )
            )
        )
        logger.info(f"Added image: {Path(img_path).name}")

    logger.info(f"Sending {len(image_paths)} images to {model}...")

    response = client.models.generate_content(
        model=model,
        contents=[types.Content(parts=parts)],
        config=types.GenerateContentConfig(
            temperature=0.1,
            max_output_tokens=16384,
        ),
    )

    raw_text = response.text
    logger.info(f"Multi-image response length: {len(raw_text)} chars")

    parsed = extract_json_from_response(raw_text)

    return {
        "dosyalar": [Path(p).name for p in image_paths],
        "model": model,
        "ham_cikti": raw_text,
        "yapilandirilmis_veri": parsed,
    }


def extract_json_from_response(text: str) -> Optional[dict]:
    """Ham yanıttan JSON bloğunu çıkar."""
    import re

    # ```json ... ``` bloğu ara
    json_match = re.search(r"```json\s*\n(.*?)\n```", text, re.DOTALL)
    if json_match:
        try:
            return json.loads(json_match.group(1))
        except json.JSONDecodeError as e:
            logger.warning(f"JSON parse hatası: {e}")

    # Direkt JSON dene
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # { ... } bloğu bulmayı dene
    brace_match = re.search(r"\{[\s\S]*\}", text)
    if brace_match:
        try:
            return json.loads(brace_match.group(0))
        except json.JSONDecodeError:
            pass

    logger.warning("JSON çıkarılamadı, ham metin döndürülüyor.")
    return None


def format_output(result: dict, fmt: str = "json") -> str:
    """Sonucu istenen formatta döndür."""
    if fmt == "json":
        return json.dumps(result, ensure_ascii=False, indent=2)

    elif fmt == "markdown":
        data = result.get("yapilandirilmis_veri")
        if not data:
            return f"## Ham Çıktı\n\n{result.get('ham_cikti', 'Veri yok')}"

        md = []
        # Ürün bilgisi
        urun = data.get("urun_bilgisi", {})
        md.append(f"# {urun.get('urun_adi', 'Bilinmeyen Ürün')}")
        md.append(f"**Marka:** {urun.get('marka', '-')}")
        md.append(f"**Tür:** {urun.get('urun_turu', '-')}")
        md.append(f"**Porsiyon:** {urun.get('porsiyon_buyuklugu', '-')}")
        md.append(f"**Toplam porsiyon:** {urun.get('toplam_porsiyon', '-')}")
        md.append("")

        # İçerik tablosu
        icerik = data.get("icerik_tablosu", [])
        if icerik:
            md.append("## İçerik Tablosu")
            md.append("| Madde | Miktar | %BRD |")
            md.append("|-------|--------|------|")
            for item in icerik:
                ad = item.get("madde_adi", "")
                miktar = f"{item.get('miktar', '')} {item.get('birim', '')}"
                brd = item.get("brd_yuzde", "-")
                md.append(f"| {ad} | {miktar} | {brd} |")
            md.append("")

        # Bileşim
        bilesim = data.get("bilesim", "")
        if bilesim:
            md.append(f"## Bileşim\n{bilesim}\n")

        # Kullanım
        kullanim = data.get("kullanim_onerisi", {})
        if kullanim:
            md.append("## Kullanım Önerisi")
            md.append(f"- **Önerilen:** {kullanim.get('onerilen_kullanim', '-')}")
            md.append(f"- **Günlük doz:** {kullanim.get('gunluk_doz', '-')}")
            md.append(f"- **Uyarılar:** {kullanim.get('uyarilar', '-')}")
            md.append("")

        # Diğer
        diger = data.get("diger_bilgiler", {})
        if diger:
            md.append("## Diğer Bilgiler")
            md.append(f"- **Üretici:** {diger.get('uretici', '-')}")
            certs = diger.get("sertifikalar", [])
            if certs:
                md.append(f"- **Sertifikalar:** {', '.join(certs)}")
            md.append(f"- **Saklama:** {diger.get('saklama_kosullari', '-')}")
            md.append(f"- **Barkod:** {diger.get('barkod', '-')}")

        return "\n".join(md)

    else:  # text
        return result.get("ham_cikti", "Veri yok")


# ── CLI ──
def main():
    parser = argparse.ArgumentParser(description="Supplement label analyzer using Gemini Vision")
    parser.add_argument("path", help="Image file or directory path")
    parser.add_argument("--model", default=DEFAULT_MODEL, help=f"Gemini model (default: {DEFAULT_MODEL})")
    parser.add_argument("--output", choices=["json", "markdown", "text"], default="json", help="Output format")
    parser.add_argument("--multi", action="store_true", help="Send all images in a directory as a single multi-image request")
    parser.add_argument("--save", help="Save output to file")

    args = parser.parse_args()
    target = Path(args.path)

    if target.is_file():
        result = analyze_image(str(target), model=args.model)
        output = format_output(result, fmt=args.output)

    elif target.is_dir():
        images = sorted(
            [str(f) for f in target.iterdir() if f.suffix.lower() in (".jpg", ".jpeg", ".png", ".webp", ".heic")]
        )
        if not images:
            logger.error(f"No images found in {target}")
            sys.exit(1)

        logger.info(f"Found {len(images)} images in {target}")

        if args.multi:
            result = analyze_multiple_images(images, model=args.model)
            output = format_output(result, fmt=args.output)
        else:
            results = []
            for img in images:
                r = analyze_image(img, model=args.model)
                results.append(r)
            output = json.dumps(results, ensure_ascii=False, indent=2)
    else:
        logger.error(f"Path not found: {target}")
        sys.exit(1)

    # Çıktı
    print(output)

    if args.save:
        save_path = Path(args.save)
        save_path.write_text(output, encoding="utf-8")
        logger.info(f"Output saved to {save_path}")


if __name__ == "__main__":
    main()
