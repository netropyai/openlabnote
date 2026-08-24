---
name: labnote-setup
description: openlabnote 초기 설정을 대화형으로 진행한다. 사용자가 /labnote-setup 을 실행하거나, labnote 스킬에서 "설정이 없습니다" 오류를 만났을 때 사용. 환경을 스캔해 해석 요약을 보여준 뒤 정형 질문으로 config를 만든다.
allowed-tools: Bash(oln:*), Bash(npx -y openlabnote:*), Read, Write
---

# labnote-setup — 초기 설정 인터뷰

`oln init`(터미널 TUI)과 동일한 config를 대화형으로 만든다. **① 스캔·해석 → ② 정형 질문 → ③ config 저장** 순서.

## ① 스캔과 해석

다음을 조사해 "이렇게 파악됐습니다" 요약을 먼저 보여준다:

```bash
ls ~/.claude/projects 2>/dev/null | head        # Claude Code 사용 흔적 (디렉토리명 = 작업 경로)
ls ~/.codex/sessions 2>/dev/null | head          # Codex 사용 흔적
git config --global user.name; git config --global user.email
ls -dt ~/Development/*/ ~/dev/*/ ~/projects/*/ 2>/dev/null | head -15   # 활동 리포 후보
```

- Claude Code 프로젝트 디렉토리명에서 실제 작업 경로들을 복원해 어떤 리포에서 일하는지 해석한다.
- 최근 커밋(`git -C <repo> log -1 --format='%aI %an'`)으로 활동 리포와 author 표기를 확인한다.

## ② 정형 질문 (AskUserQuestion 사용, 스캔 결과로 선택지를 좁혀서)

0. **UI 언어**: 한국어/English 중 선택 (config의 `uiLanguage`) — 이후 CLI 메시지 언어.
1. **git author 패턴**: 감지된 이름/이메일로 기본값 제안. 작성자 이름은 과제 협약에 등록된 이름(보통 한국명) 권장.
2. **원격 서버**: 원격 개발 서버가 있는지 묻고, 있으면 SSH 호스트(~/.ssh/config 별칭)를 받아 config의 `remotes`에 넣는다.
3. **과제 등록**: "수행 중인 과제(연구노트 단위)"의 이름을 받고, 감지된 리포(로컬 + 원격은 `호스트:~/경로` 형식)를 고르게 한다. 과제가 여러 개면 반복. 각 과제에 영문 슬러그(`[a-z0-9-]`)를 제안.
4. **노트 저장 위치**: 기본 `~/openlabnote`, md 파일이 쌓이는 곳임을 설명.
5. **엔진**: `claude --version` / `codex --version`이 되면 터미널 단독 실행(oln today)용 엔진 선택. 노트 문체는 UI 언어 기반 기본값(ko→mixed, en→en)으로 두고 묻지 않는다.

## ③ config 저장

`~/.openlabnote/config.json`에 아래 스키마로 저장한다 (스키마 상세: 저장소 docs/agent-protocol.md):

```json
{
  "version": 1,
  "uiLanguage": "ko",
  "author": { "name": "<이름>", "gitAuthors": ["<패턴1>", "<패턴2>"] },
  "notesDir": "~/openlabnote",
  "language": "mixed",
  "engine": "claude",
  "sources": { "claudeCode": true, "codex": true, "git": true },
  "projects": [
    { "id": "<슬러그>", "title": "<과제명>", "repos": ["~/dev/repo1"], "dirs": [] }
  ],
  "sink": { "type": "local" }
}
```

저장 후 `oln config`로 검증하고(파싱 오류가 없어야 함), 마무리로 안내한다:
- `/labnote` — 오늘 일 정리
- `oln today` / `oln catchup` — 터미널에서
- `oln status` — 현황
