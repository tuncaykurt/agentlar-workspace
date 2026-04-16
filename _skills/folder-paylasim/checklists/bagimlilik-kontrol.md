# 📎 Bağımlılık Kontrol Listesi

Bu dosya, bir projeyi veya skill'i paylaşıma hazırlarken dış bağımlılıkların nasıl tespit edileceğini ve çözüleceğini tanımlar.

---

## 1. Python Kod Bağımlılıkları

### Proje Dışı Import'lar

Aşağıdaki desenleri proje içindeki `.py` dosyalarında ara:

```python
# Parent directory erişimi
sys.path.append("..")
sys.path.append("../")
sys.path.insert(0, "..")

# Göreceli import (proje dışına çıkan)
from ..klasor import modul
from ...klasor import modul

# Açık dosya erişimi (proje dışı)
open("../dosya.py")
open("../../dosya.py")
Path("../dosya")

# Dinamik import
importlib.import_module("...")
__import__("...")
```

### Çözüm Adımları

1. Dış referansı tespit et
2. Referans edilen dosyayı bul
3. Dosyayı proje içine `utils/` alt klasörüne kopyala
4. Import satırını güncelle:
   ```python
   # ESKİ:
   sys.path.append("../OrtakKlasor")
   from utils import helper_func
   
   # YENİ:
   from utils.helper_func import helper_func
   ```
5. Kopyalanan dosyanın KENDİ bağımlılıklarını da kontrol et (zincir bağımlılık)

---

## 2. Skill Bağımlılıkları

Proje dosyalarında şu desenleri ara:

```
_skills/[skill-adi]
skill: [skill-adi]
Gerekli Skill: ...
SKILL.md
```

### Taranacak dosyalar:
- `README.md`
- `Instruction.md`
- `_agents/workflows/*.md`
- Proje root'undaki her `.md` dosyası

### Çözüm:
- Tespit edilen skill'leri listele
- Kullanıcıya sor: Skill'ler de dahil edilsin mi?
  - Evet → `bagli_skilller/` klasörüne kopyala
  - Hayır → `KURULUM_REHBERI.md` içinde belirt

---

## 3. Knowledge Bağımlılıkları

Hemen hemen her skill ve proje `_knowledge/` dosyalarına referans verir. Bu bağımlılıklar:

| Referans | Ne Yapılır? |
|----------|-------------|
| `_knowledge/api-anahtarlari.md` | Alıcının kendi dosyası olacak — referansı koru |
| `_knowledge/profil.md` | Alıcının kendi dosyası olacak — referansı koru |
| `_knowledge/calisma-kurallari.md` | Genel bilgi — referansı koru |

> 💡 **Kural:** `_knowledge/` referansları **asla kırılmamalı**. Bunlar Antigravity'nin standart yapısının parçası. Alıcı kendi `_knowledge/` dosyalarını dolduracak.

---

## 4. Workflow Bağımlılıkları

Bir skill veya projeyi paylaşırken, ilişkili workflow dosyalarını kontrol et:

### Workflow'ları Bulma:
1. `_agents/workflows/` klasöründeki tüm `.md` dosyalarını tara
2. İçlerinde `_skills/[paylaşılan-skill-adı]` referansı olanları tespit et
3. Bu workflow dosyalarını da paylaşıma dahil et

### Çözüm:
- İlişkili workflow'u skill/proje klasörüne `workflow/` alt klasörü olarak ekle
- `GEREKSINIMLER.md` veya `KURULUM_REHBERI.md` içinde workflow'un `_agents/workflows/` altına kopyalanması gerektiğini belirt

---

## 5. requirements.txt Oluşturma

### Otomatik Tespit:
1. Proje içindeki tüm `.py` dosyalarındaki `import` ve `from ... import` ifadelerini topla
2. Python standart kütüphanesi modüllerini filtrele (referans: https://docs.python.org/3/library/)
3. Proje içi modülleri filtrele (aynı klasördeki `.py` dosyaları)
4. Kalan modüller = üçüncü parti paketler

### Sık Karşılaşılan Paketler:

| Import Adı | pip Paketi |
|-----------|-----------|
| `dotenv` / `from dotenv` | `python-dotenv` |
| `apify_client` | `apify-client` |
| `openai` | `openai` |
| `requests` | `requests` |
| `bs4` | `beautifulsoup4` |
| `PIL` | `Pillow` |
| `cv2` | `opencv-python` |
| `yaml` | `pyyaml` |
| `sklearn` | `scikit-learn` |
| `flask` | `Flask` |
| `google.auth` | `google-auth` |
| `google_auth_oauthlib` | `google-auth-oauthlib` |
| `googleapiclient` | `google-api-python-client` |

### Format:
```
paket-adi>=minimum_versiyon
```
Versiyon tespit edilemezse sadece paket adı yazılır.

---

## 6. Kontrol Özeti

Her paylaşım işleminin sonunda şu kontroller yapılmalı:

- [ ] Proje dışı Python import'ları çözüldü mü?
- [ ] Bağımlı skill'ler tespit ve belgelendi mi?
- [ ] `_knowledge/` referansları korundu mu?
- [ ] İlişkili workflow dosyaları dahil edildi mi?
- [ ] `requirements.txt` güncel mi?
- [ ] `.env.example` oluşturuldu mu?
