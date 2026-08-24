# openlabnote

> 개발 기록을 연구노트로 — Claude Code·Codex 세션과 git 커밋을 일자별 연구노트(md)로 자동 정리
>
> Turn your dev records into research notes — daily lab-notebook entries from your AI coding sessions and git commits.

```bash
npx openlabnote     # 첫 실행: 언어 선택 + 자동 스캔 + 설정 인터뷰
oln today           # 오늘 일 정리 (수집 → 작성 → 검사 → 내 폴더에 md 저장)
oln ui              # 로컬 웹 뷰어
oln export --pdf    # 제출용 일자별 PNG + 기간 PDF
```

- 요약·작성은 **내 Claude/Codex 구독**으로 — 별도 API 키·비용 없음
- 세션 로그(raw)는 **절대 로컬을 떠나지 않음**
- 노트는 내가 지정한 폴더의 **마크다운이 정본**

문서·플러그인·소스: **https://github.com/netropyai/openlabnote**

Apache-2.0
