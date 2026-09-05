# The Rain Court — Medium

Blender로 직접 제작한 모듈형 산업도시 안뜰. ImageGen 아틀라스를 실제 메시 UV에 연결했습니다.

## 열기

web3을 HTTP 정적 서버의 루트로 제공한 뒤 /medium/ 을 엽니다. Pages: Framework None, build command `exit 0`, output `web3`. 번들링이나 외부 CDN이 필요 없습니다. `file://`은 ES 모듈 및 GLB 로딩 정책으로 지원하지 않습니다.

## 결과

- assets/rain-court.blend: 편집 가능한 원본, 조명과 카메라 포함
- assets/rain-court.glb: glTF 2.0 바이너리, 텍스처 포함, 웹 및 다른 엔진용
- assets/rain-court.fbx: 메시, UV, 임베디드 텍스처. 대상 엔진에서 재질 재연결이 필요할 수 있습니다.
- assets/surface-atlas.png: ImageGen 원본. BLEND 옆에 유지하세요.
- assets/preview.png 및 uv-checker.png: 실제 Blender 렌더
- assets/uv/*.svg: 실제 메시 UV 레이아웃
- assets/validation.json: 기하 및 UV 범위 검사
- tools/build_scene.py: 재생성 스크립트

## 단위와 재질

Blender: 미터, Z up. GLB: glTF 표준 Y up으로 변환. FBX: -Z forward / Y up. 바닥 크기는 약 18 × 15 m입니다. 머터리얼은 Principled BSDF 기반 metallic-roughness PBR이며 전용 엔진 셰이더가 필요하지 않습니다. Base Color는 sRGB, roughness 및 metallic은 재질 상수입니다. 생성형 normal/roughness 맵을 제공하는 것으로 가장하지 않습니다. 따뜻한 조명과 반사 모습은 대상 엔진 조명 환경에 따라 달라집니다.

## UV

아틀라스: 왼쪽 위 석재 / 오른쪽 위 청록 금속 / 왼쪽 아래 녹슨 철 / 오른쪽 아래 목재. UV 좌표 원점은 왼쪽 아래입니다. 각 상자 모듈의 여섯 면은 비율을 보존한 독립 아일랜드로 배치하며 경계 여백을 둡니다. 원통은 Blender 기본 cap/side 아일랜드를 해당 사분면에 맞춥니다. 동일 재질의 반복 모듈은 의도적으로 UV 공간을 재사용합니다. 장면 전체가 유일한 UV 또는 라이트맵을 갖는 구성은 아니며, 정적 라이트맵이 필요한 엔진에서는 별도 UV2를 생성해야 합니다. 재질 단위 메시 병합은 웹 드로콜을 줄이기 위한 것으로 재생성 스크립트에 원래 모듈 구성이 남아 있습니다.

## 재생성

`blender -b -t 4 -P tools/build_scene.py` (Blender 4.5 이상). 스크립트의 위치에서 출력 경로를 계산합니다. ImageGen 아틀라스는 입력 파일로 유지됩니다. 공통 프롬프트는 ../prompts/common.md 와 ../prompts/user-request.md 에 기록되어 있습니다.

Three.js 0.180.0은 vendor에 포함했고 MIT 라이선스는 vendor/LICENSE에 있습니다.

최종 검증: GLB/FBX 독립 재임포트에서 UV 누락, 범위 초과, 접힌 UV 폴리곤, 비정상 좌표 오류 0건. 베벨에서 생긴 극소 퇴화 면은 제거했고, 필요한 베벨 면은 아틀라스의 남는 띠에 비율을 보존해 매핑했습니다. 실제 ImageGen 아틀라스 해상도는 1254 × 1254입니다.
