#!/usr/bin/env python3
"""Sirve la app web del robot en localhost.

La Web Speech API (voz) exige un contexto seguro: localhost o HTTPS. Por eso
este servidor escucha en 127.0.0.1 por defecto. Para abrir la app desde otro
dispositivo de la red usa --host 0.0.0.0, sabiendo que la voz quedara
deshabilitada en el navegador (el resto de la interfaz funciona igual).

Uso:
    python app/serve.py
    python app/serve.py --port 8080
    python app/serve.py --host 0.0.0.0
"""
from __future__ import annotations

import argparse
import http.server
import mimetypes
from pathlib import Path

mimetypes.add_type("font/woff2", ".woff2")

ROOT = Path(__file__).resolve().parent


class AppHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        if self.path in ("/", "/index.html"):
            self.send_response(302)
            self.send_header("Location", "/web/index.html")
            self.end_headers()
            return
        super().do_GET()

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        print(f"[HTTP] {self.address_string()} {fmt % args}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Servidor local de la app web")
    parser.add_argument("--host", default="127.0.0.1", help="Interfaz de escucha (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=8000, help="Puerto (default: 8000)")
    args = parser.parse_args()

    server = http.server.ThreadingHTTPServer((args.host, args.port), AppHandler)
    url = f"http://{args.host}:{args.port}/web/index.html"
    print(f"App web del robot: {url}")
    print("Pulsa Ctrl+C para detener el servidor.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor detenido.")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
