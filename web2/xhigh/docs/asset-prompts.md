# ImageGen 텍스처 제작 기록

## 사용 방식

- 도구: Codex 내장 ImageGen (`image_gen`)
- 분류: `stylized-concept`
- 결과 용도: glTF 표준 PBR 머터리얼의 `baseColorTexture`
- 결과 파일: `assets/textures/material-atlas-basecolor.png`
- 보조 맵: 생성된 알베도와 동일한 크기의 flat normal 및 quadrant별 ORM을 프로젝트 도구로 조합

## 실제 제작 프롬프트

```text
Use case: stylized-concept
Asset type: tileable game texture atlas for UV-mapped modular sci-fi repair-district models
Primary request: one square 2-by-2 material atlas with four perfectly aligned equal quadrants for a game-ready rain-soaked industrial science-fiction environment kit
Scene/backdrop: orthographic flat UV texture sheet, not a scene
Subject: upper-left rain-dark charcoal steel wall panels with fine vertical seams; upper-right oxidized copper-orange repair-bay metal; lower-left wet graphite stone plaza slabs with restrained cracks; lower-right desaturated teal machine casing with thin access-panel lines
Style/medium: realistic stylized PBR base-color/albedo texture, clean production game asset
Composition/framing: exact square canvas, four equal rectangular quadrants divided at precisely 50 percent horizontal and vertical, crisp straight boundaries, each material fills its entire quadrant
Lighting/mood: completely flat neutral diffuse capture, no directional highlights, no cast shadows, no ambient occlusion or reflections baked in
Color palette: charcoal black, weathered copper-orange, rain-wet graphite gray, muted teal-gray
Materials/textures: subtle rain streaks, edge wear, restrained scratches, consistent texel density, medium-scale details readable from a quarter-view camera
Constraints: each quadrant must be seamless/tileable within itself; exact orthographic UV sheet; no objects, no perspective, no bevels, no text, no symbols, no logos, no watermark
Avoid: dramatic lighting, shadows, glowing elements, photographic props, labels, decals, uneven cells, borders thicker than 4 pixels
```

## UV 아틀라스 배치

PNG 이미지의 시각적 배치는 다음과 같습니다.

| 이미지 영역 | 재질 | glTF UV 영역 |
|---|---|---|
| 좌상단 | rain-dark charcoal steel | U 0.0–0.5, V 0.5–1.0 |
| 우상단 | oxidized copper-orange metal | U 0.5–1.0, V 0.5–1.0 |
| 좌하단 | wet graphite stone | U 0.0–0.5, V 0.0–0.5 |
| 우하단 | muted teal machine casing | U 0.5–1.0, V 0.0–0.5 |

ImageGen 결과는 flat diffuse 알베도로 사용했습니다. `tools/generate-support-textures.mjs`가 동일 해상도의 normal map과 packed ORM을 생성합니다. ORM 채널은 R=Ambient Occlusion, G=Roughness, B=Metallic입니다.
