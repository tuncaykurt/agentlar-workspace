# Railway GraphQL API — Tam Sorgu ve Mutation Referansı

Bu dosya, Railway üzerinde yapılabilecek **tüm işlemler** için GraphQL sorgularını içerir.
Tüm işlemler API üzerinden yapılır. **Dashboard'a gitmeye ASLA gerek yoktur.**

---

## 🔌 Bağlantı Bilgileri

**Endpoint:** `https://backboard.railway.app/graphql/v2`

**Token:** `_skills/canli-yayina-al/scripts/railway-token.txt` dosyasından okunur.

**Temel cURL şablonu:**
```bash
curl -s -X POST https://backboard.railway.app/graphql/v2 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{"query": "GRAPHQL_QUERY"}'
```

---

## 📋 BİLGİ ALMA SORGULARI (Query)

### 1. Tüm Projeleri Listele
```graphql
{
  projects {
    edges {
      node {
        id
        name
        services { edges { node { id name } } }
        environments { edges { node { id name } } }
      }
    }
  }
}
```

### 2. Tek Proje Detay
```graphql
{
  project(id: "PROJE_ID") {
    id
    name
    environments { edges { node { id name } } }
    services { edges { node { id name } } }
  }
}
```

### 3. Environment Variables Oku
```graphql
{
  variables(
    projectId: "PROJE_ID"
    environmentId: "ENV_ID"
    serviceId: "SERVIS_ID"
  )
}
```

### 4. Son Deployment'ları Kontrol Et
```graphql
{
  deployments(
    first: 5
    input: {
      projectId: "PROJE_ID"
      environmentId: "ENV_ID"
      serviceId: "SERVIS_ID"
    }
  ) {
    edges {
      node { id status createdAt }
    }
  }
}
```

### 5. Deployment Loglarını Oku
```graphql
{
  deploymentLogs(deploymentId: "DEPLOY_ID", limit: 50) {
    message
    timestamp
    severity
  }
}
```

---

## ✏️ OLUŞTURMA & DEĞİŞTİRME MUTATION'LARI

### 6. Yeni Proje Oluştur
```graphql
mutation {
  projectCreate(input: {
    name: "proje-adi"
    description: "Proje açıklaması"
  }) {
    id
    name
    environments {
      edges { node { id name } }
    }
  }
}
```
> **Not:** Proje oluşturulduğunda otomatik olarak bir "production" environment gelir.
> Response'dan `environments.edges[0].node.id` ile Environment ID'yi al.

### 7. GitHub Repo'dan Servis Oluştur (YENİ DEPLOY İÇİN)
```graphql
mutation {
  serviceCreate(input: {
    projectId: "PROJE_ID"
    name: "servis-adi"
    source: { repo: "[GITHUB_KULLANICI]/repo-adi" }
    branch: "main"
  }) {
    id
    name
  }
}
```
> **⚠️ ÖNEMLİ:** Bu mutation Railway'in GitHub App bağlantısı üzerinden çalışır.
> `source.repo` formatı `"owner/repo"` şeklindedir.
> Dashboard'a gidip repo bağlamaya GEREK YOKTUR.
> Servis oluşturulduğunda otomatik olarak ilk deploy başlar.

### 8. Mevcut Servise GitHub Repo Bağla
```graphql
mutation {
  serviceConnect(
    id: "SERVIS_ID"
    input: {
      repo: "[GITHUB_KULLANICI]/repo-adi"
      branch: "main"
    }
  ) {
    id
  }
}
```
> Mevcut bir servisin repo'sunu değiştirmek veya yeni bağlamak için kullanılır.

### 9. Servis Ayarlarını Güncelle (Start Command, Restart Policy)
```graphql
mutation {
  serviceInstanceUpdate(
    serviceId: "SERVIS_ID"
    environmentId: "ENV_ID"
    input: {
      startCommand: "python main.py"
      restartPolicyType: ON_FAILURE
      restartPolicyMaxRetries: 10
    }
  )
}
```

**Kullanılabilir tüm ayar alanları:**
| Alan | Tip | Açıklama |
|------|-----|----------|
| `startCommand` | String | Başlatma komutu |
| `buildCommand` | String | Build komutu |
| `restartPolicyType` | Enum | `ON_FAILURE`, `ALWAYS`, `NEVER` |
| `restartPolicyMaxRetries` | Int | Restart tekrar sayısı |
| `cronSchedule` | String | Cron ifadesi (ör: `"0 */6 * * *"`) |
| `healthcheckPath` | String | Health check URL path'i |
| `region` | String | Deploy region'ı |
| `numReplicas` | Int | Replica sayısı |
| `rootDirectory` | String | Kök dizin (monorepo için) |
| `sleepApplication` | Boolean | Uyku modu |

### 10. Environment Variable Ekle/Güncelle
```graphql
mutation {
  variableCollectionUpsert(input: {
    projectId: "PROJE_ID"
    environmentId: "ENV_ID"
    serviceId: "SERVIS_ID"
    variables: {
      KEY1: "VALUE1"
      KEY2: "VALUE2"
      KEY3: "VALUE3"
    }
  })
}
```

### 11. Redeploy Tetikle
```graphql
mutation {
  serviceInstanceRedeploy(
    serviceId: "SERVIS_ID"
    environmentId: "ENV_ID"
  )
}
```

### 12. Servis Adını/İkonunu Güncelle
```graphql
mutation {
  serviceUpdate(
    id: "SERVIS_ID"
    input: {
      name: "yeni-isim"
      icon: "🚀"
    }
  ) {
    id
    name
  }
}
```

### 13. Servis Sil
```graphql
mutation {
  serviceDelete(id: "SERVIS_ID")
}
```

### 14. Proje Sil
```graphql
mutation {
  projectDelete(id: "PROJE_ID")
}
```

---

## 🔄 TAM DEPLOY AKIŞI (Query + Mutation Sırası)

Yeni bir projeyi sıfırdan deploy etmek için bu sırayı takip et:

```
1. projectCreate      → Proje ID + Environment ID al
2. serviceCreate      → Servis ID al (GitHub repo bağlı)
3. serviceInstanceUpdate → Start command + restart policy ayarla
4. variableCollectionUpsert → Env variables ayarla
5. (Otomatik deploy başlar — serviceCreate repo bağladığında)
6. deployments query  → Deploy durumunu kontrol et
7. deploymentLogs     → Log oku (hata varsa)
```

---

## 💰 Pricing

- **Trial:** $5 kredi (yeni hesaplar)
- **Hobby:** $5/ay + kullanım bazlı
- **Pro:** $20/ay
- Bot'lar ve hafif servisler genellikle aylık $1-3 tutar

---

## 📝 Önemli Notlar

- Railway `railway.json` veya API ile start komutu belirler
- Python → `requirements.txt` gerekli
- Node → `package.json` gerekli
- `.env` dosyası Railway'de KULLANILMAZ — tüm değerler env variable olarak set edilir
- GitHub repo bağlandığında, her push otomatik deploy tetikler
