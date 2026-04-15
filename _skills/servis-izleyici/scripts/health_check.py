#!/usr/bin/env python3
"""
🏥 Antigravity Proje Sağlık Kontrolü — v3 (Self-Healing)
============================================
deploy-registry.md'deki TÜM projeleri okur:
  • Railway servislerinin deployment durumunu + log taramasını yapar
  • Cron/LaunchAgent sağlığını kontrol eder (launchctl + log analizi)
  • Lokal projelerin klasör varlığını doğrular
  • 🩺 --auto-heal ile bilinen hataları otomatik düzeltir

Kullanım:
    python3 health_check.py                          # Hızlı Railway check
    python3 health_check.py --check-up               # 🏥 Genel check-up (hepsi)
    python3 health_check.py --check-up --auto-heal   # 🩺 Tespit + otomatik düzelt
    python3 health_check.py --cron-only              # Sadece cron/LaunchAgent
    python3 health_check.py --dry-run                # E-posta göndermez
    python3 health_check.py --project X              # Tek proje kontrol
"""

import os
import re
import ssl
import sys
import json
import time
import logging
import argparse
import smtplib
import subprocess
import urllib.request
import urllib.error
from datetime import datetime, timezone, timedelta
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from pathlib import Path

# macOS Python framework SSL sertifika sorununun çözümü
def _create_ssl_context():
    """SSL context oluşturur. Sertifika doğrulaması başarısız olursa unverified fallback."""
    ctx = ssl.create_default_context()
    try:
        import urllib.request as _ur
        _ur.urlopen("https://railway.app", timeout=5, context=ctx)
        return ctx
    except Exception:
        ctx = ssl._create_unverified_context()
        return ctx

_ssl_ctx = _create_ssl_context()

# ── Sabitler ──────────────────────────────────────────────
ANTIGRAVITY_ROOT = Path(__file__).resolve().parents[3]  # _skills/servis-izleyici/scripts/ → Antigravity/
MASTER_ENV = ANTIGRAVITY_ROOT / "_knowledge" / "credentials" / "master.env"
DEPLOY_REGISTRY = ANTIGRAVITY_ROOT / "_knowledge" / "deploy-registry.md"
ENV_CACHE = Path("/tmp/antigravity_env.json")
LOG_DIR = Path(__file__).resolve().parent.parent / "logs"
LOG_FILE = LOG_DIR / "health_check.log"
TEMPLATE_DIR = Path(__file__).resolve().parent.parent / "templates"

RAILWAY_GQL_URL = "https://backboard.railway.app/graphql/v2"
ALERT_EMAIL = "EMAIL_ADRESI_BURAYA"

# Alarm verilmeyecek durumlar
HEALTHY_STATUSES = {"SUCCESS", "SLEEPING", "BUILDING", "DEPLOYING", "INITIALIZING", "WAITING"}
TRANSIENT_STATUSES = {"BUILDING", "DEPLOYING", "INITIALIZING", "WAITING", "SLEEPING"}
ALERT_STATUSES = {"FAILED", "CRASHED", "REMOVED"}

# Log tarama pattern'ları
ERROR_PATTERNS = re.compile(
    r"(ERROR|Exception|Traceback|FAILED|CRITICAL|panic|fatal|killed|OOMKilled|segfault)",
    re.IGNORECASE,
)

# Yanlış pozitif (false positive) olarak yakalanan mesajlar — bunlar hata DEĞİL
FALSE_POSITIVE_PATTERNS = re.compile(
    r"("
    r"Score is exceptionally high"
    r"|Accepting this as the final image"
    r"|exceptionally high.*accepting"
    r"|Successfully"
    r"|Critique:.*Excellent"
    r"|Critique:.*CRITICAL"
    r"|Excellent execution"
    r"|Log verisi alınamadı"
    r"|Using Prompt"
    r"|CRITICAL FACE IDENTITY"
    r"|telegram\.error\.Conflict"
    r"|terminated by other getUpdates"
    r"|only one bot instance"
    r"|No error handlers are registered.*logging exception"
    r")",
    re.IGNORECASE,
)

# Servis-izleyicinin kendi çıktılarını tekrar hata olarak algılamasını engelle
# (cascading false positive bug fix v2)
# NOT: Satırın herhangi bir yerinde → varsa veya nested [timestamp] varsa
# bu satır daha önceki bir log taramasının çıktısıdır ve hata sayılmamalı.
SELF_REFERENCE_PATTERN = re.compile(
    r"("
    r"→"                              # Ok işareti — herhangi bir yerde (nested log çıktısı)
    r"|\]\s+→"                         # [timestamp] → formatı
    r"|\]\s+\[\d{4}-\d{2}-\d{2}"       # Nested timestamp: ...] [2026-03-13...
    r"|hata bulundu:"
    r"|hata tespit edildi"
    r"|hata:"
    r"|📋 Log taranıyor"
    r"|⚠️\s+Son 24 saatte"
    r"|📧 Alarm e-postası"
    r"|📧 Self-heal raporu"
    r"|🚨 API Hatası"
    r"|🚨 Sorunlu:"
    r"|🩺 OTOMATİK İYİLEŞTİRME"
    r"|🩺 İYİLEŞTİRME SONUCU"
    r"|❓.*Bilinmeyen hata"
    r"|❌ Düzeltilemedi"
    r"|✅ Düzeltildi"
    r"|📧 Manuel müdahale"
    r"|🚨 (FAILED|CRASHED|REMOVED) \(son deploy"
    r")",
    re.IGNORECASE,
)


# ── Env Yükleme ──────────────────────────────────────────
def load_env_from_file(env_path: Path) -> dict:
    """master.env dosyasından key=value çiftlerini parse eder."""
    env = {}
    try:
        if not env_path.exists():
            return env
        with open(env_path, "r") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                if "=" in line:
                    key, _, value = line.partition("=")
                    env[key.strip()] = value.strip()
    except (PermissionError, OSError):
        pass
    return env


def load_env_from_cache(cache_path: Path) -> dict:
    """JSON cache dosyasından token bilgilerini okur."""
    env = {}
    try:
        if cache_path.exists():
            with open(cache_path, "r") as f:
                data = json.load(f)
                env.update(data)
    except (PermissionError, OSError, json.JSONDecodeError):
        pass
    return env


def load_credentials() -> dict:
    """Token bilgilerini 3 kaynaktan yükler."""
    creds = {}
    creds.update(load_env_from_file(MASTER_ENV))
    creds.update(load_env_from_cache(ENV_CACHE))
    for key in ["RAILWAY_TOKEN", "SMTP_USER", "SMTP_APP_PASSWORD"]:
        val = os.environ.get(key)
        if val:
            creds[key] = val
    return creds


# ── Deploy Registry Parse (v2 — platform-aware) ─────────
def parse_deploy_registry(registry_path: Path) -> list:
    """
    deploy-registry.md dosyasını parse eder.
    v2: Platform, LaunchAgent, LogPath, CronSchedule alanlarını da okur.
    """
    if not registry_path.exists():
        raise FileNotFoundError(f"Deploy registry bulunamadı: {registry_path}")

    content = registry_path.read_text(encoding="utf-8")
    projects = []
    blocks = re.split(r"^### ", content, flags=re.MULTILINE)

    for block in blocks[1:]:
        lines = block.strip().split("\n")
        name = lines[0].strip()

        project = {"name": name, "platform": "unknown"}
        for line in lines[1:]:
            line = line.strip()
            if line.startswith("- **Railway Project ID:**"):
                match = re.search(r"`([^`]+)`", line)
                if match:
                    project["project_id"] = match.group(1)
            elif line.startswith("- **Service ID:**"):
                match = re.search(r"`([^`]+)`", line)
                if match:
                    project["service_id"] = match.group(1)
            elif line.startswith("- **Environment ID:**"):
                match = re.search(r"`([^`]+)`", line)
                if match:
                    project["environment_id"] = match.group(1)
            elif line.startswith("- **GitHub Repo:**"):
                match = re.search(r"`([^`]+)`", line)
                if match:
                    project["github_repo"] = match.group(1)
            elif line.startswith("- **Platform:**"):
                match = re.search(r"`([^`]+)`", line)
                if match:
                    project["platform"] = match.group(1)
            elif line.startswith("- **LaunchAgent:**"):
                match = re.search(r"`([^`]+)`", line)
                if match:
                    project["launch_agent"] = match.group(1)
            elif line.startswith("- **LogPath:**"):
                match = re.search(r"`([^`]+)`", line)
                if match:
                    project["log_path"] = match.group(1)
            elif line.startswith("- **CronSchedule:**"):
                val = line.split(":**", 1)[1].strip() if ":**" in line else ""
                project["cron_schedule"] = val
            elif line.startswith("- **Lokal Klasör:**"):
                match = re.search(r"`([^`]+)`", line)
                if match:
                    project["local_folder"] = match.group(1)
            elif line.startswith("- **Durum:**"):
                project["registry_status"] = line.split(":**")[1].strip()

        if "⛔" not in name and "SİLİNDİ" not in project.get("registry_status", "").upper() and "KALDIRILDI" not in project.get("registry_status", "").upper():
            projects.append(project)

    return projects


# ── Railway GraphQL Sorgusu ──────────────────────────────
def query_railway(token: str, project_id: str, service_id: str, environment_id: str = None) -> dict:
    """Railway GraphQL API ile deployment durumunu sorgular."""
    if not environment_id:
        env_query = """
        query($projectId: String!) {
            project(id: $projectId) {
                environments {
                    edges {
                        node {
                            id
                            name
                        }
                    }
                }
            }
        }
        """
        env_result = _gql_request(token, env_query, {"projectId": project_id})
        if env_result and "data" in env_result:
            edges = env_result["data"]["project"]["environments"]["edges"]
            if edges:
                environment_id = edges[0]["node"]["id"]
            else:
                return {"error": "Environment bulunamadı"}

    query = """
    query($projectId: String!, $serviceId: String!, $environmentId: String!) {
        deployments(
            first: 1,
            input: {
                projectId: $projectId,
                serviceId: $serviceId,
                environmentId: $environmentId
            }
        ) {
            edges {
                node {
                    id
                    status
                    createdAt
                    staticUrl
                }
            }
        }
    }
    """
    variables = {
        "projectId": project_id,
        "serviceId": service_id,
        "environmentId": environment_id,
    }

    result = _gql_request(token, query, variables)
    if not result or "errors" in result:
        error_msg = result.get("errors", [{}])[0].get("message", "Bilinmeyen hata") if result else "API yanıt vermedi"
        return {"error": error_msg}

    edges = result.get("data", {}).get("deployments", {}).get("edges", [])
    if not edges:
        return {"status": "NO_DEPLOYMENTS", "message": "Hiç deployment bulunamadı"}

    node = edges[0]["node"]
    return {
        "status": node.get("status", "UNKNOWN"),
        "deployment_id": node.get("id"),
        "created_at": node.get("createdAt"),
        "url": node.get("staticUrl"),
        "environment_id": environment_id,
    }


def query_railway_deployment_logs(token: str, deployment_id: str, limit: int = 500, hours: int = 24) -> list:
    """
    Railway GraphQL API'den deployment loglarını çeker.
    Son deployment'ın loglarını okur ve error pattern'ları arar.
    
    Returns:
        list: Log entry'ler (dict). Boş liste → API hatası veya log yok.
        Hata durumunda [{"_monitoring_error": "..."}] döner.
    """
    # startDate ile sadece son N saatin loglarını çek (performans)
    start_date = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
    
    query = """
    query($deploymentId: String!, $limit: Int, $startDate: DateTime) {
        deploymentLogs(deploymentId: $deploymentId, limit: $limit, startDate: $startDate) {
            message
            severity
            timestamp
        }
    }
    """
    variables = {"deploymentId": deployment_id, "limit": limit, "startDate": start_date}
    result = _gql_request(token, query, variables)

    if not result or "errors" in result:
        error_msg = "API yanıt vermedi"
        if result and "errors" in result:
            error_msg = result["errors"][0].get("message", "Bilinmeyen GraphQL hatası")
        logging.warning(f"     ⚠️  deploymentLogs sorgusu başarısız: {error_msg}")
        return [{"_monitoring_error": error_msg}]

    logs = result.get("data", {}).get("deploymentLogs", [])
    if not logs:
        return []
    return logs if isinstance(logs, list) else []


def analyze_logs_for_errors(logs: list, hours: int = 24) -> dict:
    """
    Log listesini analiz eder, son N saat içindeki hataları bulur.
    Returns: {"error_count": int, "errors": [str], "warning_count": int, "monitoring_error": str|None}
    """
    # Monitoring hatası kontrolü — log sorgusu başarısız olduysa
    if logs and isinstance(logs[0], dict) and "_monitoring_error" in logs[0]:
        return {
            "error_count": 0,
            "errors": [],
            "warning_count": 0,
            "monitoring_error": logs[0]["_monitoring_error"],
        }

    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
    errors = []
    warnings = []

    for log_entry in logs:
        msg = ""
        severity = ""  # Varsayılan değer — NameError önlemi
        ts = None

        if isinstance(log_entry, dict):
            msg = log_entry.get("message", "")
            severity = log_entry.get("severity", "").upper()
            ts_str = log_entry.get("timestamp", "")
            if ts_str:
                try:
                    ts = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
                except (ValueError, TypeError):
                    ts = None
        elif isinstance(log_entry, str):
            msg = log_entry
        else:
            continue

        # Zaman filtresi (timestamp varsa)
        if ts and ts < cutoff:
            continue

        if ERROR_PATTERNS.search(msg):
            # False positive kontrolü — başarı mesajlarını atla
            if FALSE_POSITIVE_PATTERNS.search(msg):
                continue
            # Severity bazlı kategorize et
            if severity in ("ERROR", "CRITICAL", "FATAL"):
                errors.append(msg.strip()[:200])
            elif "warning" in msg.lower():
                warnings.append(msg.strip()[:200])
            else:
                errors.append(msg.strip()[:200])

    return {
        "error_count": len(errors),
        "errors": errors[-10:],  # Son 10 hatayı göster
        "warning_count": len(warnings),
        "monitoring_error": None,
    }


def _gql_request(token: str, query: str, variables: dict) -> dict:
    """Railway GraphQL API'ye istek gönderir."""
    payload = json.dumps({"query": query, "variables": variables}).encode("utf-8")

    req = urllib.request.Request(
        RAILWAY_GQL_URL,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
            "User-Agent": "Antigravity-HealthCheck/2.0",
            "Accept": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=15, context=_ssl_ctx) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8") if e.fp else ""
        return {"errors": [{"message": f"HTTP {e.code}: {body[:200]}"}]}
    except urllib.error.URLError as e:
        return {"errors": [{"message": f"Bağlantı hatası: {e.reason}"}]}
    except Exception as e:
        return {"errors": [{"message": str(e)}]}


# ── Cron / LaunchAgent Kontrolü ──────────────────────────
def check_launch_agent(label: str) -> dict:
    """
    macOS LaunchAgent'ın durumunu kontrol eder.
    Returns: {"running": bool, "pid": int|None, "exit_code": int|None, "status_text": str}
    """
    result = {
        "running": False,
        "pid": None,
        "exit_code": None,
        "status_text": "Bilinmiyor",
    }

    try:
        proc = subprocess.run(
            ["launchctl", "list", label],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if proc.returncode == 0:
            output = proc.stdout.strip()
            # launchctl list <label> çıktı formatı:
            # {
            #   "LimitLoadToSessionType" = "Aqua";
            #   "Label" = "com.antigravity.servis-izleyici";
            #   "LastExitStatus" = 0;
            #   "PID" = 12345;
            # };
            # Veya basit satır formatı: PID\tStatus\tLabel

            pid_match = re.search(r'"PID"\s*=\s*(\d+)', output)
            exit_match = re.search(r'"LastExitStatus"\s*=\s*(\d+)', output)

            if pid_match:
                result["pid"] = int(pid_match.group(1))
                result["running"] = True

            if exit_match:
                result["exit_code"] = int(exit_match.group(1))

            result["status_text"] = "Aktif" if result["running"] else "Yüklü (beklemede)"
            if result["exit_code"] and result["exit_code"] != 0:
                result["status_text"] = f"Son çıkış kodu: {result['exit_code']} ⚠️"

        else:
            result["status_text"] = "Yüklü değil / bulunamadı"
    except subprocess.TimeoutExpired:
        result["status_text"] = "launchctl yanıt vermedi"
    except FileNotFoundError:
        result["status_text"] = "launchctl bulunamadı (Linux?)"
    except Exception as e:
        result["status_text"] = f"Hata: {str(e)[:100]}"

    return result


def scan_log_file(log_path: str, hours: int = 24) -> dict:
    """
    Lokal bir log dosyasını tarar.
    Son N saat içindeki error/exception satırlarını bulur.
    Returns: {"exists": bool, "error_count": int, "errors": [str], "last_entry": str, "size_kb": float}
    """
    result = {
        "exists": False,
        "error_count": 0,
        "errors": [],
        "last_entry": None,
        "size_kb": 0,
    }

    # Mutlak yola çevir
    if not os.path.isabs(log_path):
        log_path = os.path.join(str(ANTIGRAVITY_ROOT), log_path)

    path = Path(log_path)
    try:
        if not path.exists():
            return result
    except PermissionError:
        result["errors"] = ["Dosya erişim izni yok (macOS kısıtlaması)"]
        return result

    result["exists"] = True
    try:
        result["size_kb"] = round(path.stat().st_size / 1024, 1)
    except (PermissionError, OSError):
        pass

    try:
        # Son 500 satırı oku (performans için)
        lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
        tail_lines = lines[-500:] if len(lines) > 500 else lines

        cutoff = datetime.now() - timedelta(hours=hours)
        errors = []

        for line in tail_lines:
            # Zaman damgası bulmaya çalış
            ts_match = re.match(r"\[?(\d{4}-\d{2}-\d{2}[\sT]\d{2}:\d{2}:\d{2})\]?", line)
            if ts_match:
                try:
                    line_time = datetime.strptime(ts_match.group(1), "%Y-%m-%d %H:%M:%S")
                    if line_time < cutoff:
                        continue
                except ValueError:
                    pass

            if ERROR_PATTERNS.search(line):
                # False positive kontrolü
                if FALSE_POSITIVE_PATTERNS.search(line):
                    continue
                # Servis-izleyicinin kendi log çıktılarını tekrar hata olarak algılama
                # (cascading false positive bug fix)
                if SELF_REFERENCE_PATTERN.search(line):
                    continue
                errors.append(line.strip()[:200])

        result["error_count"] = len(errors)
        result["errors"] = errors[-10:]  # Son 10 hata

        # Son log girişi
        if tail_lines:
            result["last_entry"] = tail_lines[-1].strip()[:150]

    except (PermissionError, OSError) as e:
        result["errors"] = [f"Dosya okunamadı: {str(e)[:100]}"]

    return result


# ── E-posta Gönderimi ────────────────────────────────────
def send_alert_email(smtp_user: str, smtp_password: str, problems: list):
    """Sorunlu servislerin listesini e-posta ile gönderir."""
    if not problems:
        return

    template_path = TEMPLATE_DIR / "alert_email.html"
    if template_path.exists():
        html_template = template_path.read_text(encoding="utf-8")
    else:
        html_template = _default_html_template()

    rows_html = ""
    for p in problems:
        status = p.get('status', 'UNKNOWN')
        status_emoji = "&#128680;" if status in ALERT_STATUSES else "&#9888;&#65039;"

        # Durum badge renkleri
        if status in ALERT_STATUSES:
            badge_bg = "#dc2626"
            badge_color = "#ffffff"
        elif status in TRANSIENT_STATUSES:
            badge_bg = "#f59e0b"
            badge_color = "#78350f"
        else:
            badge_bg = "#22c55e"
            badge_color = "#052e16"

        rows_html += f"""
                <tr>
                    <td width="40%" style="padding: 16px 24px; border-bottom: 1px solid #334155; color: #e2e8f0; font-size: 14px; line-height: 1.4;">
                        {status_emoji} {p['name']}
                    </td>
                    <td width="20%" style="padding: 16px 16px; border-bottom: 1px solid #334155; text-align: center;">
                        <span style="background-color: {badge_bg}; color: {badge_color}; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600; display: inline-block;">
                            {status}
                        </span>
                    </td>
                    <td width="40%" style="padding: 16px 24px; border-bottom: 1px solid #334155; font-size: 13px; color: #94a3b8; line-height: 1.4;">
                        {p.get('detail', '&#8212;')}
                    </td>
                </tr>
        """

    html_body = html_template.replace("{{ROWS}}", rows_html)
    html_body = html_body.replace("{{COUNT}}", str(len(problems)))
    html_body = html_body.replace("{{TIMESTAMP}}", datetime.now().strftime("%Y-%m-%d %H:%M:%S"))

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"🚨 Antigravity Alarm: {len(problems)} serviste sorun tespit edildi"
    msg["From"] = smtp_user
    msg["To"] = ALERT_EMAIL

    plain_text = f"Antigravity Servis Alarmı\n{'='*40}\n"
    for p in problems:
        plain_text += f"\n• {p['name']}: {p.get('status', 'UNKNOWN')} — {p.get('detail', '')}"
    plain_text += f"\n\nKontrol zamanı: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
    plain_text += "\nDashboard: https://railway.app/dashboard"

    msg.attach(MIMEText(plain_text, "plain", "utf-8"))
    msg.attach(MIMEText(html_body, "html", "utf-8"))

    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(smtp_user, smtp_password)
            server.send_message(msg)
        logging.info(f"📧 Alarm e-postası gönderildi → {ALERT_EMAIL}")
    except Exception as e:
        logging.error(f"❌ E-posta gönderilemedi: {e}")


def _default_html_template() -> str:
    """Şablon dosyası yoksa varsayılan HTML."""
    return """
    <html>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f7fafc; padding: 20px;">
        <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
            <div style="background: linear-gradient(135deg, #e53e3e, #c53030); padding: 24px; color: white;">
                <h1 style="margin: 0; font-size: 20px;">🚨 Antigravity Servis Alarmı</h1>
                <p style="margin: 8px 0 0; opacity: 0.9;">{{COUNT}} serviste sorun tespit edildi</p>
            </div>
            <table style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr style="background: #f7fafc;">
                        <th style="padding: 12px; text-align: left; font-size: 13px; color: #718096;">Servis</th>
                        <th style="padding: 12px; text-align: left; font-size: 13px; color: #718096;">Durum</th>
                        <th style="padding: 12px; text-align: left; font-size: 13px; color: #718096;">Detay</th>
                    </tr>
                </thead>
                <tbody>
                    {{ROWS}}
                </tbody>
            </table>
            <div style="padding: 16px; background: #f7fafc; text-align: center; font-size: 13px; color: #a0aec0;">
                <p>Kontrol zamanı: {{TIMESTAMP}}</p>
                <a href="https://railway.app/dashboard" style="color: #4299e1;">Railway Dashboard →</a>
            </div>
        </div>
    </body>
    </html>
    """


# ── Zaman Yardımcısı ────────────────────────────────────
def format_time_ago(iso_time: str) -> str:
    """ISO zaman damgasını 'X saat/gün/dk önce' formatına çevirir."""
    try:
        deploy_time = datetime.fromisoformat(iso_time.replace("Z", "+00:00"))
        delta = datetime.now(timezone.utc) - deploy_time
        hours = int(delta.total_seconds() / 3600)
        if hours < 1:
            return f"{int(delta.total_seconds() / 60)} dk önce"
        elif hours < 24:
            return f"{hours} saat önce"
        else:
            return f"{hours // 24} gün önce"
    except Exception:
        return "—"


# ══════════════════════════════════════════════════════════
# ██  ANA KONTROL FONKSİYONLARI
# ══════════════════════════════════════════════════════════

def check_railway_projects(projects: list, token: str, deep_scan: bool = False) -> list:
    """Railway projelerini kontrol eder. deep_scan=True ise logları da tarar."""
    results = []
    railway_projects = [p for p in projects if p.get("platform") in ("railway", "railway-cron")]

    if not railway_projects:
        logging.info("  ℹ️  Railway projesi bulunamadı")
        return results

    for project in railway_projects:
        time.sleep(1)  # Rate limit
        name = project["name"]
        logging.info(f"  🔍 {name}")

        result_entry = {"name": name, "platform": "railway", "status": "UNKNOWN", "problems": []}

        deploy_result = query_railway(
            token=token,
            project_id=project.get("project_id", ""),
            service_id=project.get("service_id", ""),
            environment_id=project.get("environment_id"),
        )

        if "error" in deploy_result:
            result_entry["status"] = "API_ERROR"
            result_entry["problems"].append(deploy_result["error"])
            logging.error(f"     🚨 API Hatası: {deploy_result['error']}")
        else:
            status = deploy_result.get("status", "UNKNOWN")
            created_at = deploy_result.get("created_at", "")
            time_info = format_time_ago(created_at) if created_at else "—"
            result_entry["status"] = status
            result_entry["time_info"] = time_info

            if status in ALERT_STATUSES:
                result_entry["problems"].append(f"Deployment {status} (son deploy: {time_info})")
                logging.error(f"     🚨 {status} (son deploy: {time_info})")
            elif status in TRANSIENT_STATUSES:
                logging.info(f"     ⏳ {status} (geçici durum, {time_info})")
            else:
                logging.info(f"     ✅ {status} (son deploy: {time_info})")

            # Deep scan: son deployment loglarını tara
            if deep_scan and deploy_result.get("deployment_id"):
                logging.info(f"     📋 Log taranıyor...")
                logs = query_railway_deployment_logs(token, deploy_result["deployment_id"])
                if logs:
                    log_analysis = analyze_logs_for_errors(logs, hours=24)
                    result_entry["log_analysis"] = log_analysis
                    
                    # Monitoring hatası kontrolü
                    if log_analysis.get("monitoring_error"):
                        logging.warning(f"     ⚠️  Log sorgusu başarısız: {log_analysis['monitoring_error']}")
                        result_entry["problems"].append(
                            f"MONITORING_FAILURE: Log sorgusu başarısız — {log_analysis['monitoring_error']}"
                        )
                    elif log_analysis["error_count"] > 0:
                        logging.warning(f"     ⚠️  Son 24 saatte {log_analysis['error_count']} hata bulundu:")
                        for err in log_analysis["errors"][:3]:
                            logging.warning(f"        → {err[:120]}")
                        error_texts = "\n".join(log_analysis["errors"])
                        result_entry["problems"].append(
                            f"Son 24 saatte {log_analysis['error_count']} hata tespit edildi\n{error_texts}"
                        )
                    else:
                        logging.info(f"     ✅ Son 24 saatte hata yok")
                else:
                    logging.info(f"     ℹ️  Log verisi yok (deployment henüz log üretmemiş)")

        results.append(result_entry)
    return results


def check_cron_projects(projects: list) -> list:
    """Cron/LaunchAgent projelerini kontrol eder."""
    results = []
    cron_projects = [p for p in projects if p.get("platform") == "cron-local"]

    if not cron_projects:
        logging.info("  ℹ️  Cron projesi bulunamadı")
        return results

    for project in cron_projects:
        name = project["name"]
        logging.info(f"  🔍 {name}")

        result_entry = {
            "name": name,
            "platform": "cron-local",
            "status": "UNKNOWN",
            "problems": [],
            "cron_schedule": project.get("cron_schedule", "—"),
        }

        # 1. LaunchAgent durumunu kontrol et
        la_label = project.get("launch_agent")
        if la_label:
            la_status = check_launch_agent(la_label)
            result_entry["launch_agent_status"] = la_status

            if "bulunamadı" in la_status["status_text"].lower() or "yüklü değil" in la_status["status_text"].lower():
                result_entry["status"] = "NOT_LOADED"
                result_entry["problems"].append(f"LaunchAgent yüklü değil: {la_label}")
                logging.warning(f"     ⚠️  LaunchAgent yüklü değil: {la_label}")
            elif la_status.get("exit_code") and la_status["exit_code"] != 0:
                result_entry["status"] = "EXIT_ERROR"
                result_entry["problems"].append(f"Son çıkış kodu: {la_status['exit_code']}")
                logging.warning(f"     ⚠️  Çıkış kodu {la_status['exit_code']}")
            else:
                result_entry["status"] = "OK"
                logging.info(f"     ✅ LaunchAgent: {la_status['status_text']}")
        else:
            result_entry["status"] = "NO_AGENT"
            logging.info(f"     ℹ️  LaunchAgent tanımlanmamış (manuel çalıştırma)")

        # 2. Log dosyasını tara
        log_path = project.get("log_path")
        if log_path:
            log_scan = scan_log_file(log_path, hours=24)
            result_entry["log_scan"] = log_scan

            if not log_scan["exists"]:
                logging.info(f"     ℹ️  Log dosyası henüz oluşmamış: {log_path}")
            elif log_scan["error_count"] > 0:
                logging.warning(f"     ⚠️  Son 24 saatte {log_scan['error_count']} hata:")
                for err in log_scan["errors"][:3]:
                    logging.warning(f"        → {err[:120]}")
                error_texts = "\n".join(log_scan["errors"][:3])
                result_entry["problems"].append(
                    f"Log dosyasında {log_scan['error_count']} hata:\n{error_texts}"
                )
            else:
                logging.info(f"     ✅ Log temiz ({log_scan['size_kb']} KB)")

        # 3. Proje klasörü var mı?
        local_folder = project.get("local_folder")
        if local_folder:
            full_path = ANTIGRAVITY_ROOT / local_folder
            if not full_path.exists():
                result_entry["problems"].append(f"Klasör bulunamadı: {local_folder}")
                logging.warning(f"     ⚠️  Klasör yok: {local_folder}")

        results.append(result_entry)
    return results


def check_local_projects(projects: list) -> list:
    """Sadece lokal projelerin klasör varlığını kontrol eder."""
    results = []
    # deploy-registry.md'deki tablodaki local-only projeleri yakala
    # Bunlar ### blokları değil, tablo formatında

    for project in projects:
        if project.get("platform") not in ("local-only",):
            continue

        name = project["name"]
        result_entry = {"name": name, "platform": "local-only", "status": "OK", "problems": []}

        local_folder = project.get("local_folder")
        if local_folder:
            full_path = ANTIGRAVITY_ROOT / local_folder
            if full_path.exists():
                logging.info(f"  📁 {name}: ✅ Klasör mevcut")
            else:
                result_entry["status"] = "MISSING"
                result_entry["problems"].append(f"Klasör bulunamadı: {local_folder}")
                logging.warning(f"  📁 {name}: ⚠️ Klasör yok — {local_folder}")
        else:
            logging.info(f"  📁 {name}: ℹ️ Klasör yolu tanımlanmamış")

        results.append(result_entry)
    return results


def check_stale_launch_agents() -> list:
    """
    ~/Library/LaunchAgents/ içinde antigravity/[isim] ile ilgili
    ama geçersiz yola işaret eden plist dosyalarını bulur.
    """
    issues = []
    la_dir = Path.home() / "Library" / "LaunchAgents"
    try:
        if not la_dir.exists():
            return issues

        for plist in la_dir.glob("com.antigravity.*.plist"):
            _check_plist(plist, issues)
        for plist in la_dir.glob("com.[isim].*.plist"):
            _check_plist(plist, issues)
    except PermissionError:
        logging.info("  ℹ️  LaunchAgents klasörüne erişim izni yok (sandbox kısıtlaması)")
        return issues

    return issues


def _check_plist(plist_path: Path, issues: list):
    """Tek bir plist dosyasını kontrol et, script yolu geçerli mi?"""
    try:
        content = plist_path.read_text(encoding="utf-8", errors="replace")
        # ProgramArguments içindeki script yolunu bul
        strings = re.findall(r"<string>([^<]+)</string>", content)
        for s in strings:
            if s.endswith(".py") and not Path(s).exists():
                issues.append({
                    "plist": plist_path.name,
                    "missing_path": s,
                    "detail": f"Script bulunamadı: {s}",
                })
    except Exception:
        pass


# ── Ana Kontrol Fonksiyonu ───────────────────────────────
def run_health_check(dry_run: bool = False, target_project: str = None,
                     check_up: bool = False, cron_only: bool = False,
                     auto_heal: bool = False):
    """
    Ana kontrol fonksiyonu.
    - Normal mod: Sadece Railway deployment status
    - check_up mod: Railway + log tarama + cron + lokal + stale agent tespiti
    - cron_only mod: Sadece cron/LaunchAgent kontrolü
    """
    # Logging ayarla
    handlers = [logging.StreamHandler(sys.stdout)]

    log_file_path = LOG_FILE
    try:
        LOG_DIR.mkdir(parents=True, exist_ok=True)
        handlers.append(logging.FileHandler(log_file_path, encoding="utf-8"))
    except (PermissionError, OSError):
        fallback_log = Path("/tmp/antigravity_health_check.log")
        try:
            handlers.append(logging.FileHandler(fallback_log, encoding="utf-8"))
            log_file_path = fallback_log
        except Exception:
            pass

    logging.basicConfig(
        level=logging.INFO,
        format="[%(asctime)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        handlers=handlers,
    )

    mode_label = "🏥 GENEL CHECK-UP" if check_up else ("⏰ CRON KONTROLÜ" if cron_only else "🚂 RAILWAY KONTROLÜ")
    logging.info("=" * 55)
    logging.info(f"{mode_label} BAŞLADI")
    logging.info("=" * 55)

    # 1. Credentials yükle
    env = load_credentials()
    railway_token = env.get("RAILWAY_TOKEN")
    smtp_user = env.get("SMTP_USER")
    smtp_password = env.get("SMTP_APP_PASSWORD")

    if not cron_only and not railway_token:
        logging.error("❌ RAILWAY_TOKEN bulunamadı!")
        sys.exit(1)

    if not smtp_user or not smtp_password:
        logging.warning("⚠️ SMTP bilgileri eksik — alarm e-postaları gönderilemeyecek.")

    # 2. Projeleri oku
    registry_path = Path(env.get("DEPLOY_REGISTRY", str(DEPLOY_REGISTRY)))
    try:
        projects = parse_deploy_registry(registry_path)
    except (FileNotFoundError, PermissionError) as e:
        logging.error(f"❌ {e}")
        sys.exit(1)

    if target_project:
        projects = [p for p in projects if p["name"] == target_project]
        if not projects:
            logging.error(f"❌ '{target_project}' adlı proje deploy-registry.md'de bulunamadı.")
            sys.exit(1)

    # 3. Platform bazlı kontrol
    all_results = []
    all_problems = []

    # 3a. Railway kontrolleri
    if not cron_only:
        logging.info("")
        logging.info("🚂 RAILWAY SERVİSLERİ")
        logging.info("-" * 40)
        railway_results = check_railway_projects(projects, railway_token, deep_scan=check_up)
        all_results.extend(railway_results)
        for r in railway_results:
            if r["problems"]:
                all_problems.extend([{"name": r["name"], "status": r["status"], "detail": p, "platform": r.get("platform", "railway")} for p in r["problems"]])

    # 3b. Cron / LaunchAgent kontrolleri
    if check_up or cron_only:
        logging.info("")
        logging.info("⏰ CRON / LAUNCHAGENT SERVİSLERİ")
        logging.info("-" * 40)
        cron_results = check_cron_projects(projects)
        all_results.extend(cron_results)
        for r in cron_results:
            if r["problems"]:
                all_problems.extend([{"name": r["name"], "status": r["status"], "detail": p, "platform": r.get("platform", "cron-local")} for p in r["problems"]])

    # 3c. Lokal projeler (sadece check-up modunda)
    if check_up:
        logging.info("")
        logging.info("📁 LOKAL PROJELER")
        logging.info("-" * 40)
        local_results = check_local_projects(projects)
        all_results.extend(local_results)
        for r in local_results:
            if r["problems"]:
                all_problems.extend([{"name": r["name"], "status": r["status"], "detail": p, "platform": r.get("platform", "local-only")} for p in r["problems"]])

    # 3d. Eski LaunchAgent tespiti (sadece check-up modunda)
    if check_up:
        logging.info("")
        logging.info("🧹 TEMİZLİK KONTROLÜ")
        logging.info("-" * 40)
        stale_agents = check_stale_launch_agents()
        if stale_agents:
            for sa in stale_agents:
                logging.warning(f"  ⚠️  Eski LaunchAgent: {sa['plist']} → {sa['detail']}")
                all_problems.append({
                    "name": f"LaunchAgent: {sa['plist']}",
                    "status": "STALE",
                    "detail": sa["detail"],
                })
        else:
            logging.info("  ✅ Eski/bozuk LaunchAgent bulunamadı")

    # 4. Self-Healing (auto-heal aktifse)
    heal_results = []
    if all_problems and auto_heal:
        try:
            import sys as _sys
            _scripts_dir = str(Path(__file__).resolve().parent)
            if _scripts_dir not in _sys.path:
                _sys.path.insert(0, _scripts_dir)
            from self_healer import heal_all
            heal_results = heal_all(all_problems, projects, railway_token, dry_run=dry_run)
        except ImportError:
            logging.error("❌ self_healer modülü bulunamadı — otomatik iyileştirme devre dışı")
        except Exception as e:
            logging.error(f"❌ Self-healer hatası: {e}")

    # 5. Sorun varsa e-posta gönder
    problem_count = len(all_problems)
    healthy_count = len(all_results) - len([r for r in all_results if r.get("problems")])

    # Heal sonuçlarına göre sorunları kategorize et
    healed_problems = [h for h in heal_results if h.get("healed") and h.get("action") != "ignore_transient"]
    unhealed_problems = [h for h in heal_results if not h.get("healed") and h.get("action") not in ("ignore_transient", "unknown")]
    remaining_problems = [p for p in all_problems if not any(
        h.get("project") == p.get("name") and h.get("healed")
        for h in heal_results
    )]
    
    meaningful_heals = [h for h in heal_results if h.get("action") != "ignore_transient"]

    if meaningful_heals and not dry_run:
        # Self-heal raporu gönder
        if smtp_user and smtp_password:
            send_healing_report_email(smtp_user, smtp_password, heal_results, all_problems)
    elif remaining_problems and not dry_run:
        # Normal alarm gönder (heal olmadan kalan sorunlar)
        if smtp_user and smtp_password:
            send_alert_email(smtp_user, smtp_password, remaining_problems)
        else:
            logging.warning("⚠️ SMTP bilgileri eksik → e-posta gönderilemedi")
    elif all_problems and not auto_heal and not dry_run:
        # auto-heal kapalı, normal alarm gönder
        if smtp_user and smtp_password:
            send_alert_email(smtp_user, smtp_password, all_problems)
        else:
            logging.warning("⚠️ SMTP bilgileri eksik → e-posta gönderilemedi")
    elif all_problems and dry_run:
        logging.info(f"\n🏃 DRY-RUN modu — {problem_count} sorun tespit edildi, e-posta gönderilmedi")

    # 6. Özet
    logging.info("")
    logging.info("=" * 55)
    logging.info(f"📊 SONUÇ: {len(all_results)} proje kontrol edildi")

    # Platform bazlı sayılar
    platform_counts = {}
    for r in all_results:
        p = r.get("platform", "unknown")
        platform_counts[p] = platform_counts.get(p, 0) + 1

    platform_emoji = {"railway": "🚂", "cron-local": "⏰", "local-only": "📁"}
    for platform, count in platform_counts.items():
        emoji = platform_emoji.get(platform, "❓")
        logging.info(f"  {emoji} {platform}: {count} proje")

    logging.info(f"  ✅ Sağlıklı: {healthy_count}")
    logging.info(f"  🚨 Sorunlu: {problem_count}")
    if heal_results:
        logging.info(f"  🩺 Otomatik düzeltildi: {len(healed_problems)}")
        logging.info(f"  ❌ Düzeltilemedi: {len(unhealed_problems)}")

    if not all_problems:
        logging.info("🎉 Tüm servisler sağlıklı!")
    logging.info("=" * 55)

    return {
        "total": len(all_results),
        "healthy": healthy_count,
        "problems": problem_count,
        "healed": len(healed_problems),
        "details": all_results,
        "heal_results": heal_results,
    }


# ── Self-Heal Rapor E-postası ────────────────────────────
def send_healing_report_email(smtp_user: str, smtp_password: str, heal_results: list, original_problems: list):
    """Self-heal sonuçlarını e-posta ile gönderir."""
    template_path = TEMPLATE_DIR / "healing_report.html"
    if template_path.exists():
        html_template = template_path.read_text(encoding="utf-8")
    else:
        # Fallback basit template
        html_template = "<html><body><h1>Self-Heal Raporu</h1>{{HEALED_SECTION}}{{FAILED_SECTION}}</body></html>"

    healed = [h for h in heal_results if h.get("healed") and h.get("action") != "ignore_transient"]
    failed = [h for h in heal_results if not h.get("healed") and h.get("action") not in ("ignore_transient",)]
    skipped = [h for h in heal_results if h.get("action") == "ignore_transient" or (h.get("healed") and h.get("action") == "ignore_transient")]

    # Healed section HTML
    healed_html = ""
    if healed:
        healed_html = """
            <div style="padding: 0 24px 20px;">
                <h3 style="margin: 0 0 12px; font-size: 14px; color: #22c55e; text-transform: uppercase; letter-spacing: 0.5px;">&#10003; Otomatik D&uuml;zeltildi</h3>
                <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
        """
        for h in healed:
            healed_html += f"""
                    <tr>
                        <td style="padding: 10px 16px; border-bottom: 1px solid #1e3a2f; color: #86efac; font-size: 14px;">
                            &#10003; {h.get('project', '?')}
                        </td>
                        <td style="padding: 10px 16px; border-bottom: 1px solid #1e3a2f; color: #4ade80; font-size: 12px;">
                            {h.get('action', '?')}
                        </td>
                        <td style="padding: 10px 16px; border-bottom: 1px solid #1e3a2f; color: #94a3b8; font-size: 12px;">
                            {h.get('detail', '')[:120]}
                        </td>
                    </tr>
            """
        healed_html += "</table></div>"

    # Failed section HTML
    failed_html = ""
    if failed:
        failed_html = """
            <div style="padding: 0 24px 20px;">
                <h3 style="margin: 0 0 12px; font-size: 14px; color: #ef4444; text-transform: uppercase; letter-spacing: 0.5px;">&#10007; M&uuml;dahale Gerekli</h3>
                <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
        """
        for h in failed:
            failed_html += f"""
                    <tr>
                        <td style="padding: 10px 16px; border-bottom: 1px solid #3b1a1a; color: #fca5a5; font-size: 14px;">
                            &#10007; {h.get('project', '?')}
                        </td>
                        <td style="padding: 10px 16px; border-bottom: 1px solid #3b1a1a; color: #f87171; font-size: 12px;">
                            {h.get('action', '?')}
                        </td>
                        <td style="padding: 10px 16px; border-bottom: 1px solid #3b1a1a; color: #94a3b8; font-size: 12px;">
                            {h.get('detail', '')[:120]}
                        </td>
                    </tr>
            """
        failed_html += "</table></div>"

    # Template değişkenleri
    html_body = html_template
    html_body = html_body.replace("{{TIMESTAMP}}", datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
    html_body = html_body.replace("{{TOTAL_PROBLEMS}}", str(len(original_problems)))
    html_body = html_body.replace("{{HEALED_COUNT}}", str(len(healed)))
    html_body = html_body.replace("{{FAILED_COUNT}}", str(len(failed)))
    html_body = html_body.replace("{{SKIPPED_COUNT}}", str(len(skipped)))
    html_body = html_body.replace("{{HEALED_SECTION}}", healed_html)
    html_body = html_body.replace("{{FAILED_SECTION}}", failed_html)

    # E-posta konusu
    if healed and not failed:
        subject = f"✅ Antigravity: {len(healed)} sorun otomatik düzeltildi"
    elif healed and failed:
        subject = f"🩺 Antigravity: {len(healed)} düzeltildi, {len(failed)} müdahale bekliyor"
    else:
        subject = f"🚨 Antigravity: {len(failed)} sorun düzeltilemedi — müdahale gerekli"

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = smtp_user
    msg["To"] = ALERT_EMAIL

    # Plain text fallback
    plain_text = f"Antigravity Self-Heal Raporu\n{'='*40}\n"
    if healed:
        plain_text += "\n✅ Otomatik Düzeltildi:\n"
        for h in healed:
            plain_text += f"  • {h.get('project')}: {h.get('action')} — {h.get('detail', '')}\n"
    if failed:
        plain_text += "\n❌ Müdahale Gerekli:\n"
        for h in failed:
            plain_text += f"  • {h.get('project')}: {h.get('action')} — {h.get('detail', '')}\n"
    plain_text += f"\nKontrol zamanı: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"

    msg.attach(MIMEText(plain_text, "plain", "utf-8"))
    msg.attach(MIMEText(html_body, "html", "utf-8"))

    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(smtp_user, smtp_password)
            server.send_message(msg)
        logging.info(f"📧 Self-heal raporu gönderildi → {ALERT_EMAIL}")
    except Exception as e:
        logging.error(f"❌ Self-heal raporu gönderilemedi: {e}")


# ── CLI ───────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(
        description="🏥 Antigravity Proje Sağlık Kontrolü v3 (Self-Healing)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Örnekler:
  python3 health_check.py                            # Hızlı Railway check
  python3 health_check.py --check-up                 # 🏥 Genel check-up (hepsi)
  python3 health_check.py --check-up --auto-heal     # 🩺 Tespit + otomatik düzelt
  python3 health_check.py --check-up --auto-heal --dry-run  # Ne yapacağını göster
  python3 health_check.py --cron-only                # Sadece cron kontrolü
  python3 health_check.py --project X                # Tek proje kontrol
        """,
    )
    parser.add_argument("--dry-run", action="store_true", help="E-posta göndermeden sadece kontrol yap")
    parser.add_argument("--project", type=str, help="Belirli bir projeyi kontrol et")
    parser.add_argument("--check-up", action="store_true", help="Genel check-up: Railway + cron + lokal + loglar")
    parser.add_argument("--cron-only", action="store_true", help="Sadece cron/LaunchAgent kontrolü")
    parser.add_argument("--auto-heal", action="store_true", help="Bilinen hataları otomatik düzelt (playbook tabanlı)")

    args = parser.parse_args()
    run_health_check(
        dry_run=args.dry_run,
        target_project=args.project,
        check_up=args.check_up,
        cron_only=args.cron_only,
        auto_heal=args.auto_heal,
    )


if __name__ == "__main__":
    main()
