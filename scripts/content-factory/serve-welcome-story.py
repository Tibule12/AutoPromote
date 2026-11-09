"""Loopback artifact viewer; native Studio can reopen these normal media URLs."""
from http.server import ThreadingHTTPServer
from pathlib import Path
import sys

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from local_media_http import RangeMediaHandler
root=Path(__file__).resolve().parents[2]/'reports/welcome-cinematic-20261009'

class Viewer(RangeMediaHandler):
    def __init__(self,*a,**k):super().__init__(*a,directory=str(root),**k)
    def end_headers(self):
        if self.headers.get('Origin')=='http://127.0.0.1:5007':
            self.send_header('Access-Control-Allow-Origin','http://127.0.0.1:5007')
            self.send_header('Vary','Origin')
        super().end_headers()

ThreadingHTTPServer(('127.0.0.1',8765),Viewer).serve_forever()
