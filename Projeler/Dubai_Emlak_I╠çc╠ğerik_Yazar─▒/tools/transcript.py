#!/usr/bin/env python3
"""
Supadata Transkript Aracı
==========================
Instagram ve TikTok video URL'lerinden transkript çıkarır.
Supadata API (https://supadata.ai) kullanır.

Kullanım:
  python3 transcript.py "https://www.tiktok.com/@user/video/1234567890"
  python3 transcript.py "https://www.instagram.com/reel/ABC123/"
"""

import sys
import json
import ssl
import urllib.request
import urllib.parse
import urllib.error

# macOS SSL fix
SSL_CONTEXT = ssl.create_default_context()
try:
    import certifi
    SSL_CONTEXT.load_verify_locations(certifi.where())
except ImportError:
    SSL_CONTEXT = ssl._create_unverified_context()

# ── API Ayarları ─────────────────────────────────────────────
SUPADATA_API_KEY = "BURAYA_SUPADATA_API_KEY"
SUPADATA_BASE_URL = "https://api.supadata.ai/v1"


def get_transcript(video_url: str, lang: str = None, mode: str = "auto") -> dict:
    """Video URL'den transkript çıkar.

    Args:
        video_url: TikTok veya Instagram video URL'si
        lang: Tercih edilen dil kodu (ör: 'en', 'tr', 'ar'). None = otomatik tespit.
        mode: Transkript alma modu:
              'native' = platformun kendi altyazılarını al
              'generate' = AI ile yeni transkript üret
              'auto' = önce native dene, yoksa AI ile üret

    Returns:
        {
          "content": "Transkript metni...",
          "segments": [...],  # Zaman damgalı segmentler
          "lang": "en",
          "error": None
        }
    """
    params = {"url": video_url, "mode": mode}
    if lang:
        params["lang"] = lang

    query_string = urllib.parse.urlencode(params)
    url = f"{SUPADATA_BASE_URL}/transcript?{query_string}"

    req = urllib.request.Request(url)
    req.add_header("x-api-key", SUPADATA_API_KEY)
    req.add_header("User-Agent", "Mozilla/5.0 (DubaiEmlakBot/1.0)")
    req.add_header("Accept", "application/json")

    try:
        with urllib.request.urlopen(req, timeout=30, context=SSL_CONTEXT) as response:
            data = json.loads(response.read().decode("utf-8"))
            # Transkript metnini segmentlerden birleştir
            content = ""
            segments = data.get("content", [])

            if isinstance(segments, list):
                content = " ".join(
                    seg.get("text", "") for seg in segments if isinstance(seg, dict)
                )
                if not content:
                    content = " ".join(str(s) for s in segments)
            elif isinstance(segments, str):
                content = segments

            return {
                "content": content.strip(),
                "segments": segments if isinstance(segments, list) else [],
                "lang": data.get("lang", "unknown"),
                "error": None,
            }

    except urllib.error.HTTPError as e:
        error_body = e.read().decode("utf-8", errors="replace")
        return {
            "content": "",
            "segments": [],
            "lang": "",
            "error": f"HTTP {e.code}: {error_body[:300]}",
        }
    except urllib.error.URLError as e:
        return {
            "content": "",
            "segments": [],
            "lang": "",
            "error": f"Bağlantı hatası: {str(e)}",
        }
    except Exception as e:
        return {
            "content": "",
            "segments": [],
            "lang": "",
            "error": f"Beklenmeyen hata: {str(e)}",
        }


def format_transcript(result: dict) -> str:
    """Transkript sonucunu okunabilir formata çevir."""
    if result.get("error"):
        return f"❌ Hata: {result['error']}"

    if not result.get("content"):
        return "⚠️ Transkript bulunamadı veya boş."

    lines = [
        f"🌐 Dil: {result['lang']}",
        f"📝 Transkript ({len(result['content'])} karakter):",
        "",
        result["content"],
    ]
    return "\n".join(lines)


# ── Ana Çalıştırma ───────────────────────────────────────────

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Kullanım: python3 transcript.py <video_url> [lang]")
        print("Örnek:    python3 transcript.py 'https://www.tiktok.com/@user/video/123'")
        sys.exit(1)

    video_url = sys.argv[1]
    lang = sys.argv[2] if len(sys.argv) > 2 else None

    print(f"🔍 Transkript alınıyor: {video_url}")
    result = get_transcript(video_url, lang=lang)
    print(format_transcript(result))
