import socket

def check_port(host, port):
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(2)
    result = sock.connect_ex((host, port))
    sock.close()
    return result == 0

ports = {
    "PostgreSQL": 5432,
    "Redis": 6379
}

print("--- Port Check Results ---")
for name, port in ports.items():
    status = "OPEN" if check_port("localhost", port) else "CLOSED"
    print(f"{name} ({port}): {status}")
print("--- End Results ---")
