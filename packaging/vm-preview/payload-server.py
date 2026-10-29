"""Loopback-only read-only first-boot payload server. No private seed is served."""
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

root = Path(sys.argv[1]).resolve()
if root.name != 'payload' or not (root / 'manifest.json').is_file():
    raise SystemExit('Expected the public preview payload directory')
handler = partial(SimpleHTTPRequestHandler, directory=str(root))
ThreadingHTTPServer(('127.0.0.1', 18083), handler).serve_forever()
