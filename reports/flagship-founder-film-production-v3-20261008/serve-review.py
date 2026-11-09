"""Private media review, exported videos only; retained independently of GPU."""
from http.server import ThreadingHTTPServer
from pathlib import Path
import sys
from urllib.parse import urlsplit, unquote
sys.path.insert(0,str(Path(__file__).resolve().parent))
from local_media_http import RangeMediaHandler
root=Path(__file__).resolve().parent/'review'
allowed={'/','/index.html','/hero.mp4','/hero.jpg','/cutdown.mp4','/cutdown.jpg','/teaser.mp4','/teaser.jpg'}
class Handler(RangeMediaHandler):
    def __init__(self,*a,**kw):super().__init__(*a,directory=str(root),**kw)
    def send_head(self):
        if unquote(urlsplit(self.path).path) not in allowed:
            self.send_error(404);return None
        return super().send_head()
    def list_directory(self,path):self.send_error(404);return None
ThreadingHTTPServer(('127.0.0.1',3099),Handler).serve_forever()
