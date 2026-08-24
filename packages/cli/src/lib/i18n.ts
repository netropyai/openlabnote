/**
 * UI 언어 (ko/en). 한국어 문자열 자체를 키로 쓰고, en은 카탈로그에서 찾는다.
 * 카탈로그에 없으면 한국어로 폴백 — 새 문자열 추가 시 EN에 짝을 넣을 것.
 */
export type Locale = "ko" | "en";

let locale: Locale = "ko";

export function setLocale(l: Locale): void {
  locale = l;
}

export function getLocale(): Locale {
  return locale;
}

/** 설정이 없을 때의 초기 로케일 추정 (OLN_LANG 최우선) */
export function detectSystemLocale(): Locale {
  const env = process.env.OLN_LANG || process.env.LC_ALL || process.env.LC_MESSAGES || process.env.LANG || "";
  return /^ko/i.test(env) ? "ko" : "en";
}

export function t(ko: string, params?: Record<string, string | number>): string {
  const template = locale === "ko" ? ko : (EN[ko] ?? ko);
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? `{${k}}`));
}

const EN: Record<string, string> = {
  // ── search-select · init 개선 (2026-08-27) ──────────────
  "이 과제에 속한 저장소 선택 — 글자 입력 = 검색 · Tab = 선택 (없으면 그냥 enter)":
    "Select repositories for this project — type to search · Tab to select (enter to skip)",
  "어떤 기록을 수집할까요? (space로 켜고 끄기)":
    "Which records should be collected? (space to toggle)",
  "Claude Code 세션": "Claude Code sessions",
  "Codex 세션": "Codex sessions",
  "git 커밋": "git commits",
  "과제에 등록한 저장소": "repos registered to projects",
  " · 원격 서버 포함": " · incl. remote servers",
  "미감지": "not detected",
  "수집 소스": "Collection sources",
  "추가됨: {path}": "Added: {path}",
  "경로가 없습니다: {path} — 추가하지 않았습니다": "Path not found: {path} — not added",
  "추가하지 않았습니다: {path}": "Not added: {path}",
  "{host}에서 경로 확인 중": "Checking path on {host}",
  "{host}: 연결 실패": "{host}: connection failed",
  "지금은 연결할 수 없습니다. 나중에 연결된다면 그대로 등록할까요?":
    "Can't connect right now. Register anyway for later?",
  "{host}: 경로가 없습니다 — {path}": "{host}: path not found — {path}",
  "원격에 이 경로가 없습니다. 그래도 등록할까요? (보통은 오타입니다)":
    "This path doesn't exist on the remote. Register anyway? (usually a typo)",
  "{host}: 경로 확인됨": "{host}: path verified",
  "  Tab: 자동완성 (원격 호스트:경로 포함 — 첫 조회 1~2초) · 빈 입력 엔터 = 완료/기본값":
    "  Tab: autocomplete (incl. remote host:path — first lookup takes 1-2s) · empty enter = done/default",
  "홈으로 가기 (Enter)": "Go to home (Enter)",
  "과제 현황": "Projects",
  "웹 뷰어를 열었습니다: {url}": "Opened the web viewer: {url}",
  "내가 직접 수정하기": "Edit it myself",
  "웹 뷰어가 열립니다": "opens the web viewer",
  "새로 수집해서 다시 작성": "Re-collect and rewrite",
  "기존은 .bak 보관": "old note kept as .bak",
  "브라우저에서 수정 후 저장하면 바로 반영됩니다 (형식 검사 포함)":
    "Edit in the browser and save — applied immediately (with format lint)",
  "오늘 노트는 그대로 둡니다 — 할 일이 없습니다": "Keeping today's notes — nothing to do",
  "어느 노트를 볼까요? (글자 입력 = 검색)": "Which note? (type to search)",
  "일": "Sun", "월": "Mon", "화": "Tue", "수": "Wed", "목": "Thu", "금": "Fri", "토": "Sat",
  "↑↓ 이동 · Enter 실행 · q 종료": "↑↓ move · Enter run · q quit",
  "과제 폴더명 (영문 — 노트가 이 폴더에 쌓입니다)": "Project folder name (English — notes are stored here)",
  "과제 폴더명 (영문)": "Project folder name (English)",
  "밀린 {n}일치 정리하기": "Catch up on {n} pending day(s)",
  "oln catchup  — 밀린 {n}일치": "oln catchup  — {n} pending day(s)",
  "무엇을 바꿀까요? (ESC = 변경 없이 나가기)": "What to change? (ESC = leave without changes)",
  "나가기": "Exit",
  "변경 없이 종료": "leave without changes",
  "설정을 닫았습니다": "Settings closed",
  "저장됨": "Saved",
  "변경 취소 — 저장하지 않았습니다": "Cancelled — nothing was saved",
  "완료": "Done",
  "{p}의 {date} 노트가 이미 있습니다 (위 내용).": "{p} already has a note for {date} (shown above).",
  "그대로 두기": "Keep as is",
  "✓ 오늘 작성됨": "✓ written today",
  "마지막 노트 {d} ({n}일 전)": "last note {d} ({n}d ago)",
  "노트 없음": "no notes yet",
  "새로 발견된 미매핑 경로 {n}곳 — 과제에 속하지 않아 노트에 반영되지 않습니다":
    "{n} new unmapped path(s) — not part of any project, so not included in notes",
  "건": "", 
  "외 {n}곳": "and {n} more",
  "   과제로 넣으려면:  oln setup projects  · 이 안내는 경로당 한 번만 표시됩니다":
    "   To include:  oln setup projects  · shown once per path",
  "Enter를 누르면 홈으로 돌아갑니다 ": "Press Enter to return home ",
  "최근 {n}주": "Last {n} weeks",
  "노트 작성": "Write",
  "보기 · 내보내기": "View · Export",
  "관리": "Manage",
  "{host}: {phase}": "{host}: {phase}",
  "{host}: {phase} — {sec}s": "{host}: {phase} — {sec}s",
  "하네스 확인 중 (~/.claude · ~/.codex)": "checking harnesses (~/.claude · ~/.codex)",
  "git 리포 찾는 중 (홈 깊이 4 — 서버가 크면 수십 초)": "finding git repos (home, depth 4 — may take tens of seconds on big servers)",
  "{host}: 원격 스캔 실패": "{host}: remote scan failed",
  "{host} 연결이 끊겼습니다. 지금 비밀번호를 입력해 다시 연결할까요? (키 재등록 — 1회 입력)":
    "{host} is unreachable. Enter the password now to reconnect? (reinstalls the key — one time)",
  "{host}: 다시 연결됐습니다": "{host}: reconnected",
  "{host}: 재연결에 실패했습니다": "{host}: reconnect failed",
  "{host}: 연결할 수 없어 이번 수집에서 건너뜁니다 (다시 연결: ssh-copy-id {host})":
    "{host}: unreachable — skipped for this run (reconnect: ssh-copy-id {host})",
  "{host}: 키 인증이 안 되어 있습니다. 어떻게 할까요?": "{host}: key auth is not set up. What now?",
  "지금 비밀번호 한 번 입력해서 키 등록 (권장)": "Enter the password once now to install a key (recommended)",
  "일단 등록만 해두기 — 나중에 키 연결": "Register anyway — connect the key later",
  "이 호스트 건너뛰기": "Skip this host",
  "{host}: 키 등록 후에도 연결이 안 됩니다 — 건너뜁니다 ({err})": "{host}: still can't connect after key install — skipping ({err})",
  "{host}: 키 인증 연결 확인": "{host}: key auth verified",
  "SSH 키가 없습니다. 새로 만들까요? (ed25519, 암호 없음)": "No SSH key found. Create one? (ed25519, no passphrase)",
  "키 생성에 실패했습니다": "Key generation failed",
  "{host}의 비밀번호를 물으면 입력하세요 — 이 1회뿐이고, 이후엔 키로 자동 접속합니다.":
    "When asked, enter the password for {host} — just this once; afterwards the key logs in automatically.",
  "ssh-copy-id를 실행할 수 없습니다 — 수동으로:  ssh-copy-id {host}": "Couldn't run ssh-copy-id — manually:  ssh-copy-id {host}",
  "ESC = 이전 단계": "ESC = previous step",
  "언어": "Language",
  "원격": "Remote",
  "소스": "Sources",
  "작성자": "Author",
  "과제": "Projects",
  "저장 위치": "Notes dir",
  "환경 스캔 중 (하네스·git·리포)": "Scanning environment (harnesses · git · repos)",
  "스캔 완료": "Scan done",
  "어떤 기록을 수집할까요? (space로 켜고 끄기 — 최소 1개)":
    "Which records should be collected? (space to toggle — at least one)",
  "감지: {places}": "detected: {places}",
  "로컬": "local",
  " · 원격 리포 {n}개 발견": " · {n} remote repos found",
  "{host}: 리포 {n}개 · Claude Code {c} · Codex {x}": "{host}: {n} repos · Claude Code {c} · Codex {x}",
  "git 커밋 author 매칭 패턴 (쉼표 구분 — 커밋의 author 이름에 이 문자열이 포함되면 내 커밋, 대소문자 무시)":
    "git author match patterns (comma-separated — a commit is yours if its author contains one of these, case-insensitive)",
  "과제에 등록할 저장소에서 수집": "collected from repos you register per project",
  "git 수집이 꺼져 있어 저장소 선택을 건너뜁니다 (나중에: oln setup sources)":
    "git collection is off — skipping repo selection (later: oln setup sources)",
  // ── redact (시크릿 스캔) ─────────────────────────────────
  "시크릿으로 의심되는 값이 노트에 있습니다 — 내보내기를 중단합니다":
    "Possible secrets found in notes — export blocked",
  "    L{line}  {label}: {masked}": "    L{line}  {label}: {masked}",
  "총 {n}건 발견. 노트를 수정한 뒤 다시 실행하세요.":
    "{n} finding(s). Edit the notes and run again.",
  "실제 키가 아니라 의도한 값이면:  oln export --allow-secrets":
    "If these are intentional (not real keys):  oln export --allow-secrets",
  "시크릿 의심 {n}건 — 내보내기(export)·업로드 시 차단됩니다. 실제 키라면 노트에서 지우세요.":
    "{n} possible secret(s) — export/upload will be blocked. Remove them if they are real keys.",
  "개인키 블록": "private key block",
  "AWS Access Key": "AWS access key",
  "AWS Secret Key": "AWS secret key",
  "GitHub 토큰": "GitHub token",
  "Anthropic API 키": "Anthropic API key",
  "OpenAI API 키": "OpenAI API key",
  "Google API 키": "Google API key",
  "Slack 토큰": "Slack token",
  "Stripe 키": "Stripe key",
  "npm 토큰": "npm token",
  "JWT 토큰": "JWT token",
  "URL 내 비밀번호": "password in URL",
  "openlabnote Cloud 토큰": "openlabnote Cloud token",
  "키/비밀번호 대입": "key/password assignment",
  // ── 공통 (ui.ts) ─────────────────────────────────────────
  "다음에 할 일:  ": "Next steps:  ",
  "해결: ": "Fix: ",
  "[그림] {caption} ({path})": "[figure] {caption} ({path})",
  // ── heatmap ─────────────────────────────────────────────
  "             월 화 수 목 금 토 일": "             Mon Tue Wed Thu Fri Sat Sun",
  "{full} 전과제 작성  {partial} 일부 작성  {activity} 기록만 있음  {today} 오늘":
    "{full} all written  {partial} partly written  {activity} activity only  {today} today",
  // ── config ──────────────────────────────────────────────
  "설정이 없습니다 ({path}).  다음:  oln init  으로 초기 설정을 하세요.":
    "No config found ({path}).  Next:  run  oln init  to set up.",
  // ── engine ──────────────────────────────────────────────
  "claude CLI를 찾을 수 없습니다": "claude CLI not found",
  "https://claude.com/claude-code 에서 설치 후  oln setup engine  으로 다시 설정":
    "Install from https://claude.com/claude-code, then run  oln setup engine",
  "codex CLI를 찾을 수 없습니다": "codex CLI not found",
  "codex 설치 후  oln setup engine  으로 다시 설정": "Install codex, then run  oln setup engine",
  "엔진 응답이 5분을 초과했습니다": "Engine did not respond within 5 minutes",
  "다시 실행하거나 raw가 과도하게 큰지 확인 (oln collect)": "Retry, or check whether the raw dump is too large (oln collect)",
  "claude -p 실행 실패: {err}": "claude -p failed: {err}",
  "claude 를 단독 실행해 로그인 상태를 확인하세요": "Run claude on its own and check that you are logged in",
  "codex exec 실행 실패: {err}": "codex exec failed: {err}",
  "codex 를 단독 실행해 로그인 상태를 확인하세요": "Run codex on its own and check that you are logged in",
  "원인 미상": "unknown reason",
  "작성 엔진이 설정되지 않았습니다": "No writing engine configured",
  "oln setup engine  으로 claude/codex를 선택하거나, Claude Code 안에서 /labnote 를 사용하세요":
    "Choose claude/codex via  oln setup engine, or use /labnote inside Claude Code",
  // ── collect (명령·경고) ──────────────────────────────────
  "날짜 형식이 잘못됐습니다 (YYYY-MM-DD)": "Invalid date format (YYYY-MM-DD)",
  "--since가 --until보다 뒤입니다": "--since is after --until",
  "범위를 확인하세요": "Check the range",
  "수집": "Collect",
  "수집된 기록이 없습니다": "No records collected",
  "git 저장소가 아님: {repo}": "Not a git repository: {repo}",
  "git log 실패: {repo} ({err})": "git log failed: {repo} ({err})",
  "원격 git log 실패: {entry} ({reason})": "Remote git log failed: {entry} ({reason})",
  "SSH 연결 실패 — 키 인증 확인": "SSH connection failed — check key auth",
  "{host}: SSH 연결 실패 — ssh {host} 로 키 인증을 확인하세요":
    "{host}: SSH connection failed — verify key auth with  ssh {host}",
  "{host}: 원격 $HOME 확인 실패 — 연결·키 인증을 확인하세요 (ssh {host})":
    "{host}: could not resolve remote $HOME — check connection/key auth (ssh {host})",
  "{host}: 원격 $HOME 확인 실패 — ssh {host} 로 키 인증을 확인하세요":
    "{host}: could not resolve remote $HOME — verify key auth with  ssh {host}",
  "{host}: 원격 세션 아카이브 해제 실패 ({err})": "{host}: failed to extract remote session archive ({err})",
  "claude-code 세션 파싱 실패: {file} ({err})": "failed to parse claude-code session: {file} ({err})",
  "codex 세션 파싱 실패: {file} ({err})": "failed to parse codex session: {file} ({err})",
  // ── lint 메시지 ──────────────────────────────────────────
  "날짜 헤딩(## @Month D, YYYY)이 정확히 1개여야 합니다 (현재 {n}개)":
    "Exactly one date heading (## @Month D, YYYY) is required (found {n})",
  "날짜 헤딩 형식이 올바르지 않습니다 (예: ## @August 21, 2026)":
    "Invalid date heading format (e.g. ## @August 21, 2026)",
  "헤딩 날짜({a})가 파일 날짜({b})와 다릅니다": "Heading date ({a}) differs from file date ({b})",
  "주제(###)가 {n}개 — 하루 {max}개 이하 권장": "{n} topics (###) — keep it to {max} per day",
  "내용이 비어 있습니다 (주제·불릿 없음)": "Note is empty (no topics/bullets)",
  "불릿이 {n}자 — {max}자 이하로 (「{preview}…」)": "Bullet is {n} chars — keep under {max} (“{preview}…”)",
  "메타서술 금지 ({label})": "No meta-narration ({label})",
  "불릿이 {n}개 — 하루 {max}개 이하 권장": "{n} bullets — keep it to {max} per day",
  "하위 불릿 금지 — 평탄화하세요": "No sub-bullets — flatten them",
  "그림이 {n}개 — 하루 {max}개 이하": "{n} figures — keep it to {max} per day",
  "FIG 파일이 없습니다: {path}": "FIG file does not exist: {path}",
  "AI에게 시켰다는 서술": "says the AI was told to do it",
  "지시했다는 서술": "says it was instructed",
  "프롬프트 언급": "mentions prompts",
  "AI에게 시켰다는 서술(영문)": "says the AI was told to do it (EN)",
  "AI가 했다는 서술(영문)": "says the AI did it (EN)",
  // ── today ───────────────────────────────────────────────
  "작성": "Compose",
  "검사": "Lint",
  "저장": "Saved",
  "미리보기": "Preview",
  "엔진": "engine",
  "수집된 기록이 없습니다 (프롬프트 0 · 커밋 0)": "Nothing collected (0 prompts · 0 commits)",
  "oln catchup  — 지난 날짜 정리": "oln catchup  — write past days",
  "{p} — 통과{warn}": "{p} — passed{warn}",
  " (경고 {n})": " ({n} warnings)",
  "{p}: 검사 실패 — 초안으로 저장 {path}": "{p}: lint failed — saved as draft {path}",
  "   직접 고치거나 Claude Code에서 /labnote 로 다시 작성하세요":
    "   Fix it by hand, or rewrite with /labnote in Claude Code",
  "{p}: 이미 작성된 노트 유지 {path}": "{p}: kept existing note {path}",
  "oln note today --edit  — 수정": "oln note today --edit  — edit",
  // ── catchup ─────────────────────────────────────────────
  "날짜 범위가 잘못됐습니다": "Invalid date range",
  "미작성 스캔": "Unwritten scan",
  "밀린 노트가 없습니다 — 기록이 있는 날짜는 모두 작성되어 있습니다":
    "Nothing to catch up — every day with activity has a note",
  "{n}건 작성에는 확인이 필요합니다": "Writing {n} notes needs confirmation",
  "{n}건을 작성합니다 (예상 ~{min}분, {engine}). 진행할까요?":
    "About to write {n} notes (~{min} min, {engine}). Continue?",
  "취소됨": "Cancelled",
  "작성 중": "writing",
  "검사 실패 → 초안 저장": "lint failed → saved as draft",
  "엔진 오류": "engine error",
  "건너뜀": "skipped",
  "완료: {n}건 작성{draft}": "Done: {n} written{draft}",
  " · 초안 {n}건": " · {n} drafts",
  "검사 실패 초안: {list} — 노트 폴더에서 .draft.md 확인": "Lint-failed drafts: {list} — see .draft.md in your notes folder",
  "oln open  — 노트 폴더 열기": "oln open  — open notes folder",
  // ── status ──────────────────────────────────────────────
  "현황": "Status",
  "최근 {n}주 · 노트 저장소 {dir}": "last {n} weeks · notes at {dir}",
  "노트 {n}건 · 마지막 {last}": "{n} notes · last {last}",
  "  미작성 {n}일": "  {n} unwritten",
  "  초안 {n}건": "  {n} drafts",
  "oln catchup  — 미작성 {n}건 정리": "oln catchup  — write {n} unwritten",
  // ── note ────────────────────────────────────────────────
  "날짜 형식이 잘못됐습니다": "Invalid date format",
  "oln note 2026-08-21  또는  oln note today": "oln note 2026-08-21  or  oln note today",
  "과제를 찾을 수 없습니다: {p}": "Project not found: {p}",
  "oln setup projects  에서 과제 id 확인": "Check project ids in  oln setup projects",
  "편집기로 열었습니다: {path}": "Opened in editor: {path}",
  "{date} 노트가 없습니다": "No note for {date}",
  "oln note {date} --regen  — 이 날짜 작성": "oln note {date} --regen  — write this day",
  "oln note {date} --edit": "oln note {date} --edit",
  "oln note {date} --regen  — 다시 작성": "oln note {date} --regen  — rewrite",
  "{date} 기록 수집 중…": "Collecting records for {date}…",
  "{p}: 작성 완료 {path}": "{p}: written {path}",
  "{p}: 검사 실패 — 초안 저장 {path}": "{p}: lint failed — draft saved {path}",
  "{date}에 수집된 기록이 없습니다": "No records collected for {date}",
  // ── open ────────────────────────────────────────────────
  "노트 폴더가 아직 없습니다 ({dir})": "Notes folder does not exist yet ({dir})",
  "oln today  로 첫 노트를 작성하세요": "Write your first note with  oln today",
  "노트 폴더를 열었습니다: {dir}": "Opened notes folder: {dir}",
  // ── lint 명령 ────────────────────────────────────────────
  "검사할 노트가 없습니다": "No notes to lint",
  "전체 통과 — {n}건": "All passed — {n} notes",
  "오류 {n}건 / 전체 {total}건": "{n} with errors / {total} total",
  "oln note <date> --edit  — 수정": "oln note <date> --edit  — edit",
  "oln note <date> --regen  — 다시 작성": "oln note <date> --regen  — rewrite",
  // ── meta (instructions/config) ──────────────────────────
  "알 수 없는 지침: {name}": "Unknown instruction: {name}",
  "oln instructions write|polish|concise [--edit|--reset]": "oln instructions write|polish|concise [--edit|--reset]",
  "커스텀 지침 삭제 — 기본 지침으로 복귀 ({name})": "Custom instruction removed — back to default ({name})",
  "커스텀 지침이 없습니다 — 이미 기본 지침 사용 중 ({name})": "No custom instruction — already using the default ({name})",
  "oln instructions {name}  — 현재 지침 확인": "oln instructions {name}  — view current instruction",
  "기본 지침을 복사했습니다: {path}": "Copied the default instruction to: {path}",
  "이후 노트 작성(oln today, /labnote)에 즉시 반영됩니다.": "Applies immediately to future notes (oln today, /labnote).",
  "oln instructions {name} --reset  — 기본으로 되돌리기": "oln instructions {name} --reset  — restore default",
  "# 출처: {origin}": "# source: {origin}",
  "커스텀 ({path})": "custom ({path})",
  "기본 (패키지 내장)": "default (bundled)",
  // ── reset ───────────────────────────────────────────────
  "설정이 없어 노트 폴더 위치를 알 수 없습니다 — 노트는 직접 지우세요":
    "No config, so the notes folder is unknown — delete notes manually",
  "노트 폴더 ({path}) ⚠ 정본 노트 삭제": "notes folder ({path}) ⚠ deletes canonical notes",
  "지울 것이 없습니다 — 이미 처음 상태입니다": "Nothing to delete — already in a fresh state",
  "oln  — 초기 설정 시작": "oln  — start setup",
  "삭제 확인이 필요합니다": "Deletion needs confirmation",
  "oln reset --yes  (노트까지: oln reset --notes --yes)": "oln reset --yes  (with notes: oln reset --notes --yes)",
  "삭제 예정: {label}": "Will delete: {label}",
  "위 항목을 삭제하고 처음 상태로 되돌릴까요?": "Delete the above and return to a fresh state?",
  "삭제됨: {label}": "Deleted: {label}",
  "oln  — 초기 설정부터 다시 시작": "oln  — start over from setup",
  // ── home ────────────────────────────────────────────────
  "과제 {n} · 노트 저장소 {dir}": "{n} projects · notes at {dir}",
  "오늘 정리하기": "Write today's note",
  "오늘 정리하기 (이미 작성됨 — 다시 작성 가능)": "Write today's note (already written — can rewrite)",
  "현황 자세히": "Detailed status",
  "특정 날짜 노트 보기": "View a specific date",
  "노트 폴더 열기": "Open notes folder",
  "설정": "Settings",
  // ── init ────────────────────────────────────────────────
  "설정이 이미 있습니다. 처음부터 다시 설정할까요? (기존 설정은 덮어씁니다)":
    "Config already exists. Start over? (overwrites current config)",
  "취소됨 — 부분 수정은  oln setup": "Cancelled — for partial edits use  oln setup",
  "감지 결과": "Detected",
  "세션 {n}개 (최근: {last})": "{n} sessions (last: {last})",
  "사용 흔적 없음": "no usage found",
  "설치됨 (수집기는 곧 지원)": "installed (collector coming soon)",
  "설치 흔적 없음": "not installed",
  "git author": "git author",
  "활동 리포": "active repos",
  "연구노트 작성자명은 과제 협약에 등록된 이름과 일치해야 합니다.\n   국내 과제는 보통 한국 이름을 쓰고, 외국인 연구자는 외국인등록증의 한국명을 권장합니다.":
    "The author name should match the name registered on your research grant.\n   Korean national projects usually use Korean names; foreign researchers should use the Korean name on their residence card.",
  "이름 (연구노트 작성자 표기 — 과제에 등록된 이름)": "Name (as registered on the grant — appears as note author)",
  "이름을 입력하세요": "Enter a name",
  "패턴을 하나 이상 입력하세요": "Enter at least one pattern",
  "수행 중인 과제(연구노트를 쓸 단위)를 등록합니다": "Register your projects (one research-note stream each)",
  "과제 {n} 이름 (정식 과제명 또는 짧은 이름)": "Project {n} name (official title or a short name)",
  "예: 뉴럴 렌더링 기반 자율주행 시뮬레이션": "e.g. Neural-rendering-based AV simulation",
  "과제 이름을 입력하세요": "Enter a project name",
  "영소문자·숫자·하이픈만": "lowercase letters, digits, hyphens only",
  "마지막 커밋 {date}": "last commit {date}",
  "추가할 경로": "Path to add",
  "경로가 없습니다: {path}": "Path does not exist: {path}",
  "과제를 더 등록할까요?": "Register another project?",
  "원격 개발 서버에서도 작업하시나요? (SSH로 원격 리포 커밋·하네스 세션까지 수집합니다)":
    "Do you also work on remote dev servers? (collects remote commits & harness sessions over SSH)",
  "예: serverA": "e.g. serverA",
  "{host} 연결 테스트 중": "Testing connection to {host}",
  "연결됨": "connected",
  "연결 실패": "connection failed",
  "노트를 어디에 저장할까요? (md 파일이 여기 쌓입니다 — 백업·git 관리 가능한 내 폴더)":
    "Where should notes be saved? (md files accumulate here — your own folder, easy to back up or git-manage)",
  "기본": "default",
  "직접 입력…": "Custom path…",
  "Tab 자동완성": "Tab completion",
  "노트 저장 경로": "Notes folder path",
  "혼합": "Mixed",
  "한국어": "Korean",
  "terse research-log English": "terse research-log English",
  "claude/codex CLI가 없어 터미널 단독 작성(oln today)은 비활성화됩니다.\n하네스 안(/labnote)에서 작성하거나, CLI 설치 후 oln setup engine 으로 켜세요.":
    "No claude/codex CLI found, so standalone writing (oln today) is disabled.\nWrite inside a harness (/labnote), or install a CLI and enable via oln setup engine.",
  "claude -p (Claude 구독)": "claude -p (your Claude subscription)",
  "codex exec (Codex 구독)": "codex exec (your Codex subscription)",
  "감지됨": "detected",
  "사용 안 함": "None",
  "하네스 안(/labnote)에서만 작성": "write only inside a harness (/labnote)",
  "터미널에서 정리할 때(oln today) 어떤 엔진으로 노트를 작성할까요? (내 구독 사용)":
    "Which engine should write notes in the terminal (oln today)? (uses your subscription)",
  "설정 저장 완료": "Config saved",
  "다음 단계": "Next steps",
  "oln today        오늘 일을 정리해보세요": "oln today        write today's note",
  "oln catchup      밀린 날짜 채우기": "oln catchup      fill in past days",
  "Claude Code를 쓰신다면 플러그인도 설치할 수 있습니다:": "If you use Claude Code, you can also install the plugin:",
  "준비 완료": "Ready",
  "초기 설정은 대화형 터미널에서 실행해야 합니다": "Setup must run in an interactive terminal",
  "터미널에서  oln init  실행 (또는 Claude Code에서 /labnote setup)":
    "Run  oln init  in a terminal (or /labnote setup in Claude Code)",
  "초기 설정을 취소했습니다 — 언제든  oln init  으로 다시 시작": "Setup cancelled — restart any time with  oln init",
  "언어를 선택하세요 · Choose your language": "언어를 선택하세요 · Choose your language",
  // ── setup ───────────────────────────────────────────────
  "설정 변경은 대화형 터미널에서 실행해야 합니다": "Settings must run in an interactive terminal",
  "openlabnote 설정": "openlabnote settings",
  "무엇을 바꿀까요?": "What do you want to change?",
  "과제 관리": "Projects",
  "현재 {n}개": "{n} configured",
  "원격 서버 관리": "Remote servers",
  "없음": "none",
  "노트 저장 위치": "Notes folder",
  "노트 문체": "Note style",
  "작성 엔진·모델": "Engine & model",
  "작성자·git author 패턴": "Author & git patterns",
  "UI 언어": "UI language",
  "저장 완료": "Saved",
  "기존 과제에 경로 추가": "Add a path to a project",
  "과제에서 경로 제거": "Remove a path from a project",
  "과제 추가": "Add a project",
  "과제 제거": "Remove a project",
  "{host}는 아직 등록되지 않은 원격 서버입니다 — 원격 서버 관리에서 먼저 추가하세요":
    "{host} is not a registered remote server — add it in Remote servers first",
  "이 원격 경로의 성격은?": "What is this remote path?",
  "git 저장소 (커밋도 수집)": "git repository (also collect commits)",
  "일반 디렉토리 (세션 매핑만)": "plain directory (session mapping only)",
  "경로가 없습니다: {path} — 저장하지 않았습니다": "Path does not exist: {path} — not saved",
  "{p}에 등록된 경로가 없습니다": "No paths registered for {p}",
  "{p}에서 제거할 경로 선택 (space로 선택, enter로 확정)": "Select paths to remove from {p} (space to select, enter to confirm)",
  "제거한 경로 없음": "No paths removed",
  "{n}개 경로 제거됨 (노트·raw 파일은 지우지 않습니다)": "{n} paths removed (notes/raw files are kept)",
  "과제 이름": "Project name",
  "입력하세요": "Required",
  "이미 있는 슬러그": "slug already exists",
  "과제 추가됨 — 경로는 \"기존 과제에 경로 추가\"로 등록하세요": "Project added — register paths via \"Add a path to a project\"",
  "과제가 1개뿐이라 제거할 수 없습니다 (최소 1개 필요)": "Cannot remove the only project (at least one required)",
  "{p}를 제거할까요? (노트 파일은 지우지 않습니다)": "Remove {p}? (note files are kept)",
  "{p} 제거됨": "{p} removed",
  "과제 선택": "Select a project",
  "원격 서버 관리 (SSH 키 인증 필수 — 원격 리포·하네스 세션을 수집합니다)":
    "Remote servers (SSH key auth required — collects remote repos & harness sessions)",
  "원격 서버 추가": "Add a remote server",
  "연결 테스트": "Test connections",
  "원격 서버 제거": "Remove a remote server",
  "키 인증을 등록하세요:  ssh-copy-id {host}  (등록만 해두고 나중에 연결해도 됩니다)":
    "Register key auth:  ssh-copy-id {host}  (you can register now and connect later)",
  "{host} 등록됨.  과제에 원격 리포를 연결하려면: 과제 관리 → 경로 추가에서  {host}:~/dev/리포경로  형식으로 입력":
    "{host} registered.  To link a remote repo: Projects → add path, using  {host}:~/dev/your-repo",
  "등록된 원격 서버가 없습니다": "No remote servers registered",
  "제거할 원격 서버": "Remote server to remove",
  "과제에 이 호스트의 경로 {n}개가 남아 있습니다 (수집에서 무시됨) — 과제 관리 → 경로 제거로 정리하세요":
    "{n} paths for this host remain in projects (ignored during collect) — clean up via Projects → remove path",
  "{host} 제거됨": "{host} removed",
  "노트 저장 위치 (기존 노트는 자동 이동하지 않습니다)": "Notes folder (existing notes are not moved automatically)",
  "경로를 입력하세요": "Enter a path",
  "혼합 (기술 영문 + 한국어 마커)": "Mixed (technical English + Korean markers)",
  "터미널 작성 엔진 (oln today가 내 구독으로 노트를 작성할 때 사용)":
    "Terminal writing engine (used by oln today with your subscription)",
  "미설치": "not installed",
  "{engine} CLI가 아직 감지되지 않습니다 — 설치해야 동작합니다": "{engine} CLI not detected yet — install it to use this",
  "모델 지정 (비우면 해당 CLI의 기본 모델 사용)": "Model override (empty = the CLI's default model)",
  "예: sonnet, haiku, opus": "e.g. sonnet, haiku, opus",
  "예: gpt-5": "e.g. gpt-5",
  "이름": "Name",
  "git author 매칭 패턴 (쉼표 구분)": "git author match patterns (comma-separated)",
  "하나 이상 입력": "enter at least one",
  // ── path-input ──────────────────────────────────────────
  "  (엔터 = {v})": "  (enter = {v})",
  // ── scan ────────────────────────────────────────────────
  "오늘": "today",
  "어제": "yesterday",
  "{n}일 전": "{n} days ago",
  // ── 추가 (배치 전환분) ────────────────────────────────────
  "{pid}  {d}일 · 프롬프트 {p} · 커밋 {c}": "{pid}  {d} days · {p} prompts · {c} commits",
  "프롬프트 {p} · 응답 {r} · 커밋 {c}": "{p} prompts · {r} responses · {c} commits",
  " · 엔진 {e}": " · engine {e}",
  "엔진 {e}": "engine {e}",
  // ── 추가 (배치 전환분) ────────────────────────────────────
  // ── init 개편 (ESC 뒤로가기·원격 리포 발견) ─────────────────
  "설정을 취소할까요? (지금까지 입력은 저장되지 않습니다)": "Cancel setup? (nothing entered so far will be saved)",
  // ── init 리뷰 2차 반영 ────────────────────────────────────
  "예: 홍길동": "e.g. Jane Doe",
  "＋ 목록에 없는 경로 직접 추가…": "+ Add a path not in the list…",
  "발견된 리포가 없어 직접 입력합니다": "No repos discovered — enter paths manually",
  "요약·작성은 하네스 안(/labnote)에서 — oln today는 수집까지만": "summaries happen inside your harness (/labnote) — oln today only collects",
  "엔진이 설정되지 않아 수집까지만 했습니다. 작성은 Claude Code에서 /labnote 를 실행하세요.": "No engine configured, so only collection ran. Compose with /labnote inside Claude Code.",
  "oln setup engine  — 터미널 엔진 켜기": "oln setup engine  — enable a terminal engine",
  // ── oln ui (웹 뷰어) ─────────────────────────────────────
  "포트가 잘못됐습니다: {p}": "Invalid port: {p}",
  "포트 {p}가 사용 중입니다": "Port {p} is already in use",
  "웹 뷰어 실행 중: {url}": "Web viewer running at {url}",
  "Ctrl+C 로 종료합니다. 노트를 수정하면 브라우저에서 새로고침하세요.": "Ctrl+C to stop. After editing notes, refresh the browser.",
  "이 날짜의 노트가 없습니다 — 기록만 있습니다. 터미널에서:  oln catchup": "No note for this day — only activity. In the terminal:  oln catchup",
  "왼쪽에서 날짜를 선택하세요": "Pick a date on the left",
  "초안 (lint 실패)": "draft (failed lint)",
  "기록만": "activity",
  "새로고침": "Refresh",
  "노트 저장소": "notes at",
  "웹 뷰어로 보기": "Open the web viewer",
  // ── 리뷰 3차 (스피너·복수 호스트·홈 루프) ─────────────────
  "① 수집 중…": "① Collecting…",
  "① 수집 중… {s}": "① Collecting… {s}",
  "원격 {host}": "remote {host}",
  "SSH 호스트 선택 (~/.ssh/config에서 발견 — space로 복수 선택, 키 인증 필요)":
    "Select SSH hosts (found in ~/.ssh/config — space for multiple, key auth required)",
  "＋ 직접 입력…": "+ Enter manually…",
  "추가할 SSH 호스트 (빈 입력 = 완료)": "SSH host to add (empty = done)",
  "기간 지정해서 정리하기": "Catch up a date range",
  "시작 날짜 (YYYY-MM-DD)": "Start date (YYYY-MM-DD)",
  "끝 날짜 (YYYY-MM-DD)": "End date (YYYY-MM-DD)",
  "종료": "Quit",
  // ── 뷰어 편집 ────────────────────────────────────────────
  "수정": "Edit",
  "에디터로 열기": "Open in editor",
  "취소": "Cancel",
  "검사 통과 — 저장됨": "Lint passed — saved",
  "저장됨 — 검사 오류 {n}건": "Saved — {n} lint errors",
  "초안이 정식 노트로 승격되었습니다": "Draft promoted to a regular note",
  "저장하기": "Save",
  // ── export ──────────────────────────────────────────────
  "렌더에 필요한 Chrome/Chromium을 찾을 수 없습니다": "Chrome/Chromium required for rendering was not found",
  "Google Chrome을 설치하거나  npx playwright install chromium  후 다시 실행": "Install Google Chrome, or run  npx playwright install chromium  and retry",
  "{p}: PNG 렌더 중 (0/{total})": "{p}: rendering PNG (0/{total})",
  "{p}: PNG 렌더 중 ({done}/{total})": "{p}: rendering PNG ({done}/{total})",
  "{p}: PNG {n}장": "{p}: {n} PNGs",
  "{p}: PDF 렌더 중": "{p}: rendering PDF",
  "{p}: PDF 1개 ({dates}일치)": "{p}: 1 PDF ({dates} days)",
  "내보낼 노트가 없습니다 ({since} ~ {until})": "No notes to export ({since} ~ {until})",
  "내보내기 완료: PNG {png}장{pdf}": "Export done: {png} PNGs{pdf}",
  " · PDF {n}개": " · {n} PDF",
  "oln export --pdf  — 기간 PDF 포함": "oln export --pdf  — include a period PDF",
  "내보내기 (제출용 PNG·PDF)": "Export (PNG·PDF for submission)",
  "{n}건 — 기록(raw)은 있는데 노트가 없는 (과제×날짜)": "{n} — (project × day) with records but no note yet",
  "대상 기간: {since} ~ {until}": "Range: {since} ~ {until}",
  "대상 기간: {since} ~ {until} (기본 최근 {n}일 — 변경: --since/--until)": "Range: {since} ~ {until} (default last {n} days — change with --since/--until)",
  "   '~'는 홈 폴더에서 시작한 세션입니다 — 과제 폴더 안에서 세션을 시작하면 자동 매핑됩니다":
    "   '~' means sessions started in your home folder — start sessions inside a project folder for automatic mapping",
  "진행 {done}/{total} · 경과 {elapsed} · 엔진 {engine}": "Progress {done}/{total} · elapsed {elapsed} · engine {engine}",

  "이전 입력": "previous entry",
  "oln ui  — 웹 뷰어로 보기": "oln ui  — open the web viewer",
  "편집기를 열 수 없습니다 — 직접 여세요: {path}": "Couldn't open an editor — open it yourself: {path}",
  "지금까지 등록: {n}개": "Registered so far: {n}",
  "추가할 경로 (폴더 이름만 치면 검색 · 빈 입력 = 완료 · 원격은 호스트:~/경로)":
    "Path to add (type a bare folder name to search · empty = done · remote: host:~/path)",
  "{p}에 추가할 저장소·디렉토리 경로 (폴더 이름만 치면 검색 · 원격은 호스트:~/경로)":
    "Repo/directory path to add to {p} (type a bare folder name to search · remote: host:~/path)",
  "'{q}' 이름이 들어간 폴더를 찾지 못했습니다 (홈 아래 깊이 4)":
    "No folder named like '{q}' found (under home, depth 4)",
  "'{q}' 폴더 검색 결과 — space로 선택, enter로 확정": "Folders matching '{q}' — space to select, enter to confirm",
  "'{q}' 폴더 검색 결과 — 추가할 폴더 선택": "Folders matching '{q}' — pick one to add",
  "추가 안 함": "Don't add",
  "외 {n}곳 — 다음 실행에서 이어서 안내": "and {n} more — continued next run",

  // ── capture (순간 기록) ─────────────────────────────────
  "기록할 내용 (여러 줄은 파이프로:  printf '%s\\n' \"- …\" | oln capture)":
    "What to capture (multi-line via pipe:  printf '%s\\n' \"- …\" | oln capture)",
  "기록할 내용이 없습니다": "Nothing to capture",
  "없는 과제입니다: {p}": "No such project: {p}",
  "과제를 정할 수 없습니다 — -p <과제id>를 지정하세요": "Can't determine the project — specify -p <projectId>",
  "어느 과제의 기록인가요? (현재 폴더가 과제에 속하지 않습니다)":
    "Which project is this for? (current folder doesn't belong to any project)",
  "기록됨: {p} · {date} ({n}건째) — 노트 정리 때 반드시 반영됩니다":
    "Captured: {p} · {date} (#{n}) — guaranteed into the note when it's written",
  "이 노트 이후에 추가된 직접 기록이 있습니다 (oln capture {n}건) — \"새로 수집해서 다시 작성\"을 권장합니다":
    "There are captures added after this note was written (oln capture, {n} total) — \"re-collect and rewrite\" is recommended",
  "설정·raw·직접 기록(captures) ({path})": "config · raw · captures ({path})",
  "설정이 올바르지 않습니다 ({detail}).  다음:  oln init  — 처음부터 다시 설정 (또는 파일 직접 수정: {path})":
    "Config is invalid ({detail}).  Next:  oln init  — set up again from scratch (or edit the file directly: {path})",

  // ── 버전·업데이트·마이그레이션 (2026-08-27) ──────────────
  "설정 마이그레이션 경로가 없습니다 (v{from}→v{to}) — 버그입니다. GitHub 이슈로 알려주세요":
    "No config migration path (v{from}→v{to}) — this is a bug. Please file a GitHub issue",
  "설정 파일이 손상됐습니다 (백업: {bak}).  다음:  oln init  으로 다시 생성하세요.":
    "Config file is corrupted (backup: {bak}).  Next:  oln init  to recreate it.",
  "이 설정은 더 새로운 oln이 만들었습니다 (설정 v{v}, 이 oln은 v{cur}까지).  다음:  npm i -g openlabnote@latest  — 또는 백업(config.json.v*.bak)을 복원하세요.":
    "This config was written by a newer oln (config v{v}, this oln supports up to v{cur}).  Next:  npm i -g openlabnote@latest  — or restore a backup (config.json.v*.bak).",
  "설정을 v{from}→v{to}로 마이그레이션했습니다 (백업: {bak})":
    "Migrated config v{from}→v{to} (backup: {bak})",
  "새 버전 {v}가 나왔습니다 (지금 {cur}) — 업데이트:  npm i -g openlabnote@latest":
    "New version {v} available (you have {cur}) — update:  npm i -g openlabnote@latest",
  "… 전체 목록: CHANGELOG.md": "… full list: CHANGELOG.md",
  "{from} → {to} 업데이트됨 — 새로워진 것": "Updated {from} → {to} — what's new",
  "새 버전 확인": "Update check",
  "주 1회": "weekly",
  "끔": "off",
  "새 버전 확인 — 주 1회 npm에 최신 버전 번호만 조회합니다 (전송되는 것은 패키지 이름뿐)":
    "Update check — asks npm for the latest version number once a week (only the package name is sent)",
  "켬 — 새 버전이 나오면 홈 화면에 한 줄 알림": "On — one-line notice on the home screen when a new version is out",
  "끔 — 직접  npm i -g openlabnote@latest  로 업데이트": "Off — update yourself with  npm i -g openlabnote@latest",
  "주 1회 npm에서 새 버전을 확인합니다 (전송: 패키지 이름뿐) — 끄기: oln setup update-check":
    "Checks npm for a new version weekly (only the package name is sent) — disable: oln setup update-check",
};
