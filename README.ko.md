# openlabnote

> 개발 기록을 연구노트로 — Claude Code·Codex 세션과 git 커밋을 일자별 연구노트(md)로 자동 정리

[English](README.md)

국가연구개발사업 연구노트는 의무지만, 실제로는 바빠서 아무도 못 씁니다. 그런데 기록은 이미 있습니다 —
AI 코딩 세션의 프롬프트에는 그날의 **판단과 이유**가, git 커밋에는 **결과**가 남아 있습니다.
openlabnote는 그 기록을 모아 하루 한 장의 연구노트로 정리합니다.

```
수집(세션·git) ─▶ 작성(내 LLM 구독) ─▶ 검사(포맷 lint) ─▶ 내 폴더에 md 저장
```

- **내 구독으로 동작**: 요약·작성은 Claude Code(또는 `claude -p`)가 수행 — 별도 API 키·비용 없음
- **어떤 하네스든**: Claude Code 플러그인 제공, Codex·Cursor 등은 [에이전트 프로토콜](docs/agent-protocol.md)로 동일 동작
- **md가 정본**: 노트는 내가 지정한 폴더에 마크다운으로 — 직접 열람·수정·백업·git 관리
- **raw는 로컬에만**: 세션 프롬프트 원문은 절대 밖으로 나가지 않음

## 시작하기 (2분)

```bash
npx openlabnote        # 첫 실행 → 자동 스캔 + 설정 인터뷰
```

인터뷰가 하네스·리포·git author를 자동 감지하고, 과제·노트 저장 위치·문체를 물어봅니다.

```bash
oln today              # 오늘 일 정리 (수집→작성→검사→저장)
oln catchup            # 밀린 날짜 채우기 (기본 최근 14일, --since로 확장)
oln status             # 현황 히트맵
oln note today --edit  # 오늘 노트 수정
```

Claude Code 안에서 쓰려면:

```
/plugin marketplace add netropyai/openlabnote
/plugin install labnote@openlabnote
/labnote               # 이 세션이 직접 노트를 작성 (구독 사용)
```

## 노트는 이렇게 생겼습니다

```markdown
## @August 21, 2026

### Physics server flags
- physics server 기동 플래그를 --headless 기본값으로 변경
- 결정: eval 배너는 stderr로 — 로그 파싱 파이프라인과 충돌 방지

### Mixed-rig eval
- SNU-EADv1.0 드라이버 통합, eval 시간 9.4 → 1.7s
```

형식 규칙(불릿 ≤110자, 주제 ≤4, 메타서술 금지 등)은 [노트 포맷 v1](docs/note-format.md)이 정의하고 `oln lint`가 강제합니다.

## 명령

| 명령 | 설명 |
|---|---|
| `oln` | 인터랙티브 홈 (히트맵 + 메뉴, 첫 실행 시 설정) |
| `oln today` | 오늘 정리 — 수집→작성→검사→저장 |
| `oln capture "…"` | 순간 기록 — "이건 남겨야지" 싶은 걸 그 자리에서. 그날 노트에 **반드시 반영** (Claude Code에선 "이거 연구노트에 기록해"라고 말하면 됨) |
| `oln catchup` | 기록은 있는데 노트가 없는 날짜 채우기 |
| `oln status` | 현황 (달력 히트맵·과제별 상태) |
| `oln note <date>` | 노트 보기 · `--edit` 수정 · `--regen` 재작성 |
| `oln ui` | 웹 뷰어 — 노트를 브라우저에서 열람 (읽기 전용, 로컬 전용) |
| `oln export` | 일자별 PNG · `--pdf` 기간 PDF 내보내기 — **시크릿 스캔이 자동으로 차단**(`--allow-secrets`로 해제) |
| `oln open` | 노트 폴더 열기 |
| `oln setup` | 설정 변경 (과제·원격 서버·문체·엔진·모델) |
| `oln instructions write --edit` | 작성 지침을 내 것으로 수정 (`--reset`으로 복귀) |
| `oln reset` | 처음 상태로 초기화 (`--notes`: 노트까지) |
| `oln collect` / `lint` / `config` | 저수준 (스킬·스크립트용) |

## 업데이트

```bash
npm i -g openlabnote@latest   # 업데이트
npm i -g openlabnote@0.1.0    # 특정 버전 고정 / 다운그레이드
```

자동 업데이트는 없습니다. 대신 주 1회 npm에서 최신 버전 번호만 확인해(전송되는 것은 패키지
이름뿐) 새 버전이 있으면 홈 화면에 한 줄로 알려줍니다 — 끄기: `oln setup update-check` 또는
`OLN_NO_UPDATE_CHECK=1`. 업데이트 후 첫 홈 진입에는 무엇이 바뀌었는지 1회 보여줍니다. 기존
설정은 업데이트를 넘어도 그대로 동작합니다(필요 시 자동 마이그레이션, `config.json` 옆에 백업).
자세한 규칙: [CHANGELOG.md](packages/cli/CHANGELOG.md) · [docs/versioning.md](docs/versioning.md)

## 커스터마이징

- **UI 언어**: 첫 실행에서 한국어/English를 고릅니다. 이후 변경은 `oln setup ui-language`. (노트 문체와는 별개 설정)

- **작성 지침**: 노트 문체·서술 규칙은 마크다운 지침 3종(write/polish/concise)이 정의합니다. `oln instructions write --edit`로 내 사본(`~/.openlabnote/instructions/`)을 만들어 고치면 이후 모든 작성(`oln today`, `/labnote`)에 즉시 반영됩니다. 단 형식 골격(헤딩·불릿 110자·주제 수)은 `oln lint`가 별도로 강제하니 그 범위 안에서 조정하세요.
- **모델**: 기본은 각 CLI의 기본 모델을 그대로 씁니다. `oln setup engine`에서 모델을 지정하면 claude는 `--model`, codex는 `-c model=`로 전달됩니다 (예: 요약 품질이 충분하다면 더 빠른 모델로).

## 로드맵

- [x] **1단계**: 수집(Claude Code·Codex·git) → 작성 → 검사 → 로컬 md 저장
- [x] **1.5단계**: **원격 서버 소스** — SSH로 원격 리포 커밋·원격 하네스 세션까지 수집 (`oln setup remotes`, 과제 경로에 `호스트:~/경로`)
- [ ] **2단계**: Export — 일자별 PNG·기간 PDF 렌더 (쓰던 연구노트 서비스에 그대로 제출 가능한 산출물), Cursor 수집기
- [ ] **3단계**: OpenLabnote Cloud — 지침 3요건(전자서명·시점인증·위변조 확인) 증빙 호스팅
- [ ] **4단계**: OSS↔Cloud 연결 (`oln login`, 검증 패키지 오프라인 검증 `oln verify`)

## 기여

수집기·어댑터 추가가 주요 기여 경로입니다 — [CONTRIBUTING.md](CONTRIBUTING.md), [아키텍처](docs/architecture.md) 참고.

## 라이선스

[Apache-2.0](LICENSE)
