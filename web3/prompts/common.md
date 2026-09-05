# 공통 실행 프롬프트

첨부 참조 이미지 D:/github/astracraft/web3/prompts/reference.png 를 직접 열어 분석하고 AFTERLIGHT / The Rain Court 장면을 제작한다. 사용자 승인 완료: Blender에서 직접 실제 메시 모델링, 정리된 UV(체커/아일랜드 여백/의도한 반복 외 비중첩), ImageGen으로 UV에 맞는 텍스처 생성 또는 조합, 표준 PBR 재질, 다른 엔진으로 이동 가능한 GLB/glTF와 FBX 및 원본 .blend, 제작 스크립트와 UV 레이아웃을 제공한다. 폐허 산업도시 안뜰, 벽돌 담장, 상점/건물, 배관, 상자, 로봇, 비 갠 뒤 젖은 바닥, 따뜻한 조명과 청록색 포인트를 재현한다. 웹 페이지는 실제 3D 모델 회전/이동/확대와 결과 파일 다운로드를 제공하고 화면의 세련된 게임 HUD 분위기를 반영한다. 사용자 프롬프트도 하위 docs 경로에 문서화한다. 지정 경로 안에서 독립 제작하고 시각 검증, export 검증, 웹 로딩 검증 후 해당 경로만 git 커밋한다. 다른 작업의 파일을 변경하거나 커밋하지 않는다. Blender는 C:/Program Files/Blender Foundation/Blender 4.5/blender.exe 등 사용 가능. 충돌 방지를 위해 독립 headless Blender 프로세스만 사용한다. ImageGen은 내장 image_gen 도구 사용. 외부 CDN 없이 웹이 실행되도록 의존성을 지정 경로에 제공하거나 빌드한다. web3 대문은 부모 작업이 담당한다. 기존 web2 변경은 사용자 작업이므로 건드리지 않는다.

각 실행은 지정 경로와 추론 강도만 달라진다: medium, high, xhigh, ultra.
