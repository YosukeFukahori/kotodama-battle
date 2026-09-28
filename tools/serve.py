"""開発用ローカルサーバー。

python3 -m http.server と同じだが、キャッシュを無効にする。
（ES Modules はブラウザにキャッシュされやすく、編集が反映されないことがあるため）

使い方：python3 tools/serve.py [port]   （既定 8000）
"""

import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    handler = partial(NoCacheHandler, directory=str(ROOT))
    with ThreadingHTTPServer(("", port), handler) as server:
        print(f"Serving {ROOT} at http://localhost:{port}/ (no-cache)")
        server.serve_forever()


if __name__ == "__main__":
    main()
