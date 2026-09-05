# Cinder Yard — xhigh variant

플레이 가능한 쿼터뷰 3D SF 수리 지구 프로토타입입니다. 외부 런타임 의존 없이 내보낼 수 있는 glTF 2.0 모델 키트와 표준 PBR 텍스처를 함께 제공합니다.

## 실행

```powershell
npm install
npm run dev
```

브라우저에서 Vite가 안내한 주소를 열면 됩니다. `npm run build`는 PBR 지원맵과 glTF를 다시 생성하고, UV/포맷 검증 및 게임 로직 테스트를 통과한 뒤 `dist/`를 만듭니다.

## 조작

- 클릭: 로봇 이동
- `WASD` 또는 방향키: 직접 이동
- 드래그 / 오른쪽 드래그 / 휠: 회전 / 이동 / 확대
- 중계기 근처에서 `E` 길게 누르기: 수리
- 터치 화면: 화면 오른쪽 아래 이동 패드와 `REPAIR` 버튼

## 범용 모델

- `assets/models/repair-district.gltf`
- `assets/models/repair-district.bin`
- `assets/textures/material-atlas-basecolor.png`
- `assets/textures/material-atlas-normal.png`
- `assets/textures/material-atlas-orm.png`

모델은 Y-up, 오른손 좌표계, 미터 단위이며 각 박스 메시의 6개 면이 0–1 안의 서로 겹치지 않는 UV 아일랜드를 사용합니다. 자세한 제작/내보내기 정보는 `docs/modeling-and-export.md`에 있습니다.
