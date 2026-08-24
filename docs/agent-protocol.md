# 에이전트 프로토콜 — 어떤 하네스에서든 openlabnote 구동하기

openlabnote는 특정 하네스에 묶이지 않는다. **결정적 작업은 CLI(`oln`)가, 노트 작성(LLM)은 하네스가** 담당한다.
Claude Code용은 플러그인([plugins/labnote](../plugins/labnote))으로 제공되고, 다른 하네스(Codex·Cursor·Gemini CLI 등)는 이 문서의 계약대로 프롬프트/룰 파일을 만들면 동일하게 동작한다 ([adapters/](../adapters) 참고).

## CLI 계약 (안정 인터페이스)

| 명령 | 용도 | 출력 |
|---|---|---|
| `oln config` | 해석된 설정 조회 (`resolved.notesDirAbsolute`, `resolved.rawDir` 포함) | JSON |
| `oln collect --since D --until D --json` | 기간 기록 수집 → raw 덤프 생성 | JSON (perProject/unmapped/warnings) |
| `oln instructions write\|polish\|concise` | **유효** 작성 지침 원문 (사용자 오버라이드 `~/.openlabnote/instructions/`가 있으면 그것) | 텍스트 |
| `oln lint [--date D] [--project P] --json` | 노트 포맷 검사 | JSON (파일별 issues) |
| `oln status --json` | 과제×날짜 상태 (written/activity/draft) | JSON |

비대화 실행 규칙: `--json`이 있는 명령은 stdout에 JSON만 출력한다. 종료 코드 0=성공, 1=오류(lint는 error 존재 시 1).

## 파일 계약

```
~/.openlabnote/config.json            # 설정 (스키마 아래)
~/.openlabnote/raw/<project>/<date>.md    # 수집된 원자료 — 로컬 전용, 외부 전송 금지
~/.openlabnote/raw/<project>/index.json   # 날짜별 통계 (읽기 예산 배분용)
<notesDir>/<project>/<date>.md        # 정본 노트 (포맷: docs/note-format.md)
```

### config.json 스키마 (version 1)

```jsonc
{
  "version": 1,
  "author": { "name": "이름", "gitAuthors": ["author 부분문자열 패턴"] },
  "notesDir": "~/openlabnote",          // 정본 노트 저장 위치
  "language": "ko" | "en" | "mixed",    // 노트 문체
  "engine": "claude" | "codex" | "none",  // 터미널 단독 작성용 엔진 (하네스 내에서는 불필요)
  "engineModel": "sonnet",              // 선택 — 비우면 각 CLI 기본 모델
  "sources": { "claudeCode": true, "codex": true, "git": true },
  "projects": [
    { "id": "slug", "title": "과제명", "repos": ["~/dev/repo", "serverA:~/dev/remote-repo"], "dirs": ["~/other/path"] }
  ],
  "remotes": [                          // 원격 개발 서버 (SSH 키 인증 필수)
    { "host": "serverA", "claudeCode": true, "codex": true }
  ],
  "sink": { "type": "local" }           // 현재 local만 — Cloud 연동은 4단계
}
```

과제 매핑: 세션 cwd 또는 커밋 repo 경로가 `repos`/`dirs`의 프리픽스에 걸리면 그 과제 소속 (가장 긴 프리픽스 우선).

**원격 소스**: `repos`/`dirs`에 scp 스타일 `호스트:~/경로` 항목을 쓰면 그 호스트의 리포에서 ssh로 커밋을 수집하고,
`remotes`에 등록된 호스트의 `~/.claude`/`~/.codex` 세션은 기간 내 수정분만 ssh+tar로 가져와 파싱한다.
원격 이벤트는 같은 호스트의 `호스트:` 항목에만 매핑된다. 모든 원자료는 로컬 raw로 합쳐진 뒤 동일하게 처리된다.

## 하네스 어댑터가 구현할 플로우

1. **설정 확인**: `oln config` — 실패 시 초기 설정(인터뷰) 진행: 스캔(하네스 흔적·리포·git author) → 정형 질문(UI 언어·작성자·원격 서버·과제·저장 위치·엔진) → config.json 저장 → `oln config`로 재검증.
2. **수집**: `oln collect --since --until --json` → raw 경로 확인.
3. **작성**: `oln instructions write`를 따르고, raw를 읽어 노트를 작성해 `<notesDir>/<project>/<date>.md`에 저장. 날짜가 많으면 병렬 분할. 이미 있는 노트는 건너뛰기(덮어쓰기는 사용자 확인 + `.bak`).
4. **검사**: `oln lint --json` → error를 고쳐 통과까지 반복.
5. **보고**: 작성/건너뜀/실패 요약 + 다음 행동 안내.

## 프라이버시 원칙

raw 덤프에는 프롬프트 전문이 담긴다. **raw는 로컬에서만 읽어 요약하고, 어디로도 업로드하지 않는다.** 밖으로 나가는 것은 완성된 노트뿐이며, export·업로드류 기능에는 시크릿 스캔 차단 게이트가 들어간다.
