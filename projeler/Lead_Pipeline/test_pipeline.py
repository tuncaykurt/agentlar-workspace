import sys
import logging
from config import Config
from sheets_reader import SheetsReader
from notion_writer import NotionWriter

logging.basicConfig(level=logging.INFO)

def main():
    print("Initializing Reader...")
    reader = SheetsReader(
        spreadsheet_id=Config.CRM_SPREADSHEET_ID,
        sheet_tabs=Config.CRM_SHEET_TABS,
        reader_name="crm",
        use_state_tab=True
    )
    reader.authenticate()
    
    tab_name = Config.CRM_SHEET_TABS[0]["name"]
    print(f"Reading from Tab: {tab_name}")
    all_rows = reader.get_all_rows(tab_name)
    total_leads_in_sheet = len(all_rows)
    print(f"\nTotal Leads in Google Sheet: {total_leads_in_sheet}")
    
    print("\nState tracked by reader:")
    print(f"Reader last row counts: {reader._last_row_counts}")
    
    print("\nInitializing NotionWriter...")
    notion = NotionWriter()
    
    print("\nChecking Notion Database...")
    # Attempting to fetch all contacts from Notion takes a long time/API calls, but we can fast-check total
    # using a simple query loop
    
    has_more = True
    start_cursor = None
    notion_count = 0
    
    while has_more:
        body = {"page_size": 100}
        if start_cursor:
            body["start_cursor"] = start_cursor
            
        try:
            res = notion.notion.databases.query(
                database_id=Config.NOTION_DATABASE_ID,
                **body
            )
            results = res.get("results", [])
            notion_count += len(results)
            has_more = res.get("has_more", False)
            start_cursor = res.get("next_cursor")
        except Exception as e:
            print(f"Failed to query Notion: {e}")
            break
            
    print(f"\nTotal Leads in Notion Database: {notion_count}")
    print(f"\nGap: {total_leads_in_sheet - notion_count} leads")

if __name__ == "__main__":
    main()
