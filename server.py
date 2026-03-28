import os
import urllib.error
import urllib.request
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


WEB_ROOT = Path(__file__).resolve().parent / "public"
API_UPSTREAM = os.getenv("API_UPSTREAM", "http://api:8090")


class StaticHandler(SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def _proxy_api(self) -> None:
        target_url = API_UPSTREAM.rstrip("/") + self.path
        body = None
        if self.command in {"POST", "PUT", "PATCH"}:
            length = int(self.headers.get("Content-Length", "0") or 0)
            body = self.rfile.read(length) if length > 0 else b""

        upstream_headers = {
            "Content-Type": self.headers.get("Content-Type", "application/json"),
            "X-Admin-Token": self.headers.get("X-Admin-Token", ""),
        }
        request = urllib.request.Request(
            target_url,
            data=body,
            method=self.command,
            headers=upstream_headers,
        )

        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                response_body = response.read()
                self.send_response(response.status)
                self.send_header("Content-Type", response.headers.get("Content-Type", "application/json"))
                self.send_header("Content-Length", str(len(response_body)))
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                self.wfile.write(response_body)
                return
        except urllib.error.HTTPError as error:
            error_body = error.read()
            self.send_response(error.code)
            self.send_header("Content-Type", error.headers.get("Content-Type", "application/json"))
            self.send_header("Content-Length", str(len(error_body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(error_body)
            return
        except Exception as error:  # noqa: BLE001
            payload = ('{"ok": false, "message": "webapp proxy error: %s"}' % str(error).replace('"', "'")).encode("utf-8")
            self.send_response(502)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(payload)

    def end_headers(self) -> None:
        path = self.path.split("?", 1)[0]
        if path.startswith("/assets/"):
            cache_control = "public, max-age=86400"
        elif path.endswith((".js", ".css")):
            cache_control = "no-store"
        elif path.endswith((".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg")):
            cache_control = "public, max-age=600"
        else:
            cache_control = "no-store"
        self.send_header("Cache-Control", cache_control)
        super().end_headers()

    def do_GET(self) -> None:
        if self.path.startswith("/api/"):
            self._proxy_api()
            return
        if self.path in {"", "/"}:
            self.path = "/index.html"
        super().do_GET()

    def do_POST(self) -> None:
        if self.path.startswith("/api/"):
            self._proxy_api()
            return
        self.send_error(405, "Method Not Allowed")

    def do_OPTIONS(self) -> None:
        if self.path.startswith("/api/"):
            self.send_response(204)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Admin-Token")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        super().do_OPTIONS()


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
