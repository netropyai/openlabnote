# 기여 가이드

관심 가져주셔서 감사합니다. openlabnote는 수집기(collector)와 하네스 어댑터를 넓혀가는 것이 핵심인 프로젝트입니다.

## 기여 경로

1. **수집기 추가** (가장 환영): Cursor, Gemini CLI, opencode 등 — [docs/architecture.md](docs/architecture.md)의 "수집기 추가하기" 참고. 픽스처(가짜 로그)와 골든 테스트 필수.
2. **하네스 어댑터**: [docs/agent-protocol.md](docs/agent-protocol.md) 계약을 따르는 프롬프트/룰 파일 — `adapters/<harness>/`.
3. 버그 수정·문서 개선.

## 규칙

- **PR은 메인테이너 승인 후 머지**됩니다. 작은 단위로 나눠주세요.
- 커밋 메시지는 [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:` …).
- CI(typecheck + build + test)가 통과해야 합니다: `npm run typecheck && npm run build && npm test`.
- **instructions/(작성 지침) 변경은 골든 테스트 갱신 동반 필수** — 지침이 곧 노트 품질입니다.
- 노트 포맷 변경은 [docs/note-format.md](docs/note-format.md) 스펙 갱신 + 파서·린터 + 테스트가 한 PR로 함께.

## 개발

```bash
npm install
npm run build
node packages/cli/dist/index.js --help

# 실데이터를 건드리지 않고 테스트하려면 OLN_HOME을 분리하세요
OLN_HOME=/tmp/oln-dev node packages/cli/dist/index.js collect --since 2026-08-01 --until 2026-08-21
```

## 하지 말아야 할 것

- raw 덤프(세션 프롬프트 원문)를 외부로 보내는 어떤 기능도 추가하지 마세요 — 프라이버시 원칙 위반입니다.
- 타사 연구노트 서비스의 UI·비공개 API를 자동화하는 싱크/업로더 — 약관·유지보수·경쟁 중립성 문제로 받지 않습니다. 다른 서비스로 옮기는 것은 export(파일 산출물)로 해결합니다.
