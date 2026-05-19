#!/usr/bin/env python3
"""
🔐 Antigravity Credential Manager
Merkezi token yönetimi — analiz, bağlama, güncelleme ve güvenlik taraması.

Kullanım:
    python3 env_manager.py analyze <proje_yolu>       # Projenin ihtiyaçlarını analiz et
    python3 env_manager.py generate <proje_yolu> [--services svc1,svc2]  # Filtrelenmiş .env oluştur
    python3 env_manager.py link <proje_yolu>           # master.env'e symlink oluştur
    python3 env_manager.py update <KEY> <VALUE>        # Token güncelle
    python3 env_manager.py refresh-all                 # Tüm filtrelenmiş .env'leri yenile
    python3 env_manager.py scan                        # Hardcoded token taraması
    python3 env_manager.py verify <proje_yolu>         # Doğrulama
    python3 env_manager.py status                      # Tüm projelerin credential durumu
"""

import os
import re
import sys
import json
import shutil
from pathlib import Path
from datetime import datetime

# ─── Paths ────────────────────────────────────────────────────────────────────
ANTIGRAVITY_ROOT = Path(__file__).resolve().parents[3]  # _skills/dev/sifre-yonetici/scripts → root
MASTER_ENV = ANTIGRAVITY_ROOT / "_knowledge" / "credentials" / "master.env"
OAUTH_DIR = ANTIGRAVITY_ROOT / "_knowledge" / "credentials" / "oauth"
PROJELER_DIR = ANTIGRAVITY_ROOT / "Projeler"

# ─── Servis İmzaları ─────────────────────────────────────────────────────────
# Kod içinde bu patternler tespit edilirse ilgili env var'lar gerekli demektir
SERVICE_SIGNATURES = {
    "openai": {
        "patterns": [
            r"import\s+openai", r"from\s+openai", r"OPENAI_API_KEY",
            r"openai\.ChatCompletion", r"openai\.Client", r"OpenAI\("
        ],
        "env_vars": ["OPENAI_API_KEY"],
    },
    "groq": {
        "patterns": [r"groq", r"GROQ_API_KEY", r"api\.groq\.com"],
        "env_vars": ["GROQ_API_KEY", "GROQ_BASE_URL"],
    },
    "perplexity": {
        "patterns": [r"perplexity", r"PERPLEXITY_API_KEY", r"api\.perplexity\.ai"],
        "env_vars": ["PERPLEXITY_API_KEY", "PERPLEXITY_BASE_URL"],
    },
    "kie": {
        "patterns": [r"kie", r"KIE_API_KEY", r"api\.kie\.ai"],
        "env_vars": ["KIE_API_KEY", "KIE_BASE_URL"],
    },
    "fal": {
        "patterns": [r"fal", r"FAL_API_KEY", r"fal\.run"],
        "env_vars": ["FAL_API_KEY", "FAL_BASE_URL"],
    },
    "imgbb": {
        "patterns": [r"imgbb", r"IMGBB_API_KEY"],
        "env_vars": ["IMGBB_API_KEY", "IMGBB_BASE_URL"],
    },
    "google_cloud": {
        "patterns": [r"GOOGLE_CLOUD_API_KEY", r"google\.cloud"],
        "env_vars": ["GOOGLE_CLOUD_API_KEY"],
    },
    "apify": {
        "patterns": [r"apify", r"APIFY_API_KEY", r"ApifyClient"],
        "env_vars": ["APIFY_API_KEY"],
    },
    "hunter": {
        "patterns": [r"hunter\.io", r"HUNTER_API_KEY", r"api\.hunter\.io"],
        "env_vars": ["HUNTER_API_KEY"],
    },
    "apollo": {
        "patterns": [r"apollo", r"APOLLO_API_KEY", r"api\.apollo\.io"],
        "env_vars": ["APOLLO_API_KEY"],
    },
    "gmail_outreach": {
        "patterns": [r"GMAIL_OUTREACH", r"KULLANICI_ADI_BURAYA@gmail"],
        "env_vars": ["GMAIL_OUTREACH_CLIENT_ID", "GMAIL_OUTREACH_CLIENT_SECRET"],
    },
    "gmail_swc": {
        "patterns": [r"GMAIL_SWC", r"sweatco\.in", r"[İŞ_EMAIL_PREFIXI]@"],
        "env_vars": ["GMAIL_SWC_CLIENT_ID", "GMAIL_SWC_CLIENT_SECRET"],
    },
    "telegram": {
        "patterns": [r"telegram", r"TELEGRAM_BOT_TOKEN", r"python-telegram-bot"],
        "env_vars": ["TELEGRAM_BOT_TOKEN", "TELEGRAM_ADMIN_CHAT_ID"],
    },
    "telegram_shorts": {
        "patterns": [r"TELEGRAM_SHORTS_BOT_TOKEN"],
        "env_vars": ["TELEGRAM_SHORTS_BOT_TOKEN"],
    },
    "elevenlabs": {
        "patterns": [r"elevenlabs", r"ELEVENLABS_API_KEY", r"xi-api-key"],
        "env_vars": ["ELEVENLABS_API_KEY"],
    },
    "railway": {
        "patterns": [r"RAILWAY_TOKEN", r"railway"],
        "env_vars": ["RAILWAY_TOKEN"],
    },
    "supadata": {
        "patterns": [r"supadata", r"SUPADATA_API_KEY"],
        "env_vars": ["SUPADATA_API_KEY"],
    },
    "anthropic": {
        "patterns": [r"anthropic", r"ANTHROPIC_API_KEY", r"claude"],
        "env_vars": ["ANTHROPIC_API_KEY"],
    },
    "openrouter": {
        "patterns": [r"openrouter", r"OPENROUTER_API_KEY"],
        "env_vars": ["OPENROUTER_API_KEY", "OPENROUTER_BASE_URL"],
    },
    "google_ai": {
        "patterns": [r"GOOGLE_API_KEY", r"gemini-pro"],
        "env_vars": ["GOOGLE_API_KEY"],
    },
}


def load_master_env() -> dict:
    """master.env dosyasını oku ve dict olarak döndür."""
    env = {}
    if not MASTER_ENV.exists():
        print(f"❌ master.env bulunamadı: {MASTER_ENV}")
        sys.exit(1)
    for line in MASTER_ENV.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" in line:
            key, value = line.split("=", 1)
            env[key.strip()] = value.strip()
    return env


def analyze_project(project_path: str) -> dict:
    """Projedeki dosyaları tarayarak hangi servislere ihtiyaç duyulduğunu belirle."""
    project = Path(project_path)
    if not project.is_absolute():
        project = ANTIGRAVITY_ROOT / project

    if not project.exists():
        print(f"❌ Proje bulunamadı: {project}")
        sys.exit(1)

    detected_services = {}
    code_extensions = {".py", ".js", ".ts", ".jsx", ".tsx", ".env", ".yaml", ".yml", ".md", ".sh"}
    skip_dirs = {"venv", ".venv", "node_modules", "__pycache__", ".git", "env", "ENV"}

    for root, dirs, files in os.walk(project):
        # Skip directories
        dirs[:] = [d for d in dirs if d not in skip_dirs]

        for f in files:
            fpath = Path(root) / f
            if fpath.suffix not in code_extensions:
                continue
            try:
                content = fpath.read_text(errors="ignore")
            except Exception:
                continue

            for service_name, svc_info in SERVICE_SIGNATURES.items():
                if service_name in detected_services:
                    continue
                for pattern in svc_info["patterns"]:
                    if re.search(pattern, content, re.IGNORECASE):
                        detected_services[service_name] = {
                            "env_vars": svc_info["env_vars"],
                            "detected_in": str(fpath.relative_to(ANTIGRAVITY_ROOT)),
                        }
                        break

    return detected_services


def generate_env(project_path: str, services: list = None):
    """Proje için filtrelenmiş .env dosyası oluştur."""
    project = Path(project_path)
    if not project.is_absolute():
        project = ANTIGRAVITY_ROOT / project

    master = load_master_env()

    if not services:
        # Otomatik tespit
        detected = analyze_project(str(project))
        services_to_include = set()
        for svc_name, svc_info in detected.items():
            for var in svc_info["env_vars"]:
                services_to_include.add(var)
    else:
        services_to_include = set()
        for svc in services:
            svc = svc.strip().lower()
            if svc in SERVICE_SIGNATURES:
                for var in SERVICE_SIGNATURES[svc]["env_vars"]:
                    services_to_include.add(var)
            else:
                # Doğrudan env var ismi olabilir
                services_to_include.add(svc.upper())

    env_path = project / ".env"

    # Mevcut .env var mı kontrol et
    if env_path.exists():
        if env_path.is_symlink():
            print(f"⚠️  Mevcut symlink kaldırılıyor: {env_path}")
            env_path.unlink()
        else:
            backup = env_path.with_suffix(".env.backup")
            shutil.copy2(env_path, backup)
            print(f"📦 Mevcut .env yedeklendi: {backup}")

    lines = [
        f"# ────────────────────────────────────────────",
        f"# 🔐 Otomatik oluşturuldu — sifre-yonetici",
        f"# 📅 {datetime.now().strftime('%Y-%m-%d %H:%M')}",
        f"# 🔄 Güncellemek için: python3 env_manager.py generate {project_path}",
        f"# ────────────────────────────────────────────",
        "",
    ]

    found_count = 0
    missing = []
    for var in sorted(services_to_include):
        if var in master:
            lines.append(f"{var}={master[var]}")
            found_count += 1
        else:
            missing.append(var)
            lines.append(f"# {var}=BULUNAMADI")

    env_path.write_text("\n".join(lines) + "\n")
    print(f"✅ .env oluşturuldu: {env_path}")
    print(f"   📊 {found_count} token bağlandı")
    if missing:
        print(f"   ⚠️  Bulunamayan: {', '.join(missing)}")


def link_env(project_path: str):
    """Projeye master.env symlink'i oluştur."""
    project = Path(project_path)
    if not project.is_absolute():
        project = ANTIGRAVITY_ROOT / project

    env_path = project / ".env"

    if env_path.exists() or env_path.is_symlink():
        if env_path.is_symlink():
            env_path.unlink()
        else:
            backup = env_path.with_suffix(".env.backup")
            shutil.copy2(env_path, backup)
            print(f"📦 Mevcut .env yedeklendi: {backup}")
            env_path.unlink()

    # Relative symlink oluştur
    rel_path = os.path.relpath(MASTER_ENV, project)
    env_path.symlink_to(rel_path)
    print(f"🔗 Symlink oluşturuldu: {env_path} → {rel_path}")


def update_key(key: str, value: str):
    """master.env'deki bir key'i güncelle."""
    if not MASTER_ENV.exists():
        print("❌ master.env bulunamadı")
        sys.exit(1)

    lines = MASTER_ENV.read_text().splitlines()
    updated = False
    for i, line in enumerate(lines):
        stripped = line.strip()
        if stripped.startswith("#") or not stripped:
            continue
        if "=" in stripped:
            k = stripped.split("=", 1)[0].strip()
            if k == key:
                lines[i] = f"{key}={value}"
                updated = True
                break

    if updated:
        MASTER_ENV.write_text("\n".join(lines) + "\n")
        print(f"✅ {key} güncellendi")
    else:
        # Key bulunamadıysa sonuna ekle
        lines.append(f"\n# Eklendi: {datetime.now().strftime('%Y-%m-%d')}")
        lines.append(f"{key}={value}")
        MASTER_ENV.write_text("\n".join(lines) + "\n")
        print(f"➕ {key} eklendi (yeni)")


def refresh_all():
    """Filtrelenmiş .env kullanan tüm projeleri yenile."""
    if not PROJELER_DIR.exists():
        print("❌ Projeler klasörü bulunamadı")
        return

    refreshed = 0
    for project_dir in PROJELER_DIR.iterdir():
        try:
            if not project_dir.is_dir() or project_dir.name.startswith((".", "_")):
                continue
        except (PermissionError, OSError):
            continue
        env_path = project_dir / ".env"
        if env_path.exists() and not env_path.is_symlink():
            # İçerikte "sifre-yonetici" imzası var mı?
            content = env_path.read_text()
            if "sifre-yonetici" in content:
                print(f"🔄 Yenileniyor: {project_dir.name}")
                generate_env(str(project_dir))
                refreshed += 1

    print(f"\n✅ {refreshed} proje yenilendi")


def scan_hardcoded():
    """Projelerde hardcoded token/secret olup olmadığını tara."""
    if not PROJELER_DIR.exists():
        return

    # Token pattern'leri
    dangerous_patterns = [
        (r"sk-proj-[A-Za-z0-9_-]{20,}", "OpenAI API Key"),
        (r"apify_api_[A-Za-z0-9]{20,}", "Apify API Key"),
        (r"gsk_[A-Za-z0-9]{20,}", "Groq API Key"),
        (r"pplx-[A-Za-z0-9]{20,}", "Perplexity API Key"),
        (r"GOCSPX-[A-Za-z0-9_-]{20,}", "Google Client Secret"),
        (r"\d{7,}:[A-Za-z0-9_-]{30,}", "Telegram Bot Token"),
    ]

    skip_dirs = {"venv", ".venv", "node_modules", "__pycache__", ".git", "env", "ENV"}
    skip_files = {".env", ".env.backup", "master.env", "api-anahtarlari.md"}
    code_extensions = {".py", ".js", ".ts", ".yaml", ".yml", ".sh", ".md"}

    findings = []
    for root, dirs, files in os.walk(PROJELER_DIR):
        dirs[:] = [d for d in dirs if d not in skip_dirs]
        for f in files:
            if f in skip_files:
                continue
            fpath = Path(root) / f
            if fpath.suffix not in code_extensions:
                continue
            try:
                content = fpath.read_text(errors="ignore")
            except Exception:
                continue
            for pattern, description in dangerous_patterns:
                matches = re.findall(pattern, content)
                if matches:
                    rel_path = fpath.relative_to(ANTIGRAVITY_ROOT)
                    findings.append({
                        "file": str(rel_path),
                        "type": description,
                        "count": len(matches),
                    })

    if findings:
        print(f"🚨 {len(findings)} dosyada hardcoded token tespit edildi:\n")
        for f in findings:
            print(f"   ⚠️  {f['file']}")
            print(f"        → {f['type']} ({f['count']} adet)")
        print(f"\n💡 Bu tokenları os.environ.get() veya .env dosyasına taşıyın.")
    else:
        print("✅ Hardcoded token bulunamadı — temiz!")


def verify_project(project_path: str):
    """Projenin credential bağlantılarını doğrula."""
    project = Path(project_path)
    if not project.is_absolute():
        project = ANTIGRAVITY_ROOT / project

    env_path = project / ".env"
    master = load_master_env()

    print(f"🔍 Doğrulama: {project.name}\n")

    # 1. .env dosyası var mı?
    if not env_path.exists():
        print("   ❌ .env dosyası yok!")
        detected = analyze_project(str(project))
        if detected:
            print(f"   💡 {len(detected)} servis tespit edildi, 'generate' komutu ile .env oluşturun")
        return

    # 2. Symlink mi, düz dosya mı?
    if env_path.is_symlink():
        target = env_path.resolve()
        if target == MASTER_ENV.resolve():
            print("   ✅ master.env'e symlink — otomatik güncel")
        else:
            print(f"   ⚠️  Bilinmeyen hedefe symlink: {target}")
    else:
        print("   📄 Bağımsız .env dosyası")

    # 3. İçindeki tokenler güncel mi?
    env_content = env_path.read_text()
    outdated = []
    for line in env_content.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" in line:
            key, value = line.split("=", 1)
            key, value = key.strip(), value.strip()
            if key in master and master[key] != value:
                outdated.append(key)

    if outdated:
        print(f"   ⚠️  {len(outdated)} token güncel değil: {', '.join(outdated)}")
    else:
        print("   ✅ Tüm tokenlar güncel")

    # 4. İhtiyaç analizi
    detected = analyze_project(str(project))
    needed_vars = set()
    for svc_info in detected.values():
        needed_vars.update(svc_info["env_vars"])

    provided_vars = set()
    for line in env_content.splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            provided_vars.add(line.split("=", 1)[0].strip())

    missing = needed_vars - provided_vars
    if missing:
        print(f"   ⚠️  Eksik tokenlar: {', '.join(missing)}")
    else:
        print(f"   ✅ Tüm gerekli tokenlar mevcut ({len(needed_vars)} servis)")


def show_status():
    """Tüm projelerin credential durumunu göster."""
    if not PROJELER_DIR.exists():
        return

    print("📊 Antigravity Credential Durumu\n")
    print(f"{'Proje':<35} {'Durum':<20} {'Detay'}")
    print("─" * 80)

    for project_dir in sorted(PROJELER_DIR.iterdir()):
        try:
            if not project_dir.is_dir() or project_dir.name.startswith((".", "_")):
                continue
        except (PermissionError, OSError):
            continue

        env_path = project_dir / ".env"
        name = project_dir.name[:33]

        try:
            if not env_path.exists():
                detected = analyze_project(str(project_dir))
                if detected:
                    print(f"{name:<35} {'❌ Bağlantı yok':<20} {len(detected)} servis tespit edildi")
                else:
                    print(f"{name:<35} {'➖ Gerek yok':<20} Token kullanmıyor")
            elif env_path.is_symlink():
                target = env_path.resolve()
                if target == MASTER_ENV.resolve():
                    print(f"{name:<35} {'🔗 Symlink':<20} master.env → otomatik güncel")
                else:
                    print(f"{name:<35} {'🔗 Symlink':<20} → {target.name}")
            else:
                content = env_path.read_text()
                var_count = sum(1 for l in content.splitlines() if l.strip() and not l.strip().startswith("#") and "=" in l)
                if "sifre-yonetici" in content:
                    print(f"{name:<35} {'📄 Yönetilen':<20} {var_count} token")
                else:
                    print(f"{name:<35} {'📄 Manuel':<20} {var_count} token (yönetilmiyor)")
        except (PermissionError, OSError) as e:
            print(f"{name:<35} {'⚠️  Erişim yok':<20} {e}")


# ─── CLI ──────────────────────────────────────────────────────────────────────
def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    command = sys.argv[1].lower()

    if command == "analyze":
        if len(sys.argv) < 3:
            print("Kullanım: env_manager.py analyze <proje_yolu>")
            sys.exit(1)
        detected = analyze_project(sys.argv[2])
        if detected:
            print(f"🔍 {len(detected)} servis tespit edildi:\n")
            for svc, info in detected.items():
                print(f"   📦 {svc}")
                print(f"      Değişkenler: {', '.join(info['env_vars'])}")
                print(f"      Tespit: {info['detected_in']}")
        else:
            print("✅ Token kullanan servis tespit edilmedi")

    elif command == "generate":
        if len(sys.argv) < 3:
            print("Kullanım: env_manager.py generate <proje_yolu> [--services svc1,svc2]")
            sys.exit(1)
        services = None
        if "--services" in sys.argv:
            idx = sys.argv.index("--services")
            if idx + 1 < len(sys.argv):
                services = sys.argv[idx + 1].split(",")
        generate_env(sys.argv[2], services)

    elif command == "link":
        if len(sys.argv) < 3:
            print("Kullanım: env_manager.py link <proje_yolu>")
            sys.exit(1)
        link_env(sys.argv[2])

    elif command == "update":
        if len(sys.argv) < 4:
            print("Kullanım: env_manager.py update <KEY> <VALUE>")
            sys.exit(1)
        update_key(sys.argv[2], sys.argv[3])

    elif command == "refresh-all":
        refresh_all()

    elif command == "scan":
        scan_hardcoded()

    elif command == "verify":
        if len(sys.argv) < 3:
            print("Kullanım: env_manager.py verify <proje_yolu>")
            sys.exit(1)
        verify_project(sys.argv[2])

    elif command == "status":
        show_status()

    else:
        print(f"❌ Bilinmeyen komut: {command}")
        print(__doc__)
        sys.exit(1)


if __name__ == "__main__":
    main()
