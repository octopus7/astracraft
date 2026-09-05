# 사용자 요청과 제작 범위

이 제작물은 사용자가 승인한 `D:/github/astracraft/web3/ultra/` 안에서 직접 제작한 독립 버전입니다.

## 전달받은 제작 지시

> 첨부 참조 이미지 D:/github/astracraft/web3/prompts/reference.png 를 직접 열어 분석하고 AFTERLIGHT / The Rain Court 장면을 제작한다. 사용자 승인 완료: Blender에서 직접 실제 메시 모델링, 정리된 UV(체커/아일랜드 여백/의도한 반복 외 비중첩), ImageGen으로 UV에 맞는 텍스처 생성 또는 조합, 표준 PBR 재질, 다른 엔진으로 이동 가능한 GLB/glTF와 FBX 및 원본 .blend, 제작 스크립트와 UV 레이아웃을 제공한다. 폐허 산업도시 안뜰, 벽돌 담장, 상점/건물, 배관, 상자, 로봇, 비 갠 뒤 젖은 바닥, 따뜻한 조명과 청록색 포인트를 재현한다. 웹 페이지는 실제 3D 모델 회전/이동/확대와 결과 파일 다운로드를 제공하고 화면의 세련된 게임 HUD 분위기를 반영한다. 사용자 프롬프트도 하위 docs 경로에 문서화한다. 지정 경로 안에서 독립 제작하고 시각 검증, export 검증, 웹 로딩 검증 후 해당 경로만 git 커밋한다. 다른 작업의 파일을 변경하거나 커밋하지 않는다. Blender는 C:/Program Files/Blender Foundation/Blender 4.5/blender.exe 등 사용 가능. 충돌 방지를 위해 독립 headless Blender 프로세스만 사용한다. ImageGen은 내장 image_gen 도구 사용. 외부 CDN 없이 웹이 실행되도록 의존성을 지정 경로에 제공하거나 빌드한다. web3 대문은 부모 작업이 담당한다. 기존 web2 변경은 사용자 작업이므로 건드리지 않는다.

> 이번 작업의 지정 경로는 D:/github/astracraft/web3/ultra/ 이며 추론 강도는 ultra이다. 사용자가 같은 저장 프로젝트의 이 경로에 직접 제작하도록 승인했다. 지금 제작을 시작하고 완료까지 진행하라.

## 추가 배포 조건

> Pages Framework None, Build command `exit 0`, Build output directory `web3`. 반드시 지정 폴더 자체에 index.html 및 브라우저 실행 가능한 정적 JS/모델/텍스처를 넣어 빌드 없이 배포 가능하게 하라. 배포 루트는 web3이므로 홈 링크는 ../ 또는 / 이며 /web3/ 접두사는 사용하지 않는다. 로컬 의존성 포함. 대문은 부모 담당.

> 대문 비교 썸네일용으로 완료 시 지정 폴더 최상위 preview.png 또는 preview.jpg 한 장도 제공하고, 결과 최종 메시지에 렌더 경로와 커밋 해시를 명시해 주세요. Pages 단일 파일 크기 제한을 고려해 25 MiB 이상 파일은 분할/압축 또는 적절한 제공 방법으로 처리하세요. 커밋은 본인 폴더만 stage해서 수행하세요.

정확한 ImageGen 제작 프롬프트와 원본/파생 텍스처 출처는 `imagegen-prompts.md`, 참조 분석은 `reference-analysis.md`에 기록했습니다.

## 반사 품질 개선 요청 — 2026-09-06

> 반사맵 수준이 떨어지는거같은데 뭘 더구현해야해?

> 구현해

실제 안뜰을 비추는 평면 반사, 공간별 젖음과 거칠기, 물 가장자리와 잔물결, 안뜰 환경 캡처를 추가했습니다. 같은 제작 범위에서 Blender 원본과 표준 PBR 내보내기, 다운로드 패키지도 갱신했습니다. 구현과 검증은 `reflection-rendering.md`, 데이터 맵과 원본 재질은 `reflection-assets.md`에 기록했습니다.
