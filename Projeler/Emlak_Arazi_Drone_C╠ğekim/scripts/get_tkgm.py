import requests

url = "https://parselsorgu.tkgm.gov.tr/tr/app"
headers = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"
}
res = requests.get(url, headers=headers)
print("APP HTML:", res.status_code)
