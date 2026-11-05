# Minimal PNG read/write with numpy + zlib (Blender's Python has numpy but no Pillow).
import zlib, struct, numpy as np
def write_png(path, arr):
    arr = np.ascontiguousarray(arr.astype(np.uint8))
    if arr.ndim == 2: arr = arr[:, :, None]
    h, w, c = arr.shape
    ctype = {1: 0, 2: 4, 3: 2, 4: 6}[c]
    raw = b''.join(b'\x00' + arr[y].tobytes() for y in range(h))
    def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, ctype, 0, 0, 0))
                + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))
def read_png(data):
    assert data[:8] == b'\x89PNG\r\n\x1a\n'
    p, idat = 8, b''
    while p < len(data):
        n, t = struct.unpack('>I4s', data[p:p + 8]); d = data[p + 8:p + 8 + n]; p += 12 + n
        if t == b'IHDR': w, h, bd, ct = struct.unpack('>IIBB', d[:10])
        elif t == b'IDAT': idat += d
    assert bd == 8
    c = {0: 1, 2: 3, 4: 2, 6: 4}[ct]
    raw = zlib.decompress(idat); stride = w * c
    out = np.zeros((h, stride), np.int32); prev = np.zeros(stride, np.int32); i = 0
    for y in range(h):
        f = raw[i]; line = np.frombuffer(raw, np.uint8, stride, i + 1).astype(np.int32); i += 1 + stride
        if f == 0: cur = line
        elif f == 2: cur = (line + prev) & 255
        else:
            cur = np.zeros(stride, np.int32)
            for x in range(stride):
                a = cur[x - c] if x >= c else 0; b = prev[x]; cc = prev[x - c] if x >= c else 0
                if f == 1: pr = a
                elif f == 3: pr = (a + b) >> 1
                else:
                    pa, pb, pc = abs(b - cc), abs(a - cc), abs(a + b - 2 * cc)
                    pr = a if pa <= pb and pa <= pc else (b if pb <= pc else cc)
                cur[x] = (line[x] + pr) & 255
        out[y] = cur; prev = cur
    return out.reshape(h, w, c).astype(np.uint8)
