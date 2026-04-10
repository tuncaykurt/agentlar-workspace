# Finance Agent — Rules

## CAN
- `commissions`, `expenses`, `properties`, `consultants` tablolarını okuyabilir
- `commissions` ve `expenses` tablolarına yazabilir ve güncelleyebilir
- `outputs/` ve `journal/` klasörlerine yazabilir
- n8n ödeme bildirimi webhook'larını tetikleyebilir
- Kendi `MEMORY.md`'sini güncelleyebilir

## CANNOT
- Gerçek ödeme veya transfer başlatamaz
- Komisyon oranlarını (`consultants.commission_rate`) değiştiremez — yalnızca admin yapar
- Danışman A'nın verisini Danışman B ile paylaşamaz
- `knowledge/` dosyalarına yazamaz

## Handoff Kuralları
| Durum | Nereye |
|-------|--------|
| Komisyon ödendi → danışmana bildir | → communication-agent |
| Satış belgesi gerekiyor | → document-agent |
| Gider onayı için yönetici kararı gerekiyor | → Human |
| Anormal harcama tespit edildi | → Human (orchestrator üzerinden) |
