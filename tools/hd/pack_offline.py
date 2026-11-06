#!/usr/bin/env python3
"""Packs assets/hd/ into assets/hd/offline-*.js so the HD look also works when index.html is
opened straight from the folder (file://): browsers won't load pictures or data files from
file://, but they're fine with the same bytes written into a script as data: URLs.

Run it again after changing anything in assets/hd/:  python3 tools/hd/pack_offline.py
index.html loads assets/hd/offline.js only from file://; the game (hd.js: HD_ASSET) then takes
each file from HD_OFFLINE instead of asking the server.
"""
import base64
import os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
HD = os.path.join(ROOT, 'assets', 'hd')
PART_BYTES = 20 * 1024 * 1024          # keeps every part well under GitHub's file size limits
MIME = {'.webp': 'image/webp', '.png': 'image/png', '.json': 'application/json', '.bin': 'application/octet-stream'}
HEADER = ('// Made by tools/hd/pack_offline.py: the HD assets as data URLs, for playing from file://.\n'
          '// Not for editing: change assets/hd/ and run the script again.\n'
          'window.HD_OFFLINE = window.HD_OFFLINE || {};\n')


def main():
    files = []
    for folder, _, names in os.walk(HD):
        for n in sorted(names):
            ext = os.path.splitext(n)[1]
            if ext in MIME:
                files.append(os.path.relpath(os.path.join(folder, n), ROOT).replace(os.sep, '/'))
    files.sort()
    for old in os.listdir(HD):
        if old.startswith('offline') and old.endswith('.js'):
            os.remove(os.path.join(HD, old))
    parts, cur, size = [], [], 0
    for rel in files:
        with open(os.path.join(ROOT, rel), 'rb') as f:
            data = base64.b64encode(f.read()).decode('ascii')
        line = "HD_OFFLINE[%r] = 'data:%s;base64,%s';\n" % (rel, MIME[os.path.splitext(rel)[1]], data)
        if cur and size + len(line) > PART_BYTES:
            parts.append(cur); cur, size = [], 0
        cur.append(line); size += len(line)
    if cur:
        parts.append(cur)
    names = []
    for i, lines in enumerate(parts, 1):
        name = 'offline-%d.js' % i
        names.append(name)
        with open(os.path.join(HD, name), 'w') as f:
            f.write(HEADER)
            f.writelines(lines)
    with open(os.path.join(HD, 'offline.js'), 'w') as f:
        f.write('// Made by tools/hd/pack_offline.py: loads the HD assets packed for file:// (see offline-*.js).\n')
        f.write("if (location.protocol === 'file:') for (const f of %s) document.write('<script src=\"assets/hd/' + f + '\"><\\/script>');\n"
                % str(names).replace("'", '"'))
    total = sum(os.path.getsize(os.path.join(HD, n)) for n in names)
    print('packed %d files into %d part(s), %.1f MB' % (len(files), len(names), total / 1e6))


if __name__ == '__main__':
    main()
