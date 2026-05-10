import sqlite3
import pprint

conn = sqlite3.connect('kripto_bot.db')
conn.row_factory = sqlite3.Row
cur = conn.cursor()

# Get tables
cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = [row['name'] for row in cur.fetchall()]
print("Tables:", tables)

# Check signal logs
if 'signallog' in tables:
    cur.execute("SELECT * FROM signallog ORDER BY id DESC LIMIT 5")
    print("SignalLogs:")
    for row in cur.fetchall():
        print(dict(row))

if 'bots' in tables:
    cur.execute("SELECT * FROM bots")
    print("Bots:")
    for row in cur.fetchall():
        print(dict(row))

if 'trades' in tables:
    cur.execute("SELECT * FROM trades ORDER BY id DESC LIMIT 5")
    print("Trades:")
    for row in cur.fetchall():
        print(dict(row))

conn.close()
