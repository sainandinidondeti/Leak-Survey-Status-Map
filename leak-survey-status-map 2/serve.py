"""Tiny local web server for this project.  Run:  python3 serve.py
It tells the browser never to cache files, and prints which folder and build it is serving."""
import http.server, os, re, socketserver, sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
FOLDER = os.path.dirname(os.path.abspath(__file__))
os.chdir(FOLDER)

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, max-age=0')
        super().end_headers()

build = re.search(r'build (\d+)', open('index.html', encoding='utf-8').read())
socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(('', PORT), NoCacheHandler) as server:
    print('Serving folder :', FOLDER)
    print('App build      :', build.group(1) if build else 'unknown (old files!)')
    print('Open this URL  : http://localhost:%d' % PORT)
    print('Stop with Ctrl+C')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nStopped.')
