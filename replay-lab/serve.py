"""Serve only the replay viewer's explicit assets and one selected playback bundle."""
import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import mimetypes
from pathlib import Path
import shutil
from urllib.parse import urlsplit

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent


def assets(data):
    routes = {
        '/': HERE / 'web/index.html',
        '/index.html': HERE / 'web/index.html',
        '/app.js': HERE / 'web/app.js',
        '/style.css': HERE / 'web/style.css',
        '/maps/ocarnus.webp': HERE / 'web/maps/ocarnus.webp',
        '/maps/NOTICE.txt': HERE / 'web/maps/NOTICE.txt',
        '/maps/GPL-3.0.txt': HERE / 'web/maps/GPL-3.0.txt',
        '/characters/manifest.json': HERE / 'web/characters/manifest.json',
        '/characters/sources.json': HERE / 'web/characters/sources.json',
        '/characters/NOTICE.txt': HERE / 'web/characters/NOTICE.txt',
        '/shared/header.js': ROOT / 'res/scripts/header.js',
        '/shared/header.css': ROOT / 'games/shared/game-header.css',
        '/shared/logo.png': ROOT / 'res/images/favicon.png',
        '/shared/kanami.jpg': ROOT / 'res/images/lovekanami.jpg',
        '/playback.json': Path(data).resolve(),
    }
    with (HERE / 'web/characters/manifest.json').open(encoding='utf-8') as file:
        for role in json.load(file):
            role_id = role.get('id')
            if type(role_id) is not int or role_id <= 0:
                raise ValueError('invalid character asset ID')
            route = f'/characters/icons/{role_id}.png'
            if role.get('portrait') != route.lstrip('/'):
                raise ValueError('invalid character portrait path')
            routes[route] = HERE / 'web' / route.lstrip('/')
    return routes


def handler(routes):
    class Handler(BaseHTTPRequestHandler):
        def do_HEAD(self):
            self.do_GET(head=True)

        def do_GET(self, head=False):
            path = urlsplit(self.path).path
            if path == '/health':
                payload = b'{"status":"ok"}'
                self.send_response(200)
                self.send_header('Content-Type','application/json')
                self.send_header('Content-Length',str(len(payload)))
                self.end_headers()
                if not head:
                    self.wfile.write(payload)
                return
            target = routes.get(path)
            if target is None or not target.is_file():
                self.send_error(404)
                return
            self.send_response(200)
            mime = mimetypes.guess_type(target.name)[0] or 'application/octet-stream'
            if target.suffix == '.js':
                mime = 'text/javascript'
            elif target.suffix == '.webp':
                mime = 'image/webp'
            self.send_header('Content-Type',mime+'; charset=utf-8' if target.suffix in ('.html','.css','.js','.json','.txt') else mime)
            self.send_header('Content-Length',str(target.stat().st_size))
            self.send_header('X-Content-Type-Options','nosniff')
            self.send_header('Cache-Control','no-cache')
            self.send_header('Content-Security-Policy',"default-src 'self'; img-src 'self' blob: data:; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'")
            self.end_headers()
            if not head:
                with target.open('rb') as source:
                    shutil.copyfileobj(source,self.wfile)

        def log_message(self, fmt, *args):
            print(fmt % args, flush=True)
    return Handler


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--data', required=True, type=Path, help='decoded playback.json')
    cli.add_argument('--port',type=int,default=8766)
    cli.add_argument('--bind',default='127.0.0.1')
    cli.add_argument('--export',type=Path,help='copy a standalone static site to this empty directory')
    args = cli.parse_args()
    with args.data.open(encoding='utf-8') as file:
        data=json.load(file)
    if data.get('schema')!='kanami-replay-playback-v1':
        cli.error('expected kanami-replay-playback-v1')
    routes=assets(args.data)
    if args.export:
        if args.export.exists() and any(args.export.iterdir()):
            cli.error('--export requires an empty directory')
        for route, source in routes.items():
            if route=='/':
                continue
            target=args.export / route.lstrip('/')
            target.parent.mkdir(parents=True,exist_ok=True)
            shutil.copy2(source,target)
        print(f'Static site exported: {args.export.resolve()}')
    else:
        server=ThreadingHTTPServer((args.bind,args.port),handler(routes))
        print(f'Local replay: http://{args.bind}:{args.port}/',flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
        finally:
            server.server_close()


if __name__=='__main__':
    main()
