# Astra Dash

블록 숲을 달리는 오리지널 3레인 러너. HTML, CSS, Canvas 2D JavaScript만 사용합니다. 외부 라이브러리, 이미지, API, 서버가 필요 없습니다. 원근 투영으로 3D 느낌을 구현한 첫 플레이 가능 프로토타입입니다.

## 실행

`web/index.html`을 브라우저로 열거나 저장소 루트에서 `node web/serve.cjs` 실행 후 http://localhost:4173 에 접속합니다.

## 조작과 규칙

- ← / → 또는 A / D: 레인 이동
- Space / ↑ / W: 점프
- Shift 길게 누르기: 대시. 에너지를 사용하며 장애물을 부술 수 있습니다.
- P / Esc: 일시정지 및 계속
- 모바일: 화면 아래 버튼 또는 좌우 스와이프 / 위 스와이프 / 탭. ϟ 버튼을 누르는 동안 대시합니다.
- 코인 수집으로 에너지가 충전됩니다. 에너지 소진 시 25%까지 회복해야 대시를 다시 사용할 수 있습니다.
- 장애물 충돌 시 최대 10코인을 잃고 잠시 무적이 됩니다. 코인이 없는 상태로 충돌하면 종료됩니다.
- 점수 = 이동 거리(m) + 코인 × 25. 최고 기록은 해당 브라우저의 localStorage에 저장됩니다. 서버 순위표는 없습니다.
- 다른 창으로 전환하면 자동 일시정지합니다. 효과음은 상단 버튼으로 켤 수 있습니다.

## Cloudflare Pages (Git 연동)

저장소를 Pages에 연결한 후 아래와 같이 설정합니다.

| 설정 | 값 |
| --- | --- |
| Framework preset | None |
| Root directory | 저장소 루트 (기본값) |
| Build command | `exit 0` |
| Build output directory | `web` |

별도 빌드나 환경 변수는 필요 없습니다. 배포 후 `/`에서 게임이 열립니다. `serve.cjs`는 개발 전용이며 Pages에서 실행되지 않습니다. 실제 배포는 Cloudflare 계정에서 저장소 연결 후 진행합니다.

공식 문서: https://developers.cloudflare.com/pages/framework-guides/deploy-anything/
