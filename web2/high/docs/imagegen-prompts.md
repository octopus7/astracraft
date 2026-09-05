# ImageGen texture prompt record

## 사용자 원문

> D:\github\astracraft 저장소에서 첨부 참고 이미지와 동일한 방향의 플레이 가능한 쿼터뷰 3D SF 수리 지구 게임을 제작해 주세요. 작업 위치는 반드시 web2/high/입니다. 모델링도 직접 제작하고 UV는 정돈된 0–1 범위의 비중첩 UV로 구성하세요. 다른 엔진으로 내보낼 수 있도록 범용 glTF 2.0(.gltf + .bin + PNG)과 표준 PBR 머터리얼을 사용하세요. UV에 맞는 텍스처는 ImageGen으로 생성하거나 조합하고, 프롬프트 원문 및 실제 제작 프롬프트를 web2/high/docs/ 아래 문서로 정리하세요. web2/index.html 대문에서 /high/로 이동할 수 있는 카드/링크도 추가하세요. 현재 다른 작업이 web2/medium을 동시에 만들고 있으니 medium 내부는 수정하지 말고, 공용 web2/index.html을 수정할 때 기존 변경을 보존하세요. 구현, 모델 검증, 빌드/테스트를 완료한 뒤 모든 관련 변경을 커밋하세요.

## 실제 제작 프롬프트

사용 도구: Codex 내장 ImageGen (`gpt-image-2` 계열 기본 경로)

분류: `stylized-concept`

```text
Use case: stylized-concept
Asset type: tileable game texture source atlas
Primary request: a clean four-quadrant material texture sheet for a stylized low-poly science-fiction repair district after rain
Scene/backdrop: flat orthographic material swatches only, no scene and no objects
Subject: four equal square swatches arranged in a precise 2x2 grid: oxidized deep teal painted metal with fine scratches; warm cream ceramic composite with subtle grime; dark graphite rubberized floor with fine speckle; aged copper-brass machinery metal with restrained patina
Style/medium: hand-painted PBR-friendly game texture, crisp stylized realism, high-frequency detail kept subtle
Composition/framing: perfectly front-facing square texture sheet; exact equal 2x2 quadrants; consistent scale; each swatch visually seamless at its own edges
Lighting/mood: neutral flat diffuse lighting, no cast shadows, no highlights, no ambient occlusion baked into the color
Color palette: deep teal, warm ivory, charcoal, oxidized copper, small muted amber accents only
Materials/textures: fine scratches, chipped paint, subtle rain wear, restrained industrial grime
Constraints: no objects, no perspective, no text, no symbols, no logos, no borders, no gutters, no watermark, no baked directional light; suitable as base-color source for a UV atlas
Avoid: photorealistic scene, panel lines spanning quadrants, dramatic lighting, glossy reflections, large focal damage
```

## 산출물과 가공

- `assets-source/repair-material-source.png`: ImageGen 원본 보존본
- `public/models/repair-atlas-basecolor.png`: glTF가 직접 참조하는 base color 텍스처
- `public/models/repair-atlas-orm.png`: 생성 스크립트가 재질 사분면에 맞춰 만든 ORM 텍스처. R=ambient occlusion, G=roughness, B=metallic
- `public/models/repair-atlas-emissive.png`: 신호등과 중계기용 amber emissive 텍스처

각 모델 primitive는 재질 사분면 내부에서 32×32 셀 단위로 face island를 패킹합니다. 셀 사이에는 8% 패딩을 두며 모든 UV는 0–1 범위에 있고 같은 primitive 안에서 겹치지 않습니다.
