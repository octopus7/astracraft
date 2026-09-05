# Rain surface rendering — 2026-09-06

## Implemented behavior

`rain-reflections.js` supplements the portable PBR scene with camera-dependent planar reflections. A single Three.js r180 Reflector captures the real shop, robots, masonry and lights above a horizontal plane at y=0.166 m. Puddles and wet paving share this image. It is not an SSR pass and does not depend on an object remaining visible in the main camera view.

The Reflector is kept outside the main scene and explicitly updated before drawing the scene. Its local projection is converted to world space. Water is hidden during capture; paving temporarily uses an unpatched PBR material that has no reflection-target sampler. This lets exposed stones appear in the water without framebuffer feedback. Visibility, materials, render target, XR state and shadow update state are restored afterward. Rebuilding quality-dependent shadow resources requests a global shadow refresh before the next capture.

The half-float reflection target is linear HDR. Its radiance is combined inside Three's physical lighting integration before the GGX/Fresnel BRDF and final tone mapping. Paving uses a wet clearcoat lobe; water uses metalness 0 and IOR 1.333. A roughness-dependent nine-tap filter softens the reflection; animated world-space normal data produces subtle distortion. Reduced-motion preferences stop the ripple animation.

The world-space wetness map controls paving color, roughness and coating strength. Water mesh boundary interpolation fades the shoreline while the wetness map breaks up transitions. Drying to 0% removes the water layer and restores the drier paving. The two main pools were resized to cover the actual floor locations where the shop windows reflect from the hero and courtyard-level cameras. Their triangles do not overlap. Paving now slopes toward the pools: its planar contribution fades with geometric slope and distance from the horizontal water plane, preserving the environment-probe fallback on tilted or raised stones. Water remains horizontal and depth-tests against exposed stone edges.

After loading the model, a 256px CubeCamera captures the actual courtyard. PMREM prefilters that capture for the other PBR materials, replacing the bootstrap RoomEnvironment. The environment probe is static because this scene's objects and lights are static. Changes to scene content or light positions would need another probe capture.

## Controls and rendering budget

- High: reflection long edge ≤1024px; capture whenever the camera changes.
- Balanced: reflection long edge ≤768px; at most approximately 30 captures/sec while moving.
- Battery saver: reflection long edge ≤384px; at most approximately 15 captures/sec while moving.
- A stationary camera reuses the last reflection image. Ripple shading continues without re-rendering the scene into the target.
- Scene reflections toggles the planar contribution, preserving the captured environment fallback.
- Surface wetness interpolates 0–100%. Wireframe temporarily disables the planar contribution.
- Resizing, quality changes and reflection/wetness toggles invalidate the appropriate cached planar view. Saving a view forces a current capture first. Volumetric fog and bloom are applied afterward in the HDR postprocessing pipeline; they do not invalidate the planar capture.

These are quality limits, not a claim of measured GPU frame rates. Planar reflection adds one scene draw when refreshed; the original 3,361 mesh instances remain combined into 22 render batches.

## Verification

- Browser GLB load and physical shader compilation succeeded without console errors or warnings.
- The captured reflection image was temporarily inspected directly and contained the actual upside-down shop, robots and walls. The diagnostic code and temporary tab were removed.
- Compared Scene reflections on/off at the same camera: the reflected shop lights change while the model and direct lighting remain.
- Inspected the Courtyard level preset: window frames and lanterns are visible in the enlarged right-hand puddle at the correct camera-dependent locations.
- Surface wetness 0% removes the water and dries the paving; 100% restores the wet state.
- High → Battery saver → High changes reflection resolution and restores the reflection with shadows; camera preset changes update it correctly.
- GLB, glTF and FBX were regenerated and independently re-imported into Blender; UV and export checks pass in `export-validation.json`.

## Portability and reproduction

The new wetness, roughness and ripple maps are local PNG data resources. `scripts/make_wet_maps.py` generates them deterministically. `scripts/build_scene.py` rebuilds editable Blender geometry and PBR exports, and `scripts/package_delivery.py` rebuilds download archives. Runtime modules and Three add-ons are included locally; no CDN or new build step is required.

Source exports carry common PBR channels and the glTF clearcoat/IOR extensions. The browser's camera capture, world-space wetness blending, shoreline alpha and animation are renderer features. Other engines must configure equivalent effects; FBX importers may require manual IOR/clearcoat setup. The source Blender water uses an opaque substrate approximation, so Blender and web pixels are not identical.

Primary implementation references: [Three r180 Reflector source](https://github.com/mrdoob/three.js/blob/r180/examples/jsm/objects/Reflector.js), [physical material](https://threejs.org/docs/pages/MeshPhysicalMaterial.html), [CubeCamera](https://threejs.org/docs/pages/CubeCamera.html).
