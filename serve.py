# Dev server that tells the browser not to cache, so it always runs the newest code.
# python3 serve.py [port]   (default 8130)
import http.server
import sys


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


class Server(http.server.ThreadingHTTPServer):
    request_queue_size = 128  # the default 5 resets connections when a page loads 60 modules and 3 workers at once
    daemon_threads = True


Server(('', int(sys.argv[1]) if len(sys.argv) > 1 else 8130), NoCache).serve_forever()
