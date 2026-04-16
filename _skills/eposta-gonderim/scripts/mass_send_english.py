import csv
import subprocess
import time
import os
import sys

# Paths
CSV_PATH = "./creator_outreach_tracking.csv"
SCRIPT_DIR = "./_skills"
TEMPLATE_PATH = "./outreach_template_v2.md"

if not os.path.exists(TEMPLATE_PATH):
    print(f"ERROR: Template not found at {TEMPLATE_PATH}")
    sys.exit(1)

TEMPLATE_SUBJECT = "Collaboration Inquiry - Sweatcoin"
TEMPLATE_BODY = """Hi {Name},

Hope you are doing well!

I’m [İSİM] from the Influencer Marketing team at Sweatcoin. I’ve been following your profile for a while and absolutely love the comedy videos and skits you post. You have a great way of turning everyday situations into genuinely funny and relatable content!

We would love to collaborate with you. We are looking for talented creators with your exact style to produce a short promotional video integrating Sweatcoin into one of your skits.

Could you please let me know your standard rate for a dedicated video integration (15-60 seconds, 9:16 vertical format)?

Feel free to send over your media kit or just let me know your initial pricing.

Looking forward to hearing from you and hopefully collaborating soon!

Best regards,

[İSİM SOYAD]
Influencer Marketing Team, Sweatcoin"""

HTML_BODY = TEMPLATE_BODY.replace("\n\n", "</p><p>").replace("\n", "<br>")
HTML_BODY = f"<p>{HTML_BODY}</p>"

print("Starting Mass Outreach using the validated English template...")

rows = []
with open(CSV_PATH, "r", encoding="utf-8") as f:
    reader = csv.reader(f)
    for row in reader:
        rows.append(row)

sent_count = 0
failed_count = 0

for i in range(2, len(rows)):
    row = rows[i]
    name = row[0]
    email = row[2]
    status = row[8] if len(row) > 8 else ""
    
    # Skip if already Sent or Failed
    if status.strip() != "":
        continue
        
    personalized_html = HTML_BODY.replace("{Name}", name)
    
    # send_email.py mapping handles 'row_id' offset correctly
    cmd = [
        "python3",
        "outreach/scripts/send_email.py",
        "--to", email,
        "--subject", TEMPLATE_SUBJECT,
        "--body", personalized_html,
        "--csv", "../Projeler/Swc_Email_Responder/creator_outreach_tracking.csv",
        "--row_id", str(i-1) 
    ]
    
    print(f"[{sent_count+failed_count+1}] Sending to {name} ({email}) ...")
    res = subprocess.run(cmd, cwd=SCRIPT_DIR, capture_output=True, text=True)
    
    if res.returncode == 0 and "Success" in res.stdout:
        print(f"  ✅ SUCCESS")
        sent_count += 1
    elif res.returncode == 0 and "Failed" in res.stdout:
        print(f"  ❌ FAILED (But script finished)")
        print(f"  Output: {res.stdout.strip()}")
        failed_count += 1
    else:
        print(f"  ❌ CRITICAL ERROR (Script crashed)")
        print(f"  Output: {res.stdout.strip()}")
        print(f"  Stderr: {res.stderr.strip()}")
        failed_count += 1
        
    time.sleep(2)

print(f"\\n--- OUTREACH COMPLETE ---")
print(f"Total Sent: {sent_count}")
print(f"Total Failed: {failed_count}")
