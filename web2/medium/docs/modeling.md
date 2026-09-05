# 모델·UV·머터리얼 사양

모델은 특정 런타임에 종속되지 않는 glTF 2.0 JSON과 외부 binary buffer, PNG 텍스처 조합이다. 좌표계는 Y-up 오른손 좌표계, 단위는 미터이다.

## 모델 목록

- `wall-module.gltf`: 외곽 방벽 모듈
- `district-building.gltf`: 수리 지구 건물
- `cargo-crate.gltf`: 화물 상자
- `relay-terminal.gltf`: 상호작용 신호 중계기
- `lamp-post.gltf`: 조명 기둥
- `service-drone.gltf`: 플레이어 정비 드론

각 모델은 자체 `.bin` 버퍼를 사용하며 `../textures/material-atlas.png`를 참조한다. 머터리얼은 glTF 표준 `pbrMetallicRoughness`와 선택적 `KHR_materials_specular`만 사용한다. Blender, Unreal Engine, Unity 등 glTF 2.0을 지원하는 도구에서 가져올 수 있다.

## UV

모든 면은 0–1 UV 공간 안에 있으며, 각 모델 안에서 면별 UV 아일랜드가 겹치지 않는다. 네 소재 사분면 내부를 다시 균일한 그리드로 나누고 2px 상당의 inset을 두어 경계 번짐을 줄였다. 생성 및 재검증은 `npm run models`와 `npm run validate:models`로 수행한다.

## 저작권과 원본성

형상과 텍스처는 이 프로젝트를 위해 새로 제작되었다. 참고 이미지는 분위기와 화면 구도의 참고로만 사용했으며, 로고·고유 명칭·원본 자산을 복제하지 않았다.

