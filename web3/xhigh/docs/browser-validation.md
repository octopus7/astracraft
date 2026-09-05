# Browser verification

The static page was loaded through the Codex in-app browser at `http://127.0.0.1:8313/xhigh/`. The parent task separately checked the same files through its integrated `web3` server.

Verified by UI interaction and screenshots:

- The actual GLB loads into WebGL and the loading state clears.
- Dragging rotates the scene, with changing wall/robot viewpoints.
- Pan mode changes the drag behavior and updates displayed world coordinates.
- The mouse wheel zooms the model, and Recenter returns to the courtyard.
- UV checker and wireframe settings visibly replace the display materials.
- Water reflections show the real courtyard walls, robots, shop lights and doors. An initial orthographic clipping defect was corrected using a mirrored orthographic camera and a world-space clipping plane.
- The downloads dialog exposes real local GLB, FBX, Blender and source-kit links. HTTP availability and file sizes are independently checked by `source/validate_static.mjs`.
- A 390 × 844 responsive viewport showed the scene and controls without horizontal overflow (`scrollWidth = clientWidth = 390`). The browser viewport override was reset afterwards.
- No browser console errors were observed after the reflection correction.

The browser uses renderer-specific lighting and planar reflections; Blender's Cycles stills are supplied separately under `assets/renders/`. The exchange files retain standard PBR materials so each destination engine can apply its own environment lighting.
