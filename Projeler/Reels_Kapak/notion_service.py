import os
import json
import requests
from dotenv import load_dotenv

load_dotenv()

NOTION_TOKEN = os.getenv("NOTION_TOKEN")
DATABASE_ID = os.getenv("NOTION_DATABASE_ID")

def get_page_content(page_id: str) -> str:
    """
    Fetches the blocks of a Notion page and extracts all text content 
    to be used as the video script context.
    """
    url = f"https://api.notion.com/v1/blocks/{page_id}/children"
    headers = {
        "Authorization": f"Bearer {NOTION_TOKEN}",
        "Notion-Version": "2022-06-28"
    }
    
    # We use requests directly for simplicity and robustness
    try:
        response = requests.get(url, headers=headers, timeout=30)
        if response.status_code != 200:
            return ""
            
        data = response.json()
        script_text = ""
        
        for block in data.get("results", []):
            block_type = block.get("type")
            if block_type in block:
                rich_text = block[block_type].get("rich_text", [])
                for text_item in rich_text:
                    script_text += text_item.get("plain_text", "")
                script_text += "\n"
        
        return script_text.strip()
    except Exception as e:
        print(f"Error fetching page content for {page_id}: {e}")
        return ""

def get_ready_videos():
    """
    Fetches videos from the Notion database that have their status set to 'Çekildi - Edit YOK'.
    """
    if not NOTION_TOKEN or not DATABASE_ID:
        print("Notion Token or Database ID is missing. Check .env")
        return []

    print(f"Querying Notion database: {DATABASE_ID} for 'Çekildi - Edit YOK' videos...")
    try:
        url = f"https://api.notion.com/v1/databases/{DATABASE_ID}/query"
        headers = {
            "Authorization": f"Bearer {NOTION_TOKEN}",
            "Content-Type": "application/json",
            "Notion-Version": "2022-06-28"
        }
        payload = {
            "filter": {
                "property": "Status",
                "select": {
                    "equals": "Çekildi - Edit YOK"
                }
            }
        }
        
        response = requests.post(url, headers=headers, json=payload, timeout=30)
        
        if response.status_code != 200:
            print(f"Error querying Notion API: {response.status_code} - {response.text}")
            return []
            
        data = response.json()
        results = data.get("results", [])
        videos = []
        
        for item in results:
            props = item.get("properties", {})
            
            # This extracts the title/name. Property name might need adjustment based on the DB.
            name_prop = props.get("Name", {}).get("title", [])
            name = name_prop[0].get("plain_text", "Unknown Video") if name_prop else "Unknown Video"
            
            # Extract Drive URL (Update property name 'Drive' if different in user's DB)
            drive_url = props.get("Drive", {}).get("url", "")
            
            # Extract the page content (script)
            script_text = get_page_content(item["id"])

            videos.append({
                "id": item["id"],
                "name": name,
                "drive_url": drive_url,
                "script_text": script_text
            })
            
        print(f"Found {len(videos)} videos ready for cover generation.")
        return videos

    except Exception as e:
        print(f"Exception querying Notion API: {e}")
        return []

def _build_revision_blocks(themes_with_links: list) -> list:
    """
    Builds Notion block children for the revision panel.
    
    themes_with_links: list of dicts with keys:
        - theme_index (int): 1-based
        - theme_name (str): e.g. "shock"
        - cover_text (str): e.g. "AJANSA PARA VERME"
        - drive_links (list[dict]): [{variant: 1, url: "...", file_id: "..."}, ...]
    """
    blocks = []
    
    # Divider
    blocks.append({"object": "block", "type": "divider", "divider": {}})
    
    # Panel header
    blocks.append({
        "object": "block",
        "type": "heading_2",
        "heading_2": {
            "rich_text": [{"type": "text", "text": {"content": "📸 KAPAK REVİZYON PANELİ"}}]
        }
    })
    
    # Info text
    blocks.append({
        "object": "block",
        "type": "paragraph",
        "paragraph": {
            "rich_text": [
                {"type": "text", "text": {"content": "Aşağıdaki kapakları inceleyip, revize etmek istediğin kapağın "}, "annotations": {"color": "gray"}},
                {"type": "text", "text": {"content": "✏️ Revize:"}, "annotations": {"bold": True}},
                {"type": "text", "text": {"content": " satırına feedback yaz. Antigravity bu feedback'i okuyup görseli revize edecek."}, "annotations": {"color": "gray"}},
            ]
        }
    })
    
    for theme in themes_with_links:
        t_idx = theme["theme_index"]
        t_name = theme.get("theme_name", f"theme{t_idx}")
        cover_text = theme.get("cover_text", "?")
        drive_links = theme.get("drive_links", [])
        
        # Theme header
        blocks.append({
            "object": "block",
            "type": "heading_3",
            "heading_3": {
                "rich_text": [
                    {"type": "text", "text": {"content": f"🎨 Tema {t_idx} ({t_name}) — \"{cover_text}\""}}
                ]
            }
        })
        
        # Drive links line
        link_parts = []
        for dl in drive_links:
            variant = dl.get("variant", "?")
            url = dl.get("url", "")
            if url:
                link_parts.append({"type": "text", "text": {"content": f"V{variant}", "link": {"url": url}}, "annotations": {"bold": True, "color": "blue"}})
                link_parts.append({"type": "text", "text": {"content": "  |  "}})
        
        if link_parts and link_parts[-1]["text"]["content"] == "  |  ":
            link_parts.pop()  # Remove trailing separator
        
        link_parts.insert(0, {"type": "text", "text": {"content": "📎 Kapaklar: "}})
        
        blocks.append({
            "object": "block",
            "type": "paragraph",
            "paragraph": {"rich_text": link_parts}
        })
        
        # Feedback line (empty — user fills this in)
        blocks.append({
            "object": "block",
            "type": "paragraph",
            "paragraph": {
                "rich_text": [
                    {"type": "text", "text": {"content": "✏️ Revize: "}, "annotations": {"bold": True, "color": "orange"}},
                ]
            }
        })
        
        # Spacer
        blocks.append({"object": "block", "type": "paragraph", "paragraph": {"rich_text": []}})
    
    # Bottom divider
    blocks.append({"object": "block", "type": "divider", "divider": {}})
    
    return blocks


def add_revision_panel(page_id: str, themes_with_links: list) -> bool:
    """
    Adds a structured revision panel to a Notion page.
    
    Args:
        page_id: The Notion page ID
        themes_with_links: list of theme dicts with drive_links for each variant
    
    Returns:
        True if successful
    """
    url = f"https://api.notion.com/v1/blocks/{page_id}/children"
    headers = {
        "Authorization": f"Bearer {NOTION_TOKEN}",
        "Content-Type": "application/json",
        "Notion-Version": "2022-06-28"
    }
    
    blocks = _build_revision_blocks(themes_with_links)
    
    try:
        response = requests.patch(url, headers=headers, json={"children": blocks}, timeout=30)
        if response.status_code == 200:
            print(f"✅ Revizyon paneli Notion sayfasına eklendi: {page_id}")
            return True
        else:
            print(f"❌ Revizyon paneli eklenemedi: {response.status_code} - {response.text}")
            return False
    except Exception as e:
        print(f"❌ Revizyon paneli ekleme hatası: {e}")
        return False


def read_revision_feedback(page_id: str) -> list:
    """
    Reads the revision panel from a Notion page and extracts feedback.
    
    Scans all blocks for the pattern:
      heading_3 → "🎨 Tema X (...)" 
      paragraph → "📎 Kapaklar: ..."  (Drive links)
      paragraph → "✏️ Revize: <FEEDBACK>"
    
    Returns:
        list of dicts: [
            {
                "theme_index": 1,
                "theme_name": "shock",
                "cover_text": "AJANSA PARA VERME",
                "feedback": "Metni daha büyük yap",
                "drive_links": ["https://..."],
                "block_id": "abc123..."  # The feedback block ID for later update
            },
            ...
        ]
        Only includes entries where feedback is non-empty.
    """
    url = f"https://api.notion.com/v1/blocks/{page_id}/children?page_size=100"
    headers = {
        "Authorization": f"Bearer {NOTION_TOKEN}",
        "Notion-Version": "2022-06-28"
    }
    
    try:
        response = requests.get(url, headers=headers, timeout=30)
        if response.status_code != 200:
            print(f"❌ Notion blokları okunamadı: {response.status_code}")
            return []
        
        blocks = response.json().get("results", [])
        feedbacks = []
        
        i = 0
        while i < len(blocks):
            block = blocks[i]
            
            # Look for theme heading: "🎨 Tema X (...) — "..."" 
            if block.get("type") == "heading_3":
                heading_text = ""
                for rt in block.get("heading_3", {}).get("rich_text", []):
                    heading_text += rt.get("plain_text", "")
                
                if heading_text.startswith("🎨 Tema"):
                    # Parse theme info from heading
                    import re
                    match = re.match(r'🎨 Tema (\d+) \((\w+)\) — "(.+)"', heading_text)
                    if match:
                        theme_index = int(match.group(1))
                        theme_name = match.group(2)
                        cover_text = match.group(3)
                    else:
                        theme_index = 0
                        theme_name = "unknown"
                        cover_text = heading_text
                    
                    # Scan next blocks for drive links and feedback
                    drive_links = []
                    feedback_text = ""
                    feedback_block_id = None
                    
                    j = i + 1
                    while j < len(blocks) and j <= i + 4:
                        next_block = blocks[j]
                        if next_block.get("type") == "paragraph":
                            para_text = ""
                            for rt in next_block.get("paragraph", {}).get("rich_text", []):
                                para_text += rt.get("plain_text", "")
                            
                            # Drive links line
                            if "📎 Kapaklar:" in para_text:
                                for rt in next_block.get("paragraph", {}).get("rich_text", []):
                                    link = rt.get("text", {}).get("link")
                                    if link and link.get("url"):
                                        drive_links.append(rt["text"]["link"]["url"])
                            
                            # Feedback line
                            if "✏️ Revize:" in para_text:
                                feedback_block_id = next_block["id"]
                                # Extract text after "✏️ Revize: "
                                raw_feedback = para_text.replace("✏️ Revize:", "").strip()
                                # Also check if there's a "✅" (processed) or "⚠️" (error) marker
                                if raw_feedback and not raw_feedback.startswith("✅") and not raw_feedback.startswith("⚠️"):
                                    feedback_text = raw_feedback
                        j += 1
                    
                    if feedback_text:
                        feedbacks.append({
                            "theme_index": theme_index,
                            "theme_name": theme_name,
                            "cover_text": cover_text,
                            "feedback": feedback_text,
                            "drive_links": drive_links,
                            "block_id": feedback_block_id,
                        })
            i += 1
        
        print(f"📋 {len(feedbacks)} adet feedback bulundu.")
        return feedbacks
    
    except Exception as e:
        print(f"❌ Feedback okuma hatası: {e}")
        return []


def update_feedback_block(block_id: str, new_text: str, is_error: bool = False) -> bool:
    """
    Updates a feedback block to mark it as processed or errored.
    Replaces the content with "✅ Revize tamamlandı — <new_text>" or "⚠️ HATA: <new_text>"
    """
    url = f"https://api.notion.com/v1/blocks/{block_id}"
    headers = {
        "Authorization": f"Bearer {NOTION_TOKEN}",
        "Content-Type": "application/json",
        "Notion-Version": "2022-06-28"
    }
    
    prefix_text = "⚠️ HATA: " if is_error else "✅ Revize tamamlandı — "
    prefix_color = "red" if is_error else "green"
    
    payload = {
        "paragraph": {
            "rich_text": [
                {"type": "text", "text": {"content": prefix_text}, "annotations": {"bold": True, "color": prefix_color}},
                {"type": "text", "text": {"content": new_text}},
            ]
        }
    }
    
    try:
        response = requests.patch(url, headers=headers, json=payload, timeout=30)
        return response.status_code == 200
    except Exception as e:
        print(f"❌ Feedback bloğu güncellenemedi: {e}")
        return False


if __name__ == "__main__":
    ready_videos = get_ready_videos()
    print(json.dumps(ready_videos, indent=2, ensure_ascii=False))
