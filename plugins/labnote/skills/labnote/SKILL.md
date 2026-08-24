---
name: labnote
description: 개발 기록(Claude Code·Codex 세션, git 커밋)을 일자별 연구노트(md)로 정리한다. 사용자가 /labnote 를 실행하거나 "연구노트 정리해줘", "오늘/이번 주 노트 써줘" 같은 요청을 할 때 사용. 설정이 없다는 오류가 나면 labnote-setup 스킬로 안내.
argument-hint: "[오늘 | 이번주 | YYYY-MM-DD | YYYY-MM-DD..YYYY-MM-DD]"
allowed-tools: Bash(oln:*), Bash(npx -y openlabnote:*), Read, Write, Edit
---

# labnote — 개발 기록을 연구노트로

openlabnote CLI(`oln`)와 협업해 연구노트를 작성하는 스킬. **결정적 작업(수집·검사)은 CLI가, 노트 작성(요약)은 이 세션의 당신이** 담당한다.

## 0. 준비 확인

```bash
oln --version || npx -y openlabnote --version
```

- CLI가 없으면: `npm install -g openlabnote` 를 안내하거나 이 세션에서는 `npx -y openlabnote`를 `oln` 대신 사용.
- `oln config` 가 "설정이 없습니다" 오류를 내면: **labnote-setup 스킬**로 초기 설정을 먼저 진행.

## 1. 범위 결정

사용자 요청에서 날짜 범위를 정한다: "오늘"=오늘 하루, "이번 주"=이번 주 월요일~오늘, "8월"=그 달 전체, 무언급=오늘. 애매하면 짧게 확인.

## 2. 수집 (CLI)

```bash
oln collect --since YYYY-MM-DD --until YYYY-MM-DD --json
```

- 결과 JSON의 `perProject`에서 (과제, 날짜)별 기록 유무를 파악한다.
- `unmapped`가 많으면 사용자에게 알리고, 필요하면 `oln setup projects`로 경로 추가를 안내한다.
- raw 덤프 위치: `~/.openlabnote/raw/<projectId>/<YYYY-MM-DD>.md` (`oln config`의 `resolved.rawDir` 참조).
- **raw 내용은 절대 외부로 전송하지 않는다 — 로컬 요약에만 사용.**

## 3. 작성 (당신)

1. 지침을 읽는다: `oln instructions write` (문체 규칙은 config의 `language` 반영).
2. 각 (과제, 날짜)의 raw md를 읽고 지침에 따라 노트를 작성한다.
   - **날짜가 많으면(5일 초과) 날짜 구간을 나눠 서브에이전트에 병렬 위임**하라. 각 서브에이전트에는 지침 전문과 해당 raw 파일의 절대경로, 저장할 노트 파일의 절대경로를 준다.
3. 노트 저장 위치: `<notesDir>/<projectId>/<YYYY-MM-DD>.md` (`oln config`의 `resolved.notesDirAbsolute`).
   - 이미 노트가 있는 날짜는 **건너뛰고** 사용자에게 알린다 (다시 쓰려면 사용자 확인 후 덮어쓰기, 기존 파일은 `.bak`으로).

## 4. 검사 루프 (CLI)

```bash
oln lint --date YYYY-MM-DD --json
```

- 오류(severity=error)가 있으면 해당 노트를 고쳐 다시 검사한다. 통과할 때까지 반복 (최대 3회, 그 이상은 사용자에게 보고).
- 여러 날짜를 쓴 경우 마지막에 전체 `oln lint --json` 한 번 더.

## 5. 보고

- 작성/건너뜀/실패 건수를 요약하고, 대표 노트 1개를 미리보기로 보여준다.
- 마지막 줄에 다음 행동 안내: `oln status`(현황), `oln open`(폴더 열기), 노트 수정은 `oln note <date> --edit`.
- 업로드를 물으면: 노트는 md 파일이라 쓰던 서비스에 직접 올리면 되고, 제출용 export(PNG·PDF)와 OpenLabnote Cloud 연동이 로드맵에 있다고 안내한다.
