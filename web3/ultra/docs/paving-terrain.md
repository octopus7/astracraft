# Sunken and tilted paving

The paving now consists of individually tilted rigid flagstones settling towards the five existing puddles. This is real mesh placement in the Blender source, GLB/glTF and FBX, not a normal-map illusion. The two water pools adjusted during the reflection pass retain their current centers and irregular XY outlines.

`scripts/build_scene.py` computes each tile's nearest normalized elliptical distance and an inward downhill direction. A smooth basin settles the center by up to 6.50 cm, while a low shoulder and independent settling offsets lift irregular shoreline edges by up to 7.61 cm. The shoreline tilt varies from 2.18° to 6.00°; remote dry paving varies more subtly, beginning at 0.31°. The tilt direction differs from the ellipse's inward gradient by at most approximately 12.3°. Rotations use a normal-alignment quaternion composed with the existing tile yaw, and packed tile UV islands remain intact.

The terrain uses its own `random.Random(271828)`. The original seed-42 calls are consumed in their original order, including the former submillimeter water-height jitter call. Consequently, architecture, robot, cargo and vegetation placement remain unchanged. Fracture details are transformed with their supporting tile instead of remaining suspended at a fixed world height.

All water vertices now lie exactly at Blender Z = 0.166 m, which is Three.js Y = 0.166 m. Tile tips emerge through the water naturally through the renderer's depth test. The supporting mortar surface is at −0.070 m, and the plinth top is at −0.170 m, preventing the subgrade from concealing depressed tile faces. The plinth bottom remains at −0.950 m. These two supporting modules have regenerated UV layouts; the flagstone UV layout is unchanged.

## Measured validation

`docs/paving-validation.json` records a 5 × 5 grid on each transformed tile's upper face, tested against the exact irregular puddle polygons. A 2 mm band distinguishes submerged and exposed samples from points directly at the waterline.

| Check | Result |
| --- | --- |
| Scene object count | 3,361 before and after |
| Unexpected non-ground transform changes | 0 |
| Water outlines | All five preserve all 29 unique XY positions |
| Water height variation | 0 m |
| Top-face samples inside water | 1,659 |
| Submerged / exposed / waterline-band samples | 1,120 / 492 / 47 |
| Tiles straddling the waterline | 45 |
| Core tiles sampled at their centers | 23 |
| Core center water depth | 3.94–10.14 cm |
| Deepest sampled paving below water | 12.90 cm |
| Minimum tile-top clearance above mortar | 10.57 cm |
| Exported tile tilt range | 0.31–6.00° |
| GLB/glTF container and GLB/glTF/FBX re-import | Passed |

The generator asserts a horizontal water plane, submerged basin centers, minimum underlay clearance and a meaningful number of partly exposed shoreline stones. The final report also includes an independent comparison of exported transforms and water outlines with the preceding committed scene. UV overlap and degeneracy checks are recorded separately in `docs/export-validation.json`.

## Visual evidence

- `assets/rain-court-hero.png` and `preview.jpg`: rebuilt hero view.
- `assets/rain-court-paving-detail.png`: additional low camera view for edge and waterline inspection. Rendered from the saved blend at camera position `(7.5, -9, 3.3)`, looking at `(2, 2, 0.15)`, perspective lens 34 mm, 1280 × 800, 24 Cycles samples. The source blend retains its original hero camera.
- `assets/uv/checker-court.png`: regenerated checker render using the same posed stones.

To rebuild the source and standard exports, run Blender headlessly with `--background --factory-startup --python scripts/build_scene.py`, then run `scripts/validate_exports.py -- --input all` through a separate Blender process. The GLB is fully written and checked for its material IOR metadata in a private sibling file before atomic publication, so an active web download does not receive a partially rewritten model.
