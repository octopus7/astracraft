# Ultra glTF 모델링 파이프라인

## 결과물

이 폴더의 모델은 프로젝트 전용으로 직접 구성한 절차적 로우폴리 메시다. 모든 자산은 glTF 2.0 JSON, 외부 바이너리, 외부 PNG를 사용하며 좌표계는 glTF 표준인 오른손 좌표계, `+Y` 위, `+Z` 앞, 단위는 미터다.

| 자산 | 용도 | 루트 메시 노드 | 보조 marker |
| --- | --- | --- | --- |
| `repair-district.gltf` / `.bin` | 플레이 가능한 SF 수리 지구 | `RepairDistrictGeometry` | `PlayerSpawn`, `DeliveryPad`, `RepairBay`, `CraneConsole`, `DroneSpawn` |
| `service-rover.gltf` / `.bin` | 플레이어 수리 로버 | `ServiceRoverGeometry` | `CameraFocus`, `ToolTip`, `GroundContact` |
| `salvage-drone.gltf` / `.bin` | 회수 드론 | `SalvageDroneGeometry` | `CameraFocus`, `CargoSocket` |

marker는 렌더링 메시가 없는 glTF node이며, 런타임이 이름 또는 `node.extras.role`로 찾을 수 있다. gameplay 수치는 `scene.extras.gameplay`에 저장되어 있다.

## PBR 텍스처

`district-atlas-imagegen.png`는 ImageGen이 만든 1536×1536 원본 4×4 atlas다. 생성기는 원본을 덮어쓰지 않으며, 아래의 1024×1024 glTF용 파생본을 만든다.

- `district-atlas-basecolor.png`: sRGB base color
- `district-atlas-metallic-roughness.png`: R=ambient occlusion, G=roughness, B=metallic
- `district-atlas-normal.png`: linear tangent-space normal
- `district-atlas-emissive.png`: cyan/amber 발광 tile만 추출한 sRGB emissive

16개 glTF material은 atlas의 4×4 tile과 1:1로 연결된다. tile 순서는 이미지의 왼쪽 위에서 오른쪽 아래다.

| 행 | 0 | 1 | 2 | 3 |
| --- | --- | --- | --- | --- |
| 0 | blue hull | dark panel | copper | ceramic |
| 1 | safety yellow | hazard stripe | rubber | brushed steel |
| 2 | concrete | teal paint | orange paint | oxide red |
| 3 | cyan circuit | amber light | clean steel | solar cell |

Base color와 emissive만 sRGB로 해석하고 normal 및 metallic-roughness는 linear로 샘플링해야 한다. glTF 로더는 이 색 공간 구분을 material slot에서 자동 적용한다.

## UV 정책

- `TEXCOORD_0`만 사용한다.
- 모든 UV는 닫힌 `0–1` 영역 안에 있다.
- atlas의 각 material tile을 다시 24×24 cell로 나누고, face마다 고유 cell 하나를 배정한다.
- 각 cell에는 9% gutter를 두어 mipmap/linear filtering 시 이웃 island의 색이 번지는 것을 줄였다.
- quad를 이루는 두 triangle은 한 island의 대각선만 공유하고 양의 면적이 겹치지 않는다.
- 서로 다른 primitive와 material까지 합친 모델 전체를 대상으로 triangle 교차 면적을 검사한다.

이 방식은 반복 UV나 미러 UV를 사용하지 않는다. `validate-models.mjs`는 모든 UV triangle pair에 대해 양의 교차 면적이 0인지 검사한다.

## 재생성 및 검증

`web2` 디렉터리에서 실행한다.

```powershell
node ultra/tools/generate-models.mjs
node ultra/tools/validate-models.mjs
node --test ultra/tools/tests/*.test.mjs
```

검증기는 외부 `.bin` 범위/정렬, 외부 PNG, accessor, 유한 좌표, unit normal, index 범위, PBR slot, atlas tile 범위, 0–1 UV, UV 양의 면적 겹침, gameplay marker를 검사한다. 마지막 검증 결과는 `docs/model-validation-report.json`에 기록된다.

## 후속 ImageGen 교체/병합

새 atlas를 **교체 입력**으로 쓰려면 원본을 수정하지 않고 다음처럼 실행한다.

```powershell
node ultra/tools/generate-models.mjs --source-basecolor D:\path\new-atlas.png
```

기존 atlas 위에 alpha가 있는 ImageGen 레이어를 **병합**하려면 다음처럼 실행한다.

```powershell
node ultra/tools/generate-models.mjs --overlay-basecolor D:\path\detail-overlay.png --overlay-opacity 0.72
```

입력 PNG는 8-bit, non-interlaced grayscale/RGB/RGBA/indexed 형식을 지원한다. 입력 크기는 자유이며 파생 atlas 크기로 bilinear resampling된다. 소스·overlay SHA-256과 파생 규격은 `assets/textures/atlas-provenance.json`에 남는다. 생성 결과는 byte-for-byte 결정론 테스트를 통과해야 한다.

## 내보내기 호환성

별도 엔진으로 옮길 때 `.gltf`, 같은 이름의 `.bin`, 네 장의 `district-atlas-*.png`를 함께 복사하고 상대 디렉터리 구조(`models/`와 `textures/`)를 유지한다. glTF core metallic-roughness만 사용하며 전용 shader나 엔진 종속 확장은 요구하지 않는다.

