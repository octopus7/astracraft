# The Mender's Quarter

비가 갠 SF 정비 지구에서 Mender 드론을 조종해 다섯 중계기를 복구하는 쿼터뷰 3D 웹게임입니다.

- 이동: `WASD`, 방향키 또는 지면 클릭/터치
- 수리: 중계기 근처에서 `E` 길게 누르기
- 탐색 펄스: `R` (에너지 8 소모)
- 목표: 전기 누출 구역을 피하고 부품을 회수해 에너지를 보충하며 중계기 5개 복구

모델은 `tools/generate-models.mjs`에서 직접 모델링되며 glTF 2.0 + external BIN + PNG PBR 구성으로 생성됩니다. 자세한 반출 구조와 검증 내용은 `docs/model-export.md`에 있습니다.
