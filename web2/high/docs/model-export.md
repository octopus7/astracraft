# Portable model export

`public/models/`의 파일은 웹게임 전용 포맷이 아니라 범용 glTF 2.0 metallic-roughness PBR 자산입니다.

## 자산 구성

- `repair-district.gltf` + `repair-district.bin`: 지면, 서비스 레인, 정비소, 타워, 파이프, 상자, 중계기 베이스가 포함된 수리 지구 환경
- `mender-drone.gltf` + `mender-drone.bin`: 플레이어 정비 드론
- `repair-atlas-basecolor.png`: ImageGen에서 만든 4분할 base color atlas
- `repair-atlas-orm.png`: G 채널 roughness, B 채널 metallic 값을 담은 PBR 보조 맵
- `repair-atlas-emissive.png`: 신호 재질의 emissive map
- `model-audit.json`: primitive별 vertex/triangle 수, UV island 수와 UV 범위를 기록한 검증 자료

## 가져오기

Blender, Godot, Unity, Unreal Engine 등 glTF 2.0 importer가 있는 도구에서 `.gltf` 파일을 선택하면 같은 폴더의 `.bin`과 PNG를 상대 경로로 불러옵니다. 모든 텍스처 파일을 `.gltf`/`.bin`과 같은 디렉터리에 유지하세요.

## 재생성 및 검증

`web2/`에서 아래 명령을 실행합니다.

```sh
npm run models:high
npm run validate:high
npm run test:high
npm run build:high
```

검증기는 glTF 버전, 외부 BIN 길이, PNG 참조, 표준 metallic-roughness 재질, POSITION/NORMAL/TEXCOORD_0 attribute를 확인합니다. 또한 실제 BIN의 UV와 index accessor를 읽어 0–1 범위와 primitive별 island 중첩 여부를 확인합니다.
