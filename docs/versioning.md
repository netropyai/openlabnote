# 버전·업데이트·마이그레이션 지침

Claude Code의 실제 방식을 참고해 oln 규모에 맞게 정한 규칙이다 — 참고한 것: additive 설정 진화(새 필드는
기본값과 함께 추가), 모르는 설정 키를 에러 내지 않음, 손상 파일은 백업 후 안내(크래시 금지), `~/.claude`
내부 상태의 불투명(opaque) 취급, npm 설치에는 자동 업데이트를 하지 않는 관행. 첫 공개(v0.1.0)부터 적용한다.

## 1. 버전 체계

- SemVer. 0.x 동안: **minor(0.2.0) = 동작·호환이 바뀔 수 있는 릴리스**, patch(0.1.1) = 수정만.
- 모든 릴리스는 CHANGELOG.md 항목(영어) + git 태그 `vX.Y.Z` + GitHub Release를 동반한다.

## 2. 호환을 약속하는 표면

**약속 대상**: CLI 명령·플래그, `~/.openlabnote/config.json`, 노트 포맷([note-format.md](note-format.md))과
notesDir 배치.

**약속 없음(불투명 내부 상태)**: `~/.openlabnote`의 `raw/`·`index.json`·`unmapped-seen.json`·`state.json` 등 —
재생성 가능한 파생물이다. 새 버전이 읽지 못하면 조용히 버리고 다시 만들며, 읽기는 항상 관대하게(try/catch)
구현한다. 이 파일들의 포맷 변경에는 마이그레이션을 만들지 않는다.

예외: `~/.openlabnote/captures/`(순간 기록, `oln capture`)는 **사용자가 직접 남긴 재생성 불가능한 자산**이다 —
불투명 대상이 아니며, 포맷을 바꾸면 하위호환을 유지하거나 마이그레이션한다.

## 3. config 진화 규칙

- 기본은 **additive**: 새 필드는 반드시 default를 갖고 추가한다 — 옛 config가 마이그레이션 없이 동작한다.
- **루트 수준의 모르는 키는 저장 시 보존**한다(`saveConfig`) — 구버전 CLI의 setup 저장이 신버전이 쓴 필드를
  지우지 않게.
- **깨는 변경**(키 이름 변경·형태 변경·필수화)만 `version` 정수를 올리고 `src/lib/config.ts`의 `MIGRATIONS`에
  n→n+1 변환 함수를 추가한다. 마이그레이션 직전 원본을 `config.json.v{n}.bak`으로 백업한다.
- **미래 버전 config**(파일의 version > 이 CLI가 아는 버전): "업데이트하거나 백업을 복원하라"는 안내와 함께
  종료한다 — 사용자를 막다른 에러에 가두지 않는다.
- **손상 JSON**: `config.json.corrupted.bak`으로 백업 후 `oln init` 안내.

## 4. 노트는 사용자 자산

- 도구가 기존 노트를 소급 변환·수정하지 않는다.
- 포맷 변경은 note-format.md 갱신 + 새로 쓰는 노트부터 적용. 파서·lint는 구버전 노트에 관대해야 한다.

## 5. 업데이트·다운그레이드

- **자동 업데이트 없음** — npm 설치의 표준이다 (Claude Code도 npm 설치에는 자동 업데이트를 하지 않는다).
- 업데이트: `npm i -g openlabnote@latest` · 특정 버전 고정/다운그레이드: `npm i -g openlabnote@X.Y.Z`.
- 다운그레이드 후 config가 더 새 버전이면 §3의 백업 복원 안내가 경로다.

## 6. 새 버전 알림 · 새 소식

- **주 1회** npm registry에서 최신 버전 번호만 조회한다(전송되는 것은 패키지 이름뿐). 새 버전이 있으면 홈
  화면에 한 줄 알림. 끄기: `oln setup update-check` 또는 `OLN_NO_UPDATE_CHECK=1`. 첫 설정 완료 화면에서
  고지한다. 조회는 비차단(소켓 unref)이라 명령 실행·종료를 지연시키지 않는다.
- **버전이 바뀐 뒤 첫 홈 진입**에 패키지에 동봉된 CHANGELOG에서 그 사이 변경분을 1회 보여준다
  (네트워크 불필요 — Claude Code의 `lastReleaseNotesSeen` 패턴).

## 7. 폐기(deprecation)

- 명령·플래그·설정 키 제거는 최소 1 minor 동안 경고를 띄운 뒤 시행한다.

## 8. 릴리스 절차

1. `packages/cli/package.json` 버전 bump
2. CHANGELOG.md 항목 작성 (Added / Improved / Fixed / Changed / Removed)
3. `npm run typecheck && npm test` + 수동 스모크 (`oln` 홈 → today 1회)
4. `npm publish` (packages/cli)
5. git 태그 `vX.Y.Z` + GitHub Release (큰 변경은 한국어 설명 병기)

첫 npm publish 시점에 단일 커밋(amend) 정책을 종료하고 일반 커밋 히스토리로 전환한다.

## 도입하지 않은 것

stable/latest 채널, minimumVersion 하한, 자동 업데이트 — 주 단위로 릴리스하는 대형 도구용이라 지금 규모에는
과하다. 필요해지면 그때 도입한다.
