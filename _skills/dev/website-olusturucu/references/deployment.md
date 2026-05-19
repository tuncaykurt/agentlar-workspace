# Deployment Protocol

Once the HTML file is generated and approved by the user, the final step in the skill is to seamlessly deploy it. Since the output is a static HTML file, **Netlify** via GitHub is the best flow. Antigravity has a Netlify MCP server integrated, so the entire deployment process is **fully automated** — no manual steps required.

## 1. GitHub Repository Creation (Automated)
When the user asks to publish or deploy the website:
1. **Create Repository:** Use your GitHub MCP tools (`mcp_github-mcp-server_create_repository`) to create a new public repository for the project. Name it based on the brand (e.g., `aura-timepieces-web`).
2. **Push Code:** Push the `index.html` file (and any required assets, though usually we rely on CDNs) to the repository using `mcp_github-mcp-server_create_or_update_file` (or push_files). The path should be `index.html` at the root.

## 2. Netlify Deployment (Automated via MCP)

Antigravity has built-in Netlify MCP tools. Use them to deploy **without any manual steps**:

1. **Create a new Netlify project** using `mcp_netlify_netlify-project-services-updater` → `create-new-project`
2. **Deploy the site** using `mcp_netlify_netlify-deploy-services-updater` → `deploy-site` with the project directory
3. The site will be live on a Netlify URL automatically

> ✅ **Netlify deploy tamamen otomatiktir — kullanıcıdan hiçbir şey istemeye gerek yok.**

### Alternatif: Drag & Drop (Kullanıcı isterse)
Eğer MCP ile sorun yaşanırsa, kullanıcıya şu yönerge verilir:

> "✅ **Web siteniz GitHub'a yüklendi!**
>
> Netlify ile 10 saniye içinde canlıya almak için:
> 1. [Netlify Drop](https://app.netlify.com/drop) adresine gidin.
> 2. Proje klasörünü sürükleyip bırakın.
>
> Siteniz yayında olacak ve size bir bağlantı verilecektir. Kendi özel alan adınızı (domain) oradan bağlayabilirsiniz."

## Notes
- Netlify MCP aracılığıyla deploy yapılırken build komutu gerekmez — statik dosya doğrudan yayınlanır.
- GitHub repository public olmalıdır ki Netlify kolayca erişebilsin.
- `index.html` dosyasının repository kökünde olması gerekir.
- **Vercel ve Cloudflare Pages artık kullanılmamaktadır** — tüm statik site deploy'ları Netlify üzerinden yapılır.
