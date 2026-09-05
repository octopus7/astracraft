"""Reproduce linear shader-data maps for Rain Court wetness and ripples.

No generated art is replaced or repainted. The existing ImageGen concrete
roughness is remapped as PBR data; albedo darkening belongs to the material.
Requires NumPy and Pillow. Run before build_scene.py after changing parameters.
"""
from pathlib import Path
import json
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
TEX = ROOT / "assets" / "textures"
SIZE = 1024
PUDDLES = [(2.6, 4.5, 4.1, .8), (4.6, 0, 3.2, 3.55),
           (-5.6, 3.3, 1.6, 2.4), (-2, -6.6, 2.3, 1), (9, -1, 1, 5)]


def smoothstep(lo, hi, value):
    t = np.clip((value - lo) / (hi - lo), 0, 1)
    return t * t * (3 - 2 * t)


def save_gray(path, values):
    Image.fromarray(np.rint(np.clip(values, 0, 1) * 255).astype(np.uint8)).save(path, optimize=True)


# First PNG row is Blender y=+9 (Three z=-9). TextureLoader's flipY=true
# yields world Three UV = ((x+11)/22, (9-z)/18).
x, y = np.meshgrid(np.linspace(-11, 11, SIZE), np.linspace(9, -9, SIZE))
noise = (np.sin(x * 1.31 + y * .67) * np.cos(y * 1.81 - x * .29) * .42
         + np.sin(x * 3.17 - y * 2.43) * .19
         + np.sin(x * 7.83 + y * 9.17) * .09)
wetness = .10 + .12 * smoothstep(-.6, .6, noise)
for cx, cy, rx, ry in PUDDLES:
    radius = np.sqrt(((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2)
    boundary = radius + noise * .13
    core = 1 - smoothstep(.60, 1.14, boundary)
    damp_edge = (1 - smoothstep(.92, 1.46, boundary)) * .45
    wetness = np.maximum(wetness, np.maximum(core, damp_edge))
save_gray(TEX / 'wetness-map.png', wetness)

# Multiple periodic wave directions, small amplitude, no hard ring pattern.
# Include both periodic endpoints so opposite PNG edges are exactly equal.
n = 512
u, v = np.meshgrid(np.linspace(0, 1, n), np.linspace(1, 0, n))
du = np.zeros_like(u)
dv = np.zeros_like(v)
for ax, ay, phase, amplitude in [(3, 5, .23, .018), (-7, 2, 1.7, .012),
                                (11, -9, 2.3, .007), (17, 13, .9, .004)]:
    wave = np.cos(2 * np.pi * (ax * u + ay * v) + phase) * amplitude
    length = np.hypot(ax, ay)
    du += wave * ax / length
    dv += wave * ay / length
normal = np.stack((-du, -dv, np.ones_like(du)), axis=-1)
normal /= np.linalg.norm(normal, axis=-1, keepdims=True)
encoded = np.rint((normal * .5 + .5) * 255).astype(np.uint8)
Image.fromarray(encoded).save(TEX / 'ripple-normal.png', optimize=True)

rough = np.asarray(Image.open(TEX / 'concrete-roughness.png').convert('L'), dtype=np.float32) / 255
lo, hi = np.percentile(rough, [1, 99])
rough = .20 + .30 * np.clip((rough - lo) / max(hi - lo, .001), 0, 1)
save_gray(TEX / 'wet-concrete-roughness.png', rough)

report = {
    'wetness': {'path': 'assets/textures/wetness-map.png', 'size': [SIZE, SIZE],
                'color_space': 'linear data', 'blender_bounds_xy': [-11, 11, -9, 9],
                'png_first_row_blender_y': 9, 'three_texture_flipY': True,
                'three_world_uv': ['(x + 11) / 22', '(9 - z) / 18'],
                'puddle_ellipses_blender_xy': PUDDLES},
    'ripple': {'path': 'assets/textures/ripple-normal.png', 'size': [n, n],
               'color_space': 'linear data', 'normal_convention': 'OpenGL tangent-space +Y',
               'opposite_edge_max_byte_difference': int(max(
                   np.abs(encoded[0].astype(int) - encoded[-1]).max(),
                   np.abs(encoded[:, 0].astype(int) - encoded[:, -1]).max()))},
    'wet_concrete_roughness': {'path': 'assets/textures/wet-concrete-roughness.png',
                              'min': float(rough.min()), 'max': float(rough.max()),
                              'source': 'assets/textures/concrete-roughness.png'},
}
print(json.dumps(report, indent=2))
