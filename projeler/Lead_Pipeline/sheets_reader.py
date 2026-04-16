"""
Lead Pipeline — Google Sheets Okuma Modülü (Birleşik)
CRM ve Notifier için ayrı spreadsheet'leri okuyabilir.
Cron-uyumlu: State'i Google Sheets _Meta tab'ında tutar (ephemeral FS koruması).
"""
import os
import sys
import json
import time
import logging
from typing import Optional
from datetime import datetime, timedelta, timezone

from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from config import Config

logger = logging.getLogger(__name__)

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets.readonly",
    "https://www.googleapis.com/auth/spreadsheets",  # _Meta tab yazımı için
]

_TRANSIENT_KEYWORDS = [
    "eof", "ssl", "broken pipe", "connection reset", "timeout",
    "connection aborted", "timed out", "502", "503", "429",
    "rate limit", "quota", "internal error", "backend error",
    "service unavailable", "bad gateway"
]
_MAX_RETRIES = 5

# CRM state: Google Sheets _Meta tab'ında saklanır (cron restart koruması)
_STATE_META_TAB = "_Meta"
_STATE_META_CELL = "A1"


class SheetsReader:
    """İki farklı spreadsheet'i okuyabilen birleşik reader."""

    def __init__(self, spreadsheet_id: str, sheet_tabs: list[dict], reader_name: str = "default", use_state_tab: bool = True):
        self.spreadsheet_id = spreadsheet_id
        self.sheet_tabs = sheet_tabs
        self.reader_name = reader_name
        self.use_state_tab = use_state_tab
        self.service = None
        self._creds = None
        self._last_row_counts: dict[str, int] = {}
        self._pending_counts: dict[str, int] = {}
        self._consecutive_errors = 0
        self._state_loaded = False

    # ── STATE YÖNETİMİ (Google Sheets _Meta tab) ────────────

    def _load_state_from_sheets(self):
        """Google Sheets _Meta tab'ından state yükler."""
        if self._state_loaded or not self.use_state_tab:
            self._state_loaded = True
            return

        try:
            result = (
                self.service.spreadsheets()
                .values()
                .get(
                    spreadsheetId=self.spreadsheet_id,
                    range=f"'{_STATE_META_TAB}'!A:B",
                )
                .execute()
            )
            values = result.get("values", [])
            for row in values:
                if len(row) >= 2:
                    key = f"{self.reader_name}:{row[0]}"
                    try:
                        self._last_row_counts[key] = int(row[1])
                    except ValueError:
                        continue
            logger.info(f"📂 [{self.reader_name}] State yüklendi (Sheets _Meta): {self._last_row_counts}")
        except HttpError as e:
            if e.resp.status == 400 or "Unable to parse range" in str(e):
                logger.info(f"📂 [{self.reader_name}] _Meta tab yok — ilk çalıştırma")
            else:
                logger.warning(f"⚠️ [{self.reader_name}] _Meta okunamadı: {e}")
        except Exception as e:
            logger.warning(f"⚠️ [{self.reader_name}] State yüklenemedi: {e}")

        # Fallback: env variable'dan dene
        env_key = f"LEAD_PIPELINE_STATE_{self.reader_name.upper()}"
        env_state = os.environ.get(env_key, "")
        if env_state and not self._last_row_counts:
            try:
                data = json.loads(env_state)
                self._last_row_counts = {f"{self.reader_name}:{k}": v for k, v in data.items()}
                logger.info(f"📂 [{self.reader_name}] State yüklendi (env fallback): {self._last_row_counts}")
            except json.JSONDecodeError:
                pass

        self._state_loaded = True

    def _save_state_to_sheets(self):
        """State'i Google Sheets _Meta tab'ına yazar."""
        if not self.use_state_tab:
            return

        # Env variable'a da yaz
        clean_state = {}
        for k, v in self._last_row_counts.items():
            tab_name = k.replace(f"{self.reader_name}:", "")
            clean_state[tab_name] = v

        env_key = f"LEAD_PIPELINE_STATE_{self.reader_name.upper()}"
        os.environ[env_key] = json.dumps(clean_state)

        # Google Sheets _Meta tab'ına yaz
        try:
            values = [[tab_name, str(count)] for tab_name, count in clean_state.items()]

            # _Meta tab yoksa oluşturmayı dene (yazma izni varsa)
            try:
                self.service.spreadsheets().values().update(
                    spreadsheetId=self.spreadsheet_id,
                    range=f"'{_STATE_META_TAB}'!A1",
                    valueInputOption="RAW",
                    body={"values": values},
                ).execute()
                logger.debug(f"✅ [{self.reader_name}] State kaydedildi (Sheets _Meta)")
            except HttpError as e:
                if "Unable to parse range" in str(e) or e.resp.status == 400:
                    try:
                        # Tab oluştur
                        self.service.spreadsheets().batchUpdate(
                            spreadsheetId=self.spreadsheet_id,
                            body={
                                "requests": [{
                                    "addSheet": {
                                        "properties": {"title": _STATE_META_TAB}
                                    }
                                }]
                            }
                        ).execute()
                        logger.info(f"✨ [{self.reader_name}] _Meta tab oluşturuldu")
                        # Tekrar güncelle
                        self.service.spreadsheets().values().update(
                            spreadsheetId=self.spreadsheet_id,
                            range=f"'{_STATE_META_TAB}'!A1",
                            valueInputOption="RAW",
                            body={"values": values},
                        ).execute()
                        logger.debug(f"✅ [{self.reader_name}] State kaydedildi (Sheets _Meta)")
                    except Exception as sub_e:
                        logger.info(f"📝 [{self.reader_name}] _Meta tab oluşturulamadı (readonly). Env fallback kullanılıyor. Hata: {sub_e}")
                else:
                    raise
        except Exception as e:
            logger.warning(f"⚠️ [{self.reader_name}] State kaydedilemedi: {e}")

    # Disk tabanlı fallback (lokal geliştirme için)
    def _load_state_from_disk(self):
        """Disk'ten state yükler (lokal dev için)."""
        state_file = os.path.join(os.path.dirname(__file__), f".state_{self.reader_name}.json")
        try:
            if os.path.exists(state_file):
                with open(state_file, "r") as f:
                    data = json.load(f)
                self._last_row_counts = {f"{self.reader_name}:{k}": v for k, v in data.items()}
                logger.info(f"📂 [{self.reader_name}] State yüklendi (disk): {self._last_row_counts}")
                self._state_loaded = True
        except Exception as e:
            logger.warning(f"⚠️ State dosyası okunamadı: {e}")

    def _save_state_to_disk(self):
        """State'i diske kaydeder (lokal dev için)."""
        state_file = os.path.join(os.path.dirname(__file__), f".state_{self.reader_name}.json")
        clean_state = {k.replace(f"{self.reader_name}:", ""): v for k, v in self._last_row_counts.items()}
        try:
            with open(state_file, "w") as f:
                json.dump(clean_state, f)
        except OSError:
            pass

    # ── HATA TESPİTİ ────────────────────────────────────────

    @staticmethod
    def _is_transient(err: Exception) -> bool:
        """Geçici (tekrar denenebilir) hata mı kontrol eder."""
        msg = str(err).lower()
        if any(kw in msg for kw in _TRANSIENT_KEYWORDS):
            return True
        if isinstance(err, HttpError):
            status = err.resp.status if hasattr(err, 'resp') else 0
            if status in (429, 500, 502, 503):
                return True
        return False

    # ── AUTHENTICATION ───────────────────────────────────────

    def _build_oauth_credentials(self, token_info: dict):
        """OAuth2 refresh token'dan credentials oluşturur."""
        from google.oauth2.credentials import Credentials as OAuthCredentials
        return OAuthCredentials(
            token=token_info.get("token"),
            refresh_token=token_info.get("refresh_token"),
            token_uri=token_info.get("token_uri", "https://oauth2.googleapis.com/token"),
            client_id=token_info.get("client_id"),
            client_secret=token_info.get("client_secret"),
            scopes=token_info.get("scopes", SCOPES),
        )

    def authenticate(self):
        """Google Sheets API'ye bağlanır. Öncelik: OAuth > ServiceAccount > Lokal."""

        # 1) OAuth Token (Production — Railway'de GOOGLE_OUTREACH_TOKEN_JSON)
        oauth_info = Config.get_oauth_token_info()
        if oauth_info:
            logger.info(f"🔑 [{self.reader_name}] OAuth token ile authentication")
            self._creds = self._build_oauth_credentials(oauth_info)
            self.service = build("sheets", "v4", credentials=self._creds)
            logger.info(f"✅ [{self.reader_name}] Google Sheets API bağlantısı kuruldu (OAuth)")
        else:
            # 2) Service Account
            sa_info = Config.get_google_credentials_info()
            if sa_info:
                from google.oauth2 import service_account
                logger.info(f"🔑 [{self.reader_name}] Service Account ile authentication")
                self._creds = service_account.Credentials.from_service_account_info(
                    sa_info, scopes=SCOPES
                )
                self.service = build("sheets", "v4", credentials=self._creds)
                logger.info(f"✅ [{self.reader_name}] Google Sheets API bağlantısı kuruldu (SA)")
            else:
                # 3) Lokal google_auth (geliştirme ortamı)
                logger.info(f"🔑 [{self.reader_name}] Merkezi google_auth ile authentication (Lokal)")
                _antigravity_root = os.path.abspath(
                    os.path.join(os.path.dirname(__file__), "..", "..")
                )
                sys.path.insert(0, os.path.join(
                    _antigravity_root, "_knowledge", "credentials", "oauth"
                ))
                from google_auth import get_sheets_service
                self.service = get_sheets_service("outreach")
                logger.info(f"✅ [{self.reader_name}] Google Sheets API bağlantısı kuruldu (Lokal)")

        # State'i yükle
        if not self._state_loaded:
            self._load_state_from_sheets()
            if not self._state_loaded:
                self._load_state_from_disk()

    def _reconnect(self):
        """API bağlantısını yeniden kurar."""
        logger.info(f"🔄 [{self.reader_name}] Yeniden bağlanılıyor...")
        self.service = None
        self.authenticate()

    # ── VERİ OKUMA ───────────────────────────────────────────

    def get_all_rows(self, tab_name: str) -> list[dict]:
        """Belirtilen tab'daki tüm satırları header'larla birlikte döner."""
        if not self.service:
            self.authenticate()

        last_err = None
        for attempt in range(_MAX_RETRIES):
            if attempt > 0:
                wait = min(2 ** attempt, 60)
                logger.warning(
                    f"⚠️ [{self.reader_name}] '{tab_name}' geçici hata, {wait}s sonra "
                    f"yeniden bağlanılıyor (deneme {attempt + 1}/{_MAX_RETRIES})..."
                )
                time.sleep(wait)
                try:
                    self._reconnect()
                except Exception:
                    continue

            try:
                result = (
                    self.service.spreadsheets()
                    .values()
                    .get(
                        spreadsheetId=self.spreadsheet_id,
                        range=f"'{tab_name}'!A:Z",
                    )
                    .execute()
                )

                values = result.get("values", [])
                if not values or len(values) < 2:
                    return []

                headers = values[0]
                rows = []
                for row_values in values[1:]:
                    row_dict = {}
                    for i, header in enumerate(headers):
                        row_dict[header] = row_values[i] if i < len(row_values) else ""
                    rows.append(row_dict)

                self._consecutive_errors = 0
                return rows

            except Exception as e:
                last_err = e
                if self._is_transient(e) and attempt < _MAX_RETRIES - 1:
                    continue
                self._consecutive_errors += 1
                raise

        raise last_err

    # ── YENİ SATIR TESPİTİ ──────────────────────────────────

    def get_new_rows(self, tab_name: str) -> list[dict]:
        """Sadece eklenen yeni satırları döner. State kapalıysa son N satırı döner."""
        all_rows = self.get_all_rows(tab_name)
        total = len(all_rows)

        # Eğer state kapalıysa (Notion'ı duplicate kaynağı olarak kullanıyorsak) her seferinde son 150 satırı dön.
        if not self.use_state_tab:
            fallback_count = min(150, total)
            logger.info(f"📊 [{self.reader_name}] '{tab_name}': State kapalı, son {fallback_count} satır çekildi (Duplicate kontrolüne gidecek).")
            return all_rows[-fallback_count:]

        state_key = f"{self.reader_name}:{tab_name}"
        last_count = self._last_row_counts.get(state_key, 0)

        if last_count == 0:
            # İlk çalıştırma — son 48 saatin satırlarını dene (CRM kalıntı kurtarma)
            self._pending_counts[state_key] = total

            recent_rows = self._filter_recent_rows(all_rows, hours=48)
            if recent_rows:
                logger.info(
                    f"📊 [{self.reader_name}] '{tab_name}': İlk çalıştırma — "
                    f"son 48 saatte {len(recent_rows)} satır (toplam: {total})"
                )
                return recent_rows

            # created_time yoksa güvenli fallback
            if total > 0:
                fallback_count = min(50, total)
                logger.info(
                    f"📊 [{self.reader_name}] '{tab_name}': İlk çalıştırma — "
                    f"son {fallback_count} satır (toplam: {total})"
                )
                return all_rows[-fallback_count:]

            return []

        if total > last_count:
            new_rows = all_rows[last_count:]
            self._pending_counts[state_key] = total
            logger.info(
                f"📊 [{self.reader_name}] '{tab_name}': {len(new_rows)} yeni satır (toplam: {total})"
            )
            return new_rows

        if total < last_count:
            logger.warning(
                f"⚠️ [{self.reader_name}] '{tab_name}': Satır azaldı ({last_count} → {total})"
            )
            self._pending_counts[state_key] = total
            return []

        self._pending_counts[state_key] = total
        return []

    @staticmethod
    def _filter_recent_rows(rows: list[dict], hours: int = 48) -> list[dict]:
        """created_time sütununa göre son N saat içindeki satırları filtreler."""
        cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
        recent = []
        for row in rows:
            raw_time = row.get("created_time", "")
            if not raw_time:
                continue
            try:
                dt = datetime.fromisoformat(raw_time)
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                if dt >= cutoff:
                    recent.append(row)
            except (ValueError, TypeError):
                continue
        return recent

    # ── STATE ONAY / GERİ ALMA ──────────────────────────────

    def confirm_processed(self):
        """Pending counts'u kalıcı yapar."""
        if not self.use_state_tab:
            return
        if self._pending_counts:
            self._last_row_counts.update(self._pending_counts)
            self._pending_counts.clear()
            self._save_state_to_sheets()
            self._save_state_to_disk()

    def rollback_pending(self):
        """Hata durumunda pending'i geri al."""
        if self._pending_counts:
            logger.info(f"↩️ [{self.reader_name}] Pending geri alındı: {self._pending_counts}")
            self._pending_counts.clear()

    # ── POLL ORCHESTRATOR ────────────────────────────────────

    def poll_all_tabs(self) -> list[dict]:
        """Tüm tab'ları tarar, yeni satırları toplar."""
        all_new = []
        had_error = False

        for tab_info in self.sheet_tabs:
            tab_name = tab_info["name"]
            try:
                new_rows = self.get_new_rows(tab_name)
                for row in new_rows:
                    row["_source_tab"] = tab_name
                all_new.extend(new_rows)
            except Exception as e:
                logger.error(f"❌ [{self.reader_name}] '{tab_name}' okunamadı: {e}")
                had_error = True
                continue

        if had_error and not all_new:
            raise RuntimeError(f"[{self.reader_name}] Tüm tab'lar okunamadı")

        return all_new
