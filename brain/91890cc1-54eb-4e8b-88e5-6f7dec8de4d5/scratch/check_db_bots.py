import sqlite3
import os

db_path = r'c:\Users\user\Desktop\Antigravity\projeler\Kripto_Bot_Platform\backend\kripto_bot.db'

def check_bots():
    if not os.path.exists(db_path):
        print(f"Database not found at {db_path}")
        return
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute('SELECT name FROM sqlite_master WHERE type="table"')
    tables = cursor.fetchall()
    print("Tables:", tables)
    
    # Try to find a bot related table
    bot_table = None
    for table in tables:
        if 'bot' in table[0].lower():
            bot_table = table[0]
            break
    
    if bot_table:
        print(f"Querying {bot_table}...")
        cursor.execute(f'SELECT * FROM {bot_table} LIMIT 1')
        print("Sample:", cursor.fetchone())
    conn.close()

if __name__ == "__main__":
    check_bots()
