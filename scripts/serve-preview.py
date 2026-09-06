"""Serve only the exported web app on loopback for the Tailscale HTTPS proxy."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / 'dist'

class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('X-Content-Type-Options', 'nosniff')
        super().end_headers()

    def list_directory(self, path):
        self.send_error(404)
        return None

if not (ROOT / 'index.html').exists():
    raise SystemExit('Run pnpm export:web first.')
ThreadingHTTPServer(('127.0.0.1', 8877), partial(Handler, directory=str(ROOT))).serve_forever()
