#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
assets/og-tree.png (1200x630) 생성 — 카페·카톡 링크 미리보기용
3D 트리를 그대로 렌더링해 왼쪽에 제목을 얹습니다.
실행: python3 make-og.py
"""
import functools
import http.server
import os
import pathlib
import socketserver
import threading

os.environ.setdefault("LD_LIBRARY_PATH", "/workspace/.tmp/libs/usr/lib/x86_64-linux-gnu")
os.environ.setdefault("FONTCONFIG_PATH", "/etc/fonts")

from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = pathlib.Path(__file__).resolve().parent
RAW = ROOT / "preview" / "_og-raw.png"
OUT = ROOT / "assets" / "og-tree.png"
W, H = 1200, 630
FONT = "/usr/share/fonts/pickle-hwp/NotoSansCJKkr-Regular.otf"


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def serve():
    handler = functools.partial(Quiet, directory=str(ROOT))
    srv = socketserver.TCPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, srv.server_address[1]


def capture():
    srv, port = serve()
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader",
                                    "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
        ctx = b.new_context(viewport={"width": W, "height": H}, device_scale_factor=1)
        pg = ctx.new_page()
        pg.goto("http://127.0.0.1:%d/index.html?test=1" % port, wait_until="load")
        pg.wait_for_function("() => window.__xmas !== undefined")
        pg.wait_for_function("() => window.__xmas.scene() !== null", timeout=30000)
        pg.evaluate("""() => {
          const s = document.createElement('style');
          s.textContent = '.topbar,.meter,.dock,.orbit-hint,.devbar,.devtab,.sheet-wrap,.done{display:none!important}'
            + '.app{max-width:none!important;padding:0!important}';
          document.head.appendChild(s);
        }""")
        pg.wait_for_timeout(500)
        pg.evaluate("window.__xmas.state.nickname='미리보기'")
        pg.evaluate("window.__xmas.applyTotal(915, 0, {silent:true})")
        pg.wait_for_timeout(1200)
        pg.evaluate("window.Scene3D.setView({azimuth:0.62, shiftX:-3.9, distance:19.8, phi:1.34, shiftY:4.25})")
        pg.evaluate("window.Scene3D.renderNow()")
        pg.evaluate("window.Scene3D.pause()")
        pg.wait_for_timeout(200)
        pg.screenshot(path=str(RAW), timeout=90000, animations="disabled")
        ctx.close()
        b.close()
    srv.shutdown()


def font(size):
    return ImageFont.truetype(FONT, size)


def spaced(draw, xy, text, f, fill, spacing=2):
    x, y = xy
    for ch in text:
        draw.text((x, y), ch, font=f, fill=fill)
        x += draw.textlength(ch, font=f) + spacing
    return x


def compose():
    base = Image.open(RAW).convert("RGB")
    if base.size != (W, H):
        base = base.resize((W, H))

    # 왼쪽 글자가 잘 읽히도록 어두운 그라데이션
    veil = Image.new("L", (W, H), 0)
    vd = ImageDraw.Draw(veil)
    for x in range(W):
        if x < 470:
            a = 252
        else:
            a = int(252 * max(0.0, (730 - x) / 300) ** 1.5)
        vd.line([(x, 0), (x, H)], fill=a)
    dark = Image.new("RGB", (W, H), (4, 10, 18))
    base = Image.composite(dark, base, veil)

    # 아래쪽 살짝 어둡게
    grad = Image.new("L", (1, H), 0)
    for y in range(H):
        grad.putpixel((0, y), int(120 * max(0, (y - H * 0.55) / (H * 0.45)) ** 1.4))
    grad = grad.resize((W, H))
    base = Image.composite(Image.new("RGB", (W, H), (3, 8, 14)), base, grad)

    draw = ImageDraw.Draw(base)
    draw.text((76, 158), "", font=font(10))

    # 키커
    spaced(draw, (80, 128), "속초 효성해링턴 플레이스", font(25), (255, 215, 122), 3)
    # 제목 (두 줄)
    f_title = font(56)
    for i, line in enumerate(["우리 아파트", "크리스마스 트리"]):
        draw.text((76, 178 + i * 68), line, font=f_title, fill=(247, 251, 255),
                  stroke_width=1, stroke_fill=(247, 251, 255))
    # 설명
    f_sub = font(25)
    draw.text((79, 330), "3D 입체 트리에 주민의 손길이", font=f_sub, fill=(206, 224, 242))
    draw.text((79, 368), "하나씩 쌓입니다", font=f_sub, fill=(206, 224, 242))
    draw.text((79, 420), "915번째 손길에서 꼭대기 별이 켜져요", font=f_sub, fill=(246, 214, 150))

    # 진행 바 장식
    bx, by, bw, bh = 79, 492, 300, 11
    draw.rounded_rectangle([bx, by, bx + bw, by + bh], radius=6, fill=(30, 48, 66))
    draw.rounded_rectangle([bx, by, bx + bw, by + bh], radius=6, fill=(246, 196, 83))
    draw.text((bx + bw + 16, by - 12), "915 / 915", font=font(23), fill=(255, 232, 176))

    # 하단 각주
    draw.text((79, 546), "속초 효성해링턴 · 2026", font=font(21), fill=(146, 168, 190))

    base.save(OUT, optimize=True)
    print("saved", OUT, base.size)


if __name__ == "__main__":
    capture()
    compose()
