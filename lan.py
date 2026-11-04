#!/usr/bin/env python3
"""Play with friends: serves the game and passes messages between the browsers.

Run it with "Play with a friend.command" (double-click), or: python3 lan.py
It opens the game for you (the host) and prints the links to send your friends:
  - one for friends on the same Wi-Fi,
  - one that works from anywhere over the internet (needs cloudflared, installed once
    with: brew install cloudflared). That link changes every time you start.
Only uses Python's standard library: nothing for your friends to install.

Options: --no-browser (don't open the game), --no-internet (Wi-Fi link only).
"""
import atexit
import http.server
import json
import os
import queue
import re
import shutil
import socket
import subprocess
import sys
import threading
import webbrowser

ROOT = os.path.dirname(os.path.abspath(__file__))
MAX_WAITING = 300                 # messages kept for someone who isn't listening
MAX_GUESTS = 30                   # connections (the game itself takes 9 friends)
PORT = 8000
PUBLIC_URL = None                 # the internet link, once cloudflared has one

lock = threading.Lock()
host_inbox = queue.Queue()
host_gen = 0
guests = {}                       # guest id -> {'q': Queue, 'gen': int}

# Only the game's own files are served (not the rest of the folder).
ALLOWED = re.compile(r'^/(index\.html|style\.css|js/[\w.-]+\.js|lib/[\w.-]+\.js)?$')


def lan_ip():
    """This computer's address on the Wi-Fi."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('10.255.255.255', 1))
        return s.getsockname()[0]
    except OSError:
        return '127.0.0.1'
    finally:
        s.close()


def params(query):
    out = {}
    for part in query.split('&'):
        k, _, v = part.partition('=')
        out[k] = v
    return out


def put(q, msg):
    q.put(msg)
    while q.qsize() > MAX_WAITING:
        try:
            q.get_nowait()
        except queue.Empty:
            break


def for_guest(raw, data, gid):
    """A snapshot carries every friend's private state: each friend only gets their own."""
    if data is None or not isinstance(data.get('g'), dict):
        return raw
    return json.dumps(dict(data, g=data['g'].get(gid)), separators=(',', ':'))


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def log_message(self, *args):
        pass

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def send_json(self, obj):
        body = json.dumps(obj).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_HEAD(self):
        path = self.path.partition('?')[0]
        if not ALLOWED.match(path):
            self.send_error(404)
            return
        super().do_HEAD()

    def do_GET(self):
        path, _, query = self.path.partition('?')
        if path == '/net/info':
            self.send_json({'url': f'http://{lan_ip()}:{PORT}', 'public': PUBLIC_URL,
                            'tunnel': bool(shutil.which('cloudflared'))})
        elif path == '/net/stream':
            p = params(query)
            if p.get('role') == 'host':
                self.stream_host()
            else:
                self.stream_guest(re.sub(r'[^\w-]', '', p.get('id', ''))[:24] or 'anon')
        elif ALLOWED.match(path):
            super().do_GET()
        else:
            self.send_error(404)

    def start_stream(self):
        self.send_response(200)
        self.send_header('Content-Type', 'text/event-stream')
        self.send_header('X-Accel-Buffering', 'no')
        self.send_header('Connection', 'close')
        self.end_headers()
        self.close_connection = True

    def pump(self, q, still_mine):
        """Send everything that arrives in `q`, in batches, until replaced or disconnected."""
        try:
            self.wfile.write(b': hello\n\n')
            self.wfile.flush()
            while still_mine():
                try:
                    msgs = [q.get(timeout=5)]
                except queue.Empty:
                    self.wfile.write(b': ping\n\n')
                    self.wfile.flush()
                    continue
                while len(msgs) < 50:
                    try:
                        msgs.append(q.get_nowait())
                    except queue.Empty:
                        break
                self.wfile.write(b'data: [' + ','.join(msgs).encode() + b']\n\n')
                self.wfile.flush()
            return True
        except (BrokenPipeError, ConnectionResetError, OSError):
            return False

    def stream_host(self):
        global host_gen
        with lock:
            host_gen += 1
            mine = host_gen
        while not host_inbox.empty():              # a fresh start
            try:
                host_inbox.get_nowait()
            except queue.Empty:
                break
        self.start_stream()
        self.pump(host_inbox, lambda: host_gen == mine)

    def stream_guest(self, gid):
        with lock:
            if gid not in guests and len(guests) >= MAX_GUESTS:
                self.send_error(503)
                return
            g = guests.setdefault(gid, {'q': queue.Queue(), 'gen': 0})
            g['gen'] += 1
            mine = g['gen']
            while not g['q'].empty():
                try:
                    g['q'].get_nowait()
                except queue.Empty:
                    break
        self.start_stream()
        self.pump(g['q'], lambda: g['gen'] == mine)
        with lock:
            if g['gen'] == mine:                   # really gone (not just reloading)
                guests.pop(gid, None)
                put(host_inbox, json.dumps({'t': 'bye', 'id': gid}))

    def do_POST(self):
        path, _, query = self.path.partition('?')
        if path != '/net/send':
            self.send_error(404)
            return
        p = params(query)
        length = int(self.headers.get('Content-Length', 0))
        raw = self.rfile.read(length).decode('utf-8')
        if p.get('role') == 'host':
            try:
                data = json.loads(raw)
            except ValueError:
                data = None
            with lock:
                targets = list(guests.items())
            to = p.get('to')
            for gid, g in targets:
                if not to or to == gid:
                    put(g['q'], for_guest(raw, data, gid))
        else:
            put(host_inbox, raw)
        self.send_response(204)
        self.send_header('Content-Length', '0')
        self.end_headers()


def start_tunnel():
    """Ask Cloudflare for a free public link to this game (needs cloudflared)."""
    exe = shutil.which('cloudflared')
    if not exe:
        print('  To play with friends who are NOT on your Wi-Fi, install cloudflared once')
        print('  (in Terminal: brew install cloudflared), then start this again.')
        print()
        return
    proc = subprocess.Popen([exe, 'tunnel', '--no-autoupdate', '--url', f'http://localhost:{PORT}'],
                            stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
    atexit.register(proc.terminate)
    print('  Getting the internet link (a few seconds)...', flush=True)

    def watch():
        global PUBLIC_URL
        for line in proc.stderr:
            m = re.search(r'https://[\w-]+\.trycloudflare\.com', line)
            if m and not PUBLIC_URL:
                PUBLIC_URL = m.group(0)
                print()
                print(f'  Friends anywhere (internet):  {PUBLIC_URL}', flush=True)
                print()
    threading.Thread(target=watch, daemon=True).start()


class Server(http.server.ThreadingHTTPServer):
    request_queue_size = 256      # many friends loading the game at the same moment
    daemon_threads = True


def main():
    global PORT
    server = None
    for port in range(8000, 8011):
        try:
            server = Server(('', port), Handler)
            PORT = port
            break
        except OSError:
            continue
    if not server:
        print('Could not start: ports 8000-8010 are all busy.')
        return
    server.daemon_threads = True
    print()
    print('  FPS Reborn - play with friends')
    print()
    print(f'  Friends on your Wi-Fi:  http://{lan_ip()}:{PORT}')
    print()
    print('  (If your Mac asks whether to allow incoming connections, click Allow.)')
    print('  Keep this window open while you play. Close it to stop.')
    print()
    if '--no-internet' not in sys.argv:
        start_tunnel()
    if '--no-browser' not in sys.argv:
        webbrowser.open(f'http://localhost:{PORT}/?lan=host')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
