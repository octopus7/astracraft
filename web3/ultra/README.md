# AFTERLIGHT / The Rain Court — ULTRA

Blender에서 제작한 산업도시 안뜰 디오라마와 정적 오프라인 3D 뷰어입니다. `index.html`은 실제 GLB 메시를 로딩합니다. 이미지 배경은 로딩 중 미리보기이며 회전 가능한 장면을 대체하지 않습니다.

물웅덩이와 젖은 포장에는 실제 안뜰의 평면 반사, 공간별 젖음 분포, 잔물결과 부드러운 물 가장자리가 적용됩니다. 주변 금속은 안뜰에서 캡처한 환경맵을 사용합니다. **Settings → Scene reflections**로 반사를 비교하고, **Surface wetness**로 건조 상태부터 비 온 뒤 상태까지 바꿀 수 있습니다. **Courtyard level** 카메라에서는 창문 반사를 가까이 볼 수 있습니다. Render quality는 반사 해상도와 갱신 빈도도 조절합니다.

HDR 블룸, 태양 그림자로 차폐되는 볼류메트릭 안개, 약한 색 보정·비네트가 적용됩니다. **Light bloom**은 조명 번짐을, **Volumetric fog / Fog density**는 안개 유무와 밀도를 조절합니다. 품질 설정은 안개 샘플 수와 안티앨리어싱도 조절합니다. 타일은 기존 웅덩이 중심 쪽으로 불규칙하게 침하·기울어지며, 수평 수면 위에 노출된 모서리가 자연스러운 물가를 만듭니다.

## 열기

저장소의 `web3`를 HTTP로 제공하면 `/ultra/`에서 열립니다. Cloudflare Pages: Framework **None**, Build command **exit 0**, Build output directory **web3**. 외부 CDN·계정·서버 API가 필요하지 않습니다. ES 모듈과 GLB 로딩 때문에 파일을 더블클릭하는 `file://` 대신 HTTP 서버를 사용하세요.

```powershell
node scripts/serve.mjs
```

## 원본과 이동 가능한 파일

- `assets/rain-court.blend`: 압축 저장한 Blender 원본, 텍스처 내장, 컬렉션·카메라·조명 포함
- `assets/rain-court.glb`: 웹 뷰어 및 엔진 이동용, 표준 metallic/roughness PBR
- `assets/rain-court.fbx`: 실제 메시 FBX, 옆의 `textures/` 파일을 상대 경로로 참조
- `assets/gltf/`: 분리형 glTF, 버퍼 및 텍스처
- `assets/textures/`: ImageGen 원본 atlas와 albedo·roughness·OpenGL normal, 파생 스크립트
- `assets/uv/`: 모든 고유 메시의 SVG UV 레이아웃, 매니페스트, 체커 및 체커 렌더
- `downloads/`: glTF / texture / 전체 제작 파일 ZIP (큰 묶음은 독립 part ZIP)
- `assets/rain-court-hero.png`: 실제 Blender 렌더
- `preview.jpg`: 비교 대문용 실제 렌더 축소본

전체 제작 ZIP에는 정적 뷰어와 로컬 라이브러리도 포함됩니다. ZIP 안에 다운로드 ZIP들을 다시 넣는 재귀 중복은 피했습니다. 압축 해제 후 다운로드 묶음까지 다시 만들려면 Python으로 `scripts/package_delivery.py`를 실행하세요. 여러 part ZIP은 모두 같은 폴더에 풀면 됩니다.

FBX의 재질 자동 연결은 수신 엔진에 따라 다릅니다. 이 경우 텍스처 폴더의 albedo를 sRGB로, normal·roughness를 linear로 다시 연결하세요. GLB/glTF가 PBR 이동의 기준 파일입니다. Blender 조명·AgX·컴포지터와 실시간 웹 조명은 별도 렌더러이므로 픽셀 단위 결과는 다릅니다.

## 다시 제작

```powershell
& 'C:/Program Files/Blender Foundation/Blender 4.5/blender.exe' --background --factory-startup --python scripts/build_scene.py
& 'C:/Program Files/Blender Foundation/Blender 4.5/blender.exe' --background --factory-startup --python scripts/validate_exports.py -- --input all
```

`build_scene.py`는 고정 시드 42로 실제 메시를 생성하고 UV·원본·GLB·glTF·FBX·렌더를 재생성합니다. ImageGen을 자동 재호출하지 않고 기록된 텍스처를 사용합니다. 모델 단위는 m, Blender Z-up, glTF Y-up입니다. 동일 벽돌·석재 타일·배관 모듈은 UV를 의도적으로 공유하며, 모듈 내부 아일랜드는 여백을 두고 배치했습니다. 따라서 씬 전체 단일 비중첩 라이트맵이 필요하면 수신 엔진에서 별도 UV 채널을 생성하세요.

젖음·잔물결 데이터는 NumPy/Pillow가 있는 Python에서 `scripts/make_wet_maps.py`로 재생성합니다. 최신 원본은 비금속 물·IOR 1.333·가변 바닥 거칠기와 clearcoat를 포함합니다. 평면 반사와 공간별 젖음 합성은 `rain-reflections.js`의 실시간 렌더링 기능으로, GLB/FBX를 옮기는 엔진에서는 별도로 설정해야 합니다. 자세한 내용은 `docs/reflection-rendering.md`와 `docs/reflection-assets.md`에 있습니다.

타일의 침하와 기울기는 Blender 및 내보낸 메시 변환에 포함됩니다. `atmosphere-post.js`의 블룸과 볼류메트릭 안개는 웹 렌더러 기능이며 다른 엔진에서는 해당 엔진의 후처리·볼륨 설정을 사용해야 합니다. 렌더링 경로와 범위는 `docs/atmosphere-rendering.md`에 기록했습니다.

재질은 이미지 텍스처와 Principled BSDF로 연결되어 있습니다. procedural-only 재질이나 온라인 텍스처 의존성이 없습니다. roughness·normal은 생성 albedo에서 유도한 예술적 파생값이며 측정된 스캔 데이터가 아닙니다.

자세한 생성 프롬프트, 장면 통계, 검증 결과는 `docs/`에 있습니다. Three.js 0.180.0의 MIT 라이선스는 `vendor/`에 포함됩니다.
