import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { setLocale, t } from "./i18n.js";
import { configPath, contractTilde, expandTilde, olnHome } from "./paths.js";

/** config.json 스키마 버전 — 깨는 변경(이름·형태 변경, 필수화)에만 올린다 (docs/versioning.md §3) */
export const CONFIG_VERSION = 1 as const;

type RawConfig = Record<string, unknown>;

/**
 * version n → n+1 마이그레이션 함수들 (키 = 출발 버전).
 * 스키마의 깨는 변경을 낼 때 여기에 변환을 추가한다 — additive 변경(default 있는 새 필드)에는 불필요.
 */
export const MIGRATIONS: Record<number, (raw: RawConfig) => RawConfig> = {};

/** 마이그레이션 체인 적용 (순수 — 테스트용 table 주입 가능). 체인이 끊겨 있으면 버그이므로 throw. */
export function applyMigrations(
  raw: RawConfig,
  from: number,
  to: number,
  table: Record<number, (r: RawConfig) => RawConfig> = MIGRATIONS,
): RawConfig {
  let cur = raw;
  for (let v = from; v < to; v++) {
    const step = table[v];
    if (!step) {
      throw new Error(
        t("설정 마이그레이션 경로가 없습니다 (v{from}→v{to}) — 버그입니다. GitHub 이슈로 알려주세요", {
          from: v,
          to: v + 1,
        }),
      );
    }
    cur = step(cur);
  }
  cur["version"] = to;
  return cur;
}

export const ProjectSchema = z.object({
  /** 파일·디렉토리 이름에 쓰이는 슬러그 (영소문자-하이픈) */
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "과제 id는 영소문자·숫자·하이픈만"),
  /** 과제 정식 명칭 (노트 상단·현황 표시에 사용) */
  title: z.string().min(1),
  /**
   * 이 과제에 속한 git 저장소 경로들 (커밋 수집 + 세션 cwd 매핑).
   * 원격은 scp 스타일 `호스트:~/경로` (예: "serverA:~/dev/genixsim") — 호스트는 config.remotes에 등록.
   */
  repos: z.array(z.string()).default([]),
  /** 저장소 외에 이 과제로 매핑할 추가 디렉토리 프리픽스 (원격 동일 형식 지원) */
  dirs: z.array(z.string()).default([]),
});

export const RemoteSchema = z.object({
  /** ssh 접속 대상 — ssh config 별칭 권장 (키 인증 필수, BatchMode로 접속) */
  host: z.string().min(1),
  /** 이 원격의 ~/.claude 세션을 수집할지 */
  claudeCode: z.boolean().default(true),
  /** 이 원격의 ~/.codex 세션을 수집할지 */
  codex: z.boolean().default(true),
});

export const ConfigSchema = z.object({
  version: z.literal(CONFIG_VERSION).default(CONFIG_VERSION),
  /** CLI 메시지 언어 */
  uiLanguage: z.enum(["ko", "en"]).default("ko"),
  /** 주 1회 npm에서 새 버전 번호 확인 (전송: 패키지 이름뿐) — OLN_NO_UPDATE_CHECK=1로도 끔 */
  updateCheck: z.boolean().default(true),
  author: z.object({
    name: z.string().min(1),
    /** git 커밋 author 매칭 패턴 (부분 문자열, 대소문자 무시, OR) */
    gitAuthors: z.array(z.string().min(1)).min(1),
  }),
  /** 정본 노트(md)가 저장되는 위치 — 사용자의 폴더 */
  notesDir: z.string().min(1),
  /** 노트 문체 */
  language: z.enum(["ko", "en", "mixed"]).default("mixed"),
  /** 터미널에서 노트 작성에 쓸 LLM 엔진 (하네스 안에서는 해당 세션이 작성) */
  engine: z.enum(["claude", "codex", "none"]).default("none"),
  /** 엔진에 넘길 모델 지정 (비우면 각 CLI의 기본 모델 — claude는 --model, codex는 -c model 로 전달) */
  engineModel: z.string().optional(),
  sources: z
    .object({
      claudeCode: z.boolean().default(true),
      codex: z.boolean().default(true),
      git: z.boolean().default(true),
    })
    .default({}),
  projects: z.array(ProjectSchema).min(1),
  /** 원격 개발 서버들 — 여기 등록된 호스트의 하네스 세션을 수집하고, 과제 경로의 `호스트:` 항목을 인식 */
  remotes: z.array(RemoteSchema).default([]),
  /** 업로드 대상 — 1단계에서는 local(폴더 저장)만 지원 */
  sink: z.object({ type: z.enum(["local"]).default("local") }).default({ type: "local" }),
});

export type Config = z.infer<typeof ConfigSchema>;
export type Project = z.infer<typeof ProjectSchema>;
export type Remote = z.infer<typeof RemoteSchema>;

/** scp 스타일 경로 항목 파싱: "host:~/path" → {host, path} / 로컬은 {path} */
export function parseRepoEntry(entry: string): { host?: string; path: string } {
  const m = /^([A-Za-z0-9._-]+(?:@[A-Za-z0-9._-]+)?):((?:~|\/).*)$/.exec(entry);
  if (m) return { host: m[1] as string, path: m[2] as string };
  return { path: entry };
}

export function isRemoteEntry(entry: string): boolean {
  return parseRepoEntry(entry).host !== undefined;
}

export function configExists(): boolean {
  return fs.existsSync(configPath());
}

export function loadConfig(): Config {
  const p = configPath();
  if (!fs.existsSync(p)) {
    throw new Error(t("설정이 없습니다 ({path}).  다음:  oln init  으로 초기 설정을 하세요.", { path: p }));
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    // 손상 백업 — 이후 init --force가 덮어써도 원본이 남는다
    const bak = `${p}.corrupted.bak`;
    try {
      fs.copyFileSync(p, bak);
    } catch {
      /* 백업 실패해도 안내는 한다 */
    }
    throw new Error(
      t("설정 파일이 손상됐습니다 (백업: {bak}).  다음:  oln init  으로 다시 생성하세요.", {
        bak: contractTilde(bak),
      }),
    );
  }

  // 스키마 버전 처리 (검증 전): 미래 버전 감지 + 구버전 마이그레이션 (docs/versioning.md §3)
  if (parsed && typeof parsed === "object") {
    const raw = parsed as RawConfig;
    const fileVersion = typeof raw["version"] === "number" ? raw["version"] : 1;
    if (fileVersion > CONFIG_VERSION) {
      throw new Error(
        t(
          "이 설정은 더 새로운 oln이 만들었습니다 (설정 v{v}, 이 oln은 v{cur}까지).  다음:  npm i -g openlabnote@latest  — 또는 백업(config.json.v*.bak)을 복원하세요.",
          { v: fileVersion, cur: CONFIG_VERSION },
        ),
      );
    }
    if (fileVersion < CONFIG_VERSION) {
      const bak = `${p}.v${fileVersion}.bak`;
      fs.copyFileSync(p, bak);
      parsed = applyMigrations(raw, fileVersion, CONFIG_VERSION);
      fs.writeFileSync(p, JSON.stringify(parsed, null, 2) + "\n", "utf8");
      console.error(
        t("설정을 v{from}→v{to}로 마이그레이션했습니다 (백업: {bak})", {
          from: fileVersion,
          to: CONFIG_VERSION,
          bak: contractTilde(bak),
        }),
      );
    }
  }

  const result = ConfigSchema.safeParse(parsed);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new Error(
      t("설정이 올바르지 않습니다 ({detail}).  다음:  oln init  — 처음부터 다시 설정 (또는 파일 직접 수정: {path})", {
        detail: `${issue?.path.join(".")}: ${issue?.message}`,
        path: contractTilde(p),
      }),
    );
  }
  setLocale(result.data.uiLanguage);
  return result.data;
}

export function saveConfig(cfg: Config): void {
  const p = configPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  // 루트 수준의 모르는 키 보존 — 더 새로운 oln이 쓴 필드를 구버전의 setup 저장이 지우지 않게.
  // 스키마가 아는 키는 cfg가 정본(옵션 필드 삭제도 반영), 모르는 키만 이어받는다.
  const unknown: RawConfig = {};
  try {
    const prev = JSON.parse(fs.readFileSync(p, "utf8")) as unknown;
    if (prev && typeof prev === "object") {
      for (const [k, v] of Object.entries(prev)) {
        if (!(k in ConfigSchema.shape)) unknown[k] = v;
      }
    }
  } catch {
    /* 없거나 손상 — cfg만 저장 */
  }
  fs.writeFileSync(p, JSON.stringify({ ...cfg, ...unknown }, null, 2) + "\n", "utf8");
}

/** 노트 저장 경로: <notesDir>/<projectId>/<date>.md */
export function notePath(cfg: Config, projectId: string, date: string): string {
  return path.join(expandTilde(cfg.notesDir), projectId, `${date}.md`);
}

export function ensureOlnHome(): void {
  fs.mkdirSync(olnHome(), { recursive: true });
}

/**
 * cwd가 어느 과제에 속하는지 판정 (가장 긴 프리픽스 우선).
 * host가 주어지면 원격 이벤트 — 같은 호스트의 `호스트:` 항목만 대상으로 하고,
 * 항목의 ~는 remoteHomes(호스트→$HOME)로 확장해 비교한다.
 */
export function projectForPath(
  cfg: Config,
  cwd: string,
  host?: string,
  remoteHomes?: Map<string, string>,
): Project | null {
  let best: { project: Project; len: number } | null = null;

  if (host === undefined) {
    const target = path.resolve(expandTilde(cwd));
    for (const project of cfg.projects) {
      for (const entry of [...project.repos, ...project.dirs]) {
        if (isRemoteEntry(entry)) continue;
        const abs = path.resolve(expandTilde(entry));
        if (target === abs || target.startsWith(abs + path.sep)) {
          if (!best || abs.length > best.len) best = { project, len: abs.length };
        }
      }
    }
    return best?.project ?? null;
  }

  // 원격: posix 문자열 프리픽스 비교
  const target = cwd.replace(/\/+$/, "");
  for (const project of cfg.projects) {
    for (const entry of [...project.repos, ...project.dirs]) {
      const parsed = parseRepoEntry(entry);
      if (parsed.host !== host) continue;
      let base = parsed.path;
      if (base === "~" || base.startsWith("~/")) {
        const home = remoteHomes?.get(host);
        if (!home) continue; // 원격 홈을 모르면 비교 불가
        base = base === "~" ? home : home + base.slice(1);
      }
      base = base.replace(/\/+$/, "");
      if (target === base || target.startsWith(base + "/")) {
        if (!best || base.length > best.len) best = { project, len: base.length };
      }
    }
  }
  return best?.project ?? null;
}
