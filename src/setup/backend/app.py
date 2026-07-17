from __future__ import annotations

import argparse
import json
import mimetypes
import socket
import threading
import webbrowser
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

from .project import ROOT, current_config, current_installation, generic_config, presets, save_configuration, verify_project
from .updater import backup_project, update_from_base64

UI_ROOT = ROOT / 'src/setup/ui'


def response(handler: BaseHTTPRequestHandler, status: int, body: bytes, content_type: str) -> None:
    handler.send_response(status)
    handler.send_header('Content-Type', content_type)
    handler.send_header('Content-Length', str(len(body)))
    handler.send_header('Cache-Control', 'no-store')
    handler.end_headers()
    handler.wfile.write(body)


def json_response(handler: BaseHTTPRequestHandler, data: object, status: int = 200) -> None:
    response(handler, status, json.dumps(data, ensure_ascii=False).encode('utf-8'), 'application/json; charset=utf-8')


class Handler(BaseHTTPRequestHandler):
    server_version = 'WikiCambadaCoreSetup/1.1'

    def log_message(self, format: str, *args: object) -> None:
        return

    def read_json(self) -> dict:
        length = int(self.headers.get('Content-Length') or 0)
        raw = self.rfile.read(length) if length else b'{}'
        return json.loads(raw.decode('utf-8'))

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == '/api/state':
            return json_response(self, {'config': current_config(), 'newConfig': generic_config(), 'installation': current_installation(), 'presets': presets()})
        if path == '/api/verify':
            return json_response(self, verify_project())
        if path in {'/', '/index.html'}:
            target = UI_ROOT / 'index.html'
        else:
            target = (UI_ROOT / path.lstrip('/')).resolve()
            if UI_ROOT.resolve() not in target.parents:
                return json_response(self, {'error': 'caminho inválido'}, 400)
        if not target.exists() or not target.is_file():
            return json_response(self, {'error': 'não encontrado'}, 404)
        content_type = mimetypes.guess_type(target.name)[0] or 'application/octet-stream'
        response(self, 200, target.read_bytes(), f'{content_type}; charset=utf-8' if content_type.startswith('text/') else content_type)

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        try:
            payload = self.read_json()
            if path == '/api/configure':
                return json_response(self, {'ok': True, **save_configuration(payload)})
            if path == '/api/backup':
                return json_response(self, {'ok': True, 'backup': str(backup_project())})
            if path == '/api/update':
                file = payload.get('file') or {}
                return json_response(self, update_from_base64(str(file.get('data') or ''), str(file.get('name') or 'update.zip')))
            return json_response(self, {'error': 'rota inválida'}, 404)
        except Exception as exc:
            return json_response(self, {'ok': False, 'error': str(exc)}, 400)


def free_port(preferred: int = 8765) -> int:
    with socket.socket() as sock:
        try:
            sock.bind(('127.0.0.1', preferred))
            return preferred
        except OSError:
            sock.bind(('127.0.0.1', 0))
            return int(sock.getsockname()[1])


def main() -> int:
    parser = argparse.ArgumentParser(description='WikiCambada Core setup')
    parser.add_argument('command', nargs='?', choices=['serve', 'verify'], default='serve')
    parser.add_argument('--port', type=int, default=8765)
    parser.add_argument('--no-browser', action='store_true')
    args = parser.parse_args()
    if args.command == 'verify':
        result = verify_project()
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0 if result['ok'] else 1
    port = free_port(args.port)
    url = f'http://127.0.0.1:{port}/'
    server = ThreadingHTTPServer(('127.0.0.1', port), Handler)
    print(f'WikiCambada Core setup: {url}')
    if not args.no_browser:
        threading.Timer(0.4, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0
