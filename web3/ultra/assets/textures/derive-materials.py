"""Reproduce material maps from the single original ImageGen atlas.

These normal and roughness maps are artistic luminance-derived estimates,
not measured scan maps. The albedo pixels originate in ImageGen.
"""
from pathlib import Path
import json
import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "material-atlas-source.png"
atlas = Image.open(SOURCE).convert("RGB")
w, h = atlas.size
assert w % 2 == 0 and h % 2 == 0
materials = [
    ("concrete", (0, 0, w // 2, h // 2), 0.76, 2.4),
    ("painted-metal", (w // 2, 0, w, h // 2), 0.48, 1.8),
    ("timber", (0, h // 2, w // 2, h), 0.57, 2.2),
    ("rust", (w // 2, h // 2, w, h), 0.75, 2.0),
]


def periodic_edges(pixels, width=40):
    """Taper opposing borders towards the same local average for repeat UVs."""
    pixels = pixels.copy()
    for axis in (0, 1):
        for i in range(width):
            weight = (1 - i / width) ** 2
            first, last = [slice(None)] * 3, [slice(None)] * 3
            first[axis], last[axis] = i, -i - 1
            first, last = tuple(first), tuple(last)
            a, b = pixels[first].copy(), pixels[last].copy()
            avg = (a + b) / 2
            pixels[first] = a * (1 - weight) + avg * weight
            pixels[last] = b * (1 - weight) + avg * weight
    return pixels


report = {"source": SOURCE.name, "sourceSize": list(atlas.size), "outputSize": [1024, 1024], "materials": []}
for name, box, roughness, normal_strength in materials:
    crop = atlas.crop(box).resize((1024, 1024), Image.Resampling.LANCZOS)
    rgb = periodic_edges(np.asarray(crop).astype(np.float32) / 255)
    albedo = Image.fromarray(np.uint8(np.clip(rgb, 0, 1) * 255), "RGB")
    albedo.save(ROOT / f"{name}-albedo.png", optimize=True)
    gray = rgb @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    blur = np.asarray(Image.fromarray(np.uint8(gray * 255), "L").filter(ImageFilter.GaussianBlur(5)), dtype=np.float32) / 255
    height = gray - blur
    dx = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) * normal_strength
    dy = (np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) * normal_strength
    normal = np.stack((-dx, dy, np.ones_like(height)), axis=-1)
    normal /= np.linalg.norm(normal, axis=-1, keepdims=True)
    Image.fromarray(np.uint8(np.clip(normal * 0.5 + 0.5, 0, 1) * 255), "RGB").save(ROOT / f"{name}-normal.png", optimize=True)
    rough = np.clip(roughness + (gray - gray.mean()) * 0.38, 0.25, 0.95)
    Image.fromarray(np.uint8(rough * 255), "L").save(ROOT / f"{name}-roughness.png", optimize=True)
    report["materials"].append({"name": name, "sourceCrop": list(box), "roughnessMean": round(float(rough.mean()), 3), "normalConvention": "OpenGL tangent-space +Y", "borderMaxDifference": float(max(np.abs(rgb[0] - rgb[-1]).max(), np.abs(rgb[:, 0] - rgb[:, -1]).max()))})

(ROOT / "material-provenance.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
print(json.dumps(report, indent=2))
