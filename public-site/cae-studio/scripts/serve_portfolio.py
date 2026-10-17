from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from functools import partial
class Handler(SimpleHTTPRequestHandler):
 extensions_map={**SimpleHTTPRequestHandler.extensions_map,'.js':'application/javascript','.json':'application/json','.css':'text/css'}
ThreadingHTTPServer(('127.0.0.1',8770),partial(Handler,directory='D:/codex/cae-portfolio-publish/public-site')).serve_forever()