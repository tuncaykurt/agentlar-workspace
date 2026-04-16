#!/usr/bin/env python3
"""
Blog Publisher — MDX + görselleri GitHub'a push eder → Netlify auto-deploy
==========================================================================
Strateji:
  1. blog_ready.mdx dosyasını okur
  2. Cover image'ı okur (base64)
  3. Annotated step görsellerini okur (base64)
  4. GitHub API ile Ornek_AI_Website repo'suna tek commit ile push eder
  5. Netlify otomatik build tetikler → KISISEL_WEBSITE_BURAYA güncellenir

Kullanım:
    python3 blog_publisher.py <video_dir> --slug <slug>

NOT: Bu script GitHub MCP araçlarını değil, doğrudan GitHub API kullanır.
     Böylece Railway'de de çalışabilir (MCP bağımlılığı yok).
"""

import base64
import json
import os
import re
import sys
import requests
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent.resolve()

# ─── Config ───
GITHUB_OWNER = "[GITHUB_KULLANICI]"
GITHUB_REPO = "Ornek_AI_Website"
GITHUB_BRANCH = "main"

# Netlify Build Hook — push sonrası otomatik deploy tetikler
# env'den oku (Railway'de değiştirilebilir), yoksa hardcoded fallback
NETLIFY_BUILD_HOOK_URL = os.environ.get(
    "NETLIFY_BUILD_HOOK_URL",
    "https://api.netlify.com/build_hooks/69cd7618168c1cbf4aab0e10"
)

# Dosya yolları (repo içi)
BLOG_CONTENT_DIR = "src/content/blog"
BLOG_IMAGES_DIR = "public/images/blog"


def load_github_token():
    """GitHub token'ı oku (env_loader: önce os.environ, sonra master.env)."""
    from env_loader import get_env
    return get_env("GITHUB_TOKEN", "")


# ══════════════════════════════════════════════════════════════
# GITHUB API HELPERS
# ══════════════════════════════════════════════════════════════

class GitHubPublisher:
    """GitHub API ile dosya push eden yardımcı sınıf."""

    def __init__(self, token: str):
        self.token = token
        self.api_base = f"https://api.github.com/repos/{GITHUB_OWNER}/{GITHUB_REPO}"
        self.headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github.v3+json",
        }

    def get_ref_sha(self) -> str:
        """main branch'in son commit SHA'sını al."""
        resp = requests.get(
            f"{self.api_base}/git/ref/heads/{GITHUB_BRANCH}",
            headers=self.headers,
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json()["object"]["sha"]

    def get_tree_sha(self, commit_sha: str) -> str:
        """Commit'in tree SHA'sını al."""
        resp = requests.get(
            f"{self.api_base}/git/commits/{commit_sha}",
            headers=self.headers,
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json()["tree"]["sha"]

    def create_blob(self, content: str, encoding: str = "utf-8") -> str:
        """GitHub'da blob oluştur (text veya base64)."""
        resp = requests.post(
            f"{self.api_base}/git/blobs",
            headers=self.headers,
            json={"content": content, "encoding": encoding},
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json()["sha"]

    def create_tree(self, base_tree_sha: str, tree_items: list) -> str:
        """Yeni tree oluştur."""
        resp = requests.post(
            f"{self.api_base}/git/trees",
            headers=self.headers,
            json={"base_tree": base_tree_sha, "tree": tree_items},
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json()["sha"]

    def create_commit(self, tree_sha: str, parent_sha: str, message: str) -> str:
        """Yeni commit oluştur."""
        resp = requests.post(
            f"{self.api_base}/git/commits",
            headers=self.headers,
            json={
                "message": message,
                "tree": tree_sha,
                "parents": [parent_sha],
            },
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json()["sha"]

    def update_ref(self, commit_sha: str) -> bool:
        """Branch ref'ini güncelle."""
        resp = requests.patch(
            f"{self.api_base}/git/refs/heads/{GITHUB_BRANCH}",
            headers=self.headers,
            json={"sha": commit_sha},
            timeout=30,
        )
        resp.raise_for_status()
        return True

    def push_files(self, files: list, commit_message: str) -> bool:
        """Birden fazla dosyayı tek commit ile push et.

        files: [{'path': 'repo/path', 'content': str, 'encoding': 'utf-8'|'base64'}]
        """
        print(f"\n  📤 GitHub'a push ediliyor ({len(files)} dosya)...")

        try:
            # 1. Son commit SHA
            ref_sha = self.get_ref_sha()
            tree_sha = self.get_tree_sha(ref_sha)

            # 2. Blob'ları oluştur
            tree_items = []
            for i, f in enumerate(files):
                blob_sha = self.create_blob(f["content"], f["encoding"])
                tree_items.append({
                    "path": f["path"],
                    "mode": "100644",
                    "type": "blob",
                    "sha": blob_sha,
                })
                if (i + 1) % 5 == 0 or i == len(files) - 1:
                    print(f"    Blob {i+1}/{len(files)}: {f['path']}")

            # 3. Yeni tree
            new_tree_sha = self.create_tree(tree_sha, tree_items)

            # 4. Commit
            new_commit_sha = self.create_commit(new_tree_sha, ref_sha, commit_message)

            # 5. Ref güncelle
            self.update_ref(new_commit_sha)

            print(f"  ✅ Push başarılı! Commit: {new_commit_sha[:8]}")
            return True

        except Exception as e:
            print(f"  ❌ GitHub push hatası: {e}")
            if hasattr(e, 'response') and e.response is not None:
                print(f"     Response: {e.response.text[:300]}")
            return False


# ══════════════════════════════════════════════════════════════
# DOSYA HAZIRLAMA
# ══════════════════════════════════════════════════════════════

def prepare_files(video_dir: str, slug: str) -> list:
    """Push edilecek dosyaları hazırla.

    Returns: [{'path': str, 'content': str, 'encoding': str}]
    """
    files = []
    video_dir = os.path.abspath(video_dir)

    # 1. MDX dosyası
    mdx_path = os.path.join(video_dir, "blog_ready.mdx")
    if not os.path.exists(mdx_path):
        print(f"  ❌ blog_ready.mdx bulunamadı: {mdx_path}")
        return []

    with open(mdx_path, "r", encoding="utf-8") as f:
        mdx_content = f.read()

    files.append({
        "path": f"{BLOG_CONTENT_DIR}/{slug}.mdx",
        "content": mdx_content,
        "encoding": "utf-8",
    })
    print(f"  📄 MDX: {slug}.mdx ({len(mdx_content):,} chars)")

    # 2. Cover image
    cover_path = os.path.join(video_dir, f"{slug}-cover.webp")
    if not os.path.exists(cover_path):
        # Fallback: jpg formatı
        cover_path = os.path.join(video_dir, f"{slug}-cover.jpg")

    if os.path.exists(cover_path):
        with open(cover_path, "rb") as f:
            cover_b64 = base64.b64encode(f.read()).decode("ascii")
        ext = cover_path.rsplit('.', 1)[-1]
        files.append({
            "path": f"{BLOG_IMAGES_DIR}/{slug}-cover.{ext}",
            "content": cover_b64,
            "encoding": "base64",
        })
        size_kb = os.path.getsize(cover_path) / 1024
        print(f"  🖼️ Cover: {slug}-cover.{ext} ({size_kb:.0f} KB)")
    else:
        print(f"  ⚠️ Cover image bulunamadı, devam ediliyor...")

    # 3. Annotated step görselleri
    annotated_dir = os.path.join(video_dir, "annotated_v3")
    if os.path.isdir(annotated_dir):
        image_count = 0
        for fname in sorted(os.listdir(annotated_dir)):
            if fname.lower().endswith(('.jpg', '.jpeg', '.png', '.webp')):
                fpath = os.path.join(annotated_dir, fname)
                with open(fpath, "rb") as f:
                    img_b64 = base64.b64encode(f.read()).decode("ascii")
                files.append({
                    "path": f"{BLOG_IMAGES_DIR}/{slug}/{fname}",
                    "content": img_b64,
                    "encoding": "base64",
                })
                image_count += 1

        print(f"  🖼️ Step görselleri: {image_count} adet")
    else:
        print(f"  ⚠️ Annotated klasörü bulunamadı: {annotated_dir}")

    return files


# ══════════════════════════════════════════════════════════════
# ANA FONKSİYON
# ══════════════════════════════════════════════════════════════

def publish_blog(video_dir: str, slug: str, blog_title: str = "") -> bool:
    """Blog'u GitHub'a push et ve Netlify deploy tetikle.

    Returns: True = başarılı
    """
    print(f"\n{'='*60}")
    print(f"🚀 BLOG PUBLISHER — GitHub Push → Netlify Deploy")
    print(f"{'='*60}")
    print(f"  Slug   : {slug}")
    print(f"  Repo   : {GITHUB_OWNER}/{GITHUB_REPO}")
    print(f"  Branch : {GITHUB_BRANCH}")

    # Token
    token = load_github_token()
    if not token:
        print("  ❌ GITHUB_TOKEN bulunamadı! master.env'e ekleyin.")
        return False

    # Dosyaları hazırla
    files = prepare_files(video_dir, slug)
    if not files:
        print("  ❌ Push edilecek dosya bulunamadı!")
        return False

    # Commit message
    if not blog_title:
        blog_title = slug.replace('-', ' ').title()
    commit_msg = f"📝 Yeni blog: {blog_title}"

    # Push
    publisher = GitHubPublisher(token)
    success = publisher.push_files(files, commit_msg)

    if success:
        blog_url = f"https://KISISEL_WEBSITE_BURAYA/blog/{slug}"
        print(f"\n  📡 Netlify build hook tetikleniyor...")

        # Netlify Build Hook tetikle
        try:
            hook_resp = requests.post(NETLIFY_BUILD_HOOK_URL, timeout=15)
            if hook_resp.ok:
                print(f"  ✅ Netlify build başarıyla tetiklendi (HTTP {hook_resp.status_code})")
            else:
                print(f"  ⚠️ Netlify hook yanıtı: HTTP {hook_resp.status_code}")
        except Exception as e:
            print(f"  ⚠️ Netlify hook tetiklenemedi (GitHub auto-deploy devreye girecek): {e}")

        print(f"\n  {'='*50}")
        print(f"  ✅ BLOG YAYINLANDI!")
        print(f"  {'='*50}")
        print(f"  🔗 URL  : {blog_url}")
        print(f"  📦 Files: {len(files)} dosya push edildi")
        print(f"  ⏳ Netlify build ~2-3 dakika içinde tamamlanacak")
        return True
    else:
        print(f"\n  ❌ Blog yayınlanamadı!")
        return False


# ══════════════════════════════════════════════════════════════
# CLI
# ══════════════════════════════════════════════════════════════

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Blog Publisher — GitHub Auto-Deploy")
    parser.add_argument("video_dir", help="Video çalışma dizini")
    parser.add_argument("--slug", type=str, required=True, help="Blog slug'ı")
    parser.add_argument("--title", type=str, default="", help="Blog başlığı")
    args = parser.parse_args()

    success = publish_blog(args.video_dir, args.slug, args.title)
    if not success:
        sys.exit(1)
