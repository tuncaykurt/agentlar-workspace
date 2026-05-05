with open('projeler/Kripto_Bot_Platform/docker-compose.yml', 'r') as f:
    lines = f.readlines()
    for i, line in enumerate(lines):
        if 'nginx' in line or 'dockerfile' in line:
            print(f"{i+1}: {repr(line)}")
