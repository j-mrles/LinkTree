from __future__ import annotations

from array import array
from collections import deque
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from PIL import Image


@dataclass(frozen=True)
class Box:
    left: int
    top: int
    right: int
    bottom: int

    def padded(self, pad: int, w: int, h: int) -> "Box":
        return Box(
            left=max(0, self.left - pad),
            top=max(0, self.top - pad),
            right=min(w, self.right + pad),
            bottom=min(h, self.bottom + pad),
        )


def _iter_border(w: int, h: int) -> Iterable[tuple[int, int]]:
    for x in range(w):
        yield (x, 0)
        yield (x, h - 1)
    for y in range(1, h - 1):
        yield (0, y)
        yield (w - 1, y)


def _remove_edge_connected_dark_background(img: Image.Image, max_channel_threshold: int) -> Image.Image:
    """
    Turn edge-connected near-black pixels transparent.
    This preserves dark details inside the artwork because the flood-fill only
    removes pixels connected to the image border.
    """
    rgba = img.convert("RGBA")
    w, h = rgba.size
    px = rgba.load()

    bg = [[False] * w for _ in range(h)]
    q: deque[tuple[int, int]] = deque()

    def is_bg_candidate(x: int, y: int) -> bool:
        r, g, b, a = px[x, y]
        if a == 0:
            return True
        return max(r, g, b) <= max_channel_threshold

    for x, y in _iter_border(w, h):
        if is_bg_candidate(x, y):
            bg[y][x] = True
            q.append((x, y))

    # 4-neighbor flood fill
    while q:
        x, y = q.popleft()
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if nx < 0 or ny < 0 or nx >= w or ny >= h:
                continue
            if bg[ny][nx]:
                continue
            if not is_bg_candidate(nx, ny):
                continue
            bg[ny][nx] = True
            q.append((nx, ny))

    # Apply transparency
    for y in range(h):
        row = bg[y]
        for x in range(w):
            if row[x]:
                r, g, b, a = px[x, y]
                if a != 0:
                    px[x, y] = (r, g, b, 0)

    return rgba


@dataclass
class Component:
    area: int
    box: Box


def _label_components(rgba: Image.Image) -> tuple[list[Component], list[array]]:
    """
    Labels connected (4-neighbor) opaque regions.
    Returns (components, labels[y][x] -> component_id or -1).
    """
    w, h = rgba.size
    px = rgba.load()
    labels: list[array] = [array("i", [-1]) * w for _ in range(h)]
    comps: list[Component] = []

    def is_opaque(x: int, y: int) -> bool:
        return px[x, y][3] > 0

    for y0 in range(h):
        row = labels[y0]
        for x0 in range(w):
            if row[x0] != -1 or not is_opaque(x0, y0):
                continue

            comp_id = len(comps)
            q: deque[tuple[int, int]] = deque([(x0, y0)])
            row[x0] = comp_id

            area = 0
            left = right = x0
            top = bottom = y0

            while q:
                x, y = q.popleft()
                area += 1
                if x < left:
                    left = x
                if x > right:
                    right = x
                if y < top:
                    top = y
                if y > bottom:
                    bottom = y

                for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                    if nx < 0 or ny < 0 or nx >= w or ny >= h:
                        continue
                    if labels[ny][nx] != -1 or not is_opaque(nx, ny):
                        continue
                    labels[ny][nx] = comp_id
                    q.append((nx, ny))

            comps.append(Component(area=area, box=Box(left=left, top=top, right=right + 1, bottom=bottom + 1)))

    return comps, labels


def clean_logo(
    input_path: Path,
    output_path: Path,
    *,
    max_channel_threshold: int = 22,
    padding_px: int = 18,
) -> None:
    img = Image.open(input_path)
    rgba = _remove_edge_connected_dark_background(img, max_channel_threshold=max_channel_threshold)

    # Remove leftover UI artifacts (like the iOS home bar) by discarding
    # "thin-wide" components near the bottom edge, while keeping the logo
    # even if it's split into multiple components (character + curved text).
    w, h = rgba.size
    comps, labels = _label_components(rgba)
    if not comps:
        raise RuntimeError("No opaque pixels found after background removal.")

    keep_ids: set[int] = set()
    for cid, comp in enumerate(comps):
        bw = comp.box.right - comp.box.left
        bh = comp.box.bottom - comp.box.top

        is_thin_wide = bh <= 40 and bh > 0 and (bw / bh) >= 10
        is_near_bottom = comp.box.bottom >= int(h * 0.88)

        if is_thin_wide and is_near_bottom:
            continue
        if comp.area < 250:  # drop tiny specks
            continue

        keep_ids.add(cid)

    if not keep_ids:
        raise RuntimeError("Component filter removed everything; adjust thresholds.")

    # Build a new RGBA with only kept components.
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    out_px = out.load()
    in_px = rgba.load()

    union: Box | None = None
    for cid in keep_ids:
        b = comps[cid].box
        union = b if union is None else Box(
            left=min(union.left, b.left),
            top=min(union.top, b.top),
            right=max(union.right, b.right),
            bottom=max(union.bottom, b.bottom),
        )

    assert union is not None

    # Copy pixels by label membership (fast enough for this image size).
    for y in range(h):
        lab_row = labels[y]
        for x in range(w):
            cid = lab_row[x]
            if cid in keep_ids:
                out_px[x, y] = in_px[x, y]

    padded = union.padded(padding_px, w=w, h=h)
    cropped = out.crop((padded.left, padded.top, padded.right, padded.bottom))
    cropped.save(output_path, format="PNG", optimize=True)


if __name__ == "__main__":
    repo = Path(__file__).resolve().parents[1]
    src = repo / "gumgum" / "images" / "gengar_strawhat.png"
    backup = repo / "gumgum" / "images" / "gengar_strawhat_original.png"
    out = repo / "gumgum" / "images" / "gengar_strawhat.png"

    # Backup once (don’t overwrite if it already exists)
    if not backup.exists():
        backup.write_bytes(src.read_bytes())

    # Always process from the original capture to avoid compounding quality loss.
    clean_logo(backup, out)
