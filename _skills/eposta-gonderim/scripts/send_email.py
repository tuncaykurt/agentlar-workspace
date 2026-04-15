import os
import sys
import argparse
import base64
import json
import csv
from datetime import datetime
from email.mime.text import MIMEText

# Merkezi Google Auth modülünü import et
_antigravity_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
sys.path.insert(0, os.path.join(_antigravity_root, "_knowledge", "credentials", "oauth"))
from google_auth import get_gmail_service


def get_gmail_service_local():
    """Gets the Gmail API service via centralized auth."""
    return get_gmail_service("outreach")

def update_csv_status(csv_path, row_id, new_status, message):
    """Updates the target CSV file with Outreach Status, Date, and Message."""
    if not csv_path or not os.path.exists(csv_path):
        print(f"Warning: CSV file {csv_path} not provided or not found. Skipping status update.")
        return

    temp_csv_path = csv_path + ".tmp"
    fieldnames = []
    
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        if 'Outreach_Status' not in fieldnames: fieldnames.append('Outreach_Status')
        if 'Outreach_Date' not in fieldnames: fieldnames.append('Outreach_Date')
        if 'Personalized_Message' not in fieldnames: fieldnames.append('Personalized_Message')
        
    with open(csv_path, 'r', encoding='utf-8') as f_read, open(temp_csv_path, 'w', encoding='utf-8', newline='') as f_write:
        reader = csv.DictReader(f_read)
        writer = csv.DictWriter(f_write, fieldnames=fieldnames)
        writer.writeheader()
        
        for idx, row in enumerate(reader):
            if str(idx) == str(row_id):
                row['Outreach_Status'] = new_status
                row['Outreach_Date'] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                # Clean up newlines for safe CSV storage without heavy multi-line breaks
                row['Personalized_Message'] = message.replace('\n', '\\n') 
            writer.writerow(row)
            
    os.replace(temp_csv_path, csv_path)
    print(f"📝 CSV Tracker Updated: Row {row_id} marked as {new_status}")

def send_email(service, to, subject, body):
    """Sends the actual email via Gmail API."""
    try:
        message = MIMEText(body, 'html')
        message['to'] = to
        message['subject'] = subject
        # Encode as urlsafe base64 string
        raw = base64.urlsafe_b64encode(message.as_bytes()).decode()
        
        sent_message = service.users().messages().send(
            userId='me',
            body={'raw': raw}
        ).execute()
        return True, sent_message['id']
    except Exception as e:
        return False, str(e)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Outreach Engine - Email Sender")
    parser.add_argument('--to', required=True, help="Recipient email address")
    parser.add_argument('--subject', required=True, help="Email subject")
    parser.add_argument('--body', required=True, help="HTML body of the email")
    parser.add_argument('--csv', help="Path to the lead CSV file to update")
    parser.add_argument('--row_id', help="Row index (0-based, matching DictReader output) to update in CSV")
    
    args = parser.parse_args()
    
    print(f"🚀 Outreach Engine starting for {args.to}...")
    
    try:
        service = get_gmail_service_local()
    except Exception as e:
        print(f"❌ Failed to initialize Gmail Service: {e}")
        if args.csv and args.row_id is not None:
             update_csv_status(args.csv, args.row_id, "Failed (Auth Error)", args.body)
        exit(1)
        
    success, result = send_email(service, args.to, args.subject, args.body)
    
    if success:
        print(f"✅ Success. Sent message ID: {result}")
        status = "Sent"
    else:
        print(f"❌ Failed to send email: {result}")
        status = f"Failed ({result[:50]}...)"
        
    if args.csv and args.row_id is not None:
        update_csv_status(args.csv, args.row_id, status, args.body)
