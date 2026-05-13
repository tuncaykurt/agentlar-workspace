"use client"

import React, { useState, useEffect } from "react"
import { api } from "@/lib/api"
import BotCard from "@/components/BotCard/BotCard"

// ─── Tipler ───────────────────────────────────────────────────────────────────
interface Bot {
  id: number; name: string; symbol: string
  strategy: string; paper_mode: boolean; running: boolean
  exchange?: string; initial_balance?: number
  leverage?: number; risk_per_trade?: number; max_daily_loss?: number
  params?: Record<string, any> | null
}

// ─── Semboller ────────────────────────────────────────────────────────────────
const SYMBOLS = [
  "BTC/USDT:USDT","ETH/USDT:USDT","SOL/USDT:USDT","BNB/USDT:USDT",
  "XRP/USDT:USDT","ADA/USDT:USDT","AVAX/USDT:USDT","DOGE/USDT:USDT",
  "ARB/USDT:USDT","OP/USDT:USDT","LINK/USDT:USDT","SUI/USDT:USDT",
  "INJ/USDT:USDT","TON/USDT:USDT","NEAR/USDT:USDT",
]

// ─── Strateji kataloğu ────────────────────────────────────────────────────────
interface StrategyParam {
  key: string; label: string; type: "number"|"select"|"boolean"
  min?: number; max?: number; step?: number
  options?: { value: string; label: string }[]
  default: number | string | boolean
  description: string
}

interface Strategy {
  id: string
  name: string
  category: "Trend" | "Momentum" | "Mean Reversion" | "Volatility" | "Custom" | "Webhook" | "Grid"
  description: string
  icon: string
  signals: string[]
  params: StrategyParam[]
}

const STRATEGIES: Strategy[] = [
  {
    id: "ema_cross",
    name: "EMA Crossover",
    category: "Trend",
    icon: "📈",
    description: "Hızlı EMA yavaş EMA'yı yukarı kestiğinde AL, aşağı kestiğinde SAT sinyali üretir.",
    signals: ["EMA çaprazlaması", "Trend yönü onayı"],
    params: [
      { key: "fast_ema",   label: "Hızlı EMA",        type: "number",  min: 2,  max: 50,  default: 9,    description: "Kısa vadeli EMA periyodu" },
      { key: "slow_ema",   label: "Yavaş EMA",         type: "number",  min: 5,  max: 200, default: 21,   description: "Uzun vadeli EMA periyodu" },
      { key: "signal_ema", label: "Sinyal EMA",        type: "number",  min: 3,  max: 50,  default: 9,    description: "Onay için üçüncü EMA (0 = kapalı)" },
      { key: "timeframe",  label: "Zaman Dilimi",      type: "select",  default: "1h",     description: "Sinyal üretim zaman dilimi",
        options: [
          { value:"1m",label:"1 Dakika"},{value:"5m",label:"5 Dakika"},{value:"15m",label:"15 Dakika"},
          { value:"1h",label:"1 Saat"},{value:"4h",label:"4 Saat"},{value:"1d",label:"1 Gün"},
        ],
      },
      { key: "min_volume", label: "Min. Hacim Filtresi", type: "number", min: 0, max: 10000000, step: 100000, default: 0, description: "Bu hacmin altındaki sinyalleri filtrele (0 = kapalı)" },
    ],
  },
  {
    id: "rsi_oversold",
    name: "RSI Aşırı Alım/Satım",
    category: "Momentum",
    icon: "⚡",
    description: "RSI aşırı satım bölgesinden çıkınca AL, aşırı alım bölgesinden çıkınca SAT.",
    signals: ["RSI sinyali", "Momentum dönüşü"],
    params: [
      { key: "rsi_period",    label: "RSI Periyodu",      type: "number", min: 2,  max: 100, default: 14,   description: "RSI hesaplama periyodu" },
      { key: "oversold",      label: "Aşırı Satım",       type: "number", min: 5,  max: 40,  default: 30,   description: "Bu seviyenin altı aşırı satım" },
      { key: "overbought",    label: "Aşırı Alım",        type: "number", min: 60, max: 95,  default: 70,   description: "Bu seviyenin üstü aşırı alım" },
      { key: "timeframe",     label: "Zaman Dilimi",      type: "select", default: "1h",     description: "Sinyal zaman dilimi",
        options: [
          {value:"5m",label:"5 Dakika"},{value:"15m",label:"15 Dakika"},
          {value:"1h",label:"1 Saat"},{value:"4h",label:"4 Saat"},
        ],
      },
      { key: "rsi_ema_filter", label: "EMA Trend Filtresi", type: "number", min: 0, max: 500, default: 200, description: "Trendin üstünde long, altında short al (0 = kapalı)" },
    ],
  },
  {
    id: "macd_signal",
    name: "MACD Sinyal",
    category: "Momentum",
    icon: "📊",
    description: "MACD histogram sinyale çaprazlandığında pozisyon açar. Histogram renk değişimini takip eder.",
    signals: ["MACD histogram", "MACD sinyal kesişimi"],
    params: [
      { key: "fast",      label: "Hızlı EMA",       type: "number", min: 2,  max: 50,  default: 12, description: "MACD hızlı EMA periyodu" },
      { key: "slow",      label: "Yavaş EMA",        type: "number", min: 5,  max: 200, default: 26, description: "MACD yavaş EMA periyodu" },
      { key: "signal",    label: "Sinyal",           type: "number", min: 2,  max: 50,  default: 9,  description: "MACD sinyal periyodu" },
      { key: "timeframe", label: "Zaman Dilimi",     type: "select", default: "1h",    description: "Sinyal zaman dilimi",
        options: [
          {value:"15m",label:"15 Dakika"},{value:"1h",label:"1 Saat"},
          {value:"4h",label:"4 Saat"},{value:"1d",label:"1 Gün"},
        ],
      },
      { key: "hist_threshold", label: "Histogram Eşiği", type: "number", min: 0, max: 100, step: 0.1, default: 0, description: "Minimum histogram değeri (gürültüyü filtrele)" },
    ],
  },
  {
    id: "bollinger_bounce",
    name: "Bollinger Sıkışma",
    category: "Mean Reversion",
    icon: "🎯",
    description: "Fiyat alt banda değdiğinde AL, üst banda değdiğinde SAT. Sıkışma sonrası kırılmada momentum işlemi.",
    signals: ["BB alt/üst band dokunuşu", "Band sıkışma tespiti"],
    params: [
      { key: "period",    label: "Periyot",          type: "number", min: 5,   max: 200, default: 20,  description: "Bollinger hesaplama periyodu" },
      { key: "std_dev",   label: "Standart Sapma",   type: "number", min: 0.5, max: 4,   step: 0.5, default: 2, description: "Band genişliği çarpanı" },
      { key: "squeeze",   label: "Sıkışma Filtresi", type: "boolean", default: true,     description: "Band sıkışması sonrası sinyal bekle" },
      { key: "timeframe", label: "Zaman Dilimi",     type: "select",  default: "1h",     description: "Sinyal zaman dilimi",
        options: [
          {value:"5m",label:"5 Dakika"},{value:"15m",label:"15 Dakika"},
          {value:"1h",label:"1 Saat"},{value:"4h",label:"4 Saat"},
        ],
      },
    ],
  },
  {
    id: "ut_bot",
    name: "UT Bot Alert",
    category: "Trend",
    icon: "🤖",
    description: "ATR tabanlı trailing stop ile trend yönünü belirler. Pro Chart'taki UT Bot göstergesiyle aynı algoritma.",
    signals: ["ATR trailing stop kesişimi", "Trend dönüşü"],
    params: [
      { key: "atr_period",  label: "ATR Periyodu",   type: "number", min: 1,   max: 100, default: 10, description: "ATR hesaplama periyodu" },
      { key: "atr_mult",    label: "ATR Çarpanı",    type: "number", min: 0.5, max: 10,  step: 0.5, default: 3, description: "Trailing stop mesafesi (ATR × çarpan)" },
      { key: "timeframe",   label: "Zaman Dilimi",   type: "select", default: "1h",     description: "Sinyal zaman dilimi",
        options: [
          {value:"5m",label:"5 Dakika"},{value:"15m",label:"15 Dakika"},
          {value:"1h",label:"1 Saat"},{value:"4h",label:"4 Saat"},
        ],
      },
      { key: "heikin_ashi", label: "Heikin Ashi",    type: "boolean", default: false,   description: "Heikin Ashi mumları kullan (daha az gürültü)" },
    ],
  },
  {
    id: "supertrend",
    name: "Supertrend",
    category: "Trend",
    icon: "🌊",
    description: "ATR tabanlı Supertrend indikatörü. Trend yönü değişiminde sinyal üretir. Güçlü trend piyasalarında etkili.",
    signals: ["Supertrend yön değişimi", "Renk geçişi (yeşil/kırmızı)"],
    params: [
      { key: "period",    label: "Periyot",        type: "number", min: 2,   max: 100, default: 10, description: "ATR periyodu" },
      { key: "mult",      label: "Çarpan",         type: "number", min: 0.5, max: 10,  step: 0.5, default: 3, description: "ATR çarpanı (band genişliği)" },
      { key: "timeframe", label: "Zaman Dilimi",   type: "select", default: "1h",     description: "Sinyal zaman dilimi",
        options: [
          {value:"15m",label:"15 Dakika"},{value:"1h",label:"1 Saat"},
          {value:"4h",label:"4 Saat"},{value:"1d",label:"1 Gün"},
        ],
      },
    ],
  },
  {
    id: "hedge_bot",
    name: "Hedge Bot (Garantili Kâr)",
    category: "Volatility",
    icon: "🔀",
    description: "Aynı anda LONG + SHORT açar. Kazanan TP'ye vurduğunda kapanır, kaybeden break-even'e dönene kadar tutulur. Net kâr = TP% - SL% (örn: %30 TP, %20 SL → her döngüde +%10).",
    signals: ["Çift yönlü giriş", "Kazanan TP tespiti", "Kaybeden break-even yönetimi"],
    params: [
      { key: "trigger_mode", label: "Tetikleyici", type: "select", default: "on_start", description: "Pozisyonu ne zaman aç",
        options: [
          { value: "on_start",  label: "Bot başlayınca hemen aç" },
          { value: "on_signal", label: "Sinyal gelince aç (TV Webhook)" },
        ],
      },
      { key: "leverage",       label: "Kaldıraç (x)",           type: "number",  min: 1,   max: 500, step: 1,   default: 20,   description: "İşlem kaldıracı — yüksek kaldıraç TP/SL mesafesini küçültür" },
      { key: "long_size_ratio", label: "Long Büyüklük Oranı",   type: "number",  min: 0.1, max: 0.9, step: 0.05, default: 0.5, description: "0.5 = eşit büyüklük, 0.6 = long daha büyük" },
      { key: "long_tp_pct",    label: "Long TP %",               type: "number",  min: 0.1, max: 100, step: 0.5, default: 30,   description: "Long pozisyonu kapat (giriş fiyatından % yükseliş)" },
      { key: "long_sl_pct",    label: "Long SL %",               type: "number",  min: 0.1, max: 100, step: 0.5, default: 20,   description: "Long stop-loss (giriş fiyatından % düşüş)" },
      { key: "short_tp_pct",   label: "Short TP %",              type: "number",  min: 0.1, max: 100, step: 0.5, default: 30,   description: "Short pozisyonu kapat (giriş fiyatından % düşüş)" },
      { key: "short_sl_pct",   label: "Short SL %",              type: "number",  min: 0.1, max: 100, step: 0.5, default: 20,   description: "Short stop-loss (giriş fiyatından % yükseliş)" },
      { key: "losing_side_mode", label: "Kaybeden Taraf Modu",  type: "select",  default: "hold_to_breakeven", description: "Kazanan kapanınca kaybeden ne yapsın",
        options: [
          { value: "hold_to_breakeven", label: "Break-Even'e tut (önerilen)" },
          { value: "trailing",          label: "Trailing Stop uygula" },
          { value: "sl_only",           label: "Sadece SL bekle" },
          { value: "close_both",        label: "İkisini birden kapat" },
        ],
      },
      { key: "breakeven_buffer_pct", label: "Break-Even Buffer %", type: "number", min: 0, max: 5, step: 0.05, default: 0.1, description: "Break-even + bu kadar kâra geçince kapat (0.1 = %0.1 kâr)" },
      { key: "losing_trail_pct",     label: "Trailing Stop %",    type: "number", min: 0.1, max: 20, step: 0.1, default: 1.5, description: "Trailing mod: zirveden bu kadar geri çekilince kapat" },
      { key: "reopen_after_tp",  label: "Döngü Yenile",          type: "boolean", default: true,               description: "Döngü tamamlanınca yeniden aç" },
      { key: "reopen_delay_secs", label: "Yeniden Açma Gecikmesi (sn)", type: "number", min: 0, max: 3600, step: 30, default: 300, description: "Döngü tamamlanınca kaç saniye bekle" },
      { key: "max_cycles",       label: "Maksimum Döngü",         type: "number", min: 0, max: 100, step: 1, default: 0,  description: "0 = sınırsız döngü" },
      { key: "funding_pause_enabled", label: "Funding Koruması",  type: "boolean", default: false,              description: "Yüksek funding rate'de pozisyon açma" },
      { key: "funding_pause_threshold", label: "Funding Eşiği %", type: "number", min: 0.01, max: 1, step: 0.01, default: 0.1, description: "Saatlik funding rate bu değeri geçerse dur" },
      { key: "max_loss_pct",     label: "Maksimum Kayıp %",       type: "number", min: 0, max: 100, step: 1, default: 10, description: "Toplam sermayenin bu %'i kaybedilirse döngü dursun" },
    ],
  },
  {
    id: "dual_hedge",
    name: "Dual Hedge (Çift Yönlü)",
    category: "Volatility",
    icon: "⚖️",
    description: "Hem Long hem Short pozisyonu aynı anda açar. ATR bazlı dinamik TP/SL ve Trailing Stop kullanarak karı maksimize eder, zararı minimize eder.",
    signals: ["Simültane Entry", "Dinamik TP/SL", "Volatility Breakout"],
    params: [
      { key: "atr_period", label: "ATR Periyodu", type: "number", min: 1, max: 100, default: 14, description: "ATR hesaplama periyodu" },
      { key: "atr_mult_tp", label: "ATR TP Çarpanı", type: "number", min: 0.1, max: 20, step: 0.1, default: 4.0, description: "Kâr al hedefi için ATR çarpanı" },
      { key: "atr_mult_sl", label: "ATR SL Çarpanı", type: "number", min: 0.1, max: 10, step: 0.1, default: 1.5, description: "Zarar durdur için ATR çarpanı" },
      { key: "partial_tp_mult", label: "Kısmi Kâr Al ATR Çarpanı", type: "number", min: 0.1, max: 10, step: 0.1, default: 2.0, description: "Pozisyonun yarısının kapatılacağı ATR mesafesi" },
      { key: "move_to_be_pct", label: "BE Taşıma %", type: "number", min: 0.1, max: 5, step: 0.1, default: 0.4, description: "Kâr bu orana ulaştığında SL'i giriş seviyesine taşır" },
      { key: "tighten_other_pct", label: "Diğer Taraf Sıkıştırma %", type: "number", min: 0.1, max: 5, step: 0.1, default: 0.2, description: "Bir taraf kârdayken diğer tarafın SL'ini daraltır" },
      { key: "trail_activation_pct", label: "Takip Aktivasyon %", type: "number", min: 0.1, max: 10, step: 0.1, default: 0.8, description: "Trailing stop'un devreye gireceği kâr yüzdesi" },
      { key: "trail_atr_mult", label: "Takip ATR Çarpanı", type: "number", min: 0.1, max: 5, step: 0.1, default: 1.0, description: "Trailing stop mesafesi (ATR cinsinden)" },
      { key: "timeframe", label: "Zaman Dilimi", type: "select", default: "1h", description: "ATR hesaplama zaman dilimi",
        options: [
          {value:"15m",label:"15 Dakika"},{value:"1h",label:"1 Saat"},
          {value:"4h",label:"4 Saat"},{value:"1d",label:"1 Gün"},
        ],
      },
    ],
  },
  {
    id: "bb_ema_cross",
    name: "BB-EMA Cross",
    category: "Trend",
    icon: "📡",
    description: "Bollinger Band orta çizgisi kesişimi ile EMA çaprazlaması giriş, EMA dokunuşu yeniden giriş, BB bandı çıkışı.",
    signals: ["BB orta çizgi kesişimi", "EMA çaprazlama onayı", "EMA dokunuş yeniden giriş"],
    params: [
      { key: "bb_period",     label: "BB Periyodu",       type: "number",  min: 5,   max: 100, default: 20,     description: "Bollinger Band SMA periyodu" },
      { key: "bb_std",        label: "BB Std Sapma",      type: "number",  min: 0.5, max: 4,   step: 0.5, default: 2.0, description: "Bollinger Band standart sapma katsayısı" },
      { key: "ema_fast",      label: "Hızlı EMA",         type: "number",  min: 2,   max: 50,  default: 5,      description: "Hızlı EMA periyodu" },
      { key: "ema_slow",      label: "Yavaş EMA",         type: "number",  min: 3,   max: 100, default: 13,     description: "Yavaş EMA / destek dokunuş çizgisi" },
      { key: "touch_pct",     label: "Dokunuş Eşiği %",   type: "number",  min: 0,   max: 5,   step: 0.1, default: 0.3, description: "EMA'ya yüzde yaklaşım (0 = sadece wick)" },
      { key: "setup_lookback",label: "Setup Geriye Bakış", type: "number", min: 1,   max: 20,  default: 5,      description: "BB orta kesişimi için geriye bakış barlık" },
      { key: "direction",     label: "Yön",               type: "select",  default: "both",   description: "İşlem yönü filtresi",
        options: [
          { value: "both",  label: "Long ve Short" },
          { value: "long",  label: "Sadece Long" },
          { value: "short", label: "Sadece Short" },
        ],
      },
      { key: "exit_at_bands", label: "BB Bantında Çık",   type: "boolean", default: true,     description: "BB üst/alt bandına ulaşınca pozisyonu kapat" },
    ],
  },
  {
    id: "funding_rate",
    name: "Funding Rate Arbitraj",
    category: "Volatility",
    icon: "💰",
    description: "Funding rate negatifleştiğinde long, pozitifleşip eşiği geçtiğinde short açar. Perp-spot arbitraj fırsatı.",
    signals: ["Funding rate eşiği", "Açık pozisyon yoğunluğu"],
    params: [
      { key: "threshold",  label: "Eşik Değeri (%)", type: "number", min: 0.001, max: 1, step: 0.001, default: 0.01, description: "Bu funding rate oranı aşılınca sinyal" },
      { key: "check_interval", label: "Kontrol Sıklığı (dk)", type: "number", min: 1, max: 60, default: 5, description: "Funding rate kaç dakikada bir kontrol edilsin" },
    ],
  },
  {
    id: "custom_signal",
    name: "Özel JS Sinyali",
    category: "Custom",
    icon: "⚙️",
    description: "Pro Chart'taki Özel Kod Editöründen gelen buy/sell sinyallerini dinler. Kendi algoritmanı yaz, bot otomatik işlem açsın.",
    signals: ["Özel indikatör sinyali", "JS kodu çıktısı (buy/sell)"],
    params: [
      { key: "min_confidence", label: "Min. Güven Skoru", type: "number", min: 0, max: 100, default: 0, description: "Özel sinyal için minimum güven skoru (0 = tümünü işle)" },
      { key: "signal_ttl",     label: "Sinyal Geçerlilik (sn)", type: "number", min: 30, max: 600, default: 300, description: "Bu süreden eski sinyalleri yoksay" },
      { key: "cooldown",       label: "İşlem Arası Bekleme (sn)", type: "number", min: 0, max: 3600, default: 60, description: "Aynı yönde ardışık sinyal engeli" },
    ],
  },
  {
    id: "tradingview_webhook",
    name: "TradingView Alarm",
    category: "Webhook",
    icon: "📡",
    description: "TradingView'de oluşturulan alarm webhook'u gelince otomatik işlem açar. Her strateji/indikatör için çalışır — Pine Script zorunlu değil.",
    signals: ["TradingView alarm tetiklemesi", "Webhook POST isteği"],
    params: [],
  },
  {
    id: "grid_bot",
    name: "Grid Bot",
    category: "Grid",
    icon: "⊞",
    description: "Belirlenen fiyat aralığını eşit grid seviyelerine böler. Her düşüşte alır, her yükselişte satar. Yatay piyasalarda ve düşük volatilitede çok etkilidir.",
    signals: ["Grid alım", "Grid satım", "Kâr realizasyonu"],
    params: [
      { key: "price_range_mode", label: "Fiyat Aralığı Modu", type: "select", default: "pct", description: "Aralığı yüzde olarak mı yoksa mutlak fiyat olarak mı belirle",
        options: [
          { value: "pct",      label: "Yüzde (%) — anlık fiyata göre" },
          { value: "absolute", label: "Mutlak Fiyat — tam değer gir" },
        ],
      },
      { key: "upper_pct",      label: "Üst Sınır %",          type: "number",  min: 0.5,  max: 100,  step: 0.5, default: 5,     description: "Anlık fiyatın kaç % üstünde grid bitiyor (Yüzde modunda)" },
      { key: "lower_pct",      label: "Alt Sınır %",           type: "number",  min: 0.5,  max: 100,  step: 0.5, default: 5,     description: "Anlık fiyatın kaç % altında grid başlıyor (Yüzde modunda)" },
      { key: "upper_price",    label: "Üst Fiyat (USDT)",      type: "number",  min: 0,    max: 9999999, step: 0.01, default: 0, description: "Grid'in biteceği mutlak fiyat (Mutlak modunda, 0 = hesapla)" },
      { key: "lower_price",    label: "Alt Fiyat (USDT)",      type: "number",  min: 0,    max: 9999999, step: 0.01, default: 0, description: "Grid'in başlayacağı mutlak fiyat (Mutlak modunda, 0 = hesapla)" },
      { key: "grid_count",     label: "Grid Sayısı",           type: "number",  min: 2,    max: 300,  step: 1,   default: 20,    description: "Toplam kaç grid seviyesi oluşturulsun (daha fazla = daha sık işlem)" },
      { key: "grid_type",      label: "Grid Tipi",             type: "select",  default: "arithmetic", description: "Aritmetik = eşit fiyat aralığı | Geometrik = eşit yüzde aralığı",
        options: [
          { value: "arithmetic", label: "Aritmetik (Eşit Fiyat Adımı)" },
          { value: "geometric",  label: "Geometrik (Eşit Yüzde Adımı)" },
        ],
      },
      { key: "per_grid_usdt",  label: "Grid Başına USDT",      type: "number",  min: 1,    max: 10000, step: 1,   default: 10,    description: "Her grid seviyesine ayrılan USDT (toplam = grid sayısı × bu değer)" },
      { key: "trading_fee_pct", label: "İşlem Ücreti %",       type: "number",  min: 0,    max: 1,    step: 0.01, default: 0.06, description: "Borsa işlem ücreti (Bitget/MEXC Maker: ~0.02%, Taker: ~0.06%)" },
      { key: "stop_loss_pct",  label: "Stop Loss %",           type: "number",  min: 0,    max: 1000,  step: 0.5,  default: 8,    description: "Fiyat alt sınırın kaç % altına düşerse tüm gridleri kapat (0 = kapalı)" },
      { key: "stop_loss_price", label: "Stop Loss Fiyatı",     type: "number",  min: 0,    max: 9999999, step: 0.01, default: 0, description: "Bu fiyatın altına düşerse gridleri kapat (0 = yüzde modunu kullan)" },
      { key: "take_profit_pct", label: "Take Profit %",        type: "number",  min: 0,    max: 500,  step: 0.5,  default: 0,    description: "Toplam kâr bu yüzdeyi geçerse gridleri kapat (0 = kapalı)" },
      { key: "take_profit_price", label: "Take Profit Fiyatı", type: "number",  min: 0,    max: 9999999, step: 0.01, default: 0, description: "Fiyat bu seviyeye ulaşırsa gridleri kapat (0 = yüzde modunu kullan)" },
    ],
  },
]

// "BTC/USDT:USDT" → "BTCUSDT.P"
function fmtSymbol(s: string) {
  return s.replace("/USDT:USDT", "USDT.P").replace("/", "")
}

// ─── Varsayılan form ──────────────────────────────────────────────────────────
const defaultForm = () => ({
  name: "",
  symbol: "BTC/USDT:USDT",
  strategy: "ema_cross",
  exchange: "mexc",
  paper_mode: true,
  leverage: 10,
  margin_type: "isolated" as "isolated" | "cross",
  risk_mode: "pct" as "pct" | "usdt",   // % veya sabit USDT
  risk_per_trade: 1,      // risk_mode=pct → %, risk_mode=usdt → USDT tutarı
  max_daily_loss: 5,      // %
  initial_balance: 1000,
  tp_pct: 2,              // % take profit
  sl_pct: 1,              // % stop loss
  tp_sl_mode: "manual" as "manual" | "auto",  // manuel veya AI otomatik
  trailing_sl: false,
  order_type: "market" as "market" | "limit",
  max_positions: 1,
  strategy_params: {} as Record<string, number | string | boolean>,
})

type FormState = ReturnType<typeof defaultForm>
type RiskMode = "pct" | "usdt"

// ─── Wizard adımları ──────────────────────────────────────────────────────────
const STEPS = ["Strateji", "Sembol & Zaman", "Risk & Para", "Özet"]

// ─── Yardımcı bileşenler ──────────────────────────────────────────────────────
function Field({ label, description, children }: {
  label: string; description?: string; children: React.ReactNode
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-slate-300">{label}</label>
      {children}
      {description && <p className="text-[11px] text-slate-600">{description}</p>}
    </div>
  )
}

function NumInput({ value, onChange, min, max, step = 1, prefix, suffix }: {
  value: number | string; onChange: (v: number) => void
  min?: number; max?: number; step?: number
  prefix?: string; suffix?: string
}) {
  const [raw, setRaw] = React.useState(String(value))
  React.useEffect(() => { setRaw(String(value)) }, [value])

  const clamp = (n: number) => {
    if (min != null && n < min) return min
    if (max != null && n > max) return max
    return n
  }
  const adjust = (dir: 1 | -1) => {
    const cur = parseFloat(raw) || 0
    const next = clamp(parseFloat((cur + step * dir).toFixed(10)))
    setRaw(String(next))
    onChange(next)
  }

  return (
    <div className="flex items-center bg-slate-900 border border-slate-700 rounded-lg overflow-hidden focus-within:border-blue-500/60 focus-within:ring-1 focus-within:ring-blue-500/20 transition-all">
      {prefix && <span className="px-2.5 text-slate-500 text-xs border-r border-slate-700 py-2 select-none">{prefix}</span>}
      <button
        type="button" tabIndex={-1} onClick={() => adjust(-1)}
        className="px-2.5 py-2 text-slate-500 hover:text-white hover:bg-slate-800 active:bg-slate-700 transition-colors select-none"
      >
        <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
          <path d="M2.5 6h7" />
        </svg>
      </button>
      <input
        type="text" inputMode="decimal" value={raw}
        onChange={e => {
          const v = e.target.value.replace(/[^0-9.\-]/g, "")
          setRaw(v)
          const n = parseFloat(v)
          if (!isNaN(n)) onChange(clamp(n))
        }}
        onBlur={() => {
          if (raw === "" || isNaN(parseFloat(raw))) {
            const fallback = min != null ? min : 0
            setRaw(String(fallback))
            onChange(fallback)
          }
        }}
        className="flex-1 bg-transparent px-1 py-2 text-white text-sm font-medium focus:outline-none text-center min-w-0 tabular-nums"
      />
      <button
        type="button" tabIndex={-1} onClick={() => adjust(1)}
        className="px-2.5 py-2 text-slate-500 hover:text-white hover:bg-slate-800 active:bg-slate-700 transition-colors select-none"
      >
        <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
          <path d="M6 2.5v7M2.5 6h7" />
        </svg>
      </button>
      {suffix && <span className="px-2.5 text-slate-500 text-xs border-l border-slate-700 py-2 select-none">{suffix}</span>}
    </div>
  )
}

function SelectInput({ value, onChange, options }: {
  value: string; onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <select
      value={value} onChange={e => onChange(e.target.value)}
      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

function Toggle({ checked, onChange, label }: {
  checked: boolean; onChange: (v: boolean) => void; label?: string
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => onChange(!checked)}
        className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${checked ? "bg-blue-600" : "bg-slate-700"}`}
      >
        <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${checked ? "left-5" : "left-0.5"}`} />
      </button>
      {label && <span className="text-slate-400 text-sm">{label}</span>}
    </div>
  )
}

// ─── TradingView Webhook Kurulum Kartı ───────────────────────────────────────
// TradingView yalnızca 80 ve 443 portlarını kabul eder — nginx port 80'de dinliyor

function TradingViewWebhookCard({
  token, onTokenInit, direction, onDirection, signalTimeframe, onSignalTimeframe, isEditing,
}: {
  token: string
  onTokenInit: (t: string) => void
  direction: string
  onDirection: (v: string) => void
  signalTimeframe: string
  onSignalTimeframe: (v: string) => void
  isEditing?: boolean
}) {
  const [copied, setCopied] = useState<"url"|"json"|null>(null)
  const [alarmType, setAlarmType] = useState<"indicator"|"strategy">("indicator")
  const [tvServer, setTvServer] = useState("")

  useEffect(() => {
    setTvServer(`${window.location.protocol}//${window.location.hostname}`)
  }, [])

  const generateToken = () => {
    let t = "";
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      t = Array.from(crypto.getRandomValues(new Uint8Array(16)))
        .map(b => b.toString(16).padStart(2, "0")).join("")
    } else {
      t = Array.from({ length: 16 })
        .map(() => Math.floor(Math.random() * 256).toString(16).padStart(2, "0"))
        .join("")
    }
    onTokenInit(t)
  }

  // Token yoksa ve yeni bot oluşturuluyorsa oluştur
  useEffect(() => {
    if (!token && !isEditing) {
      generateToken()
    }
  }, [token, isEditing])

  const webhookUrl = `${tvServer}/api/signals/webhook/tv/${token}`

  // Botun yönüne göre action belirleme
  const actionForIndicator = direction === "sell_only" ? "sell" : "buy"

  const jsonTemplateIndicator = `{
  "action":   "${actionForIndicator}",
  "symbol":   "{{ticker}}",
  "price":    {{close}},
  "interval": "{{interval}}"
}`

  const jsonTemplateStrategy = `{
  "action":   "{{strategy.order.action}}",
  "symbol":   "{{ticker}}",
  "price":    {{close}},
  "interval": "{{interval}}",
  "message":  "{{strategy.order.comment}}"
}`

  const activeTemplate = alarmType === "indicator" ? jsonTemplateIndicator : jsonTemplateStrategy

  const copy = (text: string, key: "url"|"json") => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key)
      setTimeout(() => setCopied(null), 2000)
    })
  }

  return (
    <div className="mt-3 space-y-4">
      {/* Webhook URL */}
      <div className="p-4 rounded-xl border border-sky-500/20 bg-sky-500/5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-sky-400 text-base">📡</span>
            <p className="text-xs font-semibold text-sky-400">TradingView Webhook URL</p>
          </div>
          {isEditing && (
            <button
              type="button"
              onClick={() => {
                if (confirm("Token değişirse TradingView alarm URL'sini güncellemeniz gerekir. Devam?")) {
                  generateToken()
                }
              }}
              className="text-[10px] px-2 py-1 rounded bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 transition-colors"
            >
              🔄 Yeni Token Al
            </button>
          )}
        </div>
        {isEditing && (
          <div className="text-[10px] text-sky-300 bg-sky-500/10 rounded-lg px-2 py-1">
            ℹ️ Bot güncellemelerinde webhook token'ı değişmez. Eski URL'nizi kullanmaya devam edebilirsiniz.
          </div>
        )}
        {isEditing && !token && (
          <div className="text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
            ⚠️ Mevcut token bulunamadı. TradingView alarmınızda hangi URL kullanıldığını kontrol edin.
          </div>
        )}
        <div className="flex items-center gap-2">
          <code className="flex-1 text-[11px] font-mono bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-300 break-all">
            {token ? webhookUrl : "— token yükleniyor —"}
          </code>
          <button
            type="button"
            onClick={() => copy(webhookUrl, "url")}
            disabled={!token}
            className="shrink-0 px-3 py-2 rounded-lg bg-sky-600/20 border border-sky-500/40 text-sky-300 text-xs hover:bg-sky-600/40 transition-colors disabled:opacity-40"
          >
            {copied === "url" ? "✓ Kopyalandı" : "Kopyala"}
          </button>
        </div>
      </div>

      {/* Alarm Tipi Seçimi */}
      <div className="p-4 rounded-xl border border-slate-700 bg-slate-900/50 space-y-3">
        <p className="text-xs font-semibold text-slate-300">Alarm Tipi</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setAlarmType("indicator")}
            className={`flex-1 px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${
              alarmType === "indicator"
                ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300"
                : "border-slate-700 text-slate-400 hover:text-white"
            }`}
          >
            Indikator Alarmi
          </button>
          <button
            type="button"
            onClick={() => setAlarmType("strategy")}
            className={`flex-1 px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${
              alarmType === "strategy"
                ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300"
                : "border-slate-700 text-slate-400 hover:text-white"
            }`}
          >
            Strateji Alarmi
          </button>
        </div>
        <p className="text-[10px] text-slate-500">
          {alarmType === "indicator"
            ? "Indikatorden gelen alarm (ornegin RSI, MACD, SuperTrend). Islem yonu bot ayarina gore sabit gonderilir."
            : "Pine Script strateji alarmi. {{strategy.order.action}} otomatik olarak buy/sell degerini alir."}
        </p>
      </div>

      {/* JSON Şablonu */}
      <div className="p-4 rounded-xl border border-slate-700 bg-slate-900/50 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-slate-300">
            Alarm Mesaji (JSON Sablonu)
            {alarmType === "indicator" && (
              <span className="ml-2 text-[10px] text-emerald-400 font-normal">
                action: {actionForIndicator}
              </span>
            )}
          </p>
          <button
            type="button"
            onClick={() => copy(activeTemplate, "json")}
            className="px-2.5 py-1 rounded bg-slate-800 border border-slate-700 text-slate-400 text-[11px] hover:text-white transition-colors"
          >
            {copied === "json" ? "✓ Kopyalandı" : "Kopyala"}
          </button>
        </div>
        <pre className="text-[11px] font-mono text-emerald-300 leading-relaxed bg-black/40 rounded-lg px-3 py-2.5 overflow-x-auto">{activeTemplate}</pre>
        {alarmType === "indicator" ? (
          <p className="text-[10px] text-slate-500">
            Bu mesaji TradingView alarm mesaji alanina yapistir. <span className="text-amber-400">action</span>: {actionForIndicator === "buy" ? "AL — Long" : "SAT — Short"} &nbsp;|&nbsp; <span className="text-sky-400">{"{{interval}}"}</span> → TradingView alarmın tetiklendigi grafigin periyodunu otomatik doldurur (örn: 5m grafik → "5").
          </p>
        ) : (
          <p className="text-[10px] text-slate-500">
            {"{{strategy.order.action}}"} → buy/sell otomatik dolar. <span className="text-sky-400">{"{{interval}}"}</span> → grafigin periyodunu otomatik doldurur.
          </p>
        )}
      </div>

      {/* Kurulum Adımları */}
      <div className="p-3 rounded-xl border border-slate-800 bg-slate-900/30 space-y-1.5">
        <p className="text-xs font-semibold text-slate-400">Kurulum Adimlari</p>
        <ol className="text-[11px] text-slate-500 space-y-1 list-decimal list-inside">
          <li>TradingView'de {alarmType === "indicator" ? "indikatore" : "stratejiye"} alarm ekle (sag tik → Alarm Ekle)</li>
          <li><span className="text-slate-300">Bildirimler</span> → <span className="text-slate-300">Webhook URL</span> alanina yukaridaki URL'yi yapistir</li>
          <li><span className="text-slate-300">Mesaj</span> alanina yukaridaki JSON sablonunu yapistir</li>
          <li>Alarmi kaydet — tetiklenince bot otomatik islem acar</li>
        </ol>
      </div>

      {/* Sinyal Periyodu */}
      <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/30 space-y-2">
        <p className="text-xs font-medium text-slate-400">Sinyal Periyodu (Zaman Dilimi)</p>
        <div className="flex flex-wrap gap-2">
          {["1m","3m","5m","15m","30m","1h","4h","1d"].map(tf => (
            <button
              key={tf}
              type="button"
              onClick={() => onSignalTimeframe(tf)}
              className={`px-3 py-1.5 rounded-lg border text-xs font-mono font-medium transition-colors ${
                signalTimeframe === tf
                  ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300"
                  : "border-slate-700 text-slate-400 hover:text-white"
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-slate-500">
          TradingView alarmının hangi grafik periyodunda tetiklendiğini belirt. Bu bilgi sinyal geçmişine kaydedilir ve analizlerde kullanılır.
        </p>
      </div>

      {/* İşlem Yönü */}
      <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/30 space-y-2">
        <p className="text-xs font-medium text-slate-400">Islem Yonu Filtresi</p>
        <div className="flex gap-2">
          {[
            { value: "both",      label: "AL ve SAT" },
            { value: "buy_only",  label: "Sadece AL" },
            { value: "sell_only", label: "Sadece SAT" },
          ].map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onDirection(opt.value)}
              className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                direction === opt.value
                  ? "border-sky-500/50 bg-sky-500/10 text-sky-300"
                  : "border-slate-700 text-slate-400 hover:text-white"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Strateji Sinyal Mantığı Kartı ───────────────────────────────────────────
function StrategySignalCard({
  strategyId,
  getParam,
}: {
  strategyId: string
  getParam: (k: string, d: number | string | boolean) => number | string | boolean
}) {
  type Card = { algo: string; buy: string[]; sell: string[]; filters: string[]; note?: string }

  const card: Card = (() => {
    if (strategyId === "ema_cross") {
      const fast = getParam("fast_ema", 9)
      const slow = getParam("slow_ema", 21)
      const sig  = getParam("signal_ema", 9)
      const vol  = getParam("min_volume", 0)
      return {
        algo: `EMA ${fast} ile EMA ${slow} arasındaki kesişim anı sinyal üretir.`,
        buy:  [`EMA ${fast}, EMA ${slow}'ı yukarı keser  ↗  (Golden Cross)`],
        sell: [`EMA ${fast}, EMA ${slow}'ı aşağı keser  ↘  (Death Cross)`],
        filters: [
          ...(Number(sig) > 0 ? [`EMA ${sig} onay filtresi: üçüncü EMA trend yönünü doğrulamalı`] : []),
          ...(Number(vol) > 0 ? [`Hacim > ${(Number(vol)/1000).toFixed(0)}K olmalı (düşük hacimli sinyaller atlanır)`] : []),
        ],
        note: `Hızlı EMA küçük = daha çok sinyal (gürültülü) | Hızlı EMA büyük = daha az sinyal (geç)`,
      }
    }
    if (strategyId === "rsi_oversold") {
      const period     = getParam("rsi_period", 14)
      const oversold   = getParam("oversold", 30)
      const overbought = getParam("overbought", 70)
      const emaF       = getParam("rsi_ema_filter", 200)
      return {
        algo: `RSI(${period}) aşırı bölgelerden çıktığında tersine dönüş sinyali üretir.`,
        buy:  [`RSI < ${oversold} iken → ${oversold} üstüne çıkar  ↗  (Aşırı satımdan çıkış)`],
        sell: [`RSI > ${overbought} iken → ${overbought} altına iner  ↘  (Aşırı alımdan çıkış)`],
        filters: [
          ...(Number(emaF) > 0
            ? [`EMA ${emaF} trend filtresi: Long için fiyat EMA üstünde, Short için altında olmalı`]
            : [`Trend filtresi kapalı — her iki yönde de sinyal üretilir`]),
        ],
        note: `RSI periyodu küçük = daha hassas ve gürültülü | Büyük = daha sağlam ama geç sinyal`,
      }
    }
    if (strategyId === "macd_signal") {
      const fast = getParam("fast", 12)
      const slow = getParam("slow", 26)
      const sig  = getParam("signal", 9)
      const thr  = getParam("hist_threshold", 0)
      return {
        algo: `MACD(${fast},${slow},${sig}): Momentum değişimini yakalar. Sinyal hattı kesişimi tetikler.`,
        buy:  [`MACD hattı → Sinyal hattını YUKARI keser  ↗`, `Histogram negatiften pozitife geçer (+)`],
        sell: [`MACD hattı → Sinyal hattını AŞAĞI keser  ↘`, `Histogram pozitiften negatife geçer (−)`],
        filters: [
          ...(Number(thr) > 0
            ? [`Histogram eşiği: |histogram| > ${thr} olmalı (zayıf sinyaller filtrelenir)`]
            : [`Histogram eşiği kapalı — tüm kesişimler sinyal üretir`]),
        ],
        note: `Yavaş EMA - Hızlı EMA = MACD hattı | MACD hattının 9 günlük EMA'sı = Sinyal hattı`,
      }
    }
    if (strategyId === "bollinger_bounce") {
      const period  = getParam("period", 20)
      const std     = getParam("std_dev", 2)
      const squeeze = getParam("squeeze", true)
      return {
        algo: `Bollinger Bandı(${period}, ${std}σ): Fiyat band sınırlarına dokunduğunda geri dönüş beklenir.`,
        buy:  [`Fiyat ALT banda (SMA${period} − ${std}σ) dokunur veya altına iner  ↘→↗`],
        sell: [`Fiyat ÜST banda (SMA${period} + ${std}σ) dokunur veya üstüne çıkar  ↗→↘`],
        filters: [
          ...(squeeze
            ? [`Sıkışma filtresi AKTİF: Bantlar önce daralmalı, sonra açılmalı (kırılma beklenir)`]
            : [`Sıkışma filtresi KAPALI: Her band dokunuşu sinyal üretir`]),
        ],
        note: `Std sapma büyük = bandlar geniş, daha az sinyal | Küçük = bandlar dar, daha çok sinyal`,
      }
    }
    if (strategyId === "ut_bot") {
      const period = getParam("atr_period", 10)
      const mult   = getParam("atr_mult", 3)
      const ha     = getParam("heikin_ashi", false)
      return {
        algo: `ATR Trailing Stop: Her barda dinamik stop hesaplanır. Fiyat stopu geçince sinyal üretilir.`,
        buy:  [`Fiyat → ATR Stop'u aşağıdan YUKARI keser  ↗  (Trend yukarı döndü)`],
        sell: [`Fiyat → ATR Stop'u yukarıdan AŞAĞI keser  ↘  (Trend aşağı döndü)`],
        filters: [
          ha ? `Heikin Ashi mumları aktif (daha düzgün, sahte sinyaller azalır)` : `Normal mumlar kullanılıyor`,
        ],
        note: `Stop mesafesi = ATR(${period}) × ${mult} | Çarpan büyük = stop uzak, trend değişimine toleranslı`,
      }
    }
    if (strategyId === "supertrend") {
      const period = getParam("period", 10)
      const mult   = getParam("mult", 3)
      return {
        algo: `Supertrend(${period}, ${mult}): ATR tabanlı dinamik trend çizgisi. Renk değişimi sinyal üretir.`,
        buy:  [`Supertrend KIRMIZIDAN YEŞİLE döner  ↗  (Trend yukarı, fiyat üstte)`],
        sell: [`Supertrend YEŞİLDEN KIRMIZIYA döner  ↘  (Trend aşağı, fiyat altta)`],
        filters: [],
        note: `Periyot küçük = hızlı sinyal (gürültülü) | Çarpan büyük = bant geniş (geç ama güvenilir)`,
      }
    }
    if (strategyId === "bb_ema_cross") {
      const bbP  = getParam("bb_period", 20)
      const bbS  = getParam("bb_std", 2.0)
      const fast = getParam("ema_fast", 5)
      const slow = getParam("ema_slow", 13)
      const tpct = getParam("touch_pct", 0.3)
      const dir  = getParam("direction", "both")
      const exit = getParam("exit_at_bands", true)
      return {
        algo: `BB(${bbP}, ${bbS}σ) orta çizgi kesişimi setup → EMA${fast}/EMA${slow} çaprazlama ile giriş.`,
        buy: [
          `Fiyat BB ortayı (SMA${bbP}) YUKARI keser → setup başlar ↗`,
          `Sonraki barda EMA${fast} VE EMA${slow} BB ortanın üstüne çıkar → LONG giriş`,
          `Yeniden giriş: EMA${slow}'e %${tpct} içinde fiyat dokunuşu → LONG`,
        ],
        sell: String(dir) === "long" ? [] : [
          `Fiyat BB ortayı AŞAĞI keser → short setup ↘`,
          `EMA${fast} VE EMA${slow} BB ortanın altına iner → SHORT giriş`,
        ],
        filters: [
          ...(exit ? [`Çıkış: BB üst banda ulaşınca LONG kapat | Alt banda ulaşınca SHORT kapat`] : []),
          `Yön: ${String(dir) === "both" ? "Long ve Short" : String(dir) === "long" ? "Yalnızca Long" : "Yalnızca Short"}`,
        ],
        note: `BB orta = SMA${bbP} | EMA${fast} hızlı sinyal çizgisi | EMA${slow} destek/direnç`,
      }
    }
    if (strategyId === "funding_rate") {
      const thr      = getParam("threshold", 0.01)
      const interval = getParam("check_interval", 5)
      return {
        algo: `Funding rate piyasa dengesizliğini yansıtır. Aşırı değerlerde tersine dönüş beklenir.`,
        buy:  [`Funding rate < −${(Number(thr)*100).toFixed(3)}%  →  Shortlar primde, long fırsatı  ↗`],
        sell: [`Funding rate > +${(Number(thr)*100).toFixed(3)}%  →  Longlar primde, short fırsatı  ↘`],
        filters: [`Her ${interval} dakikada bir funding rate kontrol edilir`],
        note: `Funding rate = 0 ise piyasa dengede. Pozitif = longlar öder, negatif = shortlar öder.`,
      }
    }
    if (strategyId === "grid_bot") {
      const upper = getParam("upper_pct", 5)
      const lower = getParam("lower_pct", 5)
      const count = getParam("grid_count", 20)
      const type  = getParam("grid_type", "arithmetic")
      const sl    = getParam("stop_loss_pct", 8)
      const step  = Number(upper) + Number(lower)
      const stepPct = Number(count) > 0 ? (step / Number(count)).toFixed(2) : "—"
      return {
        algo: `Fiyat aralığı ${count} grid seviyesine bölünür. ${type === "arithmetic" ? "Aritmetik (eşit fiyat)" : "Geometrik (eşit yüzde)"} dağılım.`,
        buy:  [`Fiyat bir grid seviyesine DÜŞÜNCE → o seviyede alım emri açılır ▲`],
        sell: [`Fiyat bir sonraki grid seviyesine ÇIKINCA → kâr realizasyonu yapılır ▼`],
        filters: [
          `Grid adımı ≈ %${stepPct} | Alt sınır: −%${lower} | Üst sınır: +%${upper}`,
          ...(Number(sl) > 0 ? [`Stop Loss: Alt sınırın %${sl} altına düşerse tüm pozisyonlar kapatılır`] : [`Stop Loss kapalı — grid sınır dışına çıkabilir`]),
        ],
        note: `Grid bot yatay piyasada en verimlidir. Güçlü trend dönemlerinde risk artar.`,
      }
    }
    return { algo: "", buy: [], sell: [], filters: [] }
  })()

  if (!card.algo) return null

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-950/60 overflow-hidden">
      <div className="px-4 py-2.5 bg-slate-800/40 border-b border-slate-700/60">
        <p className="text-[11px] text-slate-400 leading-relaxed">{card.algo}</p>
      </div>
      <div className="p-3 space-y-1.5">
        {card.buy.map((c, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className="shrink-0 mt-px text-[10px] font-bold px-1.5 py-0.5 rounded bg-green-500/15 border border-green-500/30 text-green-400 leading-none">AL ▲</span>
            <span className="text-xs text-slate-300">{c}</span>
          </div>
        ))}
        {card.sell.map((c, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className="shrink-0 mt-px text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-500/15 border border-red-500/30 text-red-400 leading-none">SAT ▼</span>
            <span className="text-xs text-slate-300">{c}</span>
          </div>
        ))}
        {card.filters.map((f, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className="shrink-0 mt-px text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-500/10 border border-blue-500/25 text-blue-400 leading-none">FİLTRE</span>
            <span className="text-xs text-slate-400">{f}</span>
          </div>
        ))}
        {card.note && (
          <p className="text-[10px] text-slate-500 pt-1.5 border-t border-slate-800/80 mt-1">{card.note}</p>
        )}
      </div>
    </div>
  )
}

// ─── Leverage slider ──────────────────────────────────────────────────────────
function LeverageSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const marks = [1, 3, 5, 10, 20, 50, 75, 100, 125, 150, 200, 300, 500]
  const risk = value <= 3 ? "Düşük" : value <= 10 ? "Orta" : value <= 50 ? "Yüksek" : "Çok Yüksek"
  const sliderPct = (value / 500) * 100
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-2xl font-bold text-white">{value}x</span>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
          value <= 3  ? "border-green-500/30 bg-green-500/10 text-green-400" :
          value <= 10 ? "border-yellow-500/30 bg-yellow-500/10 text-yellow-400" :
          value <= 50 ? "border-orange-500/30 bg-orange-500/10 text-orange-400" :
                        "border-red-500/30 bg-red-500/10 text-red-400"
        }`}>{risk} Risk</span>
      </div>
      <input
        type="range" min={1} max={500} value={value}
        onChange={e => onChange(+e.target.value)}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
        style={{
          background: `linear-gradient(to right, ${
            value <= 10 ? "#22c55e" : value <= 50 ? "#f59e0b" : "#ef4444"
          } ${sliderPct}%, #1e293b ${sliderPct}%)`,
        }}
      />
      <div className="flex gap-1 flex-wrap">
        {marks.map(m => (
          <button key={m} onClick={() => onChange(m)}
            className={`px-1.5 py-0.5 rounded border text-[11px] transition-colors ${
              value === m
                ? "border-blue-500 bg-blue-500/20 text-blue-300"
                : "border-slate-700 text-slate-500 hover:text-white hover:border-slate-500"
            }`}
          >{m}x</button>
        ))}
      </div>
      {value > 50 && (
        <div className="flex items-start gap-2 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
          <span className="shrink-0 mt-0.5">⚠</span>
          <span>Yüksek kaldıraç likidasyona yol açabilir. Paper Trading modunu öneririz.</span>
        </div>
      )}
    </div>
  )
}

// ─── Grid Bot Görselleştirici ─────────────────────────────────────────────────
function GridBotVisualizer({
  upperPct, lowerPct, gridCount, perGridUsdt, feePct,
}: {
  upperPct: number; lowerPct: number; gridCount: number; perGridUsdt: number; feePct: number
}) {
  const totalRange    = upperPct + lowerPct
  const stepPct       = gridCount > 1 ? totalRange / (gridCount - 1) : totalRange
  const totalInv      = gridCount * perGridUsdt
  // Gross profit per grid cycle (buy then sell one grid step)
  const grossPerGrid  = perGridUsdt * stepPct / 100
  // Fee per trade (buy + sell = 2 trades)
  const feePerGrid    = perGridUsdt * (feePct / 100) * 2
  const netPerGrid    = grossPerGrid - feePerGrid
  const dailyEstimate = (netPerGrid * gridCount * 2) // rough: 2 full sweeps/day assumption

  const displayCount = Math.min(gridCount, 12)
  const displayStep  = gridCount > 0 ? totalRange / Math.max(displayCount - 1, 1) : 1

  const levels: number[] = []
  for (let i = 0; i < displayCount; i++) {
    levels.push(-lowerPct + i * displayStep)
  }

  return (
    <div className="rounded-xl border border-cyan-500/20 bg-slate-950/60 p-4 space-y-3">
      <p className="text-xs font-medium text-cyan-400">⊞ Grid Önizleme</p>

      <div className="space-y-0.5">
        {[...levels].reverse().map((pct, i) => {
          const isAbove = pct > 0.001
          const isBelow = pct < -0.001
          return (
            <div key={i} className="flex items-center gap-2">
              <span className="text-[9px] font-mono text-slate-500 w-14 text-right shrink-0">
                {pct > 0 ? `+${pct.toFixed(1)}` : pct.toFixed(1)}%
              </span>
              <div className={`flex-1 h-5 rounded flex items-center px-2 text-[9px] font-medium ${
                isAbove
                  ? "bg-red-500/10 border border-red-500/20 text-red-400"
                  : isBelow
                  ? "bg-green-500/10 border border-green-500/20 text-green-400"
                  : "bg-white/10 border border-white/20 text-white"
              }`}>
                {isAbove ? "▼ SAT" : isBelow ? "▲ AL" : "◈ Anlık Fiyat"}
              </div>
            </div>
          )
        })}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-800 text-center">
        <div>
          <p className="text-[10px] text-slate-500">Toplam Yatırım</p>
          <p className="text-sm font-bold text-white">${totalInv.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-[10px] text-slate-500">Grid Adımı</p>
          <p className="text-sm font-bold text-cyan-400">%{stepPct.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-[10px] text-slate-500">Net Grid Kâr</p>
          <p className={`text-sm font-bold ${netPerGrid >= 0 ? "text-green-400" : "text-red-400"}`}>
            ${netPerGrid.toFixed(3)}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-slate-500">Günlük Tahmin</p>
          <p className="text-sm font-bold text-yellow-400">~${dailyEstimate.toFixed(2)}</p>
        </div>
      </div>

      {netPerGrid < 0 && (
        <div className="flex items-center gap-2 p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
          <span>⚠</span>
          <span>İşlem ücreti grid adımından büyük! Grid sayısını azaltın veya aralığı genişletin.</span>
        </div>
      )}
    </div>
  )
}

// ─── AI TP/SL Öneri Kartı ────────────────────────────────────────────────────
interface TpSlSuggestion {
  sample_size: number
  suggested_tp_pct: number | null
  suggested_sl_pct: number | null
  confidence: "high" | "medium" | "low" | "insufficient"
  win_probability: number
  loss_probability: number
  ev_score: number
  rr_ratio: number | null
  distribution: { fav_p25: number; fav_p50: number; fav_p75: number; adv_p25: number; adv_p50: number }
  reasoning: string[]
  method: string
  message?: string
}

function AiTpSlCard({
  symbol, botId, onApply,
}: {
  symbol: string
  botId?: number
  onApply: (tp: number, sl: number) => void
}) {
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<TpSlSuggestion | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const fetch = async () => {
    setLoading(true)
    setErr(null)
    try {
      const params = new URLSearchParams()
      if (symbol) params.set("symbol", symbol)
      if (botId)  params.set("bot_id", String(botId))
      const res = await api.get(`/analytics/suggest-tp-sl?${params}`)
      setData(res)
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Öneri alınamadı")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetch() }, [symbol, botId])

  const confLabel = data?.confidence === "high" ? "Yüksek"
    : data?.confidence === "medium" ? "Orta"
    : data?.confidence === "low" ? "Düşük"
    : "Yetersiz"

  return (
    <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">🤖</span>
          <p className="text-xs font-semibold text-blue-300">AI Otomatik TP/SL Analizi</p>
          {data && (
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${
              data.confidence === "high"   ? "border-green-500/40 bg-green-500/10 text-green-400" :
              data.confidence === "medium" ? "border-yellow-500/40 bg-yellow-500/10 text-yellow-400" :
                                             "border-red-500/40 bg-red-500/10 text-red-400"
            }`}>{confLabel} güven · {data.sample_size} sinyal</span>
          )}
        </div>
        <button
          onClick={fetch}
          disabled={loading}
          className="text-[10px] text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 px-2 py-1 rounded-lg transition-colors"
        >
          {loading ? "⟳" : "↻ Yenile"}
        </button>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span className="animate-spin">⟳</span> Geçmiş sinyaller analiz ediliyor…
        </div>
      )}

      {err && <p className="text-xs text-red-400">{err}</p>}

      {data && !loading && data.confidence === "insufficient" && (
        <p className="text-xs text-slate-400">⚠️ {data.message || "Yeterli geçmiş veri yok. Manuel giriş yapın."}</p>
      )}

      {data && !loading && data.suggested_tp_pct != null && (
        <>
          {/* Öneri değerleri */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-3 text-center">
              <p className="text-[10px] text-slate-500 mb-1">Önerilen TP</p>
              <p className="text-xl font-bold text-green-400">+{data.suggested_tp_pct}%</p>
              <p className="text-[10px] text-green-600 mt-0.5">
                %{Math.round(data.win_probability * 100)} ulaşma ihtimali
              </p>
            </div>
            <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-center">
              <p className="text-[10px] text-slate-500 mb-1">Önerilen SL</p>
              <p className="text-xl font-bold text-red-400">-{data.suggested_sl_pct}%</p>
              <p className="text-[10px] text-red-600 mt-0.5">
                %{Math.round(data.loss_probability * 100)} vurulma ihtimali
              </p>
            </div>
          </div>

          {/* Metrikler */}
          <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
            <div className="rounded-lg bg-slate-800/60 p-2">
              <p className="text-slate-500">R/R Oranı</p>
              <p className={`font-bold text-sm mt-0.5 ${(data.rr_ratio || 0) >= 2 ? "text-green-400" : "text-yellow-400"}`}>
                1:{data.rr_ratio ?? "—"}
              </p>
            </div>
            <div className="rounded-lg bg-slate-800/60 p-2">
              <p className="text-slate-500">Beklenen Değer</p>
              <p className={`font-bold text-sm mt-0.5 ${(data.ev_score || 0) > 0 ? "text-green-400" : "text-red-400"}`}>
                {data.ev_score > 0 ? "+" : ""}{data.ev_score?.toFixed(3)}%
              </p>
            </div>
            <div className="rounded-lg bg-slate-800/60 p-2">
              <p className="text-slate-500">Analiz Yöntemi</p>
              <p className="font-bold text-sm mt-0.5 text-blue-400">
                {data.method === "context_weighted" ? "Koşullu" : "İstatistiksel"}
              </p>
            </div>
          </div>

          {/* Dağılım mini bar */}
          <div className="space-y-1">
            <p className="text-[10px] text-slate-500">Favorable hareket dağılımı (%25 · %50 · %75)</p>
            <div className="relative h-2 rounded-full bg-slate-800">
              <div className="absolute left-0 top-0 h-full rounded-full bg-gradient-to-r from-blue-600 to-blue-400"
                style={{ width: `${Math.min(100, data.distribution.fav_p75 * 5)}%` }} />
              <div className="absolute top-0 h-full w-0.5 bg-white/60"
                style={{ left: `${Math.min(99, data.distribution.fav_p50 * 5)}%` }} />
            </div>
            <div className="flex justify-between text-[9px] text-slate-600">
              <span>%{data.distribution.fav_p25}</span>
              <span className="text-white/50">medyan %{data.distribution.fav_p50}</span>
              <span>%{data.distribution.fav_p75}</span>
            </div>
          </div>

          {/* Uygula butonu */}
          <button
            onClick={() => onApply(data.suggested_tp_pct!, data.suggested_sl_pct!)}
            className="w-full py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors"
          >
            ✓ Bu değerleri uygula (TP %{data.suggested_tp_pct} / SL %{data.suggested_sl_pct})
          </button>
        </>
      )}
    </div>
  )
}

// ─── Ana Sayfa ────────────────────────────────────────────────────────────────
export default function BotsPage() {
  const [bots,             setBots]             = useState<Bot[]>([])
  const [creating,         setCreating]         = useState(false)
  const [editingBot,       setEditingBot]       = useState<Bot | null>(null)
  const [step,             setStep]             = useState(0)
  const [form,             setForm]             = useState<FormState>(defaultForm())
  const [saving,           setSaving]           = useState(false)
  const [error,            setError]            = useState<string | null>(null)
  const [customStrategies, setCustomStrategies] = useState<Strategy[]>([])
  // Tüm kayıtlı özel indikatörler (producesSignals filtresi yok)
  const [allCustomInds,    setAllCustomInds]    = useState<Array<{id:string;name:string;producesSignals:boolean}>>([])
  const [exchangeBalance,  setExchangeBalance]  = useState<number | null>(null)
  const [balanceLoading,   setBalanceLoading]   = useState(false)
  const [filter,           setFilter]           = useState<"all"|"active"|"stopped"|"paper"|"live">("all")

  useEffect(() => {
    api.get("/bots/").then(data => {
      if (Array.isArray(data)) setBots(data)
    }).catch(() => {})
  }, [])

  // localStorage'dan özel indikatörleri oku (doğrudan render'da)
  const loadCustomIndsFromStorage = () => {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem("prochart_custom_indicators") : null
      if (!raw) return { inds: [], strategies: [] }
      const inds: Array<{id:string;name:string;producesSignals?:boolean}> = JSON.parse(raw)
      // Stratejiler için: producesSignals=true VEYA undefined
      const sigInds = inds.filter(i => i.producesSignals !== false)
      const strategies = sigInds.map(ind => ({
        id: `custom__${ind.id}`,
        name: ind.name,
        category: "Custom" as const,
        icon: "⚙️",
        description: `"${ind.name}" özel indikatöründen gelen sinyalleri dinler.`,
        signals: ["Özel JS sinyali"],
        params: [],
      }))
      return { inds, strategies }
    } catch { return { inds: [], strategies: [] } }
  }
  
  const { inds: storageInds, strategies: storageStrategies } = loadCustomIndsFromStorage()

  const allStrategies = [...STRATEGIES, ...customStrategies, ...storageStrategies]
  const selectedStrategy = (
    allStrategies.find(s => s.id === form.strategy) ??
    STRATEGIES.find(s => s.id === "custom_signal")!
  )

  // Borsa değiştiğinde bakiye çek (sadece wizard açıkken)
  const wizardOpen = creating || !!editingBot
  useEffect(() => {
    if (!form.exchange || !wizardOpen) return
    let cancelled = false
    setBalanceLoading(true)
    setExchangeBalance(null)
    api.get(`/exchanges/${form.exchange}/balance`)
      .then((data: any) => {
        if (cancelled) return
        const usdt = data?.total ?? data?.free ?? null
        if (usdt != null && Number(usdt) > 0) {
          setExchangeBalance(Number(usdt))
          setForm(f => ({ ...f, initial_balance: Math.floor(Number(usdt)) }))
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setBalanceLoading(false) })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.exchange, wizardOpen])

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm(f => ({ ...f, [k]: v }))

  const setParam = (k: string, v: number | string | boolean) =>
    setForm(f => ({ ...f, strategy_params: { ...f.strategy_params, [k]: v } }))

  const getParam = (k: string, def: number | string | boolean) =>
    form.strategy_params[k] ?? def

  const buildPayload = (f: FormState) => {
    // Grid bot: kaldıraç yok, özel paramlar
    if (f.strategy === "grid_bot") {
      const count   = Number(f.strategy_params.grid_count   ?? 20)
      const perGrid = Number(f.strategy_params.per_grid_usdt ?? 10)
      return {
        name: f.name,
        symbol: f.symbol,
        strategy: "grid_bot",
        exchange: f.exchange,
        paper_mode: f.paper_mode,
        leverage: 1,
        risk_per_trade: 0.01,
        max_daily_loss: f.max_daily_loss / 100,
        initial_balance: count * perGrid,
        tp_pct: 0,
        sl_pct: 0,
        trailing_sl: false,
        params: f.strategy_params,
      }
    }

    const isWebhook = f.strategy === "tradingview_webhook"
    const sigSrc = f.strategy_params.signal_source as string | undefined
    const useCustomSig = !isWebhook && sigSrc && sigSrc !== "builtin"
    return {
      name: f.name,
      symbol: f.symbol,
      strategy: isWebhook ? "tradingview_webhook"
        : useCustomSig ? "custom_signal"
        : f.strategy.startsWith("custom__") ? "custom_signal"
        : f.strategy,
      exchange: f.exchange,
      paper_mode: f.paper_mode,
      leverage: f.leverage,
      risk_per_trade: f.risk_mode === "pct"
        ? f.risk_per_trade / 100
        : f.risk_per_trade / f.initial_balance,
      max_daily_loss: f.max_daily_loss / 100,
      initial_balance: f.initial_balance,
      tp_pct: f.tp_pct,
      sl_pct: f.sl_pct,
      trailing_sl: f.trailing_sl,
      order_type: f.order_type,
      params: { margin_type: f.margin_type },
      strategy_params: useCustomSig
        ? { signal_source: sigSrc, ...Object.fromEntries(
            Object.entries(f.strategy_params).filter(([k]) =>
              ["signal_mode","position_action","signal_tf","wait_candle_close","max_position_hours","max_trades_per_day","webhook_token","signal_timeframe"].includes(k)
            )
          )}
        : f.strategy_params,
    }
  }

  const handleCreate = async () => {
    if (!form.name) return
    setSaving(true)
    setError(null)
    try {
      const bot = await api.post("/bots/", buildPayload(form))
      if (bot?.id) {
        setBots(prev => [...prev, { ...bot, running: false }])
        setCreating(false)
        setStep(0)
        setForm(defaultForm())
      } else {
        setError("Bot oluşturulamadı. Beklenmedik yanıt formatı.")
      }
    } catch (e: any) {
      console.error("Bot create error:", e)
      const detail = e.message || "Sunucuya ulaşılamıyor"
      setError(`Hata: ${detail}`)
    } finally { 
      setSaving(false) 
    }
  }

  const handleEdit = async () => {
    if (!form.name || !editingBot) return
    setSaving(true)
    setError(null)
    try {
      const bot = await api.patch(`/bots/${editingBot.id}`, buildPayload(form))
      if (bot?.id) {
        setBots(prev => prev.map(b => b.id === bot.id ? { ...bot, running: b.running } : b))
        setEditingBot(null)
        setStep(0)
        setForm(defaultForm())
      } else {
        setError("Güncelleme başarısız.")
      }
    } catch (e: unknown) {
      setError(`Hata: ${e instanceof Error ? e.message : "Sunucuya ulaşılamıyor"}`)
    } finally { setSaving(false) }
  }

  const handleDelete = async (botId: number) => {
    if (!confirm("Bu botu silmek istediğinize emin misiniz?")) return
    try {
      await api.delete(`/bots/${botId}`)
      setBots(prev => prev.filter(b => b.id !== botId))
    } catch {}
  }

  const openEdit = (bot: Bot) => {
    setEditingBot(bot)
    const p = bot.params || {}
    setForm({
      ...defaultForm(),
      name: bot.name,
      symbol: bot.symbol,
      strategy: p._strategy_display || bot.strategy,
      exchange: bot.exchange || "mexc",
      paper_mode: bot.paper_mode,
      leverage: bot.leverage || 10,
      risk_per_trade: (bot.risk_per_trade || 0.01) * 100,
      max_daily_loss: (bot.max_daily_loss || 0.05) * 100,
      initial_balance: bot.initial_balance || 1000,
      tp_pct: p.tp_pct || 0,
      sl_pct: p.sl_pct || 0,
      trailing_sl: p.trailing_sl || false,
      order_type: (p.order_type || "market") as "market" | "limit",
      margin_type: (p.margin_type || "isolated") as "isolated" | "cross",
      strategy_params: Object.fromEntries(
        Object.entries(p).filter(([k]) => !["tp_pct", "sl_pct", "trailing_sl", "_strategy_display", "order_type", "margin_type"].includes(k))
      ),
    })
    setStep(0)
  }

  const handleClose = () => {
    setCreating(false)
    setEditingBot(null)
    setStep(0)
    setForm(defaultForm())
    setError(null)
  }

  const canNext = () => {
    if (step === 0) return !!form.strategy
    if (step === 1) return !!form.symbol
    if (step === 2) return form.leverage >= 1 && form.risk_per_trade > 0
    return !!form.name
  }

  return (
    <div className="min-h-screen bg-[#020817] text-white">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">

        {/* ── Başlık ── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">Botlar</h1>
            <p className="text-xs text-slate-500 mt-0.5">{bots.length} bot kayıtlı</p>
          </div>
          {!creating && (
            <button onClick={() => setCreating(true)}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-lg shadow-blue-500/20">
              <span className="text-base leading-none">+</span> Yeni Bot
            </button>
          )}
        </div>

        {/* ── Wizard Modal ── */}
        {(creating || editingBot) && (
          <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={handleClose}>
          <div className="bg-[#0d1117] border border-slate-800 rounded-2xl w-full max-w-3xl flex flex-col shadow-2xl" style={{maxHeight:"calc(100vh - 2rem)"}} onClick={e => e.stopPropagation()}>

            {/* Wizard header + adımlar */}
            <div className="px-6 pt-5 pb-0 border-b border-slate-800 shrink-0">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-white font-semibold">{editingBot ? `Düzenle: ${editingBot.name}` : "Yeni Bot Oluştur"}</h2>
                  <p className="text-slate-500 text-xs mt-0.5">Adım {step + 1} / {STEPS.length}</p>
                </div>
                <button onClick={handleClose} className="text-slate-500 hover:text-white text-xl transition-colors">×</button>
              </div>
              {/* Adım çubuğu */}
              <div className="flex gap-0">
                {STEPS.map((s, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center pb-0">
                    <div className="flex items-center w-full mb-2">
                      <div className={`flex-1 h-px ${i === 0 ? "opacity-0" : step >= i ? "bg-blue-500" : "bg-slate-800"}`} />
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
                        step > i  ? "bg-blue-600 border-blue-600 text-white" :
                        step === i ? "border-blue-500 text-blue-400 bg-blue-500/10" :
                                    "border-slate-700 text-slate-600"
                      }`}>
                        {step > i ? "✓" : i + 1}
                      </div>
                      <div className={`flex-1 h-px ${i === STEPS.length - 1 ? "opacity-0" : step > i ? "bg-blue-500" : "bg-slate-800"}`} />
                    </div>
                    <span className={`text-[10px] font-medium pb-3 ${step === i ? "text-blue-400" : step > i ? "text-slate-400" : "text-slate-600"}`}>
                      {s}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* İçerik */}
            <div className="p-6 overflow-y-auto flex-1">

              {/* ── Adım 0: Strateji Seçimi ── */}
              {step === 0 && (
                <div className="space-y-4">
                  <p className="text-slate-500 text-sm">Bir strateji seç ve parametrelerini ayarla.</p>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    {allStrategies.map(s => (
                      <button
                        key={s.id}
                        onClick={() => {
                          if (form.strategy === s.id) return
                          const sourceName = s.id.startsWith("custom__") ? s.name : undefined
                          set("strategy", s.id)
                          set("strategy_params", sourceName ? { source_name: sourceName } : {})
                        }}
                        className={`text-left p-4 rounded-xl border transition-all ${
                          form.strategy === s.id
                            ? "border-blue-500/60 bg-blue-500/10 ring-1 ring-blue-500/30"
                            : "border-slate-800 hover:border-slate-600 bg-slate-900/40"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <span className="text-2xl shrink-0">{s.icon}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-semibold text-white">{s.name}</span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${
                                s.category === "Trend"           ? "border-blue-500/40 text-blue-400 bg-blue-500/10" :
                                s.category === "Momentum"        ? "border-orange-500/40 text-orange-400 bg-orange-500/10" :
                                s.category === "Mean Reversion"  ? "border-purple-500/40 text-purple-400 bg-purple-500/10" :
                                s.category === "Volatility"      ? "border-yellow-500/40 text-yellow-400 bg-yellow-500/10" :
                                s.category === "Custom"          ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/10" :
                                s.category === "Webhook"         ? "border-sky-500/40 text-sky-400 bg-sky-500/10" :
                                s.category === "Grid"            ? "border-cyan-500/40 text-cyan-400 bg-cyan-500/10" :
                                                                   "border-slate-500/40 text-slate-400"
                              }`}>{s.category}</span>
                            </div>
                            <p className="text-xs text-slate-500 mt-1 line-clamp-2">{s.description}</p>
                            <div className="flex flex-wrap gap-1 mt-2">
                              {s.signals.map(sig => (
                                <span key={sig} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-500">
                                  {sig}
                                </span>
                              ))}
                            </div>
                          </div>
                          {form.strategy === s.id && (
                            <span className="text-blue-400 shrink-0">✓</span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>

                  {/* Seçilen strateji parametreleri */}
                  {selectedStrategy && (
                    <div className="mt-4 p-4 rounded-xl border border-slate-800 bg-slate-900/30 space-y-4">
                      <span className="text-sm font-medium text-slate-300">
                        {selectedStrategy.icon} {selectedStrategy.name} — Strateji Parametreleri
                      </span>

                      {/* ── Sinyal Kaynağı Seçici — Grid Bot ve TradingView Webhook için gösterilmez ── */}
                      {form.strategy !== "grid_bot" && form.strategy !== "tradingview_webhook" && <div className="space-y-3">
                        <p className="text-xs text-slate-400 font-medium">Sinyal Kaynağı Seç</p>

                        {/* Dahili algoritma kartı */}
                        <button
                          type="button"
                          onClick={() => setParam("signal_source", "builtin")}
                          className={`w-full text-left px-4 py-3 rounded-xl border transition-colors ${
                            !form.strategy_params.signal_source || form.strategy_params.signal_source === "builtin"
                              ? "border-blue-500/50 bg-blue-500/10"
                              : "border-slate-700 bg-slate-900/40 hover:border-slate-600"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-lg">🤖</span>
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm font-semibold ${!form.strategy_params.signal_source || form.strategy_params.signal_source === "builtin" ? "text-blue-300" : "text-slate-300"}`}>
                                {selectedStrategy.name} — Dahili Algoritma
                              </p>
                              <p className="text-xs text-slate-500 mt-0.5">
                                Yerleşik strateji parametrelerini kullan (ATR, EMA vb.)
                              </p>
                            </div>
                            {(!form.strategy_params.signal_source || form.strategy_params.signal_source === "builtin") && (
                              <span className="text-blue-400 text-sm shrink-0">✓</span>
                            )}
                          </div>
                        </button>

                        {/* Özel indikatör kartları — TÜM kaydedilmiş indikatörler */}
                        {storageInds.map(ind => (
                          <button
                            key={ind.id}
                            type="button"
                            onClick={() => setParam("signal_source", ind.id)}
                            className={`w-full text-left px-4 py-3 rounded-xl border transition-colors ${
                              form.strategy_params.signal_source === ind.id
                                ? "border-emerald-500/50 bg-emerald-500/10"
                                : "border-slate-700 bg-slate-900/40 hover:border-slate-600"
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <span className="text-lg">⚡</span>
                              <div className="flex-1 min-w-0">
                                <p className={`text-sm font-semibold ${form.strategy_params.signal_source === ind.id ? "text-emerald-300" : "text-slate-300"}`}>
                                  {ind.name}
                                </p>
                                <p className="text-xs text-slate-500 mt-0.5">
                                  Özel JS indikatörü · {ind.producesSignals ? "Sinyal üretiyor ✓" : "Kod editöründe sinyal ekle"}
                                </p>
                              </div>
                              {form.strategy_params.signal_source === ind.id && (
                                <span className="text-emerald-400 text-sm shrink-0">✓</span>
                              )}
                            </div>
                          </button>
                        ))}

                        {storageInds.length === 0 && (
                          <div className="px-4 py-3 rounded-xl border border-dashed border-slate-700 text-center">
                            <p className="text-xs text-slate-500">
                              Henüz kayıtlı özel indikatör yok
                            </p>
                            <p className="text-xs text-slate-600 mt-1">
                              Pro Chart → &lt;/&gt; Kod → İndikatörü yaz → Menüye Ekle
                            </p>
                          </div>
                        )}
                      </div>}

                      {/* Seçilen özel indikatör: sinyal filtre ayarları */}
                      {form.strategy_params.signal_source && form.strategy_params.signal_source !== "builtin" && (
                        <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 space-y-4">
                          <p className="text-xs font-semibold text-emerald-400">
                            ⚡ {storageInds.find(i => i.id === form.strategy_params.signal_source)?.name} — Sinyal Ayarları
                          </p>
                          
                          {/* Sinyal Yapılandırması */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {/* Sinyal Modu */}
                            <Field label="Sinyal Modu" description="Sinyal yönünü nasıl yorumla">
                              <SelectInput
                                value={getParam("signal_mode", "normal") as string}
                                onChange={v => setParam("signal_mode", v)}
                                options={[
                                  { value: "normal",  label: "Normal — AL=Long, SAT=Short" },
                                  { value: "inverse", label: "Ters — AL=Short, SAT=Long" },
                                  { value: "buy_only", label: "Sadece Long" },
                                  { value: "sell_only", label: "Sadece Short" },
                                ]}
                              />
                            </Field>
                            
                            {/* Pozisyon Yönetimi */}
                            <Field label="Pozisyon Yönetimi" description="Yeni sinyal geldiğinde ne yap">
                              <SelectInput
                                value={getParam("position_action", "close_and_open") as string}
                                onChange={v => setParam("position_action", v)}
                                options={[
                                  { value: "close_and_open", label: "Kapat & Yeni Aç" },
                                  { value: "reverse", label: "Ters Çevir (Reverse)" },
                                  { value: "add", label: "Ekle (Hedge)" },
                                  { value: "close_only", label: "Sadece Kapat" },
                                ]}
                              />
                            </Field>
                            
                            {/* Zaman dilimi */}
                            <Field label="Zaman Dilimi" description="İndikatörün çalıştırılacağı mum periyodu">
                              <SelectInput
                                value={getParam("signal_tf", "1h") as string}
                                onChange={v => setParam("signal_tf", v)}
                                options={[
                                  { value: "1m",  label: "1 Dakika" },
                                  { value: "5m",  label: "5 Dakika" },
                                  { value: "15m", label: "15 Dakika" },
                                  { value: "1h",  label: "1 Saat" },
                                  { value: "4h",  label: "4 Saat" },
                                  { value: "1d",  label: "1 Gün" },
                                ]}
                              />
                            </Field>
                            
                            {/* Sinyal onayı bekleme */}
                            <Field label="Mum Kapanış Onayı" description="Sinyali mum kapanışında doğrula">
                              <Toggle
                                checked={getParam("wait_candle_close", true) as boolean}
                                onChange={v => setParam("wait_candle_close", v)}
                                label={getParam("wait_candle_close", true) ? "Açık — kapanışta gir" : "Kapalı — anında gir"}
                              />
                            </Field>
                          </div>
                          
                          {/* Risk Ayarları */}
                          <div className="border-t border-emerald-500/20 pt-4">
                            <p className="text-xs font-medium text-emerald-300 mb-3">Risk Ayarları</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              {/* Maksimum Pozisyon Süresi */}
                              <Field label="Max. Pozisyon Süresi" description="Saat cinsinden (0 = limitsiz)">
                                <NumInput
                                  value={getParam("max_position_hours", 0) as number}
                                  onChange={v => setParam("max_position_hours", v)}
                                  min={0} max={168} step={1}
                                  suffix="saat"
                                />
                              </Field>
                              
                              {/* Günlük Max İşlem */}
                              <Field label="Günlük Max İşlem" description="0 = limitsiz">
                                <NumInput
                                  value={getParam("max_trades_per_day", 0) as number}
                                  onChange={v => setParam("max_trades_per_day", v)}
                                  min={0} max={50} step={1}
                                  suffix="işlem"
                                />
                              </Field>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Dahili algoritma parametreleri — yalnızca builtin seçiliyken */}
                      {(!form.strategy_params.signal_source || form.strategy_params.signal_source === "builtin") && selectedStrategy.params.length > 0 && (
                        <div className="space-y-4">
                          {/* Sinyal mantığı açıklama kartı */}
                          <StrategySignalCard strategyId={form.strategy} getParam={getParam} />
                          <div className={`grid gap-4 ${form.strategy === "grid_bot" ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-2"}`}>
                            {selectedStrategy.params.map(param => (
                              <Field key={param.key} label={param.label} description={param.description}>
                                {param.type === "number" && (
                                  <NumInput
                                    value={getParam(param.key, param.default) as number}
                                    onChange={v => setParam(param.key, v)}
                                    min={param.min} max={param.max} step={param.step}
                                  />
                                )}
                                {param.type === "select" && (
                                  <SelectInput
                                    value={getParam(param.key, param.default) as string}
                                    onChange={v => setParam(param.key, v)}
                                    options={param.options!}
                                  />
                                )}
                                {param.type === "boolean" && (
                                  <Toggle
                                    checked={getParam(param.key, param.default) as boolean}
                                    onChange={v => setParam(param.key, v)}
                                    label={`${getParam(param.key, param.default) ? "Açık" : "Kapalı"}`}
                                  />
                                )}
                              </Field>
                            ))}
                          </div>
                          {/* Grid Bot görsel önizleme */}
                          {form.strategy === "grid_bot" && (
                            <GridBotVisualizer
                              upperPct={getParam("upper_pct", 5) as number}
                              lowerPct={getParam("lower_pct", 5) as number}
                              gridCount={getParam("grid_count", 20) as number}
                              perGridUsdt={getParam("per_grid_usdt", 10) as number}
                              feePct={getParam("trading_fee_pct", 0.06) as number}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* TradingView Webhook — kurulum kartı */}
                  {form.strategy === "tradingview_webhook" && (
                    <TradingViewWebhookCard
                      token={form.strategy_params.webhook_token as string || ""}
                      onTokenInit={t => setParam("webhook_token", t)}
                      direction={form.strategy_params.signal_mode === "buy_only" ? "buy_only" : form.strategy_params.signal_mode === "sell_only" ? "sell_only" : "both"}
                      onDirection={v => setParam("signal_mode", v === "both" ? "normal" : v)}
                      signalTimeframe={form.strategy_params.signal_timeframe as string || "5m"}
                      onSignalTimeframe={v => setParam("signal_timeframe", v)}
                      isEditing={!!editingBot}
                    />
                  )}

                  {/* ── Kar / Zarar (Grid Bot bu bölümü kendi param'larında yönetir) ── */}
                  {form.strategy !== "grid_bot" && <div className="p-4 rounded-xl border border-slate-700 bg-slate-900/30 space-y-4">
                    {/* Başlık + Manuel / AI toggle */}
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-slate-300">📊 Kar / Zarar Ayarları</p>
                      <div className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 p-0.5">
                        <button
                          type="button"
                          onClick={() => set("tp_sl_mode", "manual")}
                          className={`px-3 py-1 rounded-md text-[11px] font-medium transition-colors ${
                            form.tp_sl_mode === "manual"
                              ? "bg-slate-700 text-white"
                              : "text-slate-500 hover:text-slate-300"
                          }`}
                        >
                          ✏️ Manuel
                        </button>
                        <button
                          type="button"
                          onClick={() => set("tp_sl_mode", "auto")}
                          className={`px-3 py-1 rounded-md text-[11px] font-medium transition-colors ${
                            form.tp_sl_mode === "auto"
                              ? "bg-blue-600 text-white"
                              : "text-slate-500 hover:text-slate-300"
                          }`}
                        >
                          🤖 AI Otomatik
                        </button>
                      </div>
                    </div>

                    {/* AI öneri kartı */}
                    {form.tp_sl_mode === "auto" && (
                      <AiTpSlCard
                        symbol={form.symbol}
                        botId={editingBot?.id}
                        onApply={(tp, sl) => { set("tp_pct", tp); set("sl_pct", sl) }}
                      />
                    )}

                    {/* TP / SL giriş alanları — her iki modda da görünür (auto'da AI doldurur, elle de düzenlenebilir) */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <Field label="Take Profit %" description="Pozisyon kaç % kârda kapansın (0 = kapalı)">
                        <NumInput
                          value={form.tp_pct}
                          onChange={v => set("tp_pct", v)}
                          min={0} max={1000} step={0.1} suffix="%"
                        />
                      </Field>
                      <Field label="Stop Loss %" description="Pozisyon kaç % zararda kapansın (0 = kapalı)">
                        <NumInput
                          value={form.sl_pct}
                          onChange={v => set("sl_pct", v)}
                          min={0} max={1000} step={0.1} suffix="%"
                        />
                      </Field>
                      <Field label="Trailing Stop Loss" description="Stop fiyatı kâr peşinden sürüklensin">
                        <div className="pt-2">
                          <Toggle
                            checked={form.trailing_sl}
                            onChange={v => set("trailing_sl", v)}
                            label={form.trailing_sl ? "Açık" : "Kapalı"}
                          />
                        </div>
                      </Field>
                    </div>
                    {form.tp_sl_mode === "auto" && (
                      <p className="text-[10px] text-slate-500">
                        💡 AI tarafından önerilen değerler yukarıda uygulandı. Dilerseniz elle düzenleyebilirsiniz.
                      </p>
                    )}
                    {form.sl_pct > 0 && form.tp_pct > 0 && (
                      <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-xs grid grid-cols-3 gap-2 text-center">
                        <div>
                          <p className="text-slate-500">R/R Oranı</p>
                          <p className={`font-bold text-sm mt-0.5 ${(form.tp_pct/form.sl_pct) >= 2 ? "text-green-400" : "text-yellow-400"}`}>
                            1 : {(form.tp_pct / form.sl_pct).toFixed(1)}
                          </p>
                        </div>
                        <div>
                          <p className="text-slate-500">Max Kazanç</p>
                          <p className="font-bold text-sm mt-0.5 text-green-400">+{form.tp_pct}%</p>
                        </div>
                        <div>
                          <p className="text-slate-500">Max Kayıp</p>
                          <p className="font-bold text-sm mt-0.5 text-red-400">-{form.sl_pct}%</p>
                        </div>
                      </div>
                    )}
                  </div>}

                  {/* Özel Sinyal — nasıl çalışır bilgi kartı */}
                  {form.strategy === "custom_signal" && (
                    <div className="mt-3 p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 space-y-2">
                      <p className="text-xs font-semibold text-emerald-400">Nasıl Çalışır?</p>
                      <ol className="text-xs text-slate-400 space-y-1 list-decimal list-inside">
                        <li>Pro Chart'ı aç → sağ üstteki <span className="text-white font-medium">&lt;/&gt; Kod</span> butonuna bas.</li>
                        <li>Kendi JS indikatör kodunu yaz, return objesine <span className="text-emerald-300 font-medium">signals</span> ekle.</li>
                        <li>İndikatörü grafik menüsüne kaydet veya editörde çalıştır.</li>
                        <li>Sinyal tetiklenince bu bot otomatik işlem açar.</li>
                      </ol>
                      <div className="mt-2 p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-[11px] text-slate-400 font-mono leading-relaxed">
                        <span className="text-slate-600">// Örnek sinyal üretici kod</span><br/>
                        <span className="text-blue-400">return</span> {"{"} <span className="text-emerald-300">series</span>: [...], <span className="text-emerald-300">signals</span>: [<br/>
                        &nbsp;&nbsp;{"{"} <span className="text-yellow-300">type</span>: <span className="text-orange-300">&quot;buy&quot;</span>, <span className="text-yellow-300">bar_index</span>: -1, <span className="text-yellow-300">reason</span>: <span className="text-orange-300">&quot;Golden Cross&quot;</span> {"}"}<br/>
                        ] {"}"}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Adım 1: Sembol & Zaman ── */}
              {step === 1 && (
                <div className="space-y-5">
                  <Field label="Borsa" description="Botun işlem yapacağı borsa">
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { v: "mexc",   label: "MEXC",   icon: "🟢" },
                        { v: "bitget", label: "Bitget", icon: "🔵" },
                        { v: "binance", label: "Binance", icon: "🟡" },
                      ].map(o => (
                        <button key={o.v} onClick={() => set("exchange", o.v)}
                          className={`py-2.5 px-3 rounded-lg border text-sm font-medium transition-all ${
                            form.exchange === o.v
                              ? "border-blue-500/60 bg-blue-500/10 text-blue-300"
                              : "border-slate-800 text-slate-400 hover:border-slate-600 hover:text-white"
                          }`}>
                          <span className="mr-1.5">{o.icon}</span>{o.label}
                        </button>
                      ))}
                    </div>
                  </Field>

                  <Field label="İşlem Sembolü" description="Botun işlem yapacağı futures kontrat">
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-64 overflow-y-auto pr-1">
                      {SYMBOLS.map(s => (
                        <button key={s} onClick={() => set("symbol", s)}
                          className={`py-2 px-3 rounded-lg border text-sm font-medium transition-all ${
                            form.symbol === s
                              ? "border-blue-500/60 bg-blue-500/10 text-blue-300"
                              : "border-slate-800 text-slate-400 hover:border-slate-600 hover:text-white"
                          }`}>
                          {fmtSymbol(s)}
                        </button>
                      ))}
                    </div>
                  </Field>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <Field label="Pozisyon Yönü" description="Botun hangi yönde işlem yapacağı">
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { v:"both",  label:"Her İkisi", icon:"↕" },
                          { v:"long",  label:"Sadece Long",  icon:"↑" },
                          { v:"short", label:"Sadece Short", icon:"↓" },
                        ].map(o => (
                          <button key={o.v}
                            onClick={() => set("strategy_params" as any, { ...form.strategy_params, direction: o.v })}
                            className={`py-2 rounded-lg border text-xs font-medium transition-all ${
                              (form.strategy_params.direction ?? "both") === o.v
                                ? "border-blue-500/60 bg-blue-500/10 text-blue-300"
                                : "border-slate-800 text-slate-500 hover:border-slate-600"
                            }`}>
                            <div className="text-base">{o.icon}</div>
                            {o.label}
                          </button>
                        ))}
                      </div>
                    </Field>

                    <Field label="Maks. Eş Zamanlı Pozisyon">
                      <NumInput
                        value={form.max_positions}
                        onChange={v => set("max_positions", Math.max(1, Math.min(10, v)))}
                        min={1} max={10} suffix="adet"
                      />
                    </Field>
                  </div>

                  {/* Paper Trading */}
                  <div className={`p-4 rounded-xl border transition-all ${
                    form.paper_mode
                      ? "border-emerald-500/30 bg-emerald-500/5"
                      : "border-orange-500/30 bg-orange-500/5"
                  }`}>
                    <div className="flex items-start gap-3">
                      <Toggle checked={form.paper_mode} onChange={v => set("paper_mode", v)} />
                      <div>
                        <p className={`text-sm font-medium ${form.paper_mode ? "text-emerald-400" : "text-orange-400"}`}>
                          {form.paper_mode ? "🛡 Paper Trading (Simülasyon)" : "⚡ Gerçek İşlem"}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {form.paper_mode
                            ? "Gerçek para kullanılmaz. Stratejiyi güvenle test et."
                            : `Gerçek işlem açılır. ${form.exchange.toUpperCase()} API bağlantısı gereklidir.`}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Emir Türü */}
                  <div className="p-4 rounded-xl border border-slate-700/50 bg-slate-800/30">
                    <p className="text-sm font-medium text-slate-300 mb-3">📋 Emir Türü</p>
                    <div className="grid grid-cols-2 gap-2">
                      {(["market", "limit"] as const).map(t => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => set("order_type", t)}
                          className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                            form.order_type === t
                              ? "bg-blue-500/20 border-blue-500/50 text-blue-300 border"
                              : "bg-slate-800/50 border-slate-700/30 text-slate-400 border hover:border-slate-600"
                          }`}
                        >
                          {t === "market" ? "⚡ Market" : "📊 Limit"}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-slate-500 mt-2">
                      {form.order_type === "market"
                        ? "Anlık piyasa fiyatından işlem açılır. Hızlı ve garantili."
                        : "Sinyal fiyatından limit emir verilir. Daha iyi fiyat, ama dolmama riski var."}
                    </p>
                  </div>
                </div>
              )}

              {/* ── Adım 2: Risk & Para Yönetimi ── */}
              {step === 2 && (
                <div className="space-y-6">
                  {/* Grid bot: kaldıraç yok, yatırım özeti göster */}
                  {form.strategy === "grid_bot" ? (
                    <>
                      <div className="p-4 rounded-xl border border-cyan-500/20 bg-cyan-500/5 space-y-4">
                        <p className="text-sm font-medium text-cyan-300">⊞ Grid Bot — Para Yönetimi</p>
                        <p className="text-xs text-slate-400">Grid bot kaldıraçsız çalışır. Toplam yatırım, grid sayısı × grid başına USDT'den hesaplanır.</p>
                        <div className="grid grid-cols-3 gap-3 text-center">
                          {(() => {
                            const count = Number(form.strategy_params.grid_count ?? 20)
                            const perGrid = Number(form.strategy_params.per_grid_usdt ?? 10)
                            const total = count * perGrid
                            const upper = Number(form.strategy_params.upper_pct ?? 5)
                            const lower = Number(form.strategy_params.lower_pct ?? 5)
                            const stepPct = count > 0 ? (upper + lower) / count : 0
                            const profitPerGrid = perGrid * stepPct / 100
                            return (
                              <>
                                <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                                  <p className="text-[10px] text-slate-500">Toplam Yatırım</p>
                                  <p className="text-base font-bold text-white mt-0.5">${total.toLocaleString()}</p>
                                </div>
                                <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                                  <p className="text-[10px] text-slate-500">Grid Adımı</p>
                                  <p className="text-base font-bold text-cyan-400 mt-0.5">%{stepPct.toFixed(2)}</p>
                                </div>
                                <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                                  <p className="text-[10px] text-slate-500">Grid Başı Kâr</p>
                                  <p className="text-base font-bold text-green-400 mt-0.5">${profitPerGrid.toFixed(2)}</p>
                                </div>
                              </>
                            )
                          })()}
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                        <Field label="Günlük Max. Kayıp" description="Bu kayıptan sonra grid bot durur">
                          <NumInput value={form.max_daily_loss} onChange={v => set("max_daily_loss", v)} min={0.5} max={50} step={0.5} suffix="%" />
                        </Field>
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Kaldıraç & Marjin Tipi */}
                      <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/30 space-y-4">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-slate-300">Kaldıraç</p>
                          <div className="flex rounded-lg overflow-hidden border border-slate-700 text-xs">
                            <button
                              onClick={() => set("margin_type", "isolated" as "isolated" | "cross")}
                              className={`px-3 py-1.5 transition-colors ${form.margin_type === "isolated" ? "bg-blue-600 text-white" : "bg-slate-900 text-slate-400 hover:text-white"}`}
                            >Isolated</button>
                            <button
                              onClick={() => set("margin_type", "cross" as "isolated" | "cross")}
                              className={`px-3 py-1.5 transition-colors ${form.margin_type === "cross" ? "bg-orange-600 text-white" : "bg-slate-900 text-slate-400 hover:text-white"}`}
                            >Cross</button>
                          </div>
                        </div>
                        <LeverageSlider value={form.leverage} onChange={v => set("leverage", v)} />
                        {form.margin_type === "cross" && (
                          <p className="text-[10px] text-orange-400/80">⚠ Cross marjin: tüm bakiye teminat olarak kullanılır, tasfiye riski yüksektir.</p>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                        <Field label="Başlangıç Bakiyesi" description={
                          exchangeBalance != null
                            ? `${form.exchange.toUpperCase()} bakiyesi: $${exchangeBalance.toLocaleString("tr-TR", {maximumFractionDigits: 2})} USDT`
                            : balanceLoading ? "Bakiye sorgulanıyor..." : "Bot için ayrılan USDT miktarı"
                        }>
                          <NumInput value={form.initial_balance} onChange={v => set("initial_balance", v)} min={10} prefix="$" suffix="USDT" />
                        </Field>
                        <Field label="İşlem Başına Risk" description={form.risk_mode === "pct" ? "Bakiyenin kaçta biri riske atılsın" : "İşlem başına sabit USDT miktarı"}>
                          <div className="space-y-1.5">
                            <div className="flex rounded-lg overflow-hidden border border-slate-700 text-xs">
                              <button onClick={() => set("risk_mode", "pct" as RiskMode)} className={`flex-1 py-1.5 transition-colors ${form.risk_mode === "pct" ? "bg-blue-600 text-white" : "bg-slate-900 text-slate-400 hover:text-white"}`}>% Yüzde</button>
                              <button onClick={() => set("risk_mode", "usdt" as RiskMode)} className={`flex-1 py-1.5 transition-colors ${form.risk_mode === "usdt" ? "bg-blue-600 text-white" : "bg-slate-900 text-slate-400 hover:text-white"}`}>$ USDT</button>
                            </div>
                            <NumInput
                              value={form.risk_per_trade}
                              onChange={v => set("risk_per_trade", Math.max(0.01, v))}
                              min={0.01} max={form.risk_mode === "pct" ? 100 : form.initial_balance}
                              step={form.risk_mode === "pct" ? 0.1 : 1}
                              suffix={form.risk_mode === "pct" ? "%" : "USDT"}
                            />
                            {form.risk_mode === "usdt" && (
                              <p className="text-[10px] text-slate-600">≈ {((form.risk_per_trade / form.initial_balance) * 100).toFixed(2)}% bakiye</p>
                            )}
                          </div>
                        </Field>
                        <Field label="Günlük Max. Kayıp" description="Bu kayıptan sonra bot durur">
                          <NumInput value={form.max_daily_loss} onChange={v => set("max_daily_loss", v)} min={0.5} max={50} step={0.5} suffix="%" />
                        </Field>
                      </div>

                      <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-800 text-xs grid grid-cols-2 gap-3 text-center">
                        <div>
                          <p className="text-slate-500">İşlem Başına Risk</p>
                          <p className="font-bold text-base mt-0.5 text-white">${((form.initial_balance * form.risk_per_trade) / 100).toFixed(0)}</p>
                        </div>
                        <div>
                          <p className="text-slate-500">Tasfiye Mesafesi</p>
                          <p className="font-bold text-base mt-0.5 text-red-400">{(100 / form.leverage).toFixed(1)}%</p>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* ── Adım 3: Özet ── */}
              {step === 3 && (
                <div className="space-y-5">
                  <Field label="Bot Adı">
                    <input
                      value={form.name}
                      onChange={e => set("name", e.target.value)}
                      placeholder={`${selectedStrategy.name} Botu — ${form.symbol.replace("/USDT:USDT","")}`}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors placeholder-slate-600"
                    />
                  </Field>

                  {/* Özet kartlar */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {[
                      { label: "Strateji",   value: selectedStrategy.name,                   icon: selectedStrategy.icon },
                      { label: "Borsa",      value: form.exchange.toUpperCase(),             icon: "🏦" },
                      { label: "Sembol",     value: fmtSymbol(form.symbol),                       icon: "🪙" },
                      { label: "Kaldıraç",   value: `${form.leverage}x ${form.margin_type === "isolated" ? "Isolated" : "Cross"}`, icon: "⚡" },
                      { label: "Bakiye",     value: `$${form.initial_balance.toLocaleString()}`, icon: "💵" },
                      { label: "TP / SL",    value: `${form.tp_pct}% / ${form.sl_pct}%`,   icon: "🎯" },
                      { label: "Emir Türü",  value: form.order_type === "market" ? "Market" : "Limit", icon: "📋" },
                      { label: "Mod",        value: form.paper_mode ? "Paper" : "Gerçek",  icon: form.paper_mode ? "🛡" : "⚡" },
                    ].map(item => (
                      <div key={item.label} className="p-3 rounded-xl border border-slate-800 bg-slate-900/40">
                        <p className="text-slate-500 text-[10px]">{item.icon} {item.label}</p>
                        <p className="text-white text-sm font-semibold mt-0.5 truncate">{item.value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Strateji parametreleri özet */}
                  {Object.keys(form.strategy_params).length > 0 && (
                    <div className="p-3 rounded-xl border border-slate-800 bg-slate-900/30">
                      <p className="text-xs text-slate-500 mb-2 font-medium">Strateji Parametreleri</p>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(form.strategy_params).map(([k, v]) => {
                          const param = selectedStrategy.params.find(p => p.key === k)
                          return (
                            <span key={k} className="text-xs px-2 py-1 rounded bg-slate-800 text-slate-300">
                              <span className="text-slate-500">{param?.label ?? k}: </span>
                              {String(v)}
                            </span>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {!form.paper_mode && (
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-orange-500/10 border border-orange-500/20 text-xs text-orange-300">
                      <span className="shrink-0 mt-0.5">⚠</span>
                      <span>Gerçek işlem modu seçili. Bot başlatıldığında {form.exchange.toUpperCase()} API üzerinden gerçek emir açılır.</span>
                    </div>
                  )}
                  {error && (
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-300">
                      <span className="shrink-0 mt-0.5">✕</span>
                      <span>{error}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Alt navigasyon */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800 bg-slate-900/30 shrink-0">
              <button
                onClick={() => setStep(s => s - 1)}
                disabled={step === 0}
                className="px-4 py-2 rounded-lg border border-slate-700 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed text-sm transition-colors"
              >
                ← Geri
              </button>
              <div className="flex gap-1.5">
                {STEPS.map((_, i) => (
                  <div key={i} className={`w-1.5 h-1.5 rounded-full transition-all ${
                    i === step ? "bg-blue-500 w-4" : i < step ? "bg-slate-500" : "bg-slate-700"
                  }`} />
                ))}
              </div>
              {step < STEPS.length - 1 ? (
                <button
                  onClick={() => setStep(s => s + 1)}
                  disabled={!canNext()}
                  className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
                >
                  İleri →
                </button>
              ) : (
                <button
                  onClick={editingBot ? handleEdit : handleCreate}
                  disabled={!form.name || saving}
                  className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
                >
                  {saving ? "Kaydediliyor..." : editingBot ? "✓ Kaydet" : "✓ Botu Oluştur"}
                </button>
              )}
            </div>
          </div>
          </div>
        )}

        {/* ── Filtre Butonları ── */}
        {bots.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            {([
              { key: "all",     label: "Tümü",    count: bots.length },
              { key: "active",  label: "Aktif",   count: bots.filter(b => b.running).length },
              { key: "stopped", label: "Durdurulmuş", count: bots.filter(b => !b.running).length },
              { key: "paper",   label: "Paper",   count: bots.filter(b => b.paper_mode).length },
              { key: "live",    label: "Canlı",   count: bots.filter(b => !b.paper_mode).length },
            ] as const).map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                  filter === f.key
                    ? f.key === "active"  ? "bg-green-500/15 text-green-400 border-green-500/30"
                    : f.key === "stopped" ? "bg-slate-500/15 text-slate-300 border-slate-500/30"
                    : f.key === "paper"   ? "bg-yellow-500/15 text-yellow-400 border-yellow-500/30"
                    : f.key === "live"    ? "bg-blue-500/15 text-blue-400 border-blue-500/30"
                    : "bg-slate-700/50 text-white border-slate-600"
                    : "bg-transparent text-slate-500 border-slate-800 hover:text-slate-300 hover:border-slate-700"
                }`}
              >
                {f.label}
                <span className="ml-1.5 text-[10px] opacity-60">{f.count}</span>
              </button>
            ))}
          </div>
        )}

        {/* ── Bot Listesi ── */}
        {bots.length === 0 && !creating ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="text-5xl mb-4">🤖</div>
            <p className="text-slate-400 font-medium">Henüz bot yok</p>
            <p className="text-slate-600 text-sm mt-1">Yeni bot oluşturarak otomatik işleme başla</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {bots
              .filter(b =>
                filter === "all"     ? true :
                filter === "active"  ? b.running :
                filter === "stopped" ? !b.running :
                filter === "paper"   ? b.paper_mode :
                filter === "live"    ? !b.paper_mode : true
              )
              .map(bot => (
              <BotCard
                key={bot.id}
                bot={bot}
                onEdit={() => openEdit(bot)}
                onDelete={() => handleDelete(bot.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
