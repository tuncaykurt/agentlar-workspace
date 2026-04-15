# ═══════════════════════════════════════════════════════════════
# Swc_Email_Responder — Makefile
# ═══════════════════════════════════════════════════════════════

.PHONY: sync-auth install-hooks

## 🔄 Merkezi google_auth.py'yi shared/'e senkronize et
sync-auth:
	@bash scripts/sync_google_auth.sh

## 🪝 Git pre-commit hook'u kur
install-hooks:
	@mkdir -p .git/hooks
	@printf '#!/usr/bin/env bash\nbash "$$(git rev-parse --show-toplevel)/scripts/sync_google_auth.sh"\n' > .git/hooks/pre-commit
	@chmod +x .git/hooks/pre-commit
	@echo "✅ Git pre-commit hook kuruldu"
