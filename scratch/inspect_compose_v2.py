with open('projeler/Kripto_Bot_Platform/docker-compose.yml', 'r') as f:
    lines = f.readlines()
    for i in range(58, 70):
        print(f"{i+1}: {repr(lines[i])}")
