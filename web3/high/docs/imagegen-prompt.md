# ImageGen production record

Tool: built-in `image_gen.imagegen`. New generation, no input images. Used as a UV-mapped albedo asset on real Blender meshes. Output copied to `assets/textures/rain-court-albedo.png` (1254 × 1254 PNG). No API-key or CLI fallback was used.

## Final prompt (verbatim)

Use case: stylized-concept. Asset type: production UV base-color material atlas for real 3D meshes in an abandoned industrial courtyard called AFTERLIGHT / The Rain Court. Generate one square 2048x2048 texture sheet, divided into exactly four equal square quadrants with boundaries precisely halfway horizontally and vertically. Top-left: weathered dark warm gray limestone/concrete with subtle pores, rain streaks, chips, moss flecks, NO brick grid. Top-right: aged russet red-brown brick clay surface with weathered gritty clay texture, no mortar grid (each mapped object is an individual brick). Bottom-left: aged desaturated teal painted sheet metal, worn edges and orange rust speckles, scratches, subtle industrial patina. Bottom-right: weathered dark honey brown wood grain, fine longitudinal grain and scratches, no boards or perspective. Every quadrant is a flat orthographic texture sample that fills its entire square; even neutral diffuse lighting, no shadows, no highlights, no vignette, no words, no labels, no borders, no objects, no perspective. These are albedo-only PBR texture tiles. Rich restrained realistic hand-crafted game environmental material detail. Keep all major detail away from exact quadrant seams.

## Inspection

Four quadrants are correctly aligned and free of text or perspective. Actual generated resolution differs from the requested 2048 square; the source retains the native resolution. Surface maps are derived deterministically by the Blender production script. The atlas is packed into the Blend/GLB and exported next to the glTF.
