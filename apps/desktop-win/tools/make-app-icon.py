"""헤드셋 앱 아이콘을 크기별로 그려 다중 해상도 .ico 로 묶는다.

같은 그림을 그냥 줄이면 16px 에서 회색 덩어리가 된다. 그래서 크기마다 획을 굵히고
부품을 뺀다 — 48 아래로는 마이크 붐, 32 아래로는 헤드밴드 곡선을 굵힌다.

각 크기를 8배로 그린 뒤 줄여 계단을 없앤다.
"""
import io
import struct
import sys
from PIL import Image, ImageDraw

TEAL = (15, 118, 110, 255)   # #0f766e
WHITE = (255, 255, 255, 255)

SUPERSAMPLE = 8
UNITS = 96.0


def draw_icon(px, band_width, tile_radius, cup, with_boom):
    """px 크기의 아이콘 한 장. 좌표는 96 단위계로 적고 여기서 배율을 건다."""
    canvas = px * SUPERSAMPLE
    scale = canvas / UNITS
    img = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    def s(v):
        return v * scale

    def box(x0, y0, x1, y1):
        return [s(x0), s(y0), s(x1), s(y1)]

    d.rounded_rectangle(box(0, 0, UNITS, UNITS), radius=s(tile_radius), fill=TEAL)

    # 헤드밴드는 획을 반지름 22 <b>가운데에</b> 두어야 기둥·귀와 중심이 맞는다.
    # 굵기를 안쪽으로만 먹이면 밴드와 기둥이 어긋나 귀 위에 날개가 생긴다.
    #
    # 아래쪽 반을 잘라낼 때 타일 색으로 덮으면 안 된다 — 타일 밖까지 칠해져
    # 둥근 모서리가 사각형이 된다. 마스크로 오려 낸 뒤 흰색만 얹는다.
    half = band_width / 2.0
    mask = Image.new("L", (canvas, canvas), 0)
    m = ImageDraw.Draw(mask)
    m.ellipse(box(26 - half, 26 - half, 70 + half, 70 + half), fill=255)
    m.ellipse(box(26 + half, 26 + half, 70 - half, 70 - half), fill=0)
    m.rectangle(box(0, 48, UNITS, UNITS), fill=0)

    # 밴드 끝에서 귀까지 내려오는 기둥. 밴드와 같은 폭, 같은 중심이다.
    m.rectangle(box(26 - half, 48, 26 + half, 56), fill=255)
    m.rectangle(box(70 - half, 48, 70 + half, 56), fill=255)

    img.paste(WHITE, (0, 0), mask)

    # 귀 부분. 기둥 끝을 덮으므로 기둥 마감은 따로 두지 않는다.
    x0, y0, x1, y1, r = cup
    d.rounded_rectangle(box(x0, y0, x1, y1), radius=s(r), fill=WHITE)
    d.rounded_rectangle(box(UNITS - x1, y0, UNITS - x0, y1), radius=s(r), fill=WHITE)

    if with_boom:
        bw = max(1, int(round(s(6))))
        d.line([s(70), s(74), s(70), s(77)], fill=WHITE, width=bw)
        d.arc(box(56, 70, 70, 84), start=0, end=90, fill=WHITE, width=bw)
        d.line([s(63), s(84), s(54), s(84)], fill=WHITE, width=bw)
        d.ellipse(box(54 - 3, 84 - 3, 54 + 3, 84 + 3), fill=WHITE)

    return img.resize((px, px), Image.LANCZOS)


# 크기마다 다른 그림. 작아질수록 굵고 단순해진다.
#
# 붐은 64 아래로 뺀다. 48px 에서는 획이 1px 남짓이라 마이크가 아니라 얼룩으로 읽히고,
# 그 얼룩이 헤드셋이라는 실루엣을 오히려 흐린다.
PLAN = [
    (256, 7, 20, (18, 50, 34, 74, 7), True),
    (128, 7, 20, (18, 50, 34, 74, 7), True),
    (64, 7, 20, (18, 50, 34, 74, 7), True),
    (48, 7.5, 20, (18, 50, 34, 74, 7), False),
    (32, 8.5, 19, (17, 50, 34, 75, 8), False),
    (16, 10, 18, (16, 49, 35, 75, 8), False),
]


def write_ico(images, path):
    """PNG 를 담은 다중 해상도 ICO. 윈도우는 Vista 부터 이 형식을 읽는다."""
    blobs = []
    for img in images:
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        blobs.append(buf.getvalue())

    header = struct.pack("<HHH", 0, 1, len(images))
    offset = len(header) + 16 * len(images)

    entries = b""
    for img, blob in zip(images, blobs):
        side = 0 if img.width >= 256 else img.width
        entries += struct.pack(
            "<BBBBHHII", side, side, 0, 0, 1, 32, len(blob), offset
        )
        offset += len(blob)

    with open(path, "wb") as f:
        f.write(header + entries + b"".join(blobs))


def main(ico_path, png_path):
    images = [draw_icon(*spec) for spec in PLAN]
    write_ico(images, ico_path)
    images[0].save(png_path)
    print(f"wrote {ico_path} ({', '.join(str(i.width) for i in images)})")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
