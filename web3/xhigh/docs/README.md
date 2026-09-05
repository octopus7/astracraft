# AFTERLIGHT — The Rain Court / XHigh

첨부 화면을 참고해 Blender에서 제작한 실제 3D 안뜰입니다. ImageGen 재질 원본을 UV에 맞는 텍스처로 가공했고, 웹 페이지는 모델을 직접 불러옵니다.

## 실행과 배포

Pages: Framework None, Build command `exit 0`, output directory `web3`. `/xhigh/`에서 바로 열립니다. 모든 Three.js 파일을 로컬 vendor에 포함하여 외부 CDN이나 빌드 단계가 필요 없습니다. 로컬에서는 저장소 web3/serve.mjs를 실행해 `/xhigh/`로 이동하세요. ES 모듈과 모델 로딩 때문에 `file://` 대신 HTTP로 실행해야 합니다.

## 조작

드래그 회전, Shift + 드래그 이동, 휠 확대. Orbit/Pan 모드와 Courtyard/Workshop/Mender 시점을 선택할 수 있습니다. R은 시점 초기화, H는 인터페이스 표시 전환입니다. Get scene에서 파일을 다운로드합니다.

## 파일과 이식

- `../assets/models/afterlight-rain-court.blend`: 원본, 카메라와 조명, 이미지 패킹 포함
- `../assets/models/afterlight-rain-court.glb`: glTF 2.0, 표준 PBR 재질과 텍스처 포함
- `../assets/models/afterlight-rain-court.fbx`: 메시와 UV, 임베디드 텍스처. 엔진의 FBX 임포터에 따라 PBR 맵을 재연결하세요.
- `../assets/textures/`: ImageGen 원본과 base color / roughness / normal 맵
- `../uv/`: 실제 프로토타입 UV 레이아웃 SVG와 체커 렌더
- `../source/build_scene.py`: Blender 제작 스크립트
- `../source/prepare_textures.py`: 텍스처 구성 스크립트
- `../assets/afterlight-source-kit.zip`: 폴더 구조를 유지한 Blender 원본·텍스처·UV·스크립트·문서 묶음. GLB/FBX는 별도 다운로드입니다.

Blender 단위는 미터, Z-up이며 GLB는 glTF의 Y-up으로 변환합니다. FBX는 -Z forward / Y up으로 출력합니다. Base Color는 sRGB, roughness 및 normal은 Non-Color로 연결합니다. Normal은 이미지의 높이 정보를 바탕으로 유도한 것으로 실측 재질 스캔이 아닙니다. 전용 엔진 셰이더 없이 Principled BSDF / metallic-roughness 기반 PBR을 사용합니다. 웹의 평면 반사 효과는 뷰어 표현이며 다른 엔진에서는 해당 엔진의 환경·반사 조명을 설정하세요.

## UV와 검증

고유 프로토타입은 베벨 처리 후 Smart UV Project로 펼치고 아일랜드 여백 0.018을 둡니다. 반복 모듈 인스턴스끼리는 의도적으로 UV를 공유합니다. 장면 전체를 하나의 비중첩 라이트맵에 넣은 구성이 아니므로 필요하면 대상 엔진에서 UV2를 추가하세요. 개별 메시 UV 및 GLB/FBX 재가져오기 검증 결과는 `validation.json`, 구성과 폴리곤 통계는 `asset-report.json`, 텍스처 기록은 `texture-manifest.json`에 있습니다.

## 재생성

Blender 4.5 이상: `blender --factory-startup -b --python source/build_scene.py -- --render`. 스크립트 위치를 기준으로 파일을 생성합니다. 텍스처 준비 스크립트에는 Python Pillow와 NumPy가 필요합니다. 공통 사용자 요청은 `../../prompts/user-request.md`, 실행 프롬프트는 `../../prompts/common.md`, 참조는 `../../prompts/reference.png`입니다.

Three.js 라이선스: `../vendor/three/LICENSE`.
