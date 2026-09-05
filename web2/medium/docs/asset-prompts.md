# ImageGen 제작 프롬프트

사용 도구: Codex 내장 ImageGen  
분류: `stylized-concept`  
산출물: `assets/textures/material-atlas.png`

```text
Use case: stylized-concept
Asset type: tileable game texture atlas for UV-mapped modular sci-fi environment models
Primary request: one square 2-by-2 material atlas with four perfectly aligned equal quadrants: upper-left weathered charcoal painted metal panels, upper-right oxidized copper-orange industrial metal, lower-left rain-darkened concrete slabs, lower-right muted teal-gray machine casing panels
Style/medium: realistic game-ready PBR albedo/base-color texture, orthographic flat material capture, no perspective
Composition/framing: exact square canvas, four equal rectangular quadrants with hard straight boundaries at 50 percent horizontal and vertical; each quadrant evenly fills its cell
Lighting/mood: completely flat diffuse neutral lighting, no directional highlights, no cast shadows, no ambient occlusion baked in
Color palette: charcoal, rust orange, wet concrete gray, desaturated teal
Materials/textures: subtle wear, rain streaks, panel seams, restrained scratches; consistent texel density
Constraints: seamless/tileable within each quadrant; no objects, no perspective, no bevels, no text, no symbols, no logos, no watermark; exact orthographic UV texture sheet
Avoid: dramatic lighting, shadows, glowing elements, photographic objects, labels, uneven grid cells
```

아틀라스 규약은 좌상단 charcoal, 우상단 rust, 좌하단 concrete, 우하단 teal이다. glTF 좌표계의 UV 원점이 좌하단이므로 생성 스크립트에서 각 사분면을 이에 맞춰 매핑한다.

