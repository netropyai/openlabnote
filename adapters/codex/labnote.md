개발 기록을 일자별 연구노트로 정리하라. openlabnote CLI(`oln`, 없으면 `npx -y openlabnote`)와 협업한다.

절차:
1. `oln config` 로 설정 확인. "설정이 없습니다"면 사용자와 인터뷰해 ~/.openlabnote/config.json 생성 (스키마: 저장소 docs/agent-protocol.md — 하네스 흔적·리포·git author를 먼저 스캔해 선택지를 좁혀 질문).
2. 사용자 요청에서 날짜 범위 결정 (무언급 = 오늘). `oln collect --since D --until D --json` 실행.
3. `oln instructions write` 의 지침을 읽고, `~/.openlabnote/raw/<project>/<date>.md` 를 읽어 각 (과제, 날짜)의 노트를 작성해 `<notesDir>/<project>/<date>.md` 에 저장 (notesDir는 `oln config`의 resolved.notesDirAbsolute). 이미 있는 노트는 건너뛰고 보고.
4. `oln lint --json` 으로 검사하고 error를 고쳐 통과할 때까지 반복 (최대 3회).
5. 작성/건너뜀/실패 요약과 대표 노트 미리보기를 보여주고, `oln status`·`oln open`을 안내.

원칙: raw 내용은 로컬 요약에만 쓰고 외부로 보내지 않는다. 노트는 연구자가 직접 한 일처럼 서술하고 메타서술(AI에게 시켰다 등)을 금지한다.
