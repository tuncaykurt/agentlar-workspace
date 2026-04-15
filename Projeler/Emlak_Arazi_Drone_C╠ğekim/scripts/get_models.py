import requests
from src.config import KIE_AI_API_KEY
headers = {'Authorization': f'Bearer {KIE_AI_API_KEY}'}
res = requests.get('https://api.kie.ai/api/v1/models', headers=headers)
print(res.text)
