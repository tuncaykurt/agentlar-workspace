"""
Lead Pipeline — Notion Yazma Modülü
Tele Satış CRM'den aynen taşındı. Duplikasyon kontrolü + Lead oluşturma.
"""
import re
import time
import logging

import requests
from requests.exceptions import ConnectionError, Timeout

from config import Config

logger = logging.getLogger(__name__)

NOTION_API_URL = "https://api.notion.com/v1"
WHATSAPP_BASE = "https://wa.me/"
NOTION_VERSION = "2022-06-28"

_RETRYABLE_STATUS_CODES = {429, 502, 503, 504}


class NotionWriter:
    """Notion CRM veritabanına lead ekler."""

    def __init__(self):
        self.headers = {
            "Authorization": f"Bearer {Config.NOTION_API_TOKEN}",
            "Content-Type": "application/json",
            "Notion-Version": NOTION_VERSION,
        }
        self.database_id = Config.NOTION_DATABASE_ID
        self._rate_limit_delay = Config.NOTION_RATE_LIMIT_DELAY
        self._max_retries = Config.NOTION_MAX_RETRIES

    @staticmethod
    def _build_whatsapp_link(phone: str) -> str:
        if not phone:
            return ""
        digits = re.sub(r"[^\d]", "", phone)
        return f"{WHATSAPP_BASE}{digits}" if digits else ""

    def _api_call(self, method: str, url: str, **kwargs) -> requests.Response:
        last_err = None
        for attempt in range(self._max_retries):
            try:
                if attempt > 0:
                    wait = 2 ** attempt
                    logger.warning(
                        f"⚠️ Notion API geçici hata, {wait}s sonra tekrar "
                        f"deneniyor (deneme {attempt + 1}/{self._max_retries})..."
                    )
                    time.sleep(wait)

                resp = getattr(requests, method)(url, headers=self.headers, **kwargs)

                if resp.status_code in _RETRYABLE_STATUS_CODES:
                    retry_after = float(resp.headers.get("Retry-After", 2 ** attempt))
                    logger.warning(f"⚠️ Notion {resp.status_code}, {retry_after}s bekleniyor...")
                    time.sleep(retry_after)
                    last_err = requests.HTTPError(response=resp)
                    continue

                resp.raise_for_status()
                time.sleep(self._rate_limit_delay)
                return resp

            except (ConnectionError, Timeout) as e:
                last_err = e
                if attempt < self._max_retries - 1:
                    continue
                raise

        if isinstance(last_err, requests.HTTPError):
            raise last_err
        raise last_err

    def _query_by_phone(self, phone: str) -> list[dict]:
        url = f"{NOTION_API_URL}/databases/{self.database_id}/query"
        payload = {"filter": {"property": "Phone", "phone_number": {"equals": phone}}, "page_size": 1}
        resp = self._api_call("post", url, json=payload)
        return resp.json().get("results", [])

    def _query_by_email(self, email: str) -> list[dict]:
        url = f"{NOTION_API_URL}/databases/{self.database_id}/query"
        payload = {"filter": {"property": "email", "email": {"equals": email}}, "page_size": 1}
        resp = self._api_call("post", url, json=payload)
        return resp.json().get("results", [])

    def _query_by_name(self, name: str) -> list[dict]:
        url = f"{NOTION_API_URL}/databases/{self.database_id}/query"
        payload = {"filter": {"property": "İsim", "title": {"equals": name}}, "page_size": 1}
        resp = self._api_call("post", url, json=payload)
        return resp.json().get("results", [])

    def bulk_check_duplicates(self, leads: list[dict]) -> tuple[set, set, set]:
        existing_phones = set()
        existing_emails = set()
        existing_names = set()

        if not leads:
            return existing_phones, existing_emails, existing_names

        batch_size = 30
        for i in range(0, len(leads), batch_size):
            batch = leads[i:i+batch_size]
            or_conditions = []

            for lead in batch:
                if lead["clean_phone"]:
                    or_conditions.append({"property": "Phone", "phone_number": {"equals": lead["clean_phone"]}})
                if lead["clean_email"]:
                    or_conditions.append({"property": "email", "email": {"equals": lead["clean_email"]}})
                if not lead["clean_phone"] and not lead["clean_email"] and lead["clean_name"]:
                    or_conditions.append({"property": "İsim", "title": {"equals": lead["clean_name"]}})

            if not or_conditions:
                continue

            payload = {"filter": {"or": or_conditions}, "page_size": 100}
            url = f"{NOTION_API_URL}/databases/{self.database_id}/query"

            has_more = True
            next_cursor = None
            while has_more:
                if next_cursor:
                    payload["start_cursor"] = next_cursor

                resp = self._api_call("post", url, json=payload)
                data = resp.json()
                results = data.get("results", [])

                for page in results:
                    props = page.get("properties", {})
                    phone_prop = props.get("Phone", {})
                    if phone_prop.get("phone_number"):
                        existing_phones.add(phone_prop["phone_number"])
                    email_prop = props.get("email", {})
                    if email_prop.get("email"):
                        existing_emails.add(email_prop["email"])
                    name_prop = props.get("İsim", {})
                    title_arr = name_prop.get("title", [])
                    if title_arr and title_arr[0].get("text", {}).get("content"):
                        existing_names.add(title_arr[0]["text"]["content"])

                has_more = data.get("has_more", False)
                next_cursor = data.get("next_cursor")

        return existing_phones, existing_emails, existing_names

    def check_duplicate(self, clean_email: str, clean_phone: str, clean_name: str = "") -> tuple[bool, str]:
        if clean_phone:
            results = self._query_by_phone(clean_phone)
            if results:
                return True, f"Telefon eşleşti ({clean_phone})"

        if clean_email:
            results = self._query_by_email(clean_email)
            if results:
                return True, f"Email eşleşti ({clean_email})"

        if not clean_phone and not clean_email and clean_name:
            results = self._query_by_name(clean_name)
            if results:
                return True, f"İsim eşleşti ({clean_name})"

        return False, ""

    def create_lead(self, cleaned_data: dict) -> dict:
        # ── SON SAVUNMA HATTI: İsim boşsa ASLA Notion'a yazma ──
        name = (cleaned_data.get("clean_name") or "").strip()
        if not name:
            logger.error(
                "🚫 create_lead REDDEDILDI: İsim boş. Notion'a 'İsimsiz Lead' yazılmayacak! "
                f"Raw: {cleaned_data.get('raw', {})}"
            )
            return {"id": None, "error": "İsim boş — yazım reddedildi"}

        url = f"{NOTION_API_URL}/pages"

        properties = {
            "İsim": {"title": [{"text": {"content": name}}]},
            "Durum": {"status": {"name": "Aranacak"}},
            "Komisyon": {"select": {"name": "Ödenmedi"}},
        }

        if cleaned_data["clean_email"]:
            properties["email"] = {"email": cleaned_data["clean_email"]}

        if cleaned_data["clean_phone"]:
            properties["Phone"] = {"phone_number": cleaned_data["clean_phone"]}
            wa_link = self._build_whatsapp_link(cleaned_data["clean_phone"])
            if wa_link:
                properties["WhatsApp Link"] = {"url": wa_link}

        if cleaned_data["clean_budget"]:
            properties["Bütçe"] = {"select": {"name": cleaned_data["clean_budget"]}}

        if cleaned_data.get("clean_timing"):
            properties["Ne zaman ulaşalım?"] = {"select": {"name": cleaned_data["clean_timing"]}}

        payload = {"parent": {"database_id": self.database_id}, "properties": properties}
        resp = self._api_call("post", url, json=payload)

        result = resp.json()
        logger.info(f"✅ Lead oluşturuldu: {cleaned_data['clean_name']} (ID: {result.get('id', '?')})")
        return result

    def process_lead(self, cleaned_data: dict, skip_duplicate_check: bool = False) -> dict:
        name = cleaned_data["clean_name"]
        email = cleaned_data["clean_email"]
        phone = cleaned_data["clean_phone"]

        try:
            if not skip_duplicate_check:
                is_dup, reason = self.check_duplicate(email, phone, name)
                if is_dup:
                    return {"action": "skipped", "name": name, "reason": reason}

            result = self.create_lead(cleaned_data)
            return {"action": "created", "name": name, "notion_id": result.get("id")}

        except (ConnectionError, Timeout) as e:
            logger.error(f"❌ Geçici ağ hatası ({name}): {e}")
            raise

        except requests.HTTPError as e:
            error_msg = str(e)
            try:
                error_body = e.response.json()
                error_msg = error_body.get("message", str(e))
            except Exception:
                pass

            logger.error(f"❌ Lead işlenirken hata: {name} — {error_msg}")
            return {"action": "error", "name": name, "error": error_msg}

        except Exception as e:
            logger.error(f"❌ Beklenmeyen hata: {name} — {e}")
            return {"action": "error", "name": name, "error": str(e)}
