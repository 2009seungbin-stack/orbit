# ORBIT deck

26개 프로젝트를 3D 공간에서 발표하듯 탐색하는 포트폴리오. 빌드 없이 정적 파일로 동작합니다.

**Live:** https://2009seungbin-stack.github.io/orbit/

## 실행

`npm start` → http://localhost:4320 (의존성 없음, `vendor/`에 Three.js·GSAP 포함)

`npm run check` — JS 구문 검사

## 조작

→ / Space 다음 단계·슬라이드 · Shift+→ / PageDown 슬라이드 건너뛰기 · G 목차 · P 발표 모드 · N 발표 노트(타이머) · B 블랙아웃 · 드래그 둘러보기 · 더블클릭 시점 복귀

## 구성

- `js/workflows.js` — 11개 프로젝트의 실제 구조(모듈·흐름·루프·상태·수치). 각 프로젝트 소스·문서·Git에서 추출, 경로는 상대 경로만.
- `data/archive.json` — 기존 ORBIT 아카이브(26개 프로젝트, 발전 기록, 원문 발췌).
- `data/shots/<id>.json` + `evidence/shots/<id>/` — 실제 화면 매니페스트. QA 캡처·렌더·실행 영상을 변환만 했고, 차트는 프로젝트 파일의 실제 수치로만 그렸습니다. `stage`(루프 단계)와 `module`(구조 노드)에 매핑되어 루프 슬라이드 스크린과 구조 슬라이드 썸네일에 쓰입니다.
- `js/slides.js` — 슬라이드 구성, `js/graph.js` — 3D 노드·흐름·스크린, `js/world.js` — 렌더러·카메라, `js/main.js` — 덱 컨트롤러.

## 자료 범위

- Claude Local·Claude Learn 화면은 2026-10-29 임시 복사본을 데모 데이터(모의 API 서버, 빈 학습 데이터)로 실행한 캡처입니다. Nerulio 화면은 `origin/main` fdff7e6을 임시 폴더에서 빌드해 로컬로 캡처했습니다.
- 개인정보(사용자명·경로·계정/팀 ID·채팅 창)가 보이는 화면, 실존 인물 얼굴이 나오는 영상, 권리 불명 레퍼런스 이미지는 제외했습니다.
- 내부 지표는 내부 지표로 표기합니다. 공식 성적이나 출시 완료를 뜻하지 않습니다.
