# 최종 검증

## 모델과 UV

Blender 4.5.12 LTS의 독립 headless 프로세스로 제작·렌더·재가져오기를 수행했습니다. 장면에는 3,361개 실제 메시 오브젝트, 162개 원본 모듈, 121,536개 삼각형이 있습니다. GLB와 glTF는 재질별 메시 분리가 포함되어 206개 고유 메시로 내보내집니다.

`export-validation.json`의 최종 `passed`는 `true`입니다. GLB, 분리형 glTF, FBX를 각각 새 씬으로 가져와 다음을 검사했습니다.

- 빈 메시, 유한 좌표, 장면 경계와 UV 채널
- 각 고유 메시 안의 UV 삼각형 중첩 및 퇴화 (의도한 모듈 인스턴스 간 반복 제외)
- PBR 재질과 이미지, 파일 누락 및 glTF 외부 리소스 경로
- 162개 SVG UV 레이아웃 및 체커 이미지 존재

간판 글자 삼각화에서 생긴 면적 0인 면을 원본 제작 스크립트에서 제거한 뒤 3개 포맷을 모두 다시 검증했습니다. 최종 오류·경고가 없습니다. 원본 `.blend`에는 텍스처가 내장되어 있고, FBX는 옆의 `textures/`를 상대 경로로 참조합니다.

실제 Blender 렌더 `assets/rain-court-hero.png`와 `assets/uv/checker-court.png`를 직접 열어 구도, 조명, 표면 연결과 체커를 확인했습니다. 대문용 `preview.jpg`는 해당 최종 렌더의 축소본입니다.

## 웹

로컬 Three.js 0.180.0을 사용하는 정적 뷰어입니다. ES 모듈과 서버 스크립트 구문 검사를 통과했습니다. 브라우저에서 GLB 로딩 성공 및 `LOCAL SIGNAL ACTIVE`를 확인했고, 회전 드래그·Pan 모드 이동·확대 버튼·상점 카메라 프리셋·와이어프레임을 직접 조작했습니다. 웹은 원본 GLB를 유지하면서 3,361개 메시를 22개 재질 배치로 묶어 렌더합니다.

키보드 단축키와 모든 모바일 제스처를 개별 자동 검증한 것은 아닙니다. 단축키 검사 도중 일시적인 사용량 한도가 발생했으며, 승인된 요구 범위인 모델 로딩·회전·이동·확대의 직접 검증은 완료했습니다.

배포 출력은 `web3`, 사이트 경로는 `/ultra/`입니다. 외부 CDN을 사용하지 않습니다. ZIP과 파일 크기/체크섬 결과는 `downloads/manifest.json`에 기록합니다. 전체 제작 ZIP이 호스팅 단일 파일 제한을 넘으면 각각 정상 ZIP인 여러 part 파일로 제공하며, 모두 같은 폴더에 압축 해제하면 전체 폴더가 복원됩니다.

최종적으로 `web3` 루트의 HTTP 서버에서 `/ultra/`를 열어 로딩 성공을 다시 확인했습니다. 새 브라우저 탭의 콘솔 오류·경고는 0개였고, 다운로드 패널의 원본 3종·glTF 묶음·텍스처/UV 묶음·전체 제작 ZIP 4개 링크가 정상 표시됐습니다. 페이지를 포함한 232개 정적 파일 HEAD 요청은 모두 HTTP 200이었습니다. ZIP CRC 검사 및 단일 파일 크기 검사도 통과했습니다.

## 참고 문서

- Blender glTF/FBX export API: https://docs.blender.org/api/main/bpy.ops.export_scene.html
- Blender UV API: https://docs.blender.org/api/current/bpy.ops.uv.html
- Three.js GLTFLoader: https://threejs.org/docs/#examples/en/loaders/GLTFLoader

이 장면은 참조 구도와 분위기를 옮긴 독립적인 스타일화 디오라마입니다. 원본 게임 장면의 데이터 추출물이나 픽셀 단위 복제품은 아닙니다.
