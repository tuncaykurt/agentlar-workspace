"""
Canlı Bahis Oran Manipülasyonu Tespit Dashboard'u

Çalıştırmak için:
    streamlit run dashboard/app.py
"""
import sys
import os
import time
import threading
from collections import deque
from datetime import datetime

import pandas as pd
import plotly.graph_objects as go
import plotly.express as px
import streamlit as st

# Proje kökünü path'e ekle
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config import (
    ANOMALY_THRESHOLD,
    CRITICAL_THRESHOLD,
    ALERT_COLORS,
    POLL_INTERVAL,
    USE_MOCK_DATA,
)
from detection.anomaly_detector import AnomalyDetector
from data.collector import get_data_stream
from utils.redis_store import RedisStore
from config import REDIS_HOST, REDIS_PORT, REDIS_DB, REDIS_PASSWORD

# ─────────────────────────────────────────────
#  SAYFA AYARI
# ─────────────────────────────────────────────
st.set_page_config(
    page_title="Bahis Manipülasyon Tespiti",
    page_icon="🎯",
    layout="wide",
    initial_sidebar_state="expanded",
)

st.markdown("""
<style>
    .stMetric { background: #1e1e2e; border-radius: 8px; padding: 10px; }
    .alert-critical { background: #e74c3c22; border-left: 4px solid #e74c3c; padding: 8px; }
    .alert-warning  { background: #e67e2222; border-left: 4px solid #e67e22; padding: 8px; }
    [data-testid="stSidebar"] { background: #12121f; }
</style>
""", unsafe_allow_html=True)

# ─────────────────────────────────────────────
#  SESSION STATE
# ─────────────────────────────────────────────
if "all_results" not in st.session_state:
    st.session_state.all_results: deque = deque(maxlen=2000)
if "alerts" not in st.session_state:
    st.session_state.alerts: deque = deque(maxlen=200)
if "running" not in st.session_state:
    st.session_state.running = False
if "detector" not in st.session_state:
    st.session_state.detector = AnomalyDetector()
if "store" not in st.session_state:
    st.session_state.store = RedisStore(
        host=REDIS_HOST,
        port=REDIS_PORT,
        db=REDIS_DB,
        password=REDIS_PASSWORD,
    )
if "tick_count" not in st.session_state:
    st.session_state.tick_count = 0

# ─────────────────────────────────────────────
#  SİDEBAR
# ─────────────────────────────────────────────
with st.sidebar:
    st.title("⚙️ Kontrol Paneli")

    mode_label = "MOCK" if USE_MOCK_DATA else "CANLI API"
    st.info(f"Mod: **{mode_label}**")

    redis_stats = st.session_state.store.get_stats()
    redis_status = "Bağlı" if redis_stats["connected"] else "In-Memory"
    st.metric("Redis", redis_status)

    st.divider()
    st.subheader("Eşik Değerleri")
    threshold = st.slider("Şüpheli eşiği", 0.40, 0.95, ANOMALY_THRESHOLD, 0.05)
    critical_t = st.slider("Kritik eşiği", 0.60, 0.99, CRITICAL_THRESHOLD, 0.05)

    st.divider()
    speed = st.select_slider(
        "Güncelleme hızı",
        options=[1, 2, 3, 5, 10],
        value=2,
        format_func=lambda x: f"{x}s"
    )

    st.divider()
    if st.button("🔴 Sıfırla", use_container_width=True):
        st.session_state.all_results.clear()
        st.session_state.alerts.clear()
        st.session_state.tick_count = 0
        st.session_state.detector = AnomalyDetector()
        st.rerun()

# ─────────────────────────────────────────────
#  BAŞLIK
# ─────────────────────────────────────────────
col_title, col_badge = st.columns([5, 1])
with col_title:
    st.title("🎯 Canlı Bahis Oran Manipülasyonu Tespiti")
    st.caption("NBA · Real-time anomaly detection · River HalfSpaceTrees")
with col_badge:
    st.markdown(
        f"<div style='text-align:right; color:#aaa; font-size:13px; margin-top:20px'>"
        f"{datetime.now().strftime('%H:%M:%S')}</div>",
        unsafe_allow_html=True
    )

# ─────────────────────────────────────────────
#  VERİ TOPLAMA (tek batch, her render'da)
# ─────────────────────────────────────────────
@st.cache_resource
def get_stream_generator():
    return get_data_stream()


def fetch_next_batch():
    """Generatordan bir batch alır ve detector'dan geçirir."""
    gen = get_stream_generator()
    batch = next(gen)
    results = st.session_state.detector.process_batch(batch)
    for r in results:
        r["threshold"] = threshold
        r["critical_threshold"] = critical_t
        st.session_state.all_results.append(r)
        st.session_state.tick_count += 1
        if r["anomaly_score"] >= threshold:
            r["is_alert"] = True
            st.session_state.alerts.append(r)
        else:
            r["is_alert"] = False
    st.session_state.store.push_batch(results)
    return results


fetch_next_batch()

# ─────────────────────────────────────────────
#  ÜST METRİKLER
# ─────────────────────────────────────────────
all_list = list(st.session_state.all_results)
alerts_list = list(st.session_state.alerts)

total_ticks = st.session_state.tick_count
total_alerts = len(alerts_list)
critical_alerts = sum(1 for a in alerts_list if a["anomaly_score"] >= critical_t)
avg_score = (
    sum(r["anomaly_score"] for r in all_list[-100:]) / min(len(all_list), 100)
    if all_list else 0
)

m1, m2, m3, m4, m5 = st.columns(5)
m1.metric("Toplam Tick", f"{total_ticks:,}")
m2.metric("Alarmlar", f"{total_alerts}", delta=f"+{min(total_alerts, 5)} son")
m3.metric("Kritik", f"{critical_alerts}", delta_color="inverse")
m4.metric("Ort. Anomali Skoru", f"{avg_score:.3f}")
m5.metric("Redis Alarmları", redis_stats["alert_count"])

st.divider()

# ─────────────────────────────────────────────
#  ANA İÇERİK: 2 SÜTUN
# ─────────────────────────────────────────────
left, right = st.columns([3, 2])

# ── SOL: Canlı Oran Tablosu ──────────────────
with left:
    st.subheader("📊 Canlı Oran Tablosu")

    if all_list:
        # Her event için en son sonucu al
        latest: dict[tuple, dict] = {}
        for r in reversed(all_list):
            k = (r["event_id"], r["bookmaker"])
            if k not in latest:
                latest[k] = r

        df = pd.DataFrame(latest.values())
        df = df[["home_team", "away_team", "bookmaker", "odds_home",
                  "odds_away", "pct_change", "anomaly_score", "alert_level",
                  "score_home", "score_away", "quarter"]]
        df.columns = ["Ev Sahibi", "Deplasman", "Büro", "Oran (Ev)",
                       "Oran (Dep)", "% Değişim", "Anomali Skoru", "Seviye",
                       "Skor (E)", "Skor (D)", "Devre"]
        df = df.sort_values("Anomali Skoru", ascending=False)

        def color_row(row):
            score = row["Anomali Skoru"]
            if score >= critical_t:
                return ["background-color: #e74c3c22"] * len(row)
            elif score >= threshold:
                return ["background-color: #e67e2222"] * len(row)
            return [""] * len(row)

        st.dataframe(
            df.style.apply(color_row, axis=1).format({
                "Oran (Ev)": "{:.3f}",
                "Oran (Dep)": "{:.3f}",
                "% Değişim": "{:.2f}%",
                "Anomali Skoru": "{:.4f}",
            }),
            height=400,
            use_container_width=True,
        )
    else:
        st.info("Veri bekleniyor...")

# ── SAĞ: Alarm Akışı ─────────────────────────
with right:
    st.subheader("🚨 Alarm Akışı")

    if alerts_list:
        for alert in reversed(alerts_list[-15:]):
            score = alert["anomaly_score"]
            level = alert["alert_level"]
            color = ALERT_COLORS.get(level, "#aaa")
            is_critical = score >= critical_t

            icon = "🔴" if is_critical else "🟡"
            ts = alert["timestamp"][:19].replace("T", " ")

            st.markdown(
                f"""
                <div style="border-left: 3px solid {color}; padding: 6px 10px;
                            margin-bottom: 6px; background: {color}11; border-radius: 4px;">
                <b>{icon} {alert['home_team']} vs {alert['away_team']}</b><br>
                <small>
                  Büro: <b>{alert['bookmaker']}</b> ·
                  Oran: <b>{alert['odds_home']:.3f}</b> ·
                  Δ: <b>{alert['pct_change']:+.2f}%</b><br>
                  Skor: {alert['anomaly_score']:.4f} · {level.upper()} · {ts}
                </small>
                </div>
                """,
                unsafe_allow_html=True,
            )
    else:
        st.success("Henüz alarm yok.")

st.divider()

# ─────────────────────────────────────────────
#  ANOMALI SKORU GRAFİĞİ
# ─────────────────────────────────────────────
st.subheader("📈 Anomali Skoru Zaman Serisi (Son 200 Tick)")

if len(all_list) > 10:
    recent = all_list[-200:]
    df_ts = pd.DataFrame(recent)
    df_ts["ts"] = pd.to_datetime(df_ts["timestamp"])

    fig = go.Figure()

    # Her event için ayrı çizgi
    for event_id in df_ts["event_id"].unique():
        subset = df_ts[df_ts["event_id"] == event_id]
        home = subset["home_team"].iloc[0]
        away = subset["away_team"].iloc[0]
        fig.add_trace(go.Scatter(
            x=subset["ts"],
            y=subset["anomaly_score"],
            mode="lines+markers",
            name=f"{home[:10]} vs {away[:10]}",
            line=dict(width=1.5),
            marker=dict(
                size=subset["anomaly_score"].apply(lambda s: 8 if s >= threshold else 4),
                color=subset["anomaly_score"].apply(
                    lambda s: "#e74c3c" if s >= critical_t
                    else "#e67e22" if s >= threshold
                    else "#2ecc71"
                ),
            )
        ))

    fig.add_hline(y=threshold, line_dash="dash", line_color="#e67e22",
                  annotation_text=f"Şüpheli ({threshold})")
    fig.add_hline(y=critical_t, line_dash="dash", line_color="#e74c3c",
                  annotation_text=f"Kritik ({critical_t})")

    fig.update_layout(
        paper_bgcolor="#0e0e1a",
        plot_bgcolor="#0e0e1a",
        font_color="#ddd",
        height=300,
        margin=dict(l=0, r=0, t=20, b=0),
        legend=dict(orientation="h", yanchor="bottom", y=1.02),
        xaxis=dict(gridcolor="#333"),
        yaxis=dict(gridcolor="#333", range=[0, 1]),
    )
    st.plotly_chart(fig, use_container_width=True)

# ─────────────────────────────────────────────
#  BÜRO KARŞILAŞTIRMA
# ─────────────────────────────────────────────
if all_list:
    st.subheader("🏪 Büro Bazlı Ortalama Anomali Skoru")
    df_bm = pd.DataFrame(all_list[-500:])
    bm_avg = df_bm.groupby("bookmaker")["anomaly_score"].mean().sort_values(ascending=False)

    fig2 = px.bar(
        bm_avg.reset_index(),
        x="bookmaker",
        y="anomaly_score",
        color="anomaly_score",
        color_continuous_scale=["#2ecc71", "#e67e22", "#e74c3c"],
        range_color=[0, 1],
    )
    fig2.add_hline(y=threshold, line_dash="dash", line_color="#e67e22")
    fig2.update_layout(
        paper_bgcolor="#0e0e1a",
        plot_bgcolor="#0e0e1a",
        font_color="#ddd",
        height=220,
        margin=dict(l=0, r=0, t=10, b=0),
        showlegend=False,
        coloraxis_showscale=False,
    )
    st.plotly_chart(fig2, use_container_width=True)

# ─────────────────────────────────────────────
#  OTOMATİK YENİLEME
# ─────────────────────────────────────────────
time.sleep(speed)
st.rerun()
