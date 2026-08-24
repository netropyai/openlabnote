# Codex 어댑터

Codex CLI에서 openlabnote를 쓰는 방법. 계약은 [docs/agent-protocol.md](../../docs/agent-protocol.md)와 동일합니다.

## 설치

`labnote.md`를 Codex의 커스텀 프롬프트 폴더에 복사합니다:

```bash
mkdir -p ~/.codex/prompts
cp labnote.md ~/.codex/prompts/labnote.md
```

이후 Codex에서 `/labnote`로 실행합니다.

## 동작

프롬프트가 에이전트에게 agent-protocol의 플로우(설정 확인 → `oln collect` → 지침 따라 작성 → `oln lint` 루프 → 보고)를 지시합니다.
결정적 작업은 전부 `oln` CLI가 수행하므로 Claude Code 플러그인과 동일한 품질 규칙이 적용됩니다.
