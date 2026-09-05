# ImageGen texture provenance

Built-in `image_gen` was used once. No external image-generation API or CLI was used. The returned image was visually inspected and copied to `assets/textures/imagegen-source-atlas.png`.

The tool returned **1254 × 1254 RGB**, despite the requested 2048 × 2048 dimensions. The original output is retained without upscaling. `source/prepare_textures.py` crops and prepares 512px production maps from this source, feathers tile boundaries, and derives approximate normal/roughness maps. The individual-brick swatch combines one brick's interior with fine grain from the slate quadrant, avoiding miniature brick walls painted onto physical bricks. These derived PBR channels are not measured material scans.

Exact generation prompt:

```text
Use case: photorealistic-natural
Asset type: One square 2048x2048 pixel PBR BASE COLOR texture atlas for a real Blender environment, AFTERLIGHT / The Rain Court, an abandoned post-industrial courtyard after rain.
Primary request: Generate exactly one flat production material atlas divided into four equal edge-to-edge 1024x1024 quadrants. The two dividing midlines must be at exactly 50% of the image width and height. The materials meet directly with zero gap, zero border, zero dividers, and zero padding. No captions, labels, typography, or text of any kind.
Top-left quadrant: weathered warm gray-brown brick masonry, horizontal bricks in running bond, fine aged mortar, varied subdued brown-gray brick albedo, fine granular worn clay detail, subtle moss speckles. Brick rows are straight, orthogonal, evenly sized, and run all the way to the quadrant edges.
Top-right quadrant: dark weathered slate/concrete paving surface with fine mineral mottling, minute granular detail and subtle hairline fissures. A continuous fine-grained surface, no individual stones, no large cracks, no large lines or slab divisions.
Bottom-left quadrant: muted oxidized teal painted steel, finely textured old paint, restrained worn rust scratches and tiny paint chips, subdued reddish brown oxidation details. Continuous metal surface without bolts or panels.
Bottom-right quadrant: desaturated old dark brown timber planks, straight parallel planks, subtle fine natural grain and age wear, restrained dark joints.
Style/medium: high-quality detailed tactile game material scan appearance, strictly orthographic front-on unlit albedo. Each quadrant should be visually seamless and tileable on its own, with compatible opposite edges and no noticeable feature clusters at edges.
Constraints: Pure diffuse intrinsic surface color only. Uniform flat exposure across the atlas. No perspective, no scene, no objects, no cast shadows, no baked lighting, no directional highlights, no reflections, no specular shine, no ambient occlusion, no gradients, no vignette, no wet highlights, no watermark. Do not render the title or any writing. Preserve exact equal quadrants, full-bleed material coverage, and the requested 2048x2048 square output.
```
