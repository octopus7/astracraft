# AFTERLIGHT Rain Court — ImageGen material provenance

One original raster texture atlas was generated with the built-in `image_gen.imagegen` tool on 2026-09-05. No API key or CLI fallback was used.

## Original asset

- Workspace source: `../assets/textures/material-atlas-source.png`
- Tool output: `C:/Users/blendue/.codex/generated_images/01a0719b-a707-7641-b2c4-69e7437d9fc3/exec-8e49902d-782d-4855-a0a6-858ab528de7f.png`
- Requested resolution: 2048 × 2048. Actual generated resolution: 1254 × 1254 pixels.
- Layout: upper-left concrete, upper-right painted metal, lower-left timber, lower-right rust.
- Visual inspection confirmed four equal material regions, a straight-on flat surface view, fine surface detail, and no text or borders.

## Final prompt

```text
Use case: photorealistic-natural
Asset type: PBR material diffuse albedo texture atlas for a realistic ruined industrial city game environment called AFTERLIGHT Rain Court.
Primary request: Generate exactly one perfectly square 2048 by 2048 pixel texture atlas, divided mathematically into exactly four equal square quadrants in a strict 2 by 2 grid. Each quadrant is filled edge-to-edge by its one material. There are no gutters, dividing strokes, frames, margins or text.
Composition/framing: Perfectly flat orthographic top down, photographed straight at the material plane, no perspective, no objects, no background. Materials are fine and medium scale, believable photogrammetry-like surface detail; each quadrant should look seamless and suitable for repeating UV texture mapping.
Top-left quadrant: weathered aged grey concrete and olive-grey stone composite; granular cement, very fine cracks, tiny pitted aggregate, subtle aged damp olive staining, restrained variation.
Top-right quadrant: old oxidized desaturated dark teal painted metal; patches of worn teal paint revealing dark iron, fine scratches, fine rust spots, nuanced oxidation and weathering.
Bottom-left quadrant: dark brown rain-damp timber, aged fine vertical longitudinal wood grain, subtle splits, very dark desaturated walnut brown, uniform timber surface without boards or planks or seams.
Bottom-right quadrant: weathered dark iron with deep brown and reddish dark rust mottling, rough fine oxidized steel grain, tiny corrosion pits and fine scratches.
Lighting: neutral completely even diffuse albedo illumination ONLY. No baked lighting, no gradients, no shadows, no highlights, no reflections, no specular shine, no ambient occlusion, no bevels, no 3D depth.
Constraints: Exact four regions aligned to image center at 50 percent width and 50 percent height. No extra panels. Absolutely no text, labels, numbers, symbols, signage, logos, watermarks, people, objects, frame or border.
```

## Derived material maps

The user authorized atlas cropping and texture derivation. `../assets/textures/derive-materials.py` reproduces all derivatives using Pillow and NumPy. It crops the source into exact 627 × 627 pixel quadrants, resamples each to 1024 × 1024 using Lanczos, and tapers the 40-pixel opposing edge strips to their shared average for repeat UV sampling. Resampling does not create additional source detail.

| Material | Albedo | Normal | Roughness |
|---|---|---|---|
| Concrete | `concrete-albedo.png` | `concrete-normal.png` | `concrete-roughness.png` |
| Painted teal metal | `painted-metal-albedo.png` | `painted-metal-normal.png` | `painted-metal-roughness.png` |
| Damp timber | `timber-albedo.png` | `timber-normal.png` | `timber-roughness.png` |
| Rusted dark iron | `rust-albedo.png` | `rust-normal.png` | `rust-roughness.png` |

All map files live in `../assets/textures/`. Albedos are RGB color textures and should use sRGB decoding. Normals are RGB tangent-space OpenGL +Y maps and should use linear sampling. Roughness maps are linear single-channel grayscale textures.

Normal maps are gentle luminance-gradient estimates after removing broad color variation with a Gaussian blur. Roughness is an artistic grayscale estimate with material-specific base values, varied by albedo luminance. These are useful PBR inputs, but they are not measured physical scan maps. Metallic factors and scene wetness are assigned by the renderer, not inferred by the image generator.

`material-provenance.json` records source crop coordinates, map resolution, normal convention, roughness averages and opposing edge validation. The unmodified ImageGen output is preserved as `material-atlas-source.png`.

Reproduce from the texture folder:

```sh
python derive-materials.py
```
