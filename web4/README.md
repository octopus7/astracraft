# 포근골 3D 디오라마

이미지 목업을 바탕으로 Blender에서 모델링한 독립형 Three.js 장면입니다. 페이지 우측 상단의 스위치에서 서로 다른 메시 밀도를 가진 `로우폴리`와 `원본 무드` 장면을 즉시 전환할 수 있습니다.

## 실행

```powershell
node serve.mjs
```

브라우저에서 `http://127.0.0.1:4174`를 엽니다.

## 표현 요소

- 파스텔톤 집, 아치형 목조 다리, 석조 우물, 울타리와 식생
- 실시간 평면 반사를 사용하는 물웅덩이
- 반투명 수로와 부드러운 그림자
- ACES 필믹 톤매핑, 안개, CSS 기반 비네트/컬러 워시
- OrbitControls 기반 회전과 확대, 자동 회전 및 전체 화면

## Blender 소스

- `assets/models/cozy-village-source.blend`: 두 컬렉션과 조명·카메라를 포함한 편집 원본
- `assets/models/cozy-village-low.glb`: 로우폴리 웹 모델
- `assets/models/cozy-village-detail.glb`: 디테일 웹 모델
- `tools/build_village.py`: Blender에서 원본과 GLB를 재생성하는 빌드 스크립트
