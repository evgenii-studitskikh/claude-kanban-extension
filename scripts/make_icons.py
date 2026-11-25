"""Generate extension icons and the store promo tile.

Usage: python3 scripts/make_icons.py
Requires Pillow. Output: public/icon{16,32,48,128}.png, store/promo-small-440x280.png
"""
from PIL import Image, ImageDraw, ImageFont

BG = (217, 119, 87, 255)      # terracotta
FG = (250, 246, 240, 255)     # off-white
SS = 8                        # supersampling factor


def board_mark(size: int, pad_ratio: float) -> Image.Image:
    """Rounded tile with three Kanban columns of different heights."""
    s = size * SS
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    pad = round(s * pad_ratio)
    box = s - 2 * pad
    d.rounded_rectangle([pad, pad, s - pad, s - pad], radius=round(box * 0.22), fill=BG)
    inner = box * 0.2
    gap = box * 0.08
    col_w = (box - 2 * inner - 2 * gap) / 3
    top = pad + inner
    full = box - 2 * inner
    for i, h in enumerate((1.0, 0.62, 0.82)):
        x0 = pad + inner + i * (col_w + gap)
        d.rounded_rectangle([x0, top, x0 + col_w, top + full * h],
                            radius=round(col_w * 0.25), fill=FG)
    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    # Chrome Web Store: 128px icon = 96px artwork + 16px transparent padding.
    board_mark(128, 16 / 128).save("public/icon128.png")
    for size in (16, 32, 48):
        board_mark(size, 0.0 if size == 16 else 0.04).save(f"public/icon{size}.png")

    tile = Image.new("RGBA", (440, 280), (250, 246, 240, 255))
    tile.alpha_composite(board_mark(150, 0.0), (40, 65))
    d = ImageDraw.Draw(tile)
    try:
        big = ImageFont.truetype("DejaVuSans-Bold.ttf", 30)
        small = ImageFont.truetype("DejaVuSans.ttf", 17)
    except OSError:
        big = small = ImageFont.load_default()
    d.text((215, 100), "Kanban", font=big, fill=(40, 40, 40, 255))
    d.text((215, 135), "for Claude projects", font=small, fill=(90, 90, 90, 255))
    d.text((215, 160), "Local-only. No tracking.", font=small, fill=(150, 90, 70, 255))
    tile.convert("RGB").save("store/promo-small-440x280.png")


if __name__ == "__main__":
    main()
