"""ホーム画面用のアイコン(ピンク地に白いハートとカレンダー)を作る。追加のライブラリは不要。"""
import math
import struct
import zlib
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "icons"
BG_TOP = (248, 125, 152)
BG_BOTTOM = (226, 86, 122)
WHITE = (255, 255, 255)


def heart(x, y):
    # 中心 0,0・幅およそ 2 のハート形。内側なら負
    x *= 1.15
    y = -y * 1.15 + 0.25
    return (x * x + y * y - 1) ** 3 - x * x * y ** 3


def color_at(u, v):
    """u, v は 0〜1。返り値は (r, g, b, 白の濃さ 0〜1)"""
    bg = tuple(BG_TOP[i] + (BG_BOTTOM[i] - BG_TOP[i]) * v for i in range(3))
    # カレンダーの枠(白い角丸の四角の上辺の帯 + リング)
    cx, cy = 0.5, 0.54
    hw, hh = 0.30, 0.27
    dx, dy = abs(u - cx) - (hw - 0.06), abs(v - cy) - (hh - 0.06)
    d = math.hypot(max(dx, 0), max(dy, 0)) + min(max(dx, dy), 0) - 0.06
    white = 0.0
    if d < 0:
        white = 1.0
        if v > cy - hh + 0.14:  # 下の部分はピンクのハートを抜く
            hx = (u - cx) / 0.17
            hy = (v - (cy + 0.07)) / 0.17
            if heart(hx, hy) < 0:
                return bg + (0.0,)
            # 帯と本体の境目の線
        if abs(v - (cy - hh + 0.13)) < 0.012:
            return bg + (0.0,)
    # 上のリング 2 つ
    for rx in (cx - 0.15, cx + 0.15):
        if abs(u - rx) < 0.028 and cy - hh - 0.06 < v < cy - hh + 0.06:
            white = 1.0
    return bg + (white,)


def render(size, pad=0.0):
    ss = 3  # なめらかにするため 3x3 で平均
    rows = []
    for py in range(size):
        row = bytearray([0])
        for px in range(size):
            acc = [0.0, 0.0, 0.0]
            for sy in range(ss):
                for sx in range(ss):
                    u = (px + (sx + 0.5) / ss) / size
                    v = (py + (sy + 0.5) / ss) / size
                    u = (u - 0.5) / (1 - pad) + 0.5
                    v2 = (v - 0.5) / (1 - pad) + 0.5
                    r, g, b, w = color_at(u, v2)
                    for i, c in enumerate((r, g, b)):
                        acc[i] += c * (1 - w) + WHITE[i] * w
            row += bytes(int(round(c / (ss * ss))) for c in acc)
        rows.append(bytes(row))
    raw = b"".join(rows)

    def chunk(t, data):
        c = struct.pack(">I", len(data)) + t + data
        return c + struct.pack(">I", zlib.crc32(t + data) & 0xFFFFFFFF)

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    return png


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    for name, size in (("icon-192.png", 192), ("icon-512.png", 512), ("apple-touch-icon.png", 180)):
        (OUT / name).write_bytes(render(size, pad=0.12))
        print("作成:", OUT / name)
