# Graph Report - projeler\Kripto_Bot_Platform\backend\api\routes  (2026-05-26)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 380 nodes · 633 edges · 21 communities (20 shown, 1 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 2 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `5747a494`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]

## God Nodes (most connected - your core abstractions)
1. `int` - 23 edges
2. `get_chart_data()` - 23 edges
3. `float` - 15 edges
4. `_ExClient` - 14 edges
5. `Any` - 13 edges
6. `str` - 13 edges
7. `str` - 13 edges
8. `AsyncSession` - 11 edges
9. `str` - 11 edges
10. `int` - 11 edges

## Surprising Connections (you probably didn't know these)
- `_volume_profile()` --calls--> `Any`  [INFERRED]
  chart.py → analytics.py
- `tradingview_webhook()` --calls--> `Any`  [INFERRED]
  signals.py → analytics.py
- `get_filters()` --references--> `int`  [EXTRACTED]
  bots.py → analytics.py
- `get_filters()` --references--> `AsyncSession`  [EXTRACTED]
  bots.py → analytics.py
- `get_filters()` --references--> `str`  [EXTRACTED]
  bots.py → analytics.py

## Communities (21 total, 1 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.06
Nodes (48): int, str, Her akıllı filtre için performans metrikleri.     Kaynak: action="analyzed" olan, bot_performance(), bot_status(), BotCreate, create_bot(), debug_bot() (+40 more)

### Community 1 - "Community 1"
Cohesion: 0.08
Nodes (37): Request, create_webhook_profile(), cryptopanic_webhook(), CustomSignal, delete_webhook_profile(), get_custom_signal(), get_signal_history(), list_webhook_profiles() (+29 more)

### Community 2 - "Community 2"
Cohesion: 0.10
Nodes (30): str, BaseModel, str, _build_project_context(), chat(), ChatMessage, ChatRequest, get_models() (+22 more)

### Community 3 - "Community 3"
Cohesion: 0.16
Nodes (32): float, int, str, _atr(), _bollinger(), _cci(), _ema(), _fetch_ohlcv_fallback() (+24 more)

### Community 4 - "Community 4"
Cohesion: 0.14
Nodes (24): float, int, str, _binance_klines(), _binance_ticker(), _bitget_v2_ticker(), _ema_series(), _find_fvg() (+16 more)

### Community 5 - "Community 5"
Cohesion: 0.16
Nodes (26): AsyncSession, float, int, str, Any, AiPromptUpdate, bulk_reanalyze_signals(), clear_all_signals() (+18 more)

### Community 6 - "Community 6"
Cohesion: 0.13
Nodes (19): int, str, fetch_all(), fetch_historical(), FetchAllRequest, FetchHistoricalRequest, get_ohlcv(), get_stats() (+11 more)

### Community 7 - "Community 7"
Cohesion: 0.17
Nodes (15): int, str, blackout_status(), crypto_news(), list_events(), Ekonomik Takvim API — FinnHub verilerini sunar, Kripto haberleri — CryptoPanic API veya RSS fallback, Belirtilen gün aralığındaki tüm ekonomik olayları döner (+7 more)

### Community 8 - "Community 8"
Cohesion: 0.17
Nodes (15): ai_analyze_bot_trades(), bots_trade_summary(), delete_bot_trades(), get_bot_trades(), list_trades(), Bot İşlem Kayıtları API — Her botun trade geçmişi, Belirli bir botun tüm işlemlerini getir., Belirli bir bota ait tüm işlem kayıtlarını sil. (+7 more)

### Community 9 - "Community 9"
Cohesion: 0.20
Nodes (13): int, str, BacktestRequest, _compute_indicators(), get_signals(), list_strategies(), Backtest API Endpoint'leri ────────────────────────── - Strateji backtesti baş, Geçmiş veri üzerinde strateji simülasyonu çalıştır. (+5 more)

### Community 10 - "Community 10"
Cohesion: 0.14
Nodes (13): copy_sim_to_bot(), get_portfolio(), hft_kill(), hft_live_status(), hft_stop(), Scanner Simülasyon API — Sanal işlem takip, istatistik ve ayar endpoint'leri., Grid botunu durdur.      Body (opsiyonel):     - close_positions: true ise açık, ACİL DURDURMA (Kill Switch).     Tüm emirleri iptal eder, tüm pozisyonları kapat (+5 more)

### Community 11 - "Community 11"
Cohesion: 0.19
Nodes (12): int, str, analyze(), calculate_indicator(), confluence_analysis(), get_indicator_list(), market_context(), Kullanılabilir tüm indikatörleri kategorileriyle listele. (+4 more)

### Community 12 - "Community 12"
Cohesion: 0.18
Nodes (11): clear_simulations(), hft_manual_tick(), Manuel tek tick — HFT Engine çalışmıyorsa bu endpoint ile grid motoru tetiklenir, MEXC WebSocket'ten gelen anlık fiyatları göster (debug)., Simülasyonu manuel tetikle — debug ve test için., Borsadaki gerçek bakiyeyi Redis'e cache'le., Tüm veya belirli statüdeki simülasyonları temizle., sync_exchange_balance() (+3 more)

### Community 13 - "Community 13"
Cohesion: 0.24
Nodes (9): AsyncSession, bool, float, str, get_coin_snapshots(), get_coins_summary(), Coin veri API — zero-fee coinlerin anlık gösterge verileri. CoinCollector arka p, Zero-fee coinlerin özet istatistikleri. (+1 more)

### Community 14 - "Community 14"
Cohesion: 0.20
Nodes (10): deploy_to_bot(), get_sim_settings(), Genel simülasyon istatistikleri — tek DB session, tek round-trip., Simülasyon ayarlarını getir., Simülasyon ayarlarını güncelle. Bot ayarlarını DEĞİŞTİRMEZ — bağımsız çalışır., Simülasyon ayarlarını Smart Scanner botu olarak deploy et., 3 farklı senaryo ile simülasyon performansını karşılaştır.     1. Tüm sinyallere, scenario_analysis() (+2 more)

### Community 15 - "Community 15"
Cohesion: 0.22
Nodes (8): get_freqtrade_balance(), get_freqtrade_status(), get_freqtrade_trades(), Aktif Freqtrade işlemlerini döner., Freqtrade cüzdan bakiyesini döner., Freqtrade konfigürasyonunu yeniler., Freqtrade bot durumunu döner., reload_freqtrade()

### Community 16 - "Community 16"
Cohesion: 0.22
Nodes (9): delete_simulation(), hft_trades(), list_simulations(), Simülasyonları listele. ?status=open|win|loss|expired ile filtrele., Grid bot işlem geçmişi., Simülatörün anlık durumu + MEXC WS bilgisi., Tek bir simülasyonu sil., sim_status() (+1 more)

### Community 17 - "Community 17"
Cohesion: 0.36
Nodes (7): str, HTTPAuthorizationCredentials, AuthRequest, get_current_user(), login(), me(), register()

### Community 18 - "Community 18"
Cohesion: 0.33
Nodes (6): get_hft_settings(), hft_start(), HFT Motoru (Trailing Grid) ayarlarını getir., HFT Motoru ayarlarını (Coin, Spread, Grid) güncelle., Grid botunu başlat. Paper veya Live modda çalışır.      Body:     - mode: "paper, update_hft_settings()

### Community 19 - "Community 19"
Cohesion: 0.50
Nodes (4): _check_ai_log_col(), hft_debug(), HFT Engine ve Grid Live Engine debug bilgisi., bool

## Knowledge Gaps
- **7 isolated node(s):** `int`, `float`, `HTTPAuthorizationCredentials`, `str`, `bool` (+2 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Any` connect `Community 5` to `Community 0`, `Community 1`, `Community 3`?**
  _High betweenness centrality (0.199) - this node is a cross-community bridge._
- **Why does `_volume_profile()` connect `Community 3` to `Community 5`?**
  _High betweenness centrality (0.166) - this node is a cross-community bridge._
- **Why does `get_filters()` connect `Community 0` to `Community 5`?**
  _High betweenness centrality (0.103) - this node is a cross-community bridge._
- **What connects `int`, `Tam AI analizi — tüm veri kaynakları.`, `Sadece piyasa bağlamını döner (AI olmadan).` to the rest of the system?**
  _144 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.06229508196721312 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.08250355618776671 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.09659090909090909 - nodes in this community are weakly interconnected._