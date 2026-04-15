#!/usr/bin/env python3
"""
🩺 Antigravity Self-Healer — v1
=================================
Bilinen hata kalıplarını otomatik düzeltir.
health_check.py tarafından çağrılır.

Güvenlik sınırları:
  • Sadece healing_playbook.json'daki bilinen kalıpları düzeltir
  • Saatte max 2 redeploy, günde max 5
  • Bilinmeyen hatalara dokunmaz — sadece alarm gönderir
  • Asla kod yazmaz/push etmez
"""

import os
import re
import ssl
import json
import time
import logging
import subprocess
import urllib.request
import urllib.error
from datetime import datetime, timezone, timedelta
from pathlib import Path

# ── Sabitler ──────────────────────────────────────────────
SCRIPT_DIR = Path(__file__).resolve().parent
PLAYBOOK_PATH = SCRIPT_DIR / "healing_playbook.json"
HEAL_STATE_PATH = Path("/tmp/antigravity_heal_state.json")
ANTIGRAVITY_ROOT = SCRIPT_DIR.parents[2]  # _skills/servis-izleyici/scripts/ → Antigravity/

RAILWAY_GQL_URL = "https://backboard.railway.app/graphql/v2"

# macOS Python framework SSL fix
def _create_ssl_context():
    ctx = ssl.create_default_context()
    try:
        urllib.request.urlopen("https://railway.app", timeout=5, context=ctx)
        return ctx
    except Exception:
        return ssl._create_unverified_context()

_ssl_ctx = _create_ssl_context()


# ── Playbook Yükleme ─────────────────────────────────────
def load_playbook() -> dict:
    """healing_playbook.json dosyasını yükler."""
    if not PLAYBOOK_PATH.exists():
        logging.error(f"❌ Playbook bulunamadı: {PLAYBOOK_PATH}")
        return {"patterns": [], "rate_limits": {}}

    with open(PLAYBOOK_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


# ── Rate Limiting & State ────────────────────────────────
def load_heal_state() -> dict:
    """Önceki iyileştirme işlemlerinin durumunu yükler (rate limiting için)."""
    if not HEAL_STATE_PATH.exists():
        return {"actions": [], "last_cleanup": datetime.now(timezone.utc).isoformat()}

    try:
        with open(HEAL_STATE_PATH, "r") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return {"actions": [], "last_cleanup": datetime.now(timezone.utc).isoformat()}


def save_heal_state(state: dict):
    """İyileştirme durumunu kaydeder."""
    # Eski kayıtları temizle (24 saatten eski)
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    state["actions"] = [a for a in state.get("actions", []) if a.get("timestamp", "") > cutoff]
    state["last_cleanup"] = datetime.now(timezone.utc).isoformat()

    with open(HEAL_STATE_PATH, "w") as f:
        json.dump(state, f, indent=2, ensure_ascii=False)


def check_rate_limit(state: dict, project_name: str, action: str, rate_limits: dict) -> bool:
    """
    Rate limit kontrolü.
    True = aksiyon alınabilir, False = limit aşılmış.
    """
    now = datetime.now(timezone.utc)
    one_hour_ago = (now - timedelta(hours=1)).isoformat()
    one_day_ago = (now - timedelta(hours=24)).isoformat()

    recent_actions = state.get("actions", [])

    if action == "redeploy":
        # Saatlik limit
        hourly_count = sum(
            1 for a in recent_actions
            if a.get("project") == project_name
            and a.get("action") == "redeploy"
            and a.get("timestamp", "") > one_hour_ago
        )
        max_hourly = rate_limits.get("max_redeploy_per_hour", 2)
        if hourly_count >= max_hourly:
            logging.warning(f"  ⛔ Rate limit: {project_name} için saatlik redeploy limiti ({max_hourly}) aşıldı")
            return False

        # Günlük limit
        daily_count = sum(
            1 for a in recent_actions
            if a.get("project") == project_name
            and a.get("action") == "redeploy"
            and a.get("timestamp", "") > one_day_ago
        )
        max_daily = rate_limits.get("max_redeploy_per_day", 5)
        if daily_count >= max_daily:
            logging.warning(f"  ⛔ Rate limit: {project_name} için günlük redeploy limiti ({max_daily}) aşıldı")
            return False

    elif action in ("reload_agent", "restart_agent"):
        hourly_count = sum(
            1 for a in recent_actions
            if a.get("project") == project_name
            and a.get("action") in ("reload_agent", "restart_agent")
            and a.get("timestamp", "") > one_hour_ago
        )
        max_hourly = rate_limits.get("max_agent_restart_per_hour", 3)
        if hourly_count >= max_hourly:
            logging.warning(f"  ⛔ Rate limit: {project_name} için saatlik agent restart limiti ({max_hourly}) aşıldı")
            return False

    # Cooldown kontrolü (aynı proje + aynı aksiyon için son N dakika)
    cooldown_minutes = rate_limits.get("cooldown_minutes", 30)
    cooldown_cutoff = (now - timedelta(minutes=cooldown_minutes)).isoformat()
    recent_same = [
        a for a in recent_actions
        if a.get("project") == project_name
        and a.get("action") == action
        and a.get("timestamp", "") > cooldown_cutoff
    ]
    if recent_same:
        logging.warning(f"  ⏳ Cooldown: {project_name} için {cooldown_minutes}dk cooldown süresi dolmadı")
        return False

    return True


def record_action(state: dict, project_name: str, action: str, success: bool, detail: str = ""):
    """Yapılan aksiyonu state'e kaydeder."""
    state.setdefault("actions", []).append({
        "project": project_name,
        "action": action,
        "success": success,
        "detail": detail,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })


# ── Hata Sınıflandırma ───────────────────────────────────
def classify_problem(problem: dict, playbook: dict) -> dict | None:
    """
    Bir sorunu playbook'taki kalıplarla eşleştirir.
    Returns: matching pattern dict veya None
    """
    status = problem.get("status", "")
    detail = problem.get("detail", "")
    name = problem.get("name", "")
    platform = problem.get("platform", "")

    for pattern in playbook.get("patterns", []):
        regex = pattern.get("match", "")
        context = pattern.get("context", "")

        try:
            compiled = re.compile(regex, re.IGNORECASE)
        except re.error:
            continue

        # Context'e göre eşleştirme
        if context == "railway_status" and platform == "railway":
            if compiled.search(status):
                return pattern
        elif context == "railway_log" and platform == "railway":
            if compiled.search(detail):
                return pattern
        elif context == "launch_agent" and platform == "cron-local":
            if compiled.search(status) or compiled.search(detail):
                return pattern

    return None


# ── Railway Redeploy ──────────────────────────────────────
def _gql_request(token: str, query: str, variables: dict) -> dict:
    """Railway GraphQL API'ye istek gönderir."""
    payload = json.dumps({"query": query, "variables": variables}).encode("utf-8")

    req = urllib.request.Request(
        RAILWAY_GQL_URL,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
            "User-Agent": "Antigravity-SelfHealer/1.0",
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


def get_latest_deployment(token: str, project_id: str, service_id: str, environment_id: str) -> dict | None:
    """Son deployment bilgilerini çeker."""
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
                }
            }
        }
    }
    """
    result = _gql_request(token, query, {
        "projectId": project_id,
        "serviceId": service_id,
        "environmentId": environment_id,
    })

    if not result or "errors" in result:
        return None

    edges = result.get("data", {}).get("deployments", {}).get("edges", [])
    if not edges:
        return None

    return edges[0]["node"]


def railway_redeploy(token: str, project_info: dict) -> dict:
    """
    Railway servisini yeniden deploy eder.
    serviceInstanceRedeploy mutation kullanır.
    """
    project_id = project_info.get("project_id", "")
    service_id = project_info.get("service_id", "")
    environment_id = project_info.get("environment_id", "")

    if not all([project_id, service_id, environment_id]):
        return {"success": False, "detail": "Eksik proje bilgileri (project_id, service_id veya environment_id)"}

    # Son deployment'ı bul
    latest = get_latest_deployment(token, project_id, service_id, environment_id)
    if not latest:
        return {"success": False, "detail": "Son deployment bulunamadı"}

    # serviceInstanceRedeploy mutation
    mutation = """
    mutation($environmentId: String!, $serviceId: String!) {
        serviceInstanceRedeploy(
            environmentId: $environmentId,
            serviceId: $serviceId
        )
    }
    """
    result = _gql_request(token, mutation, {
        "environmentId": environment_id,
        "serviceId": service_id,
    })

    if result and "errors" not in result:
        return {"success": True, "detail": f"Redeploy başlatıldı (önceki: {latest.get('id', '?')[:12]})"}
    else:
        error_msg = result.get("errors", [{}])[0].get("message", "Bilinmeyen hata") if result else "API yanıt vermedi"
        return {"success": False, "detail": f"Redeploy başarısız: {error_msg}"}


# ── LaunchAgent Yönetimi ──────────────────────────────────
def reload_launch_agent(label: str) -> dict:
    """LaunchAgent'ı yükler (load)."""
    plist_path = Path.home() / "Library" / "LaunchAgents" / f"{label}.plist"

    if not plist_path.exists():
        return {"success": False, "detail": f"Plist dosyası bulunamadı: {plist_path}"}

    try:
        result = subprocess.run(
            ["launchctl", "load", str(plist_path)],
            capture_output=True, text=True, timeout=10,
        )
        if result.returncode == 0:
            return {"success": True, "detail": f"LaunchAgent yüklendi: {label}"}
        else:
            return {"success": False, "detail": f"launchctl load hatası: {result.stderr.strip()[:150]}"}
    except subprocess.TimeoutExpired:
        return {"success": False, "detail": "launchctl yanıt vermedi (timeout)"}
    except Exception as e:
        return {"success": False, "detail": f"Hata: {str(e)[:150]}"}


def restart_launch_agent(label: str) -> dict:
    """LaunchAgent'ı unload + load ile yeniden başlatır."""
    plist_path = Path.home() / "Library" / "LaunchAgents" / f"{label}.plist"

    if not plist_path.exists():
        return {"success": False, "detail": f"Plist dosyası bulunamadı: {plist_path}"}

    try:
        # Unload
        subprocess.run(
            ["launchctl", "unload", str(plist_path)],
            capture_output=True, text=True, timeout=10,
        )
        time.sleep(1)

        # Load
        result = subprocess.run(
            ["launchctl", "load", str(plist_path)],
            capture_output=True, text=True, timeout=10,
        )
        if result.returncode == 0:
            return {"success": True, "detail": f"LaunchAgent yeniden başlatıldı: {label}"}
        else:
            return {"success": False, "detail": f"launchctl load hatası: {result.stderr.strip()[:150]}"}
    except subprocess.TimeoutExpired:
        return {"success": False, "detail": "launchctl yanıt vermedi (timeout)"}
    except Exception as e:
        return {"success": False, "detail": f"Hata: {str(e)[:150]}"}


# ══════════════════════════════════════════════════════════
# ██  ANA İYİLEŞTİRME FONKSİYONU
# ══════════════════════════════════════════════════════════

def attempt_heal(problem: dict, project_info: dict, token: str, dry_run: bool = False) -> dict:
    """
    Tek bir sorunu düzeltmeye çalışır.

    Args:
        problem: {"name": str, "status": str, "detail": str, "platform": str}
        project_info: deploy-registry'den gelen proje bilgileri
        token: Railway API token
        dry_run: True ise sadece ne yapacağını loglar

    Returns:
        {"healed": bool, "action": str, "detail": str, "pattern_id": str}
    """
    playbook = load_playbook()
    state = load_heal_state()
    rate_limits = playbook.get("rate_limits", {})

    result = {
        "healed": False,
        "action": "none",
        "detail": "",
        "pattern_id": None,
        "project": problem.get("name", "unknown"),
    }

    # 1. Sorunu sınıflandır
    matching_pattern = classify_problem(problem, playbook)

    if not matching_pattern:
        result["action"] = "unknown"
        result["detail"] = "Playbook'ta eşleşen kalıp bulunamadı — manuel müdahale gerekli"
        logging.info(f"  ❓ {problem.get('name')}: Bilinmeyen hata — playbook'ta eşleşme yok")
        return result

    pattern_id = matching_pattern.get("id", "?")
    action = matching_pattern.get("action", "alert_only")
    description = matching_pattern.get("description", "")
    result["pattern_id"] = pattern_id
    result["action"] = action

    logging.info(f"  🔍 {problem.get('name')}: Kalıp eşleşti → [{pattern_id}] {description}")

    # 2. ignore_transient → hiçbir şey yapma
    if action == "ignore_transient":
        wait_min = matching_pattern.get("wait_minutes", 30)
        result["healed"] = True  # "iyileştirildi" sayılır çünkü beklenmesi gereken bir durum
        result["detail"] = f"Geçici sorun — {wait_min}dk sonra kendi düzelecek. Aksiyon alınmadı."
        logging.info(f"  ⏳ Geçici sorun, aksiyon alınmadı (bekleme: {wait_min}dk)")
        return result

    # 3. alert_only → sadece uyar
    if action == "alert_only":
        result["healed"] = False
        result["detail"] = f"Bu sorun otomatik düzeltilemez: {description}"
        logging.info(f"  📧 Sadece alarm: {description}")
        return result

    # 4. Rate limit kontrolü
    if not check_rate_limit(state, problem.get("name", ""), action, rate_limits):
        result["healed"] = False
        result["detail"] = "Rate limit aşıldı — sonraki döngüde denenecek"
        return result

    # 5. Dry-run kontrolü
    if dry_run:
        result["healed"] = False
        result["action"] = f"dry_run:{action}"
        result["detail"] = f"DRY-RUN: Şu aksiyon alınacaktı → {action}: {description}"
        logging.info(f"  🏃 DRY-RUN: {action} yapılacaktı → {description}")
        return result

    # 6. Aksiyonu uygula
    if action == "redeploy":
        heal_result = railway_redeploy(token, project_info)
        result["healed"] = heal_result["success"]
        result["detail"] = heal_result["detail"]
        record_action(state, problem.get("name", ""), action, heal_result["success"], heal_result["detail"])
        if heal_result["success"]:
            logging.info(f"  ✅ Redeploy başarılı: {heal_result['detail']}")
        else:
            logging.error(f"  ❌ Redeploy başarısız: {heal_result['detail']}")

    elif action == "reload_agent":
        la_label = project_info.get("launch_agent", "")
        if la_label:
            heal_result = reload_launch_agent(la_label)
            result["healed"] = heal_result["success"]
            result["detail"] = heal_result["detail"]
            record_action(state, problem.get("name", ""), action, heal_result["success"], heal_result["detail"])
            if heal_result["success"]:
                logging.info(f"  ✅ Agent yüklendi: {heal_result['detail']}")
            else:
                logging.error(f"  ❌ Agent yükleme başarısız: {heal_result['detail']}")
        else:
            result["detail"] = "LaunchAgent label bilgisi eksik"
            logging.warning(f"  ⚠️  LaunchAgent label eksik — düzeltilemedi")

    elif action == "restart_agent":
        la_label = project_info.get("launch_agent", "")
        if la_label:
            heal_result = restart_launch_agent(la_label)
            result["healed"] = heal_result["success"]
            result["detail"] = heal_result["detail"]
            record_action(state, problem.get("name", ""), action, heal_result["success"], heal_result["detail"])
            if heal_result["success"]:
                logging.info(f"  ✅ Agent yeniden başlatıldı: {heal_result['detail']}")
            else:
                logging.error(f"  ❌ Agent restart başarısız: {heal_result['detail']}")
        else:
            result["detail"] = "LaunchAgent label bilgisi eksik"
            logging.warning(f"  ⚠️  LaunchAgent label eksik — düzeltilemedi")

    else:
        result["detail"] = f"Bilinmeyen aksiyon: {action}"
        logging.warning(f"  ⚠️  Tanımsız aksiyon: {action}")

    # State kaydet
    save_heal_state(state)
    return result


def heal_all(problems: list, projects: list, token: str, dry_run: bool = False) -> list:
    """
    Tüm sorunları sırayla iyileştirmeye çalışır.

    Args:
        problems: health_check'ten gelen sorun listesi
        projects: deploy-registry'den gelen proje bilgileri
        token: Railway API token
        dry_run: sadece logla, aksiyon alma

    Returns:
        list of heal results
    """
    if not problems:
        logging.info("  ✅ İyileştirilecek sorun yok")
        return []

    # Proje bilgilerini name → info mapping'e çevir
    project_map = {p["name"]: p for p in projects}

    results = []
    healed_count = 0
    failed_count = 0

    logging.info("")
    logging.info("🩺 OTOMATİK İYİLEŞTİRME")
    logging.info("-" * 40)

    for problem in problems:
        name = problem.get("name", "unknown")
        project_info = project_map.get(name, {})

        # Platform bilgisini problem'a ekle (eğer yoksa)
        if "platform" not in problem:
            problem["platform"] = project_info.get("platform", "unknown")

        heal_result = attempt_heal(problem, project_info, token, dry_run)
        results.append(heal_result)

        if heal_result["healed"]:
            healed_count += 1
        elif heal_result["action"] not in ("unknown", "alert_only", "ignore_transient"):
            failed_count += 1

        time.sleep(1)  # Rate limit

    # Özet
    logging.info("")
    logging.info(f"🩺 İYİLEŞTİRME SONUCU:")
    logging.info(f"  ✅ Düzeltildi: {healed_count}")
    logging.info(f"  ❌ Düzeltilemedi: {failed_count}")
    logging.info(f"  📧 Manuel müdahale: {len(results) - healed_count - failed_count}")

    return results
