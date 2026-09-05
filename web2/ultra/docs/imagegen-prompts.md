# ImageGen 제작 기록

## 생성 방식

- 도구: Codex 내장 ImageGen
- 분류: `stylized-concept`
- 용도: glTF 모델의 표준 PBR `baseColorTexture`에 사용할 4×4 산업 재질 아틀라스
- 원본 파일: `../assets/textures/district-atlas-imagegen.png`
- 생성 결과: 1536×1536 PNG, 4×4 셀
- 후처리 방침: ImageGen 원본은 그대로 보존하고, 필요한 normal/metallic-roughness/emissive 맵은 로컬 결정론적 조합 스크립트로 파생합니다.

## 사용자 프롬프트 원문

> UV에 맞는 텍스처는 ImageGen으로 생성하거나 조합

전체 제작 요청 원문은 [user-request.md](./user-request.md)에 보존되어 있습니다.

## 실제 제작 프롬프트

아래 텍스트를 수정 없이 내장 ImageGen에 전달했습니다.

```text
Use case: stylized-concept
Asset type: square game-ready base-color texture atlas for low-poly 3D sci-fi repair-district environment assets
Primary request: create a clean 4 by 4 atlas of sixteen distinct industrial surface swatches: worn blue-grey hull plating, charcoal deck plates, oxidized copper machinery, warm ivory ceramic armor, yellow hazard paint, black-and-yellow warning stripes, dark rubber, brushed steel, dusty concrete, teal painted metal, orange repair plating, burgundy utility panels, cyan emissive conduit pattern on near-black, amber emissive grille on near-black, scratched pale aluminium, and deep navy solar-panel cells
Style/medium: hand-authored stylized PBR base-color map, restrained painterly realism, readable at game distance
Composition/framing: exact orthographic square, sixteen equally sized square cells in a perfectly aligned 4x4 grid, edge-to-edge cells, no gutters, no perspective, no objects
Lighting/mood: flat neutral albedo only, no cast shadows, no directional lighting, no ambient occlusion baked in, no specular highlights
Color palette: cool graphite and blue-grey foundation with controlled cyan, amber, orange and ivory accents
Materials/textures: subtle scratches, seams, bolts and wear contained inside each cell; each cell should tile visually and remain legible at low resolution
Constraints: no text, no letters, no numbers, no logos, no trademarks, no watermark, no scene, no border around the whole image, no perspective, no photographed objects, no gradients caused by lighting, preserve the exact 4x4 grid
```

## UV 연결 원칙

아틀라스의 각 셀은 정규화된 UV 공간을 4등분한 영역에 해당합니다. 모델 생성기는 면 또는 부품 단위의 UV 섬을 선택한 셀 내부에 패딩을 두고 배치합니다. 각 glTF 메시 안에서는 UV 삼각형이 서로 겹치지 않으며 모든 좌표가 0–1 범위에 들어갑니다. 자세한 수치 검증 방법과 결과는 모델링 문서를 참고하세요.

