# 모델링 및 glTF 내보내기 명세

## 모델 구성

`tools/generate-models.mjs`는 런타임과 분리된 원본 모델 제작기입니다. 하나의 장면에 다음 모듈을 배치합니다.

- 35개 젖은 석재 광장 슬래브
- 북·동·서 메가월과 남측 출입구 벽체
- 네 모서리 타워, 벽 버트레스 및 상부 캡
- 주황색 정비고, 청록 신호 별관, 파이프 갠트리
- 수리 가능한 ASTER / MERIDIAN / LUMEN 중계기
- 화물 컨테이너와 플레이어용 `CourierRig` 정비 로봇

생성 결과는 138개 노드와 6개 재사용 메시로 구성됩니다. 메시를 노드 스케일로 조립하므로 파일은 작지만 다른 엔진에서도 각 구조물을 개별 노드로 편집할 수 있습니다.

## UV 규칙

- 좌표 범위: U/V 모두 `0.0–1.0`
- 메시당 UV 아일랜드: 6개(박스의 각 면 1개)
- 배치: 각 재질 quadrant 내부의 3×2 그리드
- 패딩: quadrant 안쪽 및 아일랜드 사이에 UV 0.012
- 중첩: 없음
- 노드 인스턴싱: 같은 메시를 여러 노드가 재사용하지만, 한 메시 내부 아일랜드는 겹치지 않음

`tools/validate-models.mjs`는 glTF 바이너리에서 실제 `TEXCOORD_0` 값을 읽어 범위와 각 아일랜드 AABB의 겹침을 검사합니다.

## PBR 머터리얼

첫 번째 머터리얼 `RepairDistrictAtlasPBR`은 glTF 2.0 core metallic-roughness 워크플로만 사용합니다.

| 슬롯 | 파일 | 색 공간 / 채널 |
|---|---|---|
| Base Color | `material-atlas-basecolor.png` | sRGB RGBA |
| Normal | `material-atlas-normal.png` | Linear RGB, tangent-space flat normal |
| Metallic-Roughness | `material-atlas-orm.png` | G=Roughness, B=Metallic |
| Occlusion | `material-atlas-orm.png` | R=Ambient Occlusion |

`WarmServiceGlow`와 `CyanSignalGlow`도 별도 확장 없이 glTF core PBR + emissive factor만 사용합니다. 모든 텍스처는 외부 PNG이며 모델은 외부 `.bin`을 참조합니다.

## 다른 엔진에서 가져오기

1. `repair-district.gltf`, `repair-district.bin`, 그리고 `assets/textures/`의 PNG 3개를 상대 경로 구조를 유지해 복사합니다.
2. 엔진의 glTF 2.0 importer로 `.gltf`를 엽니다.
3. Y-up / 오른손 좌표계 / 1 unit = 1 metre 기준으로 가져옵니다.
4. ORM 자동 인식이 없는 엔진에서는 R/G/B를 각각 AO/Roughness/Metallic 슬롯에 연결합니다.
5. tangent 생성 옵션이 있다면 가져오기 단계에서 MikkTSpace tangent를 생성합니다.

## 재생성 및 검증

```powershell
npm run assets
npm run validate:models
npm test
```

검증기는 glTF 버전, 외부 `.bin`, PNG 시그니처/해상도, PBR 슬롯, UV 0–1 범위, 6개 비중첩 UV 아일랜드를 확인합니다.
