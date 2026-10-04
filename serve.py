# Dev server that tells the browser not to cache, so it always runs the newest code.
# python3 serve.py [port]   (default 8130)
import http.server
import sys


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


http.server.ThreadingHTTPServer(('', int(sys.argv[1]) if len(sys.argv) > 1 else 8130), NoCache).serve_forever()
