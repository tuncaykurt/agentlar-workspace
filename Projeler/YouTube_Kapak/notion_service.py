import os
import json
import requests
from dotenv import load_dotenv

load_dotenv()

NOTION_TOKEN = os.getenv("NOTION_TOKEN")
DATABASE_ID = os.getenv("NOTION_DATABASE_ID")

# YouTube DB property map (farklı Reels'den)
TITLE_PROPERTY = "Video Adı"       # Reels'de "Name"
STATUS_PROPERTY = "Durum"           # Reels'de "Status"
READY_STATUS = "Çekildi"            # Reels'de "Çekildi - Edit YOK"
DRIVE_PROPERTY = "Drive"            # Aynı


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
    
    try:
        response = requests.get(url, headers=headers)
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
    Fetches videos from the YouTube database that have their status set to 'Çekildi'.
    YouTube DB uses 'Video Adı' (title) and 'Durum' (select) properties.
    """
    if not NOTION_TOKEN or not DATABASE_ID:
        print("Notion Token or Database ID is missing. Check .env")
        return []

    print(f"📺 Querying YouTube database: {DATABASE_ID} for '{READY_STATUS}' videos...")
    try:
        url = f"https://api.notion.com/v1/databases/{DATABASE_ID}/query"
        headers = {
            "Authorization": f"Bearer {NOTION_TOKEN}",
            "Content-Type": "application/json",
            "Notion-Version": "2022-06-28"
        }
        payload = {
            "filter": {
                "property": STATUS_PROPERTY,
                "select": {
                    "equals": READY_STATUS
                }
            }
        }
        
        response = requests.post(url, headers=headers, json=payload)
        
        if response.status_code != 200:
            print(f"Error querying Notion API: {response.status_code} - {response.text}")
            return []
            
        data = response.json()
        results = data.get("results", [])
        videos = []
        
        for item in results:
            props = item.get("properties", {})
            
            # YouTube DB uses "Video Adı" (title)
            name_prop = props.get(TITLE_PROPERTY, {}).get("title", [])
            name = name_prop[0].get("plain_text", "Unknown Video") if name_prop else "Unknown Video"
            
            # Drive URL
            drive_url = props.get(DRIVE_PROPERTY, {}).get("url", "")
            
            # Extract the page content (script)
            script_text = get_page_content(item["id"])

            videos.append({
                "id": item["id"],
                "name": name,
                "drive_url": drive_url,
                "script_text": script_text
            })
            
        print(f"Found {len(videos)} YouTube videos ready for cover generation.")
        return videos

    except Exception as e:
        print(f"Exception querying Notion API: {e}")
        return []


def _build_revision_blocks(themes_with_links: list) -> list:
    """
    Builds Notion block children for the YouTube revision panel.
    """
    blocks = []
    
    # Divider
    blocks.append({"object": "block", "type": "divider", "divider": {}})
    
    # Panel header
    blocks.append({
        "object": "block",
        "type": "heading_2",
        "heading_2": {
            "rich_text": [{"type": "text", "text": {"content": "🎬 YOUTUBE KAPAK REVİZYON PANELİ"}}]
        }
    })
    
    # Info text
    blocks.append({
        "object": "block",
        "type": "paragraph",
        "paragraph": {
            "rich_text": [
                {"type": "text", "text": {"content": "Aşağıdaki YouTube thumbnail kapaklarını inceleyip, revize etmek istediğin kapağın "}, "annotations": {"color": "gray"}},
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
            link_parts.pop()
        
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
    Adds a structured revision panel to a Notion page for YouTube thumbnails.
    """
    url = f"https://api.notion.com/v1/blocks/{page_id}/children"
    headers = {
        "Authorization": f"Bearer {NOTION_TOKEN}",
        "Content-Type": "application/json",
        "Notion-Version": "2022-06-28"
    }
    
    blocks = _build_revision_blocks(themes_with_links)
    
    try:
        response = requests.patch(url, headers=headers, json={"children": blocks})
        if response.status_code == 200:
            print(f"✅ YouTube revizyon paneli Notion sayfasına eklendi: {page_id}")
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
    Same logic as Reels version.
    """
    url = f"https://api.notion.com/v1/blocks/{page_id}/children?page_size=100"
    headers = {
        "Authorization": f"Bearer {NOTION_TOKEN}",
        "Notion-Version": "2022-06-28"
    }
    
    try:
        response = requests.get(url, headers=headers)
        if response.status_code != 200:
            print(f"❌ Notion blokları okunamadı: {response.status_code}")
            return []
        
        blocks = response.json().get("results", [])
        feedbacks = []
        
        i = 0
        while i < len(blocks):
            block = blocks[i]
            
            if block.get("type") == "heading_3":
                heading_text = ""
                for rt in block.get("heading_3", {}).get("rich_text", []):
                    heading_text += rt.get("plain_text", "")
                
                if heading_text.startswith("🎨 Tema"):
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
                            
                            if "📎 Kapaklar:" in para_text:
                                for rt in next_block.get("paragraph", {}).get("rich_text", []):
                                    link = rt.get("text", {}).get("link")
                                    if link and link.get("url"):
                                        drive_links.append(rt["text"]["link"]["url"])
                            
                            if "✏️ Revize:" in para_text:
                                feedback_block_id = next_block["id"]
                                raw_feedback = para_text.replace("✏️ Revize:", "").strip()
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
        response = requests.patch(url, headers=headers, json=payload)
        return response.status_code == 200
    except Exception as e:
        print(f"❌ Feedback bloğu güncellenemedi: {e}")
        return False


if __name__ == "__main__":
    ready_videos = get_ready_videos()
    print(json.dumps(ready_videos, indent=2, ensure_ascii=False))
