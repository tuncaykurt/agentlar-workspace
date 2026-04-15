#!/usr/bin/env python3
"""
Blog Formatter — blog_draft.md → SEO uyumlu MDX dosyasına dönüştürür
====================================================================
Girdi:  <video_dir>/blog_draft.md + <video_dir>/annotated_v3/annotations_v3.json
Çıktı:  <video_dir>/blog_ready.mdx  (KISISEL_WEBSITE_BURAYA uyumlu MDX frontmatter)

Kullanım:
    python3 blog_formatter.py <video_dir> [--slug emergent-28-duolingo]
"""

import json
import os
import re
import sys
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

# ─── Config ───
SCRIPT_DIR = Path(__file__).parent.resolve()


# ══════════════════════════════════════════════════════════════
# UTILS
# ══════════════════════════════════════════════════════════════

def slugify(text: str) -> str:
    """Türkçe uyumlu slug üretici.
    'Emergent 28 Duolingo' → 'emergent-28-duolingo'
    """
    # Türkçe karakter dönüşümü
    tr_map = str.maketrans({
        'ç': 'c', 'ğ': 'g', 'ı': 'i', 'ö': 'o', 'ş': 's', 'ü': 'u',
        'Ç': 'c', 'Ğ': 'g', 'İ': 'i', 'Ö': 'o', 'Ş': 's', 'Ü': 'u',
    })
    text = text.translate(tr_map)
    # Normalize ve ASCII'ye çevir
    text = unicodedata.normalize('NFKD', text).encode('ascii', 'ignore').decode('ascii')
    text = text.lower().strip()
    # Alfanumerik olmayan karakterleri tire ile değiştir
    text = re.sub(r'[^a-z0-9]+', '-', text)
    text = text.strip('-')
    return text


def extract_title(blog_text: str) -> str:
    """Blog metninden H1 başlığını çıkar."""
    for line in blog_text.split('\n'):
        line = line.strip()
        if line.startswith('# ') and not line.startswith('## '):
            return line.lstrip('# ').strip()
    # H1 yoksa ilk satırı dene
    first_line = blog_text.strip().split('\n')[0].strip()
    if first_line.startswith('**') and first_line.endswith('**'):
        return first_line.strip('*').strip()
    return first_line


def extract_meta_description(blog_text: str) -> str:
    """Blog metninden meta description çıkar."""
    patterns = [
        r'(?:Meta [Dd]escription|META DESCRIPTION)[:\s]*["\']?(.+?)["\']?\s*$',
        r'(?:Açıklama|Description)[:\s]*["\']?(.+?)["\']?\s*$',
    ]
    for pattern in patterns:
        match = re.search(pattern, blog_text, re.MULTILINE)
        if match:
            desc = match.group(1).strip().strip('"\'')
            return desc[:160]

    # Bulunamadıysa ilk paragraftan üret
    paragraphs = [p.strip() for p in blog_text.split('\n\n') if p.strip() and not p.strip().startswith('#')]
    for p in paragraphs:
        clean = re.sub(r'\[.*?\]', '', p).strip()
        clean = re.sub(r'[*_`]', '', clean).strip()
        if len(clean) > 50:
            return clean[:157] + '...'
    return ''


def extract_keywords(blog_text: str) -> list:
    """Blog metninden SEO keyword'leri çıkar."""
    patterns = [
        r'(?:SEO [Kk]eyword|Keyword|Anahtar [Kk]elime)[s]*[:\s]*(.+?)(?:\n\n|\Z)',
        r'(?:Tag|Etiket)[s]*[:\s]*(.+?)(?:\n\n|\Z)',
    ]
    for pattern in patterns:
        match = re.search(pattern, blog_text, re.MULTILINE | re.DOTALL)
        if match:
            raw = match.group(1)
            # Virgül veya satır sonu ile ayrılmış keyword'leri parse et
            keywords = []
            for item in re.split(r'[,\n•\-\*]', raw):
                clean = item.strip().strip('"\'`').lower()
                # Sayıları, çok kısa veya çok uzun olanları filtrele
                if clean and 2 < len(clean) < 40 and not clean.isdigit():
                    keywords.append(clean)
            if keywords:
                return keywords[:7]
    return ["yapay zeka", "otomasyon", "teknoloji"]


def clean_blog_body(blog_text: str) -> str:
    """Blog metninden meta bilgileri (description, keywords) temizler
    ve sadece blog içeriğini bırakır."""
    lines = blog_text.split('\n')
    clean_lines = []
    skip_section = False

    for line in lines:
        # Meta description veya keyword bölümlerini atla
        lower_line = line.strip().lower()
        if any(kw in lower_line for kw in [
            'meta description', 'seo keyword', 'anahtar kelime',
            'önerilen keyword', 'önerilen etiket', 'seo tag',
        ]):
            skip_section = True
            continue

        if skip_section:
            # Boş satır veya yeni başlık gelene kadar atla
            if line.strip() == '' or line.strip().startswith('#'):
                skip_section = False
                if line.strip().startswith('#'):
                    clean_lines.append(line)
            continue

        clean_lines.append(line)

    return '\n'.join(clean_lines).strip()


def replace_image_references(blog_body: str, slug: str, annotations_data: list) -> str:
    """Blog içindeki [Görsel X] referanslarını gerçek MDX image syntax'ına dönüştürür."""

    # annotations_data'dan step → dosya eşlemesi oluştur
    step_to_file = {}
    for ann in annotations_data:
        step_num = ann.get('step', 0)
        title = ann.get('title', f'Adım {step_num}')
        # Annotated dosyanın adını oluştur (annotate_v3.py standart format)
        filename = f"step_{step_num:02d}_{title.replace(' ', '_')}.jpg"
        step_to_file[step_num] = {
            'filename': filename,
            'title': title,
        }

    def image_replacer(match):
        full_match = match.group(0)
        num_match = re.search(r'\d+', full_match)
        if not num_match:
            return full_match

        step_num = int(num_match.group())
        if step_num in step_to_file:
            info = step_to_file[step_num]
            return f'\n![{info["title"]}](/images/blog/{slug}/{info["filename"]})\n'
        elif step_num <= len(annotations_data):
            # Fallback: sıralı eşleştirme
            ann = annotations_data[step_num - 1] if step_num > 0 else annotations_data[0]
            title = ann.get('title', f'Adım {step_num}')
            filename = f"step_{ann.get('step', step_num):02d}_{title.replace(' ', '_')}.jpg"
            return f'\n![{title}](/images/blog/{slug}/{filename})\n'
        return full_match

    # Çeşitli görsel referans formatlarını eşle
    patterns = [
        r'\[Görsel\s*\d+\]',
        r'\[Görsel:\s*\d+\]',
        r'\[Image\s*\d+\]',
        r'\!\[Adım\s*\d+.*?\]\(.*?\)',  # Zaten MDX formatında olanları atla
    ]

    result = blog_body
    for pattern in patterns[:3]:  # Son pattern hariç (zaten doğru format)
        result = re.sub(pattern, image_replacer, result, flags=re.IGNORECASE)

    return result


# ══════════════════════════════════════════════════════════════
# ANA FONKSİYON
# ══════════════════════════════════════════════════════════════

def format_blog(video_dir: str, custom_slug: str = None, video_name: str = None) -> dict:
    """blog_draft.md → blog_ready.mdx dönüşümünü gerçekleştirir.

    Returns:
        dict: {
            'mdx_path': str,       # blog_ready.mdx dosya yolu
            'slug': str,           # URL slug
            'title': str,          # Blog başlığı
            'cover_path': str,     # Beklenen cover image path
            'image_files': list,   # Annotated görsel dosyaları listesi
        }
    """
    video_dir = os.path.abspath(video_dir)

    print(f"\n{'='*60}")
    print(f"📄 BLOG FORMATTER — MDX Dönüşümü")
    print(f"{'='*60}")

    # 1. blog_draft.md oku
    draft_path = os.path.join(video_dir, "blog_draft.md")
    if not os.path.exists(draft_path):
        print(f"❌ HATA: {draft_path} bulunamadı!")
        return None

    with open(draft_path, "r", encoding="utf-8") as f:
        blog_text = f.read()
    print(f"  📖 Draft okundu: {len(blog_text)} karakter")

    # 2. annotations_v3.json oku (görsel referansları için)
    ann_path = os.path.join(video_dir, "annotated_v3", "annotations_v3.json")
    annotations_data = []
    if os.path.exists(ann_path):
        with open(ann_path, "r", encoding="utf-8") as f:
            annotations_data = json.load(f)
        print(f"  📊 {len(annotations_data)} annotation yüklendi")
    else:
        print(f"  ⚠️ annotations_v3.json bulunamadı, görseller eşleştirilmeyecek")

    # 3. Metadata çıkar
    title = extract_title(blog_text)
    excerpt = extract_meta_description(blog_text)
    tags = extract_keywords(blog_text)

    # 4. Slug üret
    if custom_slug:
        slug = custom_slug
    elif video_name:
        slug = slugify(video_name)
    else:
        slug = slugify(title)

    print(f"  📌 Başlık : {title}")
    print(f"  📌 Slug   : {slug}")
    print(f"  📌 Excerpt: {excerpt[:80]}...")
    print(f"  📌 Tags   : {tags}")

    # 5. Blog body'yi temizle
    body = clean_blog_body(blog_text)

    # H1'i body'den çıkar (frontmatter'da zaten var)
    body_lines = body.split('\n')
    clean_body_lines = []
    h1_removed = False
    for line in body_lines:
        if not h1_removed and line.strip().startswith('# ') and not line.strip().startswith('## '):
            h1_removed = True
            continue
        clean_body_lines.append(line)
    body = '\n'.join(clean_body_lines).strip()

    # 6. Görsel referanslarını dönüştür
    if annotations_data:
        body = replace_image_references(body, slug, annotations_data)

    # 7. Annotated görsel dosyaları listesi
    image_files = []
    annotated_dir = os.path.join(video_dir, "annotated_v3")
    if os.path.isdir(annotated_dir):
        for fname in sorted(os.listdir(annotated_dir)):
            if fname.lower().endswith(('.jpg', '.jpeg', '.png', '.webp')):
                image_files.append(os.path.join(annotated_dir, fname))
        print(f"  🖼️ {len(image_files)} annotated görsel bulundu")

    # 8. MDX frontmatter oluştur
    now = datetime.now(timezone.utc)
    cover_image_path = f"/images/blog/{slug}-cover.webp"

    # YAML-safe: tırnak ve özel karakterleri escape et
    safe_title = title.replace('"', '\\"')
    safe_excerpt = excerpt.replace('"', '\\"')

    frontmatter = f"""---
title: "{safe_title}"
date: "{now.strftime('%Y-%m-%dT%H:%M:%S.000Z')}"
excerpt: "{safe_excerpt}"
coverImage: "{cover_image_path}"
tags: {json.dumps(tags, ensure_ascii=False)}
---"""

    mdx_content = f"{frontmatter}\n\n{body}\n"

    # 9. Kaydet
    mdx_path = os.path.join(video_dir, "blog_ready.mdx")
    with open(mdx_path, "w", encoding="utf-8") as f:
        f.write(mdx_content)

    print(f"\n  ✅ MDX dosyası oluşturuldu: {mdx_path}")
    print(f"     Boyut: {len(mdx_content):,} karakter")

    return {
        'mdx_path': mdx_path,
        'slug': slug,
        'title': title,
        'excerpt': excerpt,
        'tags': tags,
        'cover_path': cover_image_path,
        'image_files': image_files,
    }


# ══════════════════════════════════════════════════════════════
# CLI
# ══════════════════════════════════════════════════════════════

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Blog Formatter — MDX Dönüştürücü")
    parser.add_argument("video_dir", help="Video çalışma dizini")
    parser.add_argument("--slug", type=str, default=None, help="Custom URL slug")
    parser.add_argument("--video-name", type=str, default=None, help="Video adı (slug üretimi için)")
    args = parser.parse_args()

    result = format_blog(args.video_dir, custom_slug=args.slug, video_name=args.video_name)
    if result:
        print(f"\n{'='*60}")
        print(f"✅ FORMATTER TAMAMLANDI")
        print(f"  MDX    : {result['mdx_path']}")
        print(f"  Slug   : {result['slug']}")
        print(f"  Images : {len(result['image_files'])} adet")
    else:
        print("❌ Formatter başarısız!")
        sys.exit(1)
