import requests
from src.config import KIE_AI_API_KEY
tid = "ORNEK_TASK_ID"
eps = [
    f"veo/recordInfo?taskId={tid}",
    f"veo/status?taskId={tid}",
    f"veo/status/{tid}",
    f"veo/task/{tid}",
    f"veo/taskInfo?taskId={tid}",
    f"veo/job/{tid}",
    f"veo/jobs/recordInfo?taskId={tid}",
    f"veo/result?taskId={tid}",
    f"veo/jobs/{tid}",
]
for ep in eps:
    r = requests.get(f"https://api.kie.ai/api/v1/{ep}", headers={"Authorization": f"Bearer {KIE_AI_API_KEY}"})
    if r.status_code != 404:
        print(f"{ep}: {r.status_code} {r.text}")
