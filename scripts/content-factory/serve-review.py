"""Private loopback review transport; no product endpoint or public frontend."""
import argparse,sys
from pathlib import Path
from http.server import ThreadingHTTPServer
from urllib.parse import unquote,urlsplit
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from local_media_http import RangeMediaHandler
p=argparse.ArgumentParser();p.add_argument('--root',type=Path,required=True);p.add_argument('--port',type=int,default=3096);a=p.parse_args()
class Review(RangeMediaHandler):
 def __init__(self,*x,**k):super().__init__(*x,directory=str(a.root.resolve()),**k)
 def list_directory(self,path):self.send_error(404);return None
 def allowed(self):
  clean=unquote(urlsplit(self.path).path)
  if '\x00' in clean or '..' in Path(clean).parts:return False
  destination=(a.root.resolve()/clean.lstrip('/')).resolve()
  if not destination.is_relative_to(a.root.resolve()):return False
  return clean == '/review.html' or (clean.startswith(('/outputs/','/idents/','/assets/','/generated/')) and clean.endswith(('.mp4','.jpg','.png')))
 def do_GET(self):
  if self.allowed():return super().do_GET()
  self.send_error(404)
 def do_HEAD(self):
  if self.allowed():return super().do_HEAD()
  self.send_error(404)
print(f'Private founder review: http://127.0.0.1:{a.port}/review.html',flush=True)
ThreadingHTTPServer(('127.0.0.1',a.port),Review).serve_forever()
