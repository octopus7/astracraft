# Sol / Astra village

Run `node web4/serve.mjs` from the repository root. Open http://127.0.0.1:4174/.
The root redirects to `Sol/`; the village-name links switch to `Astra/` and back.
Camera position, target, zoom, quality mode and rotation preference are passed through sessionStorage.

Sol retains the original Blender assets. Astra has its own Blender source and two GLBs,
ImageGen material textures, a non-repeating cottage facade, curved roof trim and bridge rails,
additional leaves and flowers, and animated masked water.

Rebuild Astra with Blender 4.5: `blender --background --python web4/Astra/tools/build.py`.
The build uses Sol's primitive helpers without running or replacing the Sol build.

Astra water: explicit 512px intensity mask, feathered reflection opacity, wet-soil transition,
depth tint, Fresnel reflection, scrolling wave data and sparse shoreline foam. The stream
has flowing normal variation and bank foam. Orthographic planar reflection is rendered in
linear HDR; high-threshold bloom uses a small kernel and strength 0.15 before ACES output.
Water animation freezes for reduced-motion preferences.

The Blender source packs image textures. The animated water and screen bloom are web shaders,
not baked into GLB materials. No CDN or remote fonts are needed.

Checks: `node web4/Sol/tools/validate-assets.mjs` and `node web4/Astra/tools/validate.mjs`.
