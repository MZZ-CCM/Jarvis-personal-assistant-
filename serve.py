"""Local dev server for Jarvis: python3 serve.py  →  http://localhost:8080"""
import http.server, functools, os

class NoCache(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      '.js': 'text/javascript', '.webmanifest': 'application/manifest+json'}
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

os.chdir(os.path.dirname(os.path.abspath(__file__)))
print('Jarvis running at http://localhost:8080')
http.server.ThreadingHTTPServer(('127.0.0.1', 8080), NoCache).serve_forever()
