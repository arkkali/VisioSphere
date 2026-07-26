#!/usr/bin/env python3
"""Discover the Tapo CCTV camera's current IP on whatever LAN we're on.

The camera gets a different DHCP address on each network it joins, so a
hardcoded IP breaks constantly. This scans the local /24 subnet for an RTSP
server (TCP port 554) and prints a ready-to-use RTSP URL to stdout, reusing
whatever credentials/stream path are already configured in ai_core/.env.

Only the final URL is written to stdout; all diagnostics go to stderr, so the
launcher (run_ai_core.bat) can capture the URL cleanly.
"""
import os
import socket
import sys
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlsplit, urlunsplit


def log(*a):
    print(*a, file=sys.stderr)


# Pull the credentials + stream path from .env so they never live in this file.
try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))
except ImportError:
    pass

# Template provides scheme, user:pass, port and path. Only the host gets swapped.
TEMPLATE = os.getenv("CAM_1_SOURCE", "rtsp://192.168.100.109:554/stream1")


def local_subnet_prefix():
    """Return e.g. '192.168.100.' for the primary network interface."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))   # no traffic sent; just picks the iface
        ip = s.getsockname()[0]
    finally:
        s.close()
    return ip.rsplit(".", 1)[0] + "."


def speaks_rtsp(ip, port=554, timeout=0.4):
    """True if the host answers an RTSP OPTIONS request (a 401 still counts —
    it proves it's an RTSP server, i.e. the camera, not some other service)."""
    try:
        with socket.create_connection((ip, port), timeout=timeout) as c:
            c.settimeout(timeout)
            c.sendall(f"OPTIONS rtsp://{ip}:{port} RTSP/1.0\r\nCSeq: 1\r\n\r\n".encode())
            return c.recv(256).startswith(b"RTSP/")
    except OSError:
        return False


def main():
    prefix = local_subnet_prefix()
    log(f"[find_camera] scanning {prefix}0/24 for an RTSP camera (port 554)...")
    hosts = [f"{prefix}{i}" for i in range(1, 255)]

    found = []
    with ThreadPoolExecutor(max_workers=128) as ex:
        for ip, ok in zip(hosts, ex.map(speaks_rtsp, hosts)):
            if ok:
                found.append(ip)

    if not found:
        log("[find_camera] no RTSP camera found on this subnet.")
        return 1

    ip = found[0]
    if len(found) > 1:
        log(f"[find_camera] multiple RTSP hosts {found}; using first ({ip}).")

    p = urlsplit(TEMPLATE)
    userinfo = ""
    if p.username:
        userinfo = p.username + (f":{p.password}" if p.password else "") + "@"
    netloc = f"{userinfo}{ip}:{p.port or 554}"
    url = urlunsplit((p.scheme or "rtsp", netloc, p.path or "/stream1", p.query, p.fragment))

    log(f"[find_camera] camera found at {ip}")
    print(url)            # <-- only the URL reaches stdout
    return 0


if __name__ == "__main__":
    sys.exit(main())
