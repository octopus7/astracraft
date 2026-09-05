# Wet surface source assets

`scripts/make_wet_maps.py` deterministically generates shader data with NumPy and Pillow. It does not generate replacement artwork: the original ImageGen atlas, concrete albedo, and concrete normal remain unchanged.

- `assets/textures/wetness-map.png`: 1024 × 1024 linear grayscale world-space wetness, 0 = relatively dry and 1 = pooled water. Five existing puddle ellipses drive soft damp halos with irregular low-amplitude boundaries.
- `assets/textures/ripple-normal.png`: 512 × 512 linear RGB tangent normal in OpenGL +Y convention. Periodic low-amplitude waves have equal opposing image edges and can repeat without a seam.
- `assets/textures/wet-concrete-roughness.png`: original concrete roughness remapped to 0.20–0.50. This is artistic PBR data, not a measured surface scan.

The wetness image spans Blender x = −11…+11 m and y = −9…+9 m. The first PNG row is y = +9; the last is y = −9. In the Three.js Y-up scene, Blender y = −Three z. With `TextureLoader` and `flipY = true`, sample `vec2((world.x + 11.0) / 22.0, (9.0 - world.z) / 18.0)`. Clamp to the image bounds; do not repeat the wetness image.

The editable Blender wet paving material retains its packed UVMap and concrete imagery, applies a 0.38 linear base-color factor (about 0.65 sRGB at middle gray), and uses the variable roughness with clearcoat weight 0.45 and clearcoat roughness 0.14. Water is nonmetallic, IOR 1.333, roughness 0.10, with a subtle normal map and no extra clearcoat lobe. The opaque, shallow-water base color is an artistic approximation of the dark paving beneath the puddle, avoiding refraction and transmission dependencies in receiving engines.

GLB/glTF carry standard metallic-roughness PBR, normal maps and available glTF IOR/clearcoat extensions. FBX transfers mesh UVs and common material channels; receiving engines may need manual IOR and clearcoat assignments. World-space wetness modulation, local environment capture and camera-dependent planar reflection are web renderer features and must be implemented in the destination engine. Architecture, props, UVMap islands and intentional module repetition are unchanged.

The central puddle was broadened to Blender center (4.6, 0), radii (3.2, 3.55) m so the reflected shop window falls inside actual water from both the hero and street cameras. The shop-edge strip moved to center (2.6, 4.5), radii (4.1, 0.8) m. The deterministic irregular meshes have zero mutual triangle overlap; their nearest bounding edges leave approximately 0.088 m of damp paving. The world-space wetness map uses these same updated ellipses. Other puddle shapes retain their original dimensions.

Blender 4.5's exporter omits `KHR_materials_ior` for opaque materials unless a related transmission/volume/specular extension is emitted. `build_scene.py` therefore preserves the source water IOR explicitly in this standard extension after GLB/glTF export. It changes only material JSON and reconstructs the GLB JSON chunk/header, leaving geometry and texture buffer bytes intact. The modern Mix Color node makes the wet concrete factor exportable without baking or altering the albedo image.

To reproduce assets, run `make_wet_maps.py`, then run `build_scene.py` through a separate headless Blender process. The latter recreates the blend, GLB/glTF, FBX, beauty render, UV layouts and checker render.
