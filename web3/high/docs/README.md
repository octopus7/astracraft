# AFTERLIGHT / The Rain Court — High

An original, deterministic Blender scene built from the supplied reference image. The composition preserves the enclosed industrial courtyard, masonry walls, repair storefront, warm lanterns, teal signals, three small service robots, cargo, pipework and wet paving. The interpretation is a stylized architectural diorama, not a pixel-identical reproduction.

## Open the viewer

Serve `web3/` as the static web root and visit `/high/`. No build and no network dependencies are required. Pages settings: Framework **None**, build command **`exit 0`**, output directory **`web3`**. The home link is `../`.

For a standalone local preview, run `node scripts/serve.mjs` from this directory and open http://127.0.0.1:8132. ES modules and GLB fetching require HTTP; opening index.html as a file URL is unsupported.

- Drag: orbit; Shift + drag: pan; wheel / pinch: zoom.
- Pan button changes the primary drag gesture; Recenter or R restores the view.
- WASD / arrows move the camera target. Slow orbit provides a continuous inspection.
- Scene files opens downloads. Shadows can be toggled. The viewer also supports fullscreen.
- All Three.js 0.180.0 runtime dependencies and its MIT license are in `vendor/`.

## Portable deliverables

- `assets/models/afterlight-rain-court.glb`: recommended interchange file with embedded standard metallic/roughness PBR maps, normals, emission and lights.
- `assets/models/afterlight-rain-court.gltf`, `.bin`, adjacent texture PNGs: unpacked equivalent. Keep these files together. Included together in the production kit.
- `assets/models/afterlight-rain-court.fbx`: geometry, UVs and embedded image textures. FBX has no universally consistent metallic/roughness convention; reconnect the supplied roughness and normal maps if required by the destination importer. GLB is the material reference.
- `assets/models/afterlight-rain-court.blend`: editable original meshes, named material groups, scene lighting, hero camera and packed texture images. Blender 4.5.
- `assets/afterlight-source-kit.zip`: glTF + BIN + images, script, UV layouts and documentation. Large binary formats remain separate downloads so every file stays below the 25 MiB Pages limit.
- `assets/renders/hero.png`, `preview.png`: original Cycles hero render. `docs/viewer-desktop.png` and `docs/viewer-mobile.png`: real browser captures.

The Blender source uses metres, Z up. glTF uses the standard Y-up conversion; FBX exports Y up / -Z forward. Geometry is grouped by architectural function. No plug-ins, linked libraries, custom shader nodes, opacity-cutout foliage, or geometry-node dependencies are required. Puddles are reflective polygon surfaces rather than fluids. The web viewer supplies its own economical lighting and environment; browser reflections and Blender ray-traced reflections differ.

## Texture and UV production

The built-in ImageGen tool generated `assets/textures/rain-court-albedo.png` as a four-quadrant material atlas: upper-left limestone, upper-right clay brick, lower-left teal metal, lower-right timber. Output resolution is 1254 × 1254. The exact final prompt is documented in `imagegen-prompt.md`. Generated surface luminance is used by the production script to derive restrained tangent-space normal detail and a roughness map. These are artistic PBR approximations, not measured material scans.

UVMap is the intended reusable atlas UV set. Each modeled box has six distinct islands fitted to its material quadrant, with aspect-preserving projection and a 0.008 UV inset/gutter. Independent repeated brick, paving, crate and pipe modules intentionally share this atlas. Bevel edges inherit adjacent UVs. Different reused modules may overlap by design; there is no claim that the entire scene uses unique UV0.

LightmapUV is a second UV set for non-overlapping faces: every final face, including applied bevels, is placed in a separate square cell with 20% free cell width. Planar face proportions are preserved. This set guarantees separation, but is not optimized for a particular engine's target lightmap resolution; dense masonry should be split or repacked for high-quality baked lightmaps. Text meshes use Blender's smart unwrap.

`uv/` contains actual UVMap SVG exports per mesh, selected LightmapUV SVG exports, the color checker texture, and a checker render using the exact production UVs. `material-module-layout.svg` shows the available six-face packing cells, while the other SVGs show actual fitted islands. `docs/uv-manifest.json` lists mesh/module counts and UV policies.

## Reproduce and verify

Run `blender --background --python scripts/build_scene.py` to rebuild the mesh scene and exports, using the supplied ImageGen atlas. The script uses deterministic seed 42 and runs in an independent headless Blender process. It also renders the hero and checker proofs.

Run `blender --background --python scripts/validate_exports.py` to import the `.blend`, `.glb`, `.gltf` and `.fbx` independently, check UV bounds and resource existence, and certify unique UV1 face-cell containment. Results: `docs/export-validation.json`.

With the local server running, `node scripts/validate_web.cjs` uses Playwright (set `PLAYWRIGHT_PATH` to its installed package when needed). It tests GLB load, orbit, pan, zoom, reset, tour, download responses, and desktop/mobile viewports. Results: `docs/web-validation.json`. Browser tools were unavailable in this session, so validation uses an independent headless Chrome process.

Run `python scripts/package_assets.py` to regenerate preview.png and the portable source ZIP. File sizes are checked against 25 MiB.

## Provenance

See `user-request.md` and `common.md` for the user's instructions. Original reference: `../prompts/reference.png` relative to `web3/`. The high edition writes only `web3/high/`; the comparison home belongs to the parent task. No external asset packs or remote CDNs are used. The atlas was generated with the built-in ImageGen tool; geometry was authored directly through Blender's mesh API by the included script.
