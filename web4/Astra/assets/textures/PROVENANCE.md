# Texture provenance

Generated using the built-in ImageGen tool for this project.

- `imagegen-atlas.png`: 2×2 diffuse material sheet: honey oak, coral clay, ivory plaster, sage moss/grass. Prompt requested orthographic, shadow-free full-bleed surfaces, no labels or architecture.
- `cottage-facade-unique.png`: a dedicated one-use cream plaster wall painting with asymmetrical cracks, doorway weathering, faint window runoff and a mossy lower edge. Prompt explicitly excluded actual doors/windows and perspective.
- `wood`, `roof`, `plaster`, `grass` PNGs: quadrants extracted by the Blender build. Normal and roughness maps derived from those ImageGen pixels, not independently generated PBR measurements.
- `shore-mask.png`: analytic smooth irregular radial intensity field; a data map, not color artwork.
- `wave-noise.png`: periodic analytical wave data used for animation.

The cottage's front-facing mesh polygons use a separate material and normalized X/Z UV coordinates spanning the facade once. Sampler uses EXTEND, not repeat. Other wall faces retain the reusable plaster material.
The facade texture and derived maps are packed into the Blender source and exported GLBs.
