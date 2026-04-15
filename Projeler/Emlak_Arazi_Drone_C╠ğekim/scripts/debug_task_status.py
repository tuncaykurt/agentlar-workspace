import os
import sys
import json
import requests
from src.config import KIE_AI_API_KEY as KIE_API_KEY

if not KIE_API_KEY:
    print("No KIE_API_KEY found.")
    sys.exit(1)

task_id = "ORNEK_TASK_ID"
endpoints = [
    f"https://api.kie.ai/api/v1/jobs/recordInfo?taskId={task_id}",
    f"https://api.kie.ai/api/v1/jobs/recordInfo?id={task_id}",
    f"https://api.kie.ai/api/v1/veo/recordInfo?taskId={task_id}",
    f"https://api.kie.ai/api/v1/tasks/info?taskId={task_id}",
    f"https://api.kie.ai/api/v1/kling/recordInfo?taskId={task_id}",
    f"https://api.kie.ai/api/v1/video/recordInfo?taskId={task_id}",
    f"https://api.kie.ai/api/v1/history"
]

headers = {
    "Authorization": f"Bearer {KIE_API_KEY}",
    "Content-Type": "application/json"
}

for url in endpoints:
    print(f"Testing URL: {url}")
    res = requests.get(url, headers=headers)
    print(f"Status Code: {res.status_code}")
    print(res.text[:500])
    print("-" * 50)
