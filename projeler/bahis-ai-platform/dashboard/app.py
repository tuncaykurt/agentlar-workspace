"""
AI Bahis Analiz Platformu — Ana Dashboard
Çalıştır: streamlit run dashboard/app.py
"""
import sys, os, json, logging
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import streamlit as st
import pandas as pd
from datetime import datetime, timezone

from config import LEAGUES, DEFAULT_LEAGUE, DEFAULT_SEASON, MAX_COMBO_SIZE, MIN_PROBABILITY, REDIS_HOST, REDIS_PORT, REDIS_PASSWORD, ANTHROPIC_API_KEY
from data.apis.football_api import FootballAPI
from data.cache import RedisCache
from analysis.ai.claude_analyzer import ClaudeAnalyzer
from analysis.match_pipeline import MatchPipeline
from combinations.builder import build_combinations, format_combo_output

logging.basicConfig(level=logging.INFO)

# ─────────────────────────────────────────────
#  MAÇ DURUM KODLARI
# ─────────────────────────────────────────────
FINISHED_STATUSES = {"FT", "AET", "PEN", "AWD", "WO"}
LIVE_STATUSES     = {"1H", "HT", "2H", "ET", "BT", "P", "SUSP", "INT", "LIVE"}

STATUS_LABELS = {
    "NS":   "Başlamadı",
    "TBD":  "Saat Belirsiz",
    "1H":   "1. Devre",
    "HT":   "Devre Arası",
    "2H":   "2. Devre",
    "ET":   "Uzatma",
    "P":    "Penaltılar",
    "FT":   "Bitti",
    "AET":  "Uzatmada Bitti",
    "PEN":  "Penaltıda Bitti",
    "PST":  "Ertelendi",
    "CANC": "İptal",
    "ABD":  "Yarıda Bırakıldı",
}

# ─────────────────────────────────────────────
#  KUPON DOSYASI
# ─────────────────────────────────────────────
OUTPUTS_DIR   = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "outputs")
COUPONS_FILE  = os.path.join(OUTPUTS_DIR, "coupons.json")
os.makedirs(OUTPUTS_DIR, exist_ok=True)


def load_coupons() -> list:
    if os.path.exists(COUPONS_FILE):
        try:
            with open(COUPONS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return []
    return []


def save_coupons(coupons: list):
    with open(COUPONS_FILE, "w", encoding="utf-8") as f:
        json.dump(coupons, f, ensure_ascii=False, indent=2)


def check_bet_result(bet_type: str, selection: str, home_goals: int, away_goals: int) -> bool:
    """Bahis seçeneğinin kazanıp kazanmadığını kontrol eder."""
    total = home_goals + away_goals
    s = selection.lower()

    if bet_type == "match_result_home" or "ev sahibi kazanır" in s:
        return home_goals > away_goals
    if bet_type == "match_result_draw" or s == "beraberlik" or "beraberlik" in s and "çifte" not in s:
        return home_goals == away_goals
    if bet_type == "match_result_away" or "deplasman kazanır" in s:
        return away_goals > home_goals
    if bet_type == "over_2_5" or "üst 2.5" in s:
        return total >= 3
    if bet_type == "under_2_5" or "alt 2.5" in s:
        return total <= 2
    if bet_type == "over_1_5" or "üst 1.5" in s:
        return total >= 2
    if bet_type == "under_1_5" or "alt 1.5" in s:
        return total <= 1
    if bet_type == "over_3_5" or "üst 3.5" in s:
        return total >= 4
    if bet_type == "btts_yes" or "karşılıklı gol var" in s:
        return home_goals > 0 and away_goals > 0
    if bet_type == "btts_no" or "karşılıklı gol yok" in s:
        return home_goals == 0 or away_goals == 0
    if bet_type == "double_1x" or "çifte şans 1x" in s:
        return home_goals >= away_goals
    if bet_type == "double_x2" or "çifte şans x2" in s:
        return away_goals >= home_goals
    return False


def update_coupon_statuses(coupons: list, api: FootballAPI) -> int:
    """API'den maç sonuçlarını çekip bekleyen kupon seçimlerini günceller.
    Güncellenen kupon sayısını döndürür."""
    updated = 0

    for coupon in coupons:
        if coupon.get("status") not in ("bekliyor",):
            continue

        changed   = False
        any_lost  = False
        all_done  = True

        for sel in coupon.get("selections", []):
            # Zaten sonuçlanmış seçim
            if sel.get("result") is not None:
                if sel["result"] is False:
                    any_lost = True
                continue

            fixture_id = sel.get("fixture_id")
            if not fixture_id:
                all_done = False
                continue

            fix_data = api.get_fixture_by_id(fixture_id)
            if not fix_data:
                all_done = False
                continue

            status_short = fix_data.get("fixture", {}).get("status", {}).get("short", "")
            if status_short in FINISHED_STATUSES:
                goals  = fix_data.get("goals", {})
                home_g = int(goals.get("home") or 0)
                away_g = int(goals.get("away") or 0)
                won = check_bet_result(sel.get("bet_type", ""), sel.get("selection", ""), home_g, away_g)
                sel["result"]    = won
                sel["score"]     = f"{home_g}-{away_g}"
                sel["settled_at"] = datetime.now(timezone.utc).isoformat()
                changed = True
                if not won:
                    any_lost = True
            else:
                all_done = False

        if changed:
            updated += 1

        # Kupon statüsünü güncelle
        if any_lost:
            coupon["status"] = "kaybetti"
        elif all_done and not any_lost:
            coupon["status"] = "kazandı"
        # else: bekliyor olarak kalır

    return updated


# ─────────────────────────────────────────────
#  SAYFA AYARI
# ─────────────────────────────────────────────
st.set_page_config(
    page_title="AI Bahis Analiz",
    page_icon="⚽",
    layout="wide",
    initial_sidebar_state="expanded",
)
st.markdown("""
<style>
.prob-high   { color: #2ecc71; font-weight: bold; }
.prob-med    { color: #f39c12; font-weight: bold; }
.prob-low    { color: #e74c3c; }
.bet-card    { background: #1a1a2e; border-radius: 8px; padding: 12px; margin: 6px 0; border-left: 3px solid #7c3aed; }
.combo-card  { background: #0f3460; border-radius: 8px; padding: 14px; margin: 8px 0; border-left: 4px solid #e94560; }
.won-badge   { background: #1e4d2b; color: #2ecc71; padding: 3px 10px; border-radius: 12px; font-weight: bold; font-size: 0.85em; }
.lost-badge  { background: #4d1e1e; color: #e74c3c; padding: 3px 10px; border-radius: 12px; font-weight: bold; font-size: 0.85em; }
.pend-badge  { background: #2e2e1e; color: #f39c12; padding: 3px 10px; border-radius: 12px; font-weight: bold; font-size: 0.85em; }
</style>
""", unsafe_allow_html=True)

# ─────────────────────────────────────────────
#  KAYNAKLAR (tek sefer yükle)
# ─────────────────────────────────────────────
@st.cache_resource
def get_resources():
    cache  = RedisCache(host=REDIS_HOST, port=REDIS_PORT, db=2, password=REDIS_PASSWORD)
    api    = FootballAPI(cache=cache)
    ai     = ClaudeAnalyzer(api_key=ANTHROPIC_API_KEY)
    return api, ai, cache

api, ai_analyzer, cache = get_resources()

# ─────────────────────────────────────────────
#  SİDEBAR
# ─────────────────────────────────────────────
with st.sidebar:
    st.title("⚽ AI Bahis Analiz")
    st.caption("Powered by API-Football + Claude AI")

    st.divider()
    league_name   = st.selectbox("Lig", list(LEAGUES.keys()), index=0)
    league_id     = LEAGUES[league_name]
    season        = st.number_input("Sezon", min_value=2020, max_value=2025, value=DEFAULT_SEASON)

    st.divider()
    st.subheader("Kombinasyon Ayarları")
    combo_size    = st.slider("Kombinasyon büyüklüğü", 2, MAX_COMBO_SIZE, 3)
    min_prob      = st.slider("Min. olasılık", 0.50, 0.85, MIN_PROBABILITY, 0.05, format="%.2f")
    top_n_combos  = st.slider("Kaç kombinasyon?", 3, 10, 5)

    st.divider()
    ai_status = "Claude AI Aktif" if ai_analyzer.is_available else "İstatistiksel Mod"
    st.info(f"Analiz: **{ai_status}**")

    quota = api.get_quota()
    remaining = 100 - quota.get("current", 0)
    st.metric("API İstek Hakkı", f"{remaining}/100")

# ─────────────────────────────────────────────
#  BAŞLIK
# ─────────────────────────────────────────────
st.title("⚽ AI Bahis Analiz Platformu")
st.caption(f"{league_name} · Sezon {season} · {datetime.now().strftime('%d.%m.%Y %H:%M')}")

tab1, tab2, tab3, tab4, tab5 = st.tabs([
    "📅 Günlük Analiz",
    "✅ Sonuçlanmış",
    "🎯 Kombinasyonlar",
    "🎟️ Kuponlar",
    "📺 Canlı Maçlar",
])

# ─────────────────────────────────────────────
#  TAB 1: GÜNLÜK ANALİZ (sadece başlamamış maçlar)
# ─────────────────────────────────────────────
with tab1:
    col1, col2 = st.columns([3, 1])
    with col1:
        selected_date = st.date_input("Tarih seç", value=datetime.now().date())
    with col2:
        st.write("")
        analyze_btn = st.button("Analiz Et", type="primary", use_container_width=True)

    if analyze_btn:
        # Önceki analiz sonuçlarını temizle — eski session state karışmasın
        st.session_state.pop("analyses", None)
        st.session_state.pop("finished_fixtures", None)

        date_str  = selected_date.strftime("%Y-%m-%d")
        pipeline  = MatchPipeline(api, ai_analyzer, season=season)

        with st.spinner(f"{date_str} tarihli {league_name} maçları yükleniyor..."):
            all_fixtures = api.get_fixtures_by_date(date_str, league_id=league_id, season=season)

        if not all_fixtures:
            st.warning(f"{date_str} tarihinde {league_name}'de maç bulunamadı.")
        else:
            # Maçları duruma göre ayır
            upcoming_fixtures = []
            finished_fixtures = []
            live_fixtures_tmp = []
            for f in all_fixtures:
                s = (f.get("fixture", {}).get("status", {}).get("short") or "").upper()
                if s in FINISHED_STATUSES:
                    finished_fixtures.append(f)
                elif s in LIVE_STATUSES:
                    live_fixtures_tmp.append(f)
                else:
                    # NS, TBD, PST ve diğer başlamamış durumlar
                    upcoming_fixtures.append(f)

            # Sonuçlanmış maçları session'a kaydet (Tab 2 için)
            st.session_state["finished_fixtures"] = finished_fixtures
            st.session_state["analysis_date"] = date_str

            info_parts = []
            if finished_fixtures:
                info_parts.append(f"{len(finished_fixtures)} sonuçlanmış (→ Sonuçlanmış sekmesi)")
            if live_fixtures_tmp:
                info_parts.append(f"{len(live_fixtures_tmp)} canlı oynanan (→ Canlı Maçlar sekmesi)")
            if info_parts:
                st.info("Filtrelendi: " + " · ".join(info_parts))

            if not upcoming_fixtures:
                st.warning(f"{date_str} tarihinde başlamamış {league_name} maçı bulunamadı.")
            else:
                st.success(f"{len(upcoming_fixtures)} başlamamış maç bulundu. Analiz başlıyor...")
                progress = st.progress(0)
                analyses = []

                for i, fix in enumerate(upcoming_fixtures):
                    with st.spinner(f"Analiz: {fix['teams']['home']['name']} vs {fix['teams']['away']['name']}"):
                        try:
                            result = pipeline.analyze_fixture(fix, league_id)
                            analyses.append(result)
                        except Exception as e:
                            st.error(f"Hata: {e}")
                    progress.progress((i + 1) / len(upcoming_fixtures))

                st.session_state["analyses"] = analyses
                st.session_state["combo_inputs"] = {
                    "combo_size": combo_size,
                    "min_prob":   min_prob,
                    "top_n":      top_n_combos,
                }
                progress.empty()
                st.success(f"{len(analyses)} maç analizi tamamlandı!")

    # Analiz sonuçlarını göster
    if "analyses" in st.session_state:
        for analysis in st.session_state["analyses"]:
            fix   = analysis["fixture"]
            # Güvenlik filtresi: eski session state'ten gelen biten/canlı maçları atla
            status_short = (fix.get("status") or "").upper()
            if status_short in FINISHED_STATUSES or status_short in LIVE_STATUSES:
                continue
            stat  = analysis["statistical"]
            ai_r  = analysis["ai_analysis"]
            probs = stat.get("probabilities", {})
            xg    = stat.get("expected_goals", {})

            with st.expander(
                f"⚽ {fix['home_team']} vs {fix['away_team']}  |  "
                f"{fix.get('date','')[:10]}  |  "
                f"xG: {xg.get('home',0):.2f} - {xg.get('away',0):.2f}",
                expanded=False
            ):
                c1, c2, c3 = st.columns(3)
                with c1:
                    st.metric("Ev Kazanır",  f"%{probs.get('home_win',0)*100:.1f}")
                    st.metric("Üst 2.5",     f"%{probs.get('over_2_5',0)*100:.1f}")
                with c2:
                    st.metric("Beraberlik",  f"%{probs.get('draw',0)*100:.1f}")
                    st.metric("Karşılıklı Gol", f"%{probs.get('btts_yes',0)*100:.1f}")
                with c3:
                    st.metric("Dep Kazanır", f"%{probs.get('away_win',0)*100:.1f}")
                    st.metric("Üst 1.5",     f"%{probs.get('over_1_5',0)*100:.1f}")

                st.divider()
                st.subheader("AI Önerileri")
                if ai_r.get("analysis_summary"):
                    st.info(ai_r["analysis_summary"])

                recs = ai_r.get("bet_recommendations", [])
                if recs:
                    rec_data = []
                    for r in recs:
                        prob = r.get("probability", 0)
                        rec_data.append({
                            "Bahis Türü": r.get("selection", ""),
                            "Olasılık":   f"%{prob*100:.1f}",
                            "Güven":      r.get("confidence", ""),
                            "Risk":       r.get("risk", ""),
                            "Gerekçe":    r.get("reasoning", "")[:100],
                        })
                    st.dataframe(pd.DataFrame(rec_data), use_container_width=True, hide_index=True)

                form = stat.get("form", {})
                h2h  = stat.get("h2h", {})
                st.caption(
                    f"Form → {fix['home_team']}: {form.get('home',0):.2f} | "
                    f"{fix['away_team']}: {form.get('away',0):.2f} | "
                    f"H2H ({h2h.get('total_h2h',0)} maç): "
                    f"Ev %{h2h.get('home_win_rate',0)*100:.0f} / "
                    f"Ber %{h2h.get('draw_rate',0)*100:.0f} / "
                    f"Dep %{h2h.get('away_win_rate',0)*100:.0f}"
                )

# ─────────────────────────────────────────────
#  TAB 2: SONUÇLANMIŞ MAÇLAR
# ─────────────────────────────────────────────
with tab2:
    st.header("✅ Sonuçlanmış Maçlar")

    finished = st.session_state.get("finished_fixtures", [])
    analysis_date = st.session_state.get("analysis_date", "")

    if not finished:
        st.info("Günlük Analiz sekmesinden bir tarih seçip 'Analiz Et' düğmesine basın.")
    else:
        st.caption(f"{analysis_date} tarihinde {len(finished)} maç sonuçlandı")

        rows = []
        for fix in finished:
            teams  = fix.get("teams", {})
            goals  = fix.get("goals", {})
            status = fix.get("fixture", {}).get("status", {})
            home   = teams.get("home", {}).get("name", "?")
            away   = teams.get("away", {}).get("name", "?")
            g_h    = int(goals.get("home") or 0)
            g_a    = int(goals.get("away") or 0)
            short  = status.get("short", "FT")
            label  = STATUS_LABELS.get(short, short)
            rows.append({
                "Ev Sahibi":  home,
                "Skor":       f"{g_h} - {g_a}",
                "Deplasman":  away,
                "Durum":      label,
            })

        df = pd.DataFrame(rows)
        st.dataframe(df, use_container_width=True, hide_index=True)

# ─────────────────────────────────────────────
#  TAB 3: KOMBİNASYONLAR
# ─────────────────────────────────────────────
with tab3:
    st.header("🎯 Kombinasyon Önerileri")

    if "analyses" not in st.session_state:
        st.info("Önce Günlük Analiz sekmesinden maç analizi yapın.")
    else:
        ci = st.session_state.get("combo_inputs", {})
        combos = build_combinations(
            st.session_state["analyses"],
            combo_size      = ci.get("combo_size", combo_size),
            min_probability = ci.get("min_prob", min_prob),
            top_n           = ci.get("top_n", top_n_combos),
        )

        if not combos:
            st.warning(f"Min. %{min_prob*100:.0f} olasılık eşiğini karşılayan yeterli seçenek bulunamadı.")
            st.info("Min. olasılık eşiğini düşürmeyi veya farklı bir tarih/lig seçmeyi deneyin.")
        else:
            st.success(f"{len(combos)} kombinasyon oluşturuldu.")
            for i, combo in enumerate(combos):
                with st.expander(
                    f"#{i+1} — {combo['combo_size']}lü Kombin | "
                    f"Toplam: %{combo['total_probability']*100:.2f} | "
                    f"EV: {combo['ev_score']:.4f}",
                    expanded=(i == 0)
                ):
                    for j, sel in enumerate(combo["selections"], 1):
                        prob  = sel["probability"]
                        color = "#2ecc71" if prob >= 0.70 else "#f39c12" if prob >= 0.60 else "#e74c3c"
                        st.markdown(
                            f"""<div style="border-left:3px solid {color}; padding:8px; margin:4px 0; background:#1a1a2e; border-radius:4px">
                            <b>{j}. {sel['match']}</b><br>
                            <span style="color:{color}">→ {sel['selection']} | %{prob*100:.1f}</span><br>
                            <small style="color:#aaa">{sel['reasoning'][:120]}</small>
                            </div>""",
                            unsafe_allow_html=True
                        )
                    st.caption(f"En düşük tekil olasılık: %{combo['min_prob']*100:.1f}")

                    # Kupona kaydet butonu
                    save_key = f"save_combo_{i}"
                    if st.button(f"🎟️ Kupona Kaydet #{i+1}", key=save_key):
                        coupons = load_coupons()
                        now_str = datetime.now().strftime("%Y%m%d_%H%M%S")
                        date_label = st.session_state.get("analysis_date", datetime.now().strftime("%Y-%m-%d"))
                        new_coupon = {
                            "id":          now_str,
                            "name":        f"Kombin #{i+1} — {date_label}",
                            "created_at":  datetime.now(timezone.utc).isoformat(),
                            "status":      "bekliyor",
                            "total_prob":  combo["total_probability"],
                            "selections":  [
                                {
                                    "match":      s["match"],
                                    "fixture_id": s.get("fixture_id"),
                                    "bet_type":   s.get("bet_type", ""),
                                    "selection":  s["selection"],
                                    "probability": s["probability"],
                                    "result":     None,
                                    "score":      None,
                                }
                                for s in combo["selections"]
                            ],
                        }
                        coupons.append(new_coupon)
                        save_coupons(coupons)
                        st.success(f"Kupon kaydedildi! → Kuponlar sekmesinden takip edebilirsiniz.")

# ─────────────────────────────────────────────
#  TAB 4: KUPONLAR
# ─────────────────────────────────────────────
with tab4:
    st.header("🎟️ Kaydedilmiş Kuponlar")

    col_refresh, col_delete = st.columns([2, 1])
    with col_refresh:
        if st.button("🔄 Sonuçları Güncelle", type="primary"):
            coupons = load_coupons()
            with st.spinner("Maç sonuçları kontrol ediliyor..."):
                updated = update_coupon_statuses(coupons, api)
            save_coupons(coupons)
            if updated:
                st.success(f"{updated} kuponda sonuç güncellendi!")
            else:
                st.info("Güncellenecek yeni sonuç bulunamadı.")

    with col_delete:
        if st.button("🗑️ Biten Kuponları Temizle"):
            coupons = load_coupons()
            before  = len(coupons)
            coupons = [c for c in coupons if c.get("status") == "bekliyor"]
            save_coupons(coupons)
            st.info(f"{before - len(coupons)} tamamlanmış kupon silindi.")

    st.divider()

    coupons = load_coupons()

    if not coupons:
        st.info("Henüz kaydedilmiş kupon yok. Kombinasyonlar sekmesinden 'Kupona Kaydet' düğmesini kullanın.")
    else:
        # Özet metrikler
        total    = len(coupons)
        bekliyor = sum(1 for c in coupons if c.get("status") == "bekliyor")
        kazandi  = sum(1 for c in coupons if c.get("status") == "kazandı")
        kaybetti = sum(1 for c in coupons if c.get("status") == "kaybetti")

        m1, m2, m3, m4 = st.columns(4)
        m1.metric("Toplam Kupon", total)
        m2.metric("Bekliyor",    bekliyor)
        m3.metric("Kazandı ✅",   kazandi)
        m4.metric("Kaybetti ❌",  kaybetti)

        st.divider()

        # Filtreleme
        filter_opt = st.radio(
            "Filtrele",
            ["Tümü", "Bekliyor", "Kazandı", "Kaybetti"],
            horizontal=True,
        )
        filter_map = {
            "Tümü": None,
            "Bekliyor":  "bekliyor",
            "Kazandı":   "kazandı",
            "Kaybetti":  "kaybetti",
        }
        shown = [c for c in reversed(coupons)
                 if filter_map[filter_opt] is None or c.get("status") == filter_map[filter_opt]]

        if not shown:
            st.info(f"'{filter_opt}' durumunda kupon yok.")

        for coupon in shown:
            status  = coupon.get("status", "bekliyor")
            badge   = {"bekliyor": "pend-badge", "kazandı": "won-badge", "kaybetti": "lost-badge"}.get(status, "pend-badge")
            icon    = {"bekliyor": "⏳", "kazandı": "✅", "kaybetti": "❌"}.get(status, "⏳")
            prob_pct = f"%{coupon.get('total_prob', 0)*100:.2f}"
            label   = f"{icon} {coupon.get('name','')}  |  Toplam Olasılık: {prob_pct}  |  " \
                      f"{coupon.get('created_at','')[:10]}"

            with st.expander(label, expanded=(status == "bekliyor")):
                st.markdown(
                    f'<span class="{badge}">{status.upper()}</span>',
                    unsafe_allow_html=True
                )
                st.write("")

                for sel in coupon.get("selections", []):
                    result = sel.get("result")
                    score  = sel.get("score", "")

                    if result is True:
                        sel_icon, sel_color = "✅", "#2ecc71"
                    elif result is False:
                        sel_icon, sel_color = "❌", "#e74c3c"
                    else:
                        sel_icon, sel_color = "⏳", "#f39c12"

                    score_txt = f" | Skor: **{score}**" if score else ""
                    st.markdown(
                        f"""<div style="border-left:3px solid {sel_color}; padding:8px; margin:4px 0; background:#1a1a2e; border-radius:4px">
                        {sel_icon} <b>{sel['match']}</b> — {sel['selection']}{score_txt}<br>
                        <small style="color:#888">Olasılık: %{sel.get('probability',0)*100:.1f}</small>
                        </div>""",
                        unsafe_allow_html=True
                    )

# ─────────────────────────────────────────────
#  TAB 5: CANLI MAÇLAR
# ─────────────────────────────────────────────
with tab5:
    st.header("📺 Canlı Maç Analizi")

    if st.button("Canlı Maçları Yükle", type="primary"):
        with st.spinner("Canlı maçlar yükleniyor..."):
            live_fixtures = api.get_live_fixtures(league_id=league_id)

        if not live_fixtures:
            st.info(f"Şu an {league_name}'de canlı maç yok.")
        else:
            pipeline = MatchPipeline(api, ai_analyzer, season=season)
            st.success(f"{len(live_fixtures)} canlı maç bulundu!")

            for fix in live_fixtures:
                teams  = fix.get("teams", {})
                goals  = fix.get("goals", {})
                status = fix.get("fixture", {}).get("status", {})
                home   = teams.get("home", {}).get("name", "?")
                away   = teams.get("away", {}).get("name", "?")
                g_h    = goals.get("home", 0) or 0
                g_a    = goals.get("away", 0) or 0
                minute = status.get("elapsed", 0) or 0

                with st.expander(
                    f"🔴 CANLI | {home} {g_h} - {g_a} {away}  ({minute}')",
                    expanded=True
                ):
                    col1, col2 = st.columns([2, 1])
                    with col1:
                        fid   = fix.get("fixture", {}).get("id")
                        stats = api.get_fixture_statistics(fid)
                        if stats:
                            stat_rows  = []
                            home_stats = {s["type"]: s["value"] for s in stats[0].get("statistics", [])} if stats else {}
                            away_stats = {s["type"]: s["value"] for s in stats[1].get("statistics", [])} if len(stats) > 1 else {}
                            for stat_key in ["Ball Possession", "Total Shots", "Shots on Goal", "Corner Kicks", "Yellow Cards"]:
                                stat_rows.append({
                                    home:        home_stats.get(stat_key, "-"),
                                    "İstatistik": stat_key,
                                    away:        away_stats.get(stat_key, "-"),
                                })
                            st.dataframe(pd.DataFrame(stat_rows), use_container_width=True, hide_index=True)

                    with col2:
                        with st.spinner("Analiz..."):
                            try:
                                live_analysis = pipeline.analyze_fixture(fix, league_id)
                                recs = live_analysis.get("ai_analysis", {}).get("bet_recommendations", [])
                                st.write("**Anlık Öneriler:**")
                                for r in recs[:3]:
                                    prob = r.get("probability", 0)
                                    st.write(f"• {r['selection']}: %{prob*100:.1f}")
                            except Exception as e:
                                st.error(str(e))
