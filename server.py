import os
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


WEB_ROOT = Path(__file__).resolve().parent / "public"


class StaticHandler(SimpleHTTPRequestHandler):
    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self) -> None:
        if self.path in {"", "/"}:
            self.path = "/index.html"
        super().do_GET()


def main() -> None:
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8090"))
    handler = partial(StaticHandler, directory=str(WEB_ROOT))
    server = ThreadingHTTPServer((host, port), handler)
    print(f"Serving Telegram WebApp at http://{host}:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
