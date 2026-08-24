# 아키텍처

## 구도

```
┌─ 하네스 (LLM 작업: 노트 작성) ──────────────────────────┐
│  Claude Code 플러그인(/labnote) · Codex/Cursor 어댑터   │
│  · 터미널 단독: oln today → claude -p 헤드리스          │
└───────────────┬────────────────────────────────────────┘
                │ docs/agent-protocol.md 계약
┌───────────────▼────────────────────────────────────────┐
│  CLI 코어 (결정적 작업)                                  │
│  collect(수집) → [작성은 하네스] → lint(검사) → 저장     │
│  · collectors: claude-code / codex / git  (+cursor 예정) │
│  · note: 포맷 v1 파서·린터                               │
│  · 로드맵: export(PNG·PDF) · Cloud 연동(4단계)           │
└───────────────┬────────────────────────────────────────┘
                │
        <notesDir>/<project>/<date>.md   ← 정본(md)
```

## 원칙

1. **md가 정본** — 렌더·업로드는 파생. 관리·diff·백업은 md 기준.
2. **raw는 로컬을 떠나지 않는다** — 업로드되는 것은 완성 노트뿐.
3. **결정적 작업은 CLI, LLM 작업은 사용자 구독** — 토큰 낭비 없는 재현 가능한 파이프라인.
4. **명령은 분절, 흐름은 자동** — today/catchup/push는 별도 명령이되, sink 설정 시 자동 연쇄(2단계).
5. **멱등** — collect는 기간 내 소스 미러링, 노트는 존재 시 스킵, 재실행 안전.

## 데이터 흐름

```
~/.claude/projects/*/*.jsonl ─┐
~/.codex/sessions/…/*.jsonl  ─┼─ collect ─▶ ~/.openlabnote/raw/<p>/<d>.md ─▶ (LLM 작성)
git log (repos)              ─┘                + index.json                     │
                                                                               ▼
                                    oln lint ◀── <notesDir>/<p>/<d>.md (정본)
```

## 수집기 추가하기 (기여 가이드)

`src/collectors/<name>.ts`에 `collect(range, …) → { events: RawEvent[], warnings }`를 구현하고 `src/collect.ts`에 연결한다.
`RawEvent`는 `{ts, date, source, kind: prompt|response|commit, cwd, text, ref}` — `cwd`가 과제 매핑의 키다.
테스트 픽스처(가짜 로그)와 골든 테스트를 함께 제출해야 한다 (tests/ 참고).

## 로드맵과의 관계

- 1단계(현재): 수집→작성→검사→로컬 md 저장
- 1.5단계(완료): **리모트 소스** — SSH 호스트를 등록하면 원격 리포 `git log`와 원격 `~/.claude`/`~/.codex` 세션까지 수집
- 2단계: **export** — 일자별 PNG·기간 PDF 렌더 (어느 서비스든 제출 가능한 산출물) + Cursor 수집기.
  타사 서비스 UI 자동화 싱크는 정책상 만들지 않는다 (CONTRIBUTING 참조)
- 3단계: OpenLabnote Cloud (증빙 호스팅: 전자서명·시점앵커·위변조 확인)
- 4단계: cloud 싱크·`oln login`·`oln verify`(검증 패키지 오프라인 검증)
