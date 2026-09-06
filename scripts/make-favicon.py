#!/usr/bin/env python3
"""Generate app/favicon.ico (32x32 and 16x16, PNG-in-ICO) with no dependencies."""
import struct, zlib, math, os

def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))

CYAN = (34, 211, 238)
INDIGO = (99, 102, 241)
VIOLET = (139, 92, 246)
WHITE = (255, 255, 255)

def gradient(u, v):
    """Diagonal 3-stop gradient, u,v in 0..1."""
    t = (u + v) / 2
    return lerp(CYAN, INDIGO, t / 0.55) if t < 0.55 else lerp(INDIGO, VIOLET, (t - 0.55) / 0.45)

def render(size):
    px = bytearray()
    r = size * 0.24              # corner radius
    pad = size * 0.20
    for y in range(size):
        for x in range(size):
            u, v = x / (size - 1), y / (size - 1)
            # rounded-rect alpha
            cx = min(max(x, r), size - 1 - r)
            cy = min(max(y, r), size - 1 - r)
            inside = math.hypot(x - cx, y - cy) <= r or (r <= x <= size - 1 - r) or (r <= y <= size - 1 - r)
            if not inside:
                px += bytes((0, 0, 0, 0))
                continue
            col = gradient(u, v)
            # white cursor glyph (arrow pointer) drawn with a signed-distance test
            gx, gy = (x - pad) / (size - 2 * pad), (y - pad) / (size - 2 * pad)
            glyph = 0.0
            # pointer body: triangle-ish wedge
            if 0.18 <= gx <= 0.80 and 0.12 <= gy <= 0.86:
                if gy >= gx * 0.92 + 0.02 and gx <= 0.52:
                    glyph = 1.0
                elif 0.50 <= gx <= 0.80 and 0.55 <= gy <= 0.72:
                    glyph = 1.0
            if glyph:
                col = WHITE
            px += bytes((col[0], col[1], col[2], 255))
    return bytes(px)

def png(size, raw):
    def chunk(tag, data):
        c = struct.pack('>I', len(data)) + tag + data
        return c + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF)
    ihdr = struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)
    scan = b''.join(b'\x00' + raw[y * size * 4:(y + 1) * size * 4] for y in range(size))
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr)
            + chunk(b'IDAT', zlib.compress(scan, 9)) + chunk(b'IEND', b''))

def ico(entries):
    header = struct.pack('<HHH', 0, 1, len(entries))
    offset = 6 + 16 * len(entries)
    table, blobs = b'', b''
    for size, data in entries:
        table += struct.pack('<BBBBHHII', size % 256, size % 256, 0, 0, 1, 32, len(data), offset)
        blobs += data
        offset += len(data)
    return header + table + blobs

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'app', 'favicon.ico')
data = ico([(s, png(s, render(s))) for s in (32, 16)])
with open(out, 'wb') as f:
    f.write(data)
print(f'wrote {os.path.normpath(out)} ({len(data)} bytes)')
