# Third-party software

- Three.js **0.180.0**, MIT license. Local runtime and the required GLTFLoader, OrbitControls, BufferGeometryUtils, Reflector and RoomEnvironment modules are vendored under `vendor/three/`. See `vendor/three/LICENSE` for the complete license. No CDN is used.
- Blender **4.5** authored and exported the geometry using the bundled glTF 2.0 and FBX exporters. Blender is needed only to rebuild or edit the source scene, not to run the viewer.
- Pillow and NumPy are used by `source/prepare_textures.py` for the authorised texture crop/composition and approximate data-map preparation.
- Material base-color source: one original built-in ImageGen output. See `imagegen-prompt.md` and `texture-manifest.json`.

The browser reflection pass in `main.js` uses an orthographic mirror camera and a world-space clipping plane. This is a viewer effect; exported water retains portable standard PBR material properties. The .blend includes its authored lighting and camera, while GLB/FBX are geometry/material exchange files. Imported FBX PBR maps may need reconnection depending on the target engine.
