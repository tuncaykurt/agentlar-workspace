#!/bin/bash
# Railway GraphQL API Wrapper — Tam Otonom Deploy Desteği
# 
# Bu script, Railway üzerindeki TÜM işlemleri API ile yapar.
# Dashboard'a gitmeye ASLA gerek yoktur.
#
# Kullanım: ./railway.sh <komut> [argümanlar]
#
# === PROJE & SERVİS OLUŞTURMA ===
#   ./railway.sh create-project <ad> <aciklama>
#   ./railway.sh create-service <project_id> <servis_adi> <github_repo> [branch]
#   ./railway.sh connect-repo <service_id> <github_repo> [branch]
#   ./railway.sh update-service <service_id> <env_id> <start_command>
#
# === BİLGİ ALMA ===
#   ./railway.sh api-test
#   ./railway.sh projects
#   ./railway.sh project-detail <project_id>
#   ./railway.sh envs <project_id>
#   ./railway.sh vars <project_id> <env_id> <service_id>
#   ./railway.sh deploy-status <project_id> <env_id> <service_id>
#   ./railway.sh logs <deployment_id> [limit]
#
# === İŞLEM ===
#   ./railway.sh set-var <project_id> <env_id> <service_id> <key> <value>
#   ./railway.sh set-vars <project_id> <env_id> <service_id> <json_vars>
#   ./railway.sh redeploy <service_id> <env_id>

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ANTIGRAVITY_ROOT="ANTIGRAVITY_ROOT_BURAYA"

# --- 1. Railway Token'ı bul ---
find_token() {
    # Öncelik 1: Environment variable
    if [ -n "$RAILWAY_TOKEN" ]; then
        return 0
    fi

    # Öncelik 2: railway-token.txt
    local token_file="$SCRIPT_DIR/railway-token.txt"
    if [ -f "$token_file" ]; then
        RAILWAY_TOKEN=$(cat "$token_file" | tr -d '[:space:]')
        if [ -n "$RAILWAY_TOKEN" ] && [ "$RAILWAY_TOKEN" != "HENÜZ_KAYDEDİLMEDİ" ]; then
            export RAILWAY_TOKEN
            return 0
        fi
        RAILWAY_TOKEN=""
    fi

    # Öncelik 3: master.env
    local master_env="$ANTIGRAVITY_ROOT/_knowledge/credentials/master.env"
    if [ -f "$master_env" ]; then
        RAILWAY_TOKEN=$(grep "^RAILWAY_TOKEN=" "$master_env" 2>/dev/null | cut -d'=' -f2 | tr -d '[:space:]"'"'"'')
        if [ -n "$RAILWAY_TOKEN" ]; then
            export RAILWAY_TOKEN
            return 0
        fi
    fi

    echo "❌ Railway Token bulunamadı!" >&2
    return 1
}

# --- 2. GraphQL API çağrı fonksiyonu ---
railway_api() {
    local query="$1"
    curl -s -X POST https://backboard.railway.app/graphql/v2 \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $RAILWAY_TOKEN" \
        -d "{\"query\": \"$query\"}"
}

# JSON formatla
format_json() {
    python3 -m json.tool 2>/dev/null || cat
}

# --- 3. Token'ı bul ---
find_token || exit 1

# --- 4. Komut işleme ---
case "$1" in

    # === PROJE & SERVİS OLUŞTURMA ===

    create-project)
        if [ -z "$2" ]; then
            echo "❌ Kullanım: ./railway.sh create-project <ad> [aciklama]" >&2
            exit 1
        fi
        local_name="$2"
        local_desc="${3:-Antigravity deploy}"
        echo "🚀 Railway projesi oluşturuluyor: $local_name" >&2
        railway_api "mutation { projectCreate(input: { name: \\\"$local_name\\\", description: \\\"$local_desc\\\" }) { id name environments { edges { node { id name } } } } }" | format_json
        ;;

    create-service)
        if [ -z "$4" ]; then
            echo "❌ Kullanım: ./railway.sh create-service <project_id> <servis_adi> <github_repo> [branch]" >&2
            echo "   Örnek: ./railway.sh create-service abc-123 my-bot [GITHUB_KULLANICI]/my-bot main" >&2
            exit 1
        fi
        local_proj="$2"
        local_svc="$3"
        local_repo="$4"
        local_branch="${5:-main}"
        echo "🔗 Servis oluşturuluyor: $local_svc (repo: $local_repo)" >&2
        railway_api "mutation { serviceCreate(input: { projectId: \\\"$local_proj\\\", name: \\\"$local_svc\\\", source: { repo: \\\"$local_repo\\\" }, branch: \\\"$local_branch\\\" }) { id name } }" | format_json
        ;;

    connect-repo)
        if [ -z "$3" ]; then
            echo "❌ Kullanım: ./railway.sh connect-repo <service_id> <github_repo> [branch]" >&2
            echo "   Örnek: ./railway.sh connect-repo abc-123 [GITHUB_KULLANICI]/my-bot main" >&2
            exit 1
        fi
        local_svc_id="$2"
        local_repo="$3"
        local_branch="${4:-main}"
        echo "🔗 Repo bağlanıyor: $local_repo → servis $local_svc_id" >&2
        railway_api "mutation { serviceConnect(id: \\\"$local_svc_id\\\", input: { repo: \\\"$local_repo\\\", branch: \\\"$local_branch\\\" }) { id } }" | format_json
        ;;

    update-service)
        if [ -z "$4" ]; then
            echo "❌ Kullanım: ./railway.sh update-service <service_id> <env_id> <start_command>" >&2
            exit 1
        fi
        local_svc_id="$2"
        local_env_id="$3"
        local_cmd="$4"
        echo "⚙️ Servis ayarları güncelleniyor..." >&2
        railway_api "mutation { serviceInstanceUpdate(serviceId: \\\"$local_svc_id\\\", environmentId: \\\"$local_env_id\\\", input: { startCommand: \\\"$local_cmd\\\", restartPolicyType: ON_FAILURE, restartPolicyMaxRetries: 10 }) }" | format_json
        ;;

    # === BİLGİ ALMA ===

    api-test)
        echo "🔍 Railway API Token testi..."
        railway_api '{ projects { edges { node { id name } } } }' | format_json
        ;;

    projects)
        echo "📋 Railway Projeleri:" >&2
        railway_api '{ projects { edges { node { id name services { edges { node { id name } } } environments { edges { node { id name } } } } } } }' | format_json
        ;;

    project-detail)
        if [ -z "$2" ]; then
            echo "❌ Kullanım: ./railway.sh project-detail <project_id>" >&2
            exit 1
        fi
        railway_api "{ project(id: \\\"$2\\\") { id name environments { edges { node { id name } } } services { edges { node { id name } } } } }" | format_json
        ;;

    envs)
        if [ -z "$2" ]; then
            echo "❌ Kullanım: ./railway.sh envs <project_id>" >&2
            exit 1
        fi
        railway_api "{ project(id: \\\"$2\\\") { environments { edges { node { id name } } } } }" | format_json
        ;;

    vars)
        if [ -z "$4" ]; then
            echo "❌ Kullanım: ./railway.sh vars <project_id> <env_id> <service_id>" >&2
            exit 1
        fi
        railway_api "{ variables(projectId: \\\"$2\\\", environmentId: \\\"$3\\\", serviceId: \\\"$4\\\") }" | format_json
        ;;

    deploy-status)
        if [ -z "$4" ]; then
            echo "❌ Kullanım: ./railway.sh deploy-status <project_id> <env_id> <service_id>" >&2
            exit 1
        fi
        echo "📊 Son deployment'lar:" >&2
        railway_api "{ deployments(first: 5, input: { projectId: \\\"$2\\\", environmentId: \\\"$3\\\", serviceId: \\\"$4\\\" }) { edges { node { id status createdAt } } } }" | format_json
        ;;

    logs)
        if [ -z "$2" ]; then
            echo "❌ Kullanım: ./railway.sh logs <deployment_id> [limit]" >&2
            exit 1
        fi
        local_limit="${3:-50}"
        railway_api "{ deploymentLogs(deploymentId: \\\"$2\\\", limit: $local_limit) { message timestamp severity } }" | format_json
        ;;

    # === İŞLEMLER ===

    set-var)
        if [ -z "$6" ]; then
            echo "❌ Kullanım: ./railway.sh set-var <project_id> <env_id> <service_id> <key> <value>" >&2
            exit 1
        fi
        railway_api "mutation { variableCollectionUpsert(input: { projectId: \\\"$2\\\", environmentId: \\\"$3\\\", serviceId: \\\"$4\\\", variables: { $5: \\\"$6\\\" } }) }" | format_json
        ;;

    redeploy)
        if [ -z "$3" ]; then
            echo "❌ Kullanım: ./railway.sh redeploy <service_id> <env_id>" >&2
            exit 1
        fi
        echo "🚀 Redeploy tetikleniyor..." >&2
        railway_api "mutation { serviceInstanceRedeploy(serviceId: \\\"$2\\\", environmentId: \\\"$3\\\") }" | format_json
        ;;

    # === YARDIM ===

    help|--help|-h|"")
        echo "🚂 Railway GraphQL API Wrapper — Tam Otonom"
        echo ""
        echo "🆕 OLUŞTURMA:"
        echo "  create-project <ad> [aciklama]                    Yeni proje oluştur"
        echo "  create-service <proj_id> <ad> <repo> [branch]    GitHub'dan servis oluştur"
        echo "  connect-repo <svc_id> <repo> [branch]            Mevcut servise repo bağla"
        echo "  update-service <svc_id> <env_id> <start_cmd>     Servis ayarları güncelle"
        echo ""
        echo "📋 BİLGİ:"
        echo "  api-test                                          Token doğrulama"
        echo "  projects                                          Tüm projeleri listele"
        echo "  project-detail <proj_id>                          Proje detay"
        echo "  envs <proj_id>                                    Environment'lar"
        echo "  vars <proj_id> <env_id> <svc_id>                 Env variables"
        echo "  deploy-status <proj_id> <env_id> <svc_id>        Deploy durumu"
        echo "  logs <deploy_id> [limit]                          Deploy logları"
        echo ""
        echo "⚡ İŞLEMLER:"
        echo "  set-var <proj_id> <env_id> <svc_id> KEY VALUE    Env variable ekle"
        echo "  redeploy <svc_id> <env_id>                        Redeploy tetikle"
        ;;

    *)
        echo "❌ Bilinmeyen komut: $1" >&2
        echo "💡 ./railway.sh help" >&2
        exit 1
        ;;
esac
