/**
 * 시크릿 스캔 — 외부로 나가는 산출물(export, 추후 Cloud push)의 차단 게이트.
 *
 * 설계 원칙:
 * - 고신뢰(형식이 뚜렷한) 패턴 위주로 오탐을 낮춘다. 일반 고엔트로피 탐지는 하지 않는다.
 * - 발견값은 절대 전체를 출력하지 않는다 (앞4…뒤4 마스킹).
 * - 플레이스홀더(YOUR_KEY, xxx, <token> 등)는 건너뛴다 — 노트에 예시를 적는 것은 정상이다.
 */

export interface SecretFinding {
  ruleId: string;
  /** 사람이 읽는 라벨 (한국어 — 표시 시 t()로 감쌀 것) */
  label: string;
  /** 1부터 시작하는 줄 번호 */
  line: number;
  /** 마스킹된 값 표시 (예: AKIA…X7QZ) — 원문은 보존하지 않는다 */
  masked: string;
}

interface Rule {
  id: string;
  label: string;
  re: RegExp; // g 플래그 필수. 캡처 그룹 1이 있으면 그 값을 시크릿으로 취급
}

const RULES: Rule[] = [
  { id: "private-key", label: "개인키 블록", re: /-----BEGIN [A-Z ]*PRIVATE KEY( BLOCK)?-----/g },
  { id: "aws-access-key", label: "AWS Access Key", re: /\b(?:A3T[A-Z0-9]|AKIA|ASIA|ABIA|ACCA)[A-Z0-9]{16}\b/g },
  {
    id: "aws-secret-key",
    label: "AWS Secret Key",
    re: /\baws.{0,25}?["']([0-9A-Za-z/+=]{40})["']/gi,
  },
  {
    id: "github-token",
    label: "GitHub 토큰",
    re: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})\b/g,
  },
  { id: "anthropic-key", label: "Anthropic API 키", re: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g },
  { id: "openai-key", label: "OpenAI API 키", re: /\bsk-(?!ant-)[A-Za-z0-9_-]{32,}\b/g },
  { id: "google-api-key", label: "Google API 키", re: /\bAIzaSy[A-Za-z0-9_-]{33}\b/g },
  { id: "slack-token", label: "Slack 토큰", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  { id: "stripe-key", label: "Stripe 키", re: /\b[sr]k_(?:live|test)_[A-Za-z0-9]{20,}\b/g },
  { id: "npm-token", label: "npm 토큰", re: /\bnpm_[A-Za-z0-9]{36}\b/g },
  {
    id: "jwt",
    label: "JWT 토큰",
    re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
  },
  {
    id: "url-credentials",
    label: "URL 내 비밀번호",
    re: /\b[a-z][a-z0-9+.-]*:\/\/[^/\s:@'"]{1,64}:([^@\s/'"]{4,})@/gi,
  },
  { id: "oln-cloud-token", label: "openlabnote Cloud 토큰", re: /\boln_[0-9a-f]{40,}\b/g },
  {
    id: "generic-assignment",
    label: "키/비밀번호 대입",
    re: /(?:api[_-]?key|apikey|secret|token|passwd|password|access[_-]?key)["']?\s*[:=]\s*["']([A-Za-z0-9_\-+=.]{12,})["']/gi,
  },
];

// 예시·자리표시자 — 이런 값은 시크릿으로 치지 않는다
const PLACEHOLDER =
  /(xxx|\.\.\.|…|<[^>]*>|\$\{|\{\{|YOUR_|MY_|EXAMPLE|SAMPLE|CHANGE_?ME|PLACEHOLDER|REDACTED|\*{3,})/i;

/** 같은 문자가 대부분인 값(마스킹 흔적 등)도 제외 */
function looksLikePlaceholder(value: string): boolean {
  if (PLACEHOLDER.test(value)) return true;
  const uniq = new Set(value.replace(/[^A-Za-z0-9]/g, "").split(""));
  return uniq.size <= 3 && value.length >= 8;
}

export function maskSecret(value: string): string {
  if (value.length <= 8) return "▪▪▪▪";
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

function lineOf(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) if (text[i] === "\n") line += 1;
  return line;
}

/** 텍스트에서 시크릿 의심값을 찾는다. 발견값 원문은 반환하지 않는다. */
export function scanSecrets(text: string): SecretFinding[] {
  const findings: SecretFinding[] = [];
  const seen = new Set<string>();
  for (const rule of RULES) {
    rule.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = rule.re.exec(text)) !== null) {
      const value = m[1] ?? m[0];
      if (looksLikePlaceholder(value)) continue;
      const line = lineOf(text, m.index);
      const masked = maskSecret(value);
      const key = `${rule.id}|${line}|${masked}`;
      if (seen.has(key)) continue;
      seen.add(key);
      findings.push({ ruleId: rule.id, label: rule.label, line, masked });
      if (findings.length >= 50) return findings; // 폭주 방지
    }
  }
  return findings.sort((a, b) => a.line - b.line);
}
