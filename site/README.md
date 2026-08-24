# site/ — openlabnote.com

랜딩 페이지. **라이브: https://netropyai.github.io/openlabnote/** (main의 site/** 변경 시 자동 배포)

- `index.html` — 실제 페이지 (디자인 스펙 그대로 구현)
- 커스텀 도메인(openlabnote.com) 연결: 도메인 등록 후 GitHub → Settings → Pages → Custom domain에 입력하고 DNS에 CNAME(openlabnote.github.io) 추가

## 디자인 레퍼런스 (2026-08-24 확정)

- **[design-reference.html](design-reference.html)** — 브라우저로 열면 섹션별 목업 + 주석. 이것이 구현 스펙이다.
- 온라인 사본: https://claude.ai/code/artifact/3fbaeff9-9771-46ee-b54e-bf92eca87e2e

## 확정 사항

- **구조**: opencode.ai 골격(설치 명령이 CTA, 터미널 미학, 절제된 업셀) × plausible.io 관계 설계(정직한 OSS↔Cloud 비교표)
- **디자인 토큰**: paper `#F6F5F0` · ink `#191D1A` · lab green `#0B7A4B` · terminal `#0E1713`/`#8FE3B7` · marker `#DCEDA6`
- **폰트**: IBM Plex Sans KR (헤드라인·본문) + IBM Plex Mono (명령·라벨)
- **히어로 카피**: "연구노트, 쓰지 말고 만드세요" / EN: "Stop writing research notes. Generate them."
- **섹션 순서**: nav → hero(설치 탭 + 터미널 데모) → 3스텝 → 실제 노트 예시 → 프라이버시 → 하네스 카드 → Cloud 비교표+대기명단 → FAQ 5 → footer
- **배포**: 정적 페이지, Cloudflare Pages(무료). docs는 우선 GitHub README 링크.
- **3단계에 추가**: /cloud (지침 3요건 매핑표·공개 가격표·셀프서브 가입), /pricing
