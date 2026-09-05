# Bloom, atmospheric scattering and final image

`atmosphere-post.js` adds the viewer's HDR postprocessing. The earlier viewer had ACES exposure/tone mapping and a low-density `FogExp2`, but no bloom pass or volumetric integration. The new viewer removes that scene fog so the main view is fogged once.

## Render order and color

1. The existing planar reflection update runs outside the composer and keeps its linear HDR capture.
2. A main `RenderPass` renders the courtyard into a half-float HDR target with an unsigned-integer `DepthTexture`.
3. The volume pass reconstructs world positions from that depth and integrates in-scattering and transmittance along each view ray. A depth-aware composite upscales the result.
4. `UnrealBloomPass` extracts luminance above 1.05 in linear HDR and blurs it across five mip levels. Threshold transition width is 0.25, radius is 0.55, and the viewer's initial strength is 0.45. Bright emissive windows, lights and their reflected highlights can bloom. The entire color image is not blurred.
5. A restrained grade adds 2.5% saturation, a small cool shadow/warm highlight bias, and at most 8.5% corner shading.
6. `OutputPass` applies the renderer's ACES tone mapping, exposure and sRGB output conversion exactly once.

In Three r180, ordinary offscreen render targets do not apply the renderer's final tone mapping. The composer retains linear HDR through bloom, and does not gamma-decode the reflection a second time. Disabling postprocessing or entering wireframe disables the volume, bloom and grade; the beauty and output passes retain correct exposure and display conversion.

## The volume

The fog occupies world bounds X −14 to 14, Y 0.12 to 12, Z −12 to 12 metres. Ray/box intersection limits integration to that space; the first opaque surface depth limits the end of the ray. The camera can be outside the box. Background rays traverse only the finite box, so the distant backdrop does not receive an unbounded white overlay.

Density decays exponentially with height, fades over the volume's horizontal and upper boundaries, and varies with two octaves of smooth 3D value noise. Noise drifts slowly in world space. Reduced-motion preferences freeze that drift. Screen-stable stratified sample offsets break up integration bands without animated grain or temporal-history ghosting. Base extinction is 0.019 per metre, multiplied by the density control, height, noise and boundary terms. The sun's input scattering color is scaled by 0.25 before the phase term, preserving contrast in the stone and architecture at the initial 100% density setting.

Each sample accumulates Beer–Lambert transmittance and a single-scattering light estimate. Illumination includes muted ambient haze, a forward-biased directional component, and the viewer's two point lights at their actual world positions, colors, intensities and falloff ranges. This makes the warm shop and cyan utility light illuminate nearby air.

The sun component reads the actual directional-light shadow matrix and packed RGBA shadow map after the main beauty pass has updated them. Four comparisons soften the visibility test. Walls, roof modules and props can therefore block sunlit fog; this is geometry-shadowed volumetric sunlight, not a radial screen overlay. When scene shadows are disabled in Low quality, the pass reduces direct sunlight to a quiet unshadowed fill so it does not introduce bright light shafts through buildings. VSM shadow maps are not decoded by this module and use the same fallback.

The half-resolution result stores integrated scattering in RGB and transmittance in alpha. Upscaling compares each of four candidate samples against full-resolution eye-space depth. Samples from a distant wall or backdrop are rejected near foreground silhouettes. If thin foreground geometry has no matching sample, its source image is preserved rather than receiving the background's fog.

## Quality and controls

| Quality | Ray samples | Volume resolution | Beauty MSAA | Bloom input resolution |
| --- | ---: | ---: | ---: | ---: |
| High | 24 | 50% per dimension | 4 samples | 100% |
| Balanced | 16 | 45% per dimension | 2 samples | 75% |
| Low | 8 | 35% per dimension | None | 50% |

These percentages use the composer's physical-pixel dimensions after the renderer's quality-specific pixel-ratio cap. Bloom then generates its own lower-resolution mip chain. The geometry stays at the main renderer resolution; the low-resolution volume does not blur the courtyard geometry. Multisample beauty depth resolves into the corresponding depth texture. Both composer buffers have independent depth textures, and the volume reads the current buffer on each frame even when toggles change the swap order.

The public integration API is `createAtmospherePost({ renderer, scene, camera, sun })`, returning `render(timeInMilliseconds)`, `resize(cssWidth, cssHeight)`, `setQuality`, `setBloom(0…1.5)`, `setFogEnabled`, `setFogDensity(0…2)`, `setEnabled`, `setWireframe`, `status` and `dispose`. Resizing follows the renderer's current pixel ratio. A saved viewport image must call this renderer as well, after the reflection update, to include the displayed effects. Disposal releases the composer, depth/render targets and pass materials.

## Verification — 2026-09-06

- `npm run check` passes for the viewer, reflection module, postprocessing module and local server.
- A fresh browser tab loads the final GLB and all local passes with no console errors or warnings. An ANGLE derivative warning found during review was resolved by using explicit LOD 0 for the unmipped sun shadow texture inside the ray march.
- Compared bloom 0 with the default 45%, and volume disabled with its default enabled state at the same courtyard-level camera. Light halos and depth-dependent haze respond independently.
- Fog density 0% removes the volume contribution; 200% increases it. High → Low → Balanced → High restores shadows, depth-aware fog and the expected reflection resolution without a blank frame or visible alternating-buffer artifact.
- Wireframe disables the volume, bloom and grade while preserving the inspection view, then restores the effects when unchecked.
- Inspected hero and low cameras: stone corners emerge from the horizontal water, and reflected shop windows remain visible between them. Default fog density was reduced after the first low-camera comparison to preserve the stone contrast.
- The source, GLB, glTF and FBX terrain/UV checks are recorded in `paving-validation.json` and `export-validation.json`.

## Scope and limits

- This is a finite, single-scattering volume approximation. It is not a full multiple-scattering atmospheric simulator and does not use temporal accumulation or a 3D froxel history.
- Directional sunlight is shadowed in the volume. The two point-light scattering terms have distance falloff but no separate point-light volumetric shadows.
- Depth comes from opaque geometry. The shallow transparent water keeps `depthWrite = false` to preserve its soft boundary, so its underlying paving or ground limits the volume ray a short distance below the water. It is not a multilayer transparent-volume solution.
- The main camera's atmospheric pass does not render the medium again inside the planar-reflection texture or environment probe. It fogs the reflected surface as part of the main image.
- These are viewer rendering features. Portable GLB, glTF and FBX materials remain ordinary PBR; downstream renderers need their own bloom/volume setup. The Blender source can use its native renderer's atmosphere independently.

Primary references: [Three EffectComposer](https://threejs.org/docs/pages/EffectComposer.html), [Three UnrealBloomPass](https://threejs.org/docs/pages/UnrealBloomPass.html), and [Three OutputPass](https://threejs.org/docs/pages/OutputPass.html). Implementation details were also checked against the locally vendored Three.js 0.180.0 source, including its renderer tone-mapping conditions and packed shadow-depth format.
