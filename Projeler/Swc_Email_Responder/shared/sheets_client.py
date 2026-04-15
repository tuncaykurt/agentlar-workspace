"""
Google Sheets Client — Outreach sheet okuma/yazma
===================================================
"YouTube Email Data" spreadsheet'i ile iletişim:
- Pending kontakları oku (email gönderilmemiş)
- Statü güncelle (email sent, replied vb.)
- Email template'ini oku ("Email Copies" sekmesinden)

Spreadsheet: https://docs.google.com/spreadsheets/d/BURAYA_KENDI_SHEET_ID_YAZIN

GERÇEK SHEET YAPISI (In EN, Roblox):
  A = Channel URL
  B = Number of Subscribers
  C = Email
  D = Channel Name
  E = Status

EMAIL COPIES YAPISI:
  Çok sütunlu: A=label, B=ilk outreach, C=interested yanıtı, D=username yanıtı
  NICHE bölümleri ile ayrılmış (MAKE MONEY APP, EARN BY WALKING, vb.)
  Variable: [username] → Channel Name

Auth: Merkezi google_auth modülü kullanılır.
      Token'lar _knowledge/credentials/oauth/ içindedir.
"""

import os
import sys

# google_auth'u import et (aynı dizindeki shared/google_auth.py)
try:
    from shared.google_auth import get_sheets_service, get_gmail_service
    from shared.api_utils import execute_google_api
except ImportError:
    # Doğrudan shared/ içinden çalıştırılıyorsa
    from google_auth import get_sheets_service, get_gmail_service
    from api_utils import execute_google_api

SPREADSHEET_ID = '1PpQFY7ybHkJXB6x_L_Sa58EdN714bJlbexJHA4kuir4'
SOURCE_SPREADSHEET_ID = '1AFaGyN2dQl-QUlv_kb9pXyPUqx2fbw34N_X4j94gXqg'

# Header cache — her seferinde API çağrısı yapmamak için
_headers_cache = {}


def authenticate_sheets(account: str = "swc"):
    """
    Google Sheets ve Gmail API bağlantısı kur — Merkezi token sistemi.
    
    Returns: (sheets_service, gmail_service) tuple
    """
    sheets_service = get_sheets_service(account)
    gmail_service = get_gmail_service(account)
    return sheets_service, gmail_service


def _col_index_to_letter(index):
    """0-indexed kolon numarasını harf'e çevir. 0=A, 1=B, ..., 25=Z"""
    return chr(65 + index)


def _get_column_map(sheets_service, tab_name):
    """Cached column map döndür."""
    if tab_name not in _headers_cache:
        headers = get_sheet_headers(sheets_service, tab_name)
        _headers_cache[tab_name] = _build_column_map(headers)
    return _headers_cache[tab_name]


def get_sheet_headers(sheets_service, tab_name):
    """
    Sekmenin header satırını (Row 1) oku.
    
    Returns: list of header strings
    """
    req = sheets_service.spreadsheets().values().get(
        spreadsheetId=SPREADSHEET_ID,
        range=f"'{tab_name}'!A1:Z1"
    )
    result = execute_google_api(req)
    values = result.get('values', [])
    return values[0] if values else []


def get_pending_contacts(sheets_service, tab_name="In EN, Roblox"):
    """
    Status sütunu boş OLAN VE email sütunu DOLU olan kişileri döndür.
    
    Returns: list of dicts
    """
    req = sheets_service.spreadsheets().values().get(
        spreadsheetId=SPREADSHEET_ID,
        range=f"'{tab_name}'!A1:Z"
    )
    result = execute_google_api(req)
    all_rows = result.get('values', [])
    
    if len(all_rows) < 2:
        return []
    
    headers = all_rows[0]
    col_map = _build_column_map(headers)
    pending = []
    
    status_idx = col_map.get('status', 4)
    email_idx = col_map.get('email', 2)
    
    for i, row in enumerate(all_rows[1:], start=2):
        status = _safe_get(row, status_idx).strip()
        email = _safe_get(row, email_idx).strip()
        
        # Status boş VE email dolu ise → gönderilmemiş
        if not status and email:
            contact = {
                "row": i,
                "channel_name": _safe_get(row, col_map.get('channel_name', 3)),
                "channel_url": _safe_get(row, col_map.get('channel_url', 0)),
                "subscribers": _safe_get(row, col_map.get('subscribers', 1)),
                "email": email,
                "status": status,
                "raw": row,
            }
            pending.append(contact)
    
    return pending


def get_email_sent_contacts(sheets_service, tab_name="In EN, Roblox"):
    """
    Status sütununda "email sent" yazan kişileri döndür — cevap takibi yapılacak.
    """
    req = sheets_service.spreadsheets().values().get(
        spreadsheetId=SPREADSHEET_ID,
        range=f"'{tab_name}'!A1:Z"
    )
    result = execute_google_api(req)
    all_rows = result.get('values', [])
    
    if len(all_rows) < 2:
        return []
    
    headers = all_rows[0]
    col_map = _build_column_map(headers)
    sent_contacts = []
    
    status_idx = col_map.get('status', 4)
    email_idx = col_map.get('email', 2)
    
    for i, row in enumerate(all_rows[1:], start=2):
        status = _safe_get(row, status_idx).strip().lower()
        email = _safe_get(row, email_idx).strip()
        
        if status == "email sent" and email:
            contact = {
                "row": i,
                "channel_name": _safe_get(row, col_map.get('channel_name', 3)),
                "channel_url": _safe_get(row, col_map.get('channel_url', 0)),
                "subscribers": _safe_get(row, col_map.get('subscribers', 1)),
                "email": email,
                "status": _safe_get(row, status_idx),
                "raw": row,
            }
            sent_contacts.append(contact)
    
    return sent_contacts


def update_contact_status(sheets_service, tab_name, row, status):
    """
    Belirli bir satırın Status sütununu güncelle.
    Kolon harfi dinamik olarak header'dan belirlenir.
    
    Args:
        tab_name: Sekme adı
        row: 1-indexed satır numarası
        status: Yeni statü değeri (ör: "email sent", "Replied - Interested")
    """
    col_map = _get_column_map(sheets_service, tab_name)
    status_idx = col_map.get('status', 4)
    status_col = _col_index_to_letter(status_idx)
    
    range_status = f"'{tab_name}'!{status_col}{row}"
    req = sheets_service.spreadsheets().values().update(
        spreadsheetId=SPREADSHEET_ID,
        range=range_status,
        valueInputOption="USER_ENTERED",
        body={"values": [[status]]}
    )
    execute_google_api(req)
    
    print(f"  📋 Sheet güncellendi: Row {row} → {status_col}{row} = '{status}'")


def ensure_notes_column(sheets_service, tab_name):
    """
    'Notes' header yoksa ilk boş sütuna yaz, varsa mevcut index'i döndür.

    Returns: int (0-indexed column index for Notes)
    """
    headers = get_sheet_headers(sheets_service, tab_name)
    col_map = _build_column_map(headers)

    if 'notes' in col_map:
        return col_map['notes']

    # Notes sütunu yok → ilk boş sütuna yaz
    notes_idx = len(headers)
    notes_col = _col_index_to_letter(notes_idx)

    req = sheets_service.spreadsheets().values().update(
        spreadsheetId=SPREADSHEET_ID,
        range=f"'{tab_name}'!{notes_col}1",
        valueInputOption="USER_ENTERED",
        body={"values": [["Notes"]]}
    )
    execute_google_api(req)

    # Cache'i invalidate et
    _headers_cache.pop(tab_name, None)

    print(f"  📝 Notes sütunu oluşturuldu: {notes_col}1")
    return notes_idx


def update_contact_notes(sheets_service, tab_name, row, notes_text):
    """
    Belirli bir satırın Notes sütununu güncelle.
    Notes sütunu yoksa otomatik oluşturur.
    """
    notes_idx = ensure_notes_column(sheets_service, tab_name)
    notes_col = _col_index_to_letter(notes_idx)

    range_notes = f"'{tab_name}'!{notes_col}{row}"
    req = sheets_service.spreadsheets().values().update(
        spreadsheetId=SPREADSHEET_ID,
        range=range_notes,
        valueInputOption="USER_ENTERED",
        body={"values": [[notes_text]]}
    )
    execute_google_api(req)

    print(f"  📝 Notes güncellendi: Row {row} → {notes_col}{row}")


def get_email_template(sheets_service, niche_index=0):
    """
    "Email Copies" sekmesinden outreach template'ini oku.
    
    Sheet yapısı:
    - Birden fazla niche bölümü: "NICHE: MAKE MONEY APP", "NICHE: EARN BY WALKING", vb.
    - Her bölümde Column A = label (Subject, Body), Column B = outreach içeriği
    - niche_index: Hangi niche kullanılacak (0 = ilk bölüm)
    - Variable: [username] → run-time'da Channel Name ile değiştirilir
    
    Returns: dict {"subject": str, "body": str, "niche": str}
    """
    req = sheets_service.spreadsheets().values().get(
        spreadsheetId=SPREADSHEET_ID,
        range="'Email Copies'!A1:B100"
    )
    result = execute_google_api(req)
    rows = result.get('values', [])
    
    if not rows:
        raise ValueError("'Email Copies' sekmesi boş!")
    
    # Niche bölümlerini bul
    niche_starts = []
    for i, row in enumerate(rows):
        if len(row) > 1 and "NICHE:" in str(row[1]).upper():
            niche_starts.append(i)
    
    if not niche_starts:
        # Hiç niche bulunamazsa tüm sheet'i kullan
        section_rows = rows
        niche_name = "default"
    else:
        idx = min(niche_index, len(niche_starts) - 1)
        start = niche_starts[idx]
        end = niche_starts[idx + 1] if idx + 1 < len(niche_starts) else len(rows)
        section_rows = rows[start:end]
        niche_name = rows[niche_starts[idx]][1].replace("NICHE:", "").strip()
    
    template = {"subject": "", "body": "", "niche": niche_name}
    
    # Subject ve Body'yi parse et
    body_started = False
    body_lines = []
    
    for row in section_rows:
        label = row[0].strip().lower() if row else ""
        content = row[1].strip() if len(row) > 1 else ""
        
        if label == "subject":
            template["subject"] = content
            body_started = False
            continue
        
        if label == "body":
            body_started = True
            if content:
                body_lines.append(content)
            continue
        
        if body_started:
            # "Alternative pages" veya başka bir bölüm başlığına gelince dur
            if content and any(kw in content.lower() for kw in ["alternative page", "alternative link"]):
                break
            if content:
                body_lines.append(content)
            elif not label:
                # Boş satır = paragraf arası boşluk
                body_lines.append("")
    
    # Trailing boş satırları temizle + fazla boşlukları kaldır
    while body_lines and body_lines[-1] == "":
        body_lines.pop()
    
    # Boş satırları filtrele, \n\n ile birleştir (paragraf arası boşluk)
    body_lines = [line for line in body_lines if line.strip()]
    template["body"] = "\n\n".join(body_lines)
    
    if not template["subject"]:
        template["subject"] = "Collaboration Inquiry - Sweatcoin"
    
    print(f"  📧 Template yüklendi: Niche = '{niche_name}'")
    print(f"  📧 Subject = '{template['subject'][:60]}...'")
    print(f"  📝 Body uzunluğu: {len(template['body'])} karakter")
    
    return template


def _build_column_map(headers):
    """
    Header listesinden kolon isim → index eşlemesi oluştur.
    Spesifik pattern'ler önce kontrol edilir (ör: "channel url" → "channel" 'dan önce).
    """
    col_map = {}
    for i, h in enumerate(headers):
        h_lower = h.strip().lower()
        
        # En spesifik pattern'ler önce
        if "channel url" in h_lower:
            col_map.setdefault('channel_url', i)
        elif "channel name" in h_lower:
            col_map.setdefault('channel_name', i)
        elif any(kw in h_lower for kw in ["url", "link", "youtube"]):
            col_map.setdefault('channel_url', i)
        elif any(kw in h_lower for kw in ["subscriber", "sub", "abone", "number of"]):
            col_map.setdefault('subscribers', i)
        elif any(kw in h_lower for kw in ["email", "e-mail", "mail"]):
            col_map.setdefault('email', i)
        elif any(kw in h_lower for kw in ["status", "statü", "durum"]):
            col_map.setdefault('status', i)
        elif any(kw in h_lower for kw in ["name", "kanal", "channel"]):
            col_map.setdefault('channel_name', i)
        elif any(kw in h_lower for kw in ["note", "not", "açıklama", "comment"]):
            col_map.setdefault('notes', i)
        elif any(kw in h_lower for kw in ["admin", "hub", "joined"]):
            col_map.setdefault('admin_link', i)
        elif any(kw in h_lower for kw in ["fetched", "fetch date", "çekildi"]):
            col_map.setdefault('fetched', i)
        elif any(kw in h_lower for kw in ["reached out", "reached", "outreach date"]):
            col_map.setdefault('reached_out', i)
    
    return col_map


def _safe_get(lst, index, default=""):
    """Listeden güvenli değer al."""
    try:
        return lst[index] if index < len(lst) else default
    except (IndexError, TypeError):
        return default


# ═══════════════════════════════════════════════════════════════
# 📥 Kaynak Sheet (E-mail Çekme) — Veri Aktarma Fonksiyonları
# ═══════════════════════════════════════════════════════════════

def read_source_sheet_data(sheets_service_outreach):
    """
    Kaynak sheet'ten (E-mail Çekme, outreach hesabı) tüm verileri oku.
    
    Kaynak yapı:
      A = Channel URL
      B = Number of Subscribers
      C = Email
      D = Email 2 (atlanacak)
      E = Channel Name
      F = Status
    
    Returns: list of dicts [{url, subscribers, email, channel_name, status, row}, ...]
    """
    req = sheets_service_outreach.spreadsheets().values().get(
        spreadsheetId=SOURCE_SPREADSHEET_ID,
        range="'Sayfa1'!A1:F"
    )
    result = execute_google_api(req)
    all_rows = result.get('values', [])
    
    if len(all_rows) < 2:
        return []
    
    data = []
    for i, row in enumerate(all_rows[1:], start=2):
        url = _safe_get(row, 0).strip()
        subscribers = _safe_get(row, 1).strip()
        email = _safe_get(row, 2).strip()
        channel_name = _safe_get(row, 4).strip()
        status = _safe_get(row, 5).strip()
        
        if not url:  # URL olmadan satır anlamsız
            continue
        
        data.append({
            "url": url,
            "subscribers": subscribers,
            "email": email,
            "channel_name": channel_name,
            "status": status,
            "source_row": i,
        })
    
    return data


def get_existing_target_urls(sheets_service_swc, tab_name="In EN, Roblox"):
    """
    Hedef sheet'te zaten var olan Channel URL'leri set olarak döndür.
    Dedup için kullanılır.
    
    Returns: set of URL strings
    """
    req = sheets_service_swc.spreadsheets().values().get(
        spreadsheetId=SPREADSHEET_ID,
        range=f"'{tab_name}'!A:A"
    )
    result = execute_google_api(req)
    values = result.get('values', [])
    
    urls = set()
    for row in values[1:]:  # Header'ı atla
        if row and row[0].strip():
            urls.add(row[0].strip())
    
    return urls


def append_rows_to_target(sheets_service_swc, tab_name, rows_data, fetch_date):
    """
    Hedef sheet'e yeni satırlar ekle + Fetched tarihini yaz.
    
    Hedef yapı:
      A = Channel URL
      B = Number of Subscribers  
      C = Email
      D = Channel Name
      E = Status (boş bırak)
      F = Notes (boş bırak)
      G = Fetched (tarih)
      H = Reached out (boş bırak)
    
    Args:
        rows_data: list of dicts [{url, subscribers, email, channel_name}, ...]
        fetch_date: str, tarih formatı (DD/MM/YYYY)
    
    Returns: int, eklenen satır sayısı
    """
    if not rows_data:
        return 0
    
    values = []
    for r in rows_data:
        values.append([
            r["url"],
            r["subscribers"],
            r["email"],
            r["channel_name"],
            "",           # E: Status (boş)
            "",           # F: Notes (boş)
            fetch_date,   # G: Fetched
            "",           # H: Reached out (boş)
        ])
    
    req = sheets_service_swc.spreadsheets().values().append(
        spreadsheetId=SPREADSHEET_ID,
        range=f"'{tab_name}'!A:H",
        valueInputOption="USER_ENTERED",
        insertDataOption="INSERT_ROWS",
        body={"values": values}
    )
    result = execute_google_api(req)
    
    updated = result.get('updates', {}).get('updatedRows', len(values))
    print(f"  📥 {updated} satır hedef sheet'e eklendi (Fetched: {fetch_date})")
    return updated


def update_fetched_date(sheets_service_swc, tab_name, row, date_str):
    """
    Belirli bir satırın Fetched (G) sütununu güncelle.
    """
    col_map = _get_column_map(sheets_service_swc, tab_name)
    fetched_idx = col_map.get('fetched', 6)  # G sütunu varsayılan
    fetched_col = _col_index_to_letter(fetched_idx)
    
    range_cell = f"'{tab_name}'!{fetched_col}{row}"
    req = sheets_service_swc.spreadsheets().values().update(
        spreadsheetId=SPREADSHEET_ID,
        range=range_cell,
        valueInputOption="USER_ENTERED",
        body={"values": [[date_str]]}
    )
    execute_google_api(req)
    print(f"  📅 Fetched güncellendi: Row {row} → {fetched_col}{row} = '{date_str}'")


def update_reached_out_date(sheets_service_swc, tab_name, row, date_str):
    """
    Belirli bir satırın Reached Out (H) sütununu güncelle.
    """
    col_map = _get_column_map(sheets_service_swc, tab_name)
    reached_idx = col_map.get('reached_out', 7)  # H sütunu varsayılan
    reached_col = _col_index_to_letter(reached_idx)
    
    range_cell = f"'{tab_name}'!{reached_col}{row}"
    req = sheets_service_swc.spreadsheets().values().update(
        spreadsheetId=SPREADSHEET_ID,
        range=range_cell,
        valueInputOption="USER_ENTERED",
        body={"values": [[date_str]]}
    )
    execute_google_api(req)
    print(f"  📅 Reached Out güncellendi: Row {row} → {reached_col}{row} = '{date_str}'")


def get_fetched_yesterday_contacts(sheets_service_swc, tab_name, yesterday_str):
    """
    Dün Fetched edilen (G sütununda dünün tarihi olan) VE
    Status'u boş VE email'i dolu olan kişileri döndür.
    
    Args:
        yesterday_str: "DD/MM/YYYY" formatında dünün tarihi
    
    Returns: list of dicts
    """
    req = sheets_service_swc.spreadsheets().values().get(
        spreadsheetId=SPREADSHEET_ID,
        range=f"'{tab_name}'!A1:Z"
    )
    result = execute_google_api(req)
    all_rows = result.get('values', [])
    
    if len(all_rows) < 2:
        return []
    
    headers = all_rows[0]
    col_map = _build_column_map(headers)
    
    # Fetched sütunu index'i
    fetched_idx = None
    for i, h in enumerate(headers):
        if 'fetch' in h.strip().lower():
            fetched_idx = i
            break
    if fetched_idx is None:
        fetched_idx = 6  # G sütunu varsayılan
    
    status_idx = col_map.get('status', 4)
    email_idx = col_map.get('email', 2)
    
    contacts = []
    for i, row in enumerate(all_rows[1:], start=2):
        fetched = _safe_get(row, fetched_idx).strip()
        status = _safe_get(row, status_idx).strip()
        email = _safe_get(row, email_idx).strip()
        
        # Dün fetch edilmiş + status boş + email var
        if fetched == yesterday_str and not status and email:
            contacts.append({
                "row": i,
                "channel_name": _safe_get(row, col_map.get('channel_name', 3)),
                "channel_url": _safe_get(row, col_map.get('channel_url', 0)),
                "subscribers": _safe_get(row, col_map.get('subscribers', 1)),
                "email": email,
                "status": status,
                "raw": row,
            })
    
    return contacts
