import type { Ymd } from "../lib/dates.js";

/** 수집기가 내놓는 이벤트의 표준 형태 */
export interface RawEvent {
  /** ISO 타임스탬프 */
  ts: string;
  /** 로컬 기준 날짜 */
  date: Ymd;
  source: "claude-code" | "codex" | "git";
  kind: "prompt" | "response" | "commit";
  /** 이벤트가 발생한 경로 (세션 cwd 또는 repo 경로) — 과제 매핑에 사용 */
  cwd: string;
  /** 원격 이벤트면 SSH 호스트, 로컬이면 undefined */
  host?: string;
  /** 본문 (프롬프트 전문 / 응답 발췌 / 커밋 제목) */
  text: string;
  /** 세션·커밋 구분용 (sessionId 또는 커밋 해시) */
  ref: string;
  /** 부가 정보 (커밋 통계 등) */
  meta?: Record<string, string | number>;
}

export interface CollectRange {
  since: Ymd;
  until: Ymd;
}

export interface CollectorResult {
  events: RawEvent[];
  /** 수집기 자체 경고 (파싱 실패 파일 등) */
  warnings: string[];
}
