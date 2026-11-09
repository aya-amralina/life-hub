"""Generate PWA icons: ink square with four sphere-coloured dots (money, work, study, body).

Run: python3 scripts/make_icons.py  → public/icons/*.png + favicon.svg
"""
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "public" / "icons"
INK = (34, 32, 28)
DOTS = [(0x5E, 0x8C, 0x6A), (0x5A, 0x7D, 0xB0), (0x8A, 0x79, 0xBE), (0xCC, 0x7F, 0x66)]  # money work study body
SS = 4  # supersampling


def render(size: int, content_ratio: float, rounded: bool) -> Image.Image:
    big = size * SS
    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if rounded:
        d.rounded_rectangle((0, 0, big - 1, big - 1), radius=int(big * 0.22), fill=INK)
    else:
        d.rectangle((0, 0, big, big), fill=INK)
    area = big * content_ratio
    r = area * 0.19  # dot radius
    gap = area * 0.12
    total = 4 * r + gap
    x0 = (big - total) / 2
    for i, color in enumerate(DOTS):
        cx = x0 + r + (i % 2) * (2 * r + gap)
        cy = x0 + r + (i // 2) * (2 * r + gap)
        d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=color)
    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    render(192, 0.62, rounded=False).save(OUT / "icon-192.png")
    render(512, 0.62, rounded=False).save(OUT / "icon-512.png")
    render(512, 0.5, rounded=False).save(OUT / "icon-maskable-512.png")  # inside the 80% safe zone
    render(180, 0.62, rounded=False).convert("RGB").save(OUT / "apple-touch-icon.png")
    dots = "".join(
        f'<circle cx="{11 + (i % 2) * 10}" cy="{11 + (i // 2) * 10}" r="4" fill="#{c[0]:02X}{c[1]:02X}{c[2]:02X}"/>'
        for i, c in enumerate(DOTS)
    )
    (OUT / "favicon.svg").write_text(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#22201C"/>{dots}</svg>\n'
    )
    print("icons written:", sorted(p.name for p in OUT.iterdir()))


if __name__ == "__main__":
    main()
