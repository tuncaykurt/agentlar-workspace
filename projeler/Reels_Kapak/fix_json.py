import os
import re
import json

file_path = "/tmp/antigravity_workaround/Reels_Kapak/autonomous_cover_agent.py"

with open(file_path, "r") as f:
    code = f.read()

replacement1 = """
        raw_text = response.text.replace("```json", "").replace("```", "").strip()
        parsed = json.loads(raw_text)
        if isinstance(parsed, list) and len(parsed) > 0:
            result = parsed[0]
        else:
            result = parsed
"""
code = code.replace("result = json.loads(response.text)", replacement1)

replacement2 = """
         raw_text = result.replace("```json", "").replace("```", "").strip()
         parsed = json.loads(raw_text)
         if isinstance(parsed, list) and len(parsed) > 0:
             evaluation = parsed[0]
         else:
             evaluation = parsed
"""
code = code.replace("evaluation = json.loads(result)", replacement2)

with open(file_path, "w") as f:
    f.write(code)
print("Updated json parsing in", file_path)
