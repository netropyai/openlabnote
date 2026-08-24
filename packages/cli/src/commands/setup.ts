import * as clack from "@clack/prompts";
import fs from "node:fs";
import path from "node:path";
import pc from "picocolors";
import { isRemoteEntry, loadConfig, parseRepoEntry, saveConfig, type Config } from "../lib/config.js";
import { PATH_INPUT_CANCEL, pathInput } from "../lib/path-input.js";
import { contractTilde, expandTilde } from "../lib/paths.js";
import { detectClaudeCli, detectCodexCli } from "../compose/engine.js";
import { setLocale, t, type Locale } from "../lib/i18n.js";
import { sshTestAsync } from "../lib/remote.js";
import { listSshHosts, searchDirsByName } from "../lib/scan.js";
import { die, isInteractive } from "../lib/ui.js";

type Section =
  | "projects"
  | "remotes"
  | "notes-dir"
  | "language"
  | "engine"
  | "author"
  | "sources"
  | "ui-language"
  | "update-check";

export async function setupCommand(section?: string): Promise<void> {
  if (!isInteractive()) die(t("설정 변경은 대화형 터미널에서 실행해야 합니다"), "oln setup");
  clack.intro(pc.bold(t("openlabnote 설정")));

  const fixed: Section | undefined = isSection(section) ? section : undefined;
  for (;;) {
    const cfg = loadConfig(); // 매 회 재로드 — 취소된 편집의 부분 변경이 남지 않게
    let target = fixed;
    if (!target) {
      const pick = await clack.select({
        message: t("무엇을 바꿀까요? (ESC = 변경 없이 나가기)"),
        options: [
          { value: "projects", label: t("과제 관리"), hint: t("현재 {n}개", { n: cfg.projects.length }) },
          { value: "remotes", label: t("원격 서버 관리"), hint: cfg.remotes.length ? cfg.remotes.map((r) => r.host).join(", ") : t("없음") },
          { value: "notes-dir", label: t("노트 저장 위치"), hint: contractTilde(expandTilde(cfg.notesDir)) },
          { value: "language", label: t("노트 문체"), hint: cfg.language },
          { value: "engine", label: t("작성 엔진·모델"), hint: cfg.engine + (cfg.engineModel ? ` (${cfg.engineModel})` : "") },
          { value: "author", label: t("작성자·git author 패턴"), hint: cfg.author.gitAuthors.join(", ") },
          { value: "sources", label: t("수집 소스"), hint: [cfg.sources.claudeCode && "Claude Code", cfg.sources.codex && "Codex", cfg.sources.git && "git"].filter(Boolean).join(", ") || t("없음") },
          { value: "ui-language", label: t("UI 언어"), hint: cfg.uiLanguage },
          { value: "update-check", label: t("새 버전 확인"), hint: cfg.updateCheck ? t("주 1회") : t("끔") },
          { value: "__done__", label: t("나가기"), hint: t("변경 없이 종료") },
        ],
      });
      if (clack.isCancel(pick) || pick === "__done__") {
        clack.outro(t("설정을 닫았습니다"));
        return;
      }
      target = pick as Section;
    }

    try {
      switch (target) {
        case "projects":
          await editProjects(cfg);
          break;
        case "remotes":
          await editRemotes(cfg);
          break;
        case "notes-dir":
          await editNotesDir(cfg);
          break;
        case "language":
          await editLanguage(cfg);
          break;
        case "engine":
          await editEngine(cfg);
          break;
        case "author":
          await editAuthor(cfg);
          break;
        case "sources":
          await editSources(cfg);
          break;
        case "ui-language":
          await editUiLanguage(cfg);
          break;
        case "update-check":
          await editUpdateCheck(cfg);
          break;
      }
      saveConfig(cfg);
      clack.log.success(t("저장됨"));
    } catch (e) {
      if (e instanceof SetupCancel) {
        clack.log.info(t("변경 취소 — 저장하지 않았습니다"));
      } else {
        throw e;
      }
    }
    if (fixed) {
      clack.outro(t("완료"));
      return; // oln setup <section> 직접 호출은 1회로 종료
    }
  }
}

function isSection(s?: string): s is Section {
  return (
    !!s &&
    ["projects", "remotes", "notes-dir", "language", "engine", "author", "sources", "ui-language", "update-check"].includes(s)
  );
}

async function editSources(cfg: Config): Promise<void> {
  const initial: string[] = [];
  if (cfg.sources.claudeCode) initial.push("claudeCode");
  if (cfg.sources.codex) initial.push("codex");
  if (cfg.sources.git) initial.push("git");
  const remoteHint = cfg.remotes.length > 0 ? t(" · 원격 서버 포함") : "";
  const picks = await clack.multiselect({
    message: t("어떤 기록을 수집할까요? (space로 켜고 끄기)"),
    options: [
      { value: "claudeCode", label: t("Claude Code 세션"), hint: "~/.claude" + remoteHint },
      { value: "codex", label: t("Codex 세션"), hint: "~/.codex" + remoteHint },
      { value: "git", label: t("git 커밋"), hint: t("과제에 등록한 저장소") + remoteHint },
    ],
    initialValues: initial,
    required: false,
  });
  bail(picks);
  const set = new Set(picks as string[]);
  cfg.sources = { claudeCode: set.has("claudeCode"), codex: set.has("codex"), git: set.has("git") };
}

async function editUpdateCheck(cfg: Config): Promise<void> {
  const on = await clack.select({
    message: t("새 버전 확인 — 주 1회 npm에 최신 버전 번호만 조회합니다 (전송되는 것은 패키지 이름뿐)"),
    options: [
      { value: true, label: t("켬 — 새 버전이 나오면 홈 화면에 한 줄 알림") },
      { value: false, label: t("끔 — 직접  npm i -g openlabnote@latest  로 업데이트") },
    ],
    initialValue: cfg.updateCheck,
  });
  bail(on);
  cfg.updateCheck = on as boolean;
}

async function editUiLanguage(cfg: Config): Promise<void> {
  const lang = await clack.select({
    message: "언어를 선택하세요 · Choose your language",
    options: [
      { value: "ko", label: "한국어" },
      { value: "en", label: "English" },
    ],
    initialValue: cfg.uiLanguage,
  });
  bail(lang);
  cfg.uiLanguage = lang as Locale;
  setLocale(cfg.uiLanguage);
}

async function editRemotes(cfg: Config): Promise<void> {
  const action = await clack.select({
    message: t("원격 서버 관리 (SSH 키 인증 필수 — 원격 리포·하네스 세션을 수집합니다)"),
    options: [
      { value: "add", label: t("원격 서버 추가") },
      { value: "test", label: t("연결 테스트") },
      { value: "remove", label: t("원격 서버 제거") },
    ],
  });
  bail(action);

  if (action === "add") {
    const known = listSshHosts().filter((x) => !cfg.remotes.some((r) => r.host === x));
    let hosts: string[] = [];
    let wantCustom = known.length === 0;
    if (known.length > 0) {
      const picks = await clack.multiselect({
        message: t("SSH 호스트 선택 (~/.ssh/config에서 발견 — space로 복수 선택, 키 인증 필요)"),
        options: [...known.map((x) => ({ value: x, label: x })), { value: "__custom__", label: t("＋ 직접 입력…"), hint: "user@host" }],
        required: false,
      });
      bail(picks);
      hosts = (picks as string[]).filter((v) => v !== "__custom__");
      wantCustom = (picks as string[]).includes("__custom__");
    }
    while (wantCustom) {
      const typed = await clack.text({ message: t("추가할 SSH 호스트 (빈 입력 = 완료)"), placeholder: t("예: serverA"), defaultValue: "" });
      bail(typed);
      const v = (typed as string).trim();
      if (!v) break;
      if (!hosts.includes(v) && !cfg.remotes.some((r) => r.host === v)) hosts.push(v);
    }
    for (const h of hosts) {
      const spin = clack.spinner();
      spin.start(t("{host} 연결 테스트 중", { host: h }));
      const test = await sshTestAsync(h);
      spin.stop(`${h} — ${test.detail}`);
      if (!test.ok) clack.log.warn(t("키 인증을 등록하세요:  ssh-copy-id {host}  (등록만 해두고 나중에 연결해도 됩니다)", { host: h }));
      cfg.remotes.push({ host: h, claudeCode: true, codex: true });
      clack.log.success(t("{host} 등록됨.  과제에 원격 리포를 연결하려면: 과제 관리 → 경로 추가에서  {host}:~/dev/리포경로  형식으로 입력", { host: h }));
    }
    return;
  }

  if (cfg.remotes.length === 0) {
    clack.log.warn(t("등록된 원격 서버가 없습니다"));
    return;
  }

  if (action === "test") {
    for (const r of cfg.remotes) {
      const spin = clack.spinner();
      spin.start(t("{host} 연결 테스트 중", { host: r.host }));
      const test = await sshTestAsync(r.host);
      spin.stop(`${r.host} — ${test.detail}`);
    }
    return;
  }

  if (action === "remove") {
    const pick = await clack.select({
      message: t("제거할 원격 서버"),
      options: cfg.remotes.map((r) => ({ value: r.host, label: r.host })),
    });
    bail(pick);
    cfg.remotes = cfg.remotes.filter((r) => r.host !== pick);
    const orphan = cfg.projects.flatMap((p) =>
      [...p.repos, ...p.dirs].filter((e) => parseRepoEntry(e).host === pick),
    );
    if (orphan.length > 0) {
      clack.log.warn(t("과제에 이 호스트의 경로 {n}개가 남아 있습니다 (수집에서 무시됨) — 과제 관리 → 경로 제거로 정리하세요", { n: orphan.length }));
    }
    clack.log.success(t("{host} 제거됨", { host: pick as string }));
  }
}

async function editProjects(cfg: Config): Promise<void> {
  const action = await clack.select({
    message: t("과제 관리"),
    options: [
      { value: "add-path", label: t("기존 과제에 경로 추가") },
      { value: "remove-path", label: t("과제에서 경로 제거") },
      { value: "add", label: t("과제 추가") },
      { value: "remove", label: t("과제 제거") },
    ],
  });
  bail(action);

  if (action === "add-path") {
    const pid = await pickProject(cfg);
    const project = cfg.projects.find((p) => p.id === pid);
    if (!project) return;
    const p = await pathInput(t("{p}에 추가할 저장소·디렉토리 경로 (폴더 이름만 치면 검색 · 원격은 호스트:~/경로)", { p: pid }));
    if (p === PATH_INPUT_CANCEL) return;

    if (isRemoteEntry(p)) {
      const host = parseRepoEntry(p).host as string;
      if (!cfg.remotes.some((r) => r.host === host)) {
        clack.log.warn(t("{host}는 아직 등록되지 않은 원격 서버입니다 — 원격 서버 관리에서 먼저 추가하세요", { host }));
        return;
      }
      const kind = await clack.select({
        message: t("이 원격 경로의 성격은?"),
        options: [
          { value: "repo", label: t("git 저장소 (커밋도 수집)") },
          { value: "dir", label: t("일반 디렉토리 (세션 매핑만)") },
        ],
      });
      bail(kind);
      if (kind === "repo") project.repos.push(p);
      else project.dirs.push(p);
      clack.log.success(`${pid} ← ${p}`);
      return;
    }

    const addLocal = (absPath: string): void => {
      const entry = contractTilde(absPath);
      if (fs.existsSync(path.join(absPath, ".git"))) project.repos.push(entry);
      else project.dirs.push(entry);
      clack.log.success(`${pid} ← ${entry}`);
    };

    const abs = expandTilde(p);
    if (!fs.existsSync(abs)) {
      // 경로가 아니라 단어면 폴더 이름 검색으로
      if (!p.includes("/") && !p.startsWith("~")) {
        const hits = searchDirsByName(p);
        if (hits.length === 0) {
          clack.log.warn(t("'{q}' 이름이 들어간 폴더를 찾지 못했습니다 (홈 아래 깊이 4)", { q: p }));
          return;
        }
        const pick = await clack.select({
          message: t("'{q}' 폴더 검색 결과 — 추가할 폴더 선택", { q: p }),
          options: [
            ...hits.map((h) => ({
              value: h,
              label: contractTilde(h),
              ...(fs.existsSync(path.join(h, ".git")) ? { hint: "git" } : {}),
            })),
            { value: "__none__", label: t("추가 안 함") },
          ],
        });
        if (!clack.isCancel(pick) && pick !== "__none__") addLocal(pick as string);
        return;
      }
      clack.log.warn(t("경로가 없습니다: {path} — 저장하지 않았습니다", { path: p }));
      return;
    }
    addLocal(abs);
    return;
  }

  if (action === "remove-path") {
    const pid = await pickProject(cfg);
    const project = cfg.projects.find((p) => p.id === pid);
    if (!project) return;
    const entries = [
      ...project.repos.map((r) => ({ kind: "repo" as const, value: r })),
      ...project.dirs.map((d) => ({ kind: "dir" as const, value: d })),
    ];
    if (entries.length === 0) {
      clack.log.warn(t("{p}에 등록된 경로가 없습니다", { p: pid }));
      return;
    }
    const picks = await clack.multiselect({
      message: t("{p}에서 제거할 경로 선택 (space로 선택, enter로 확정)", { p: pid }),
      options: entries.map((e) => ({ value: `${e.kind}:${e.value}`, label: e.value, hint: e.kind })),
      required: false,
    });
    bail(picks);
    const toRemove = new Set(picks as string[]);
    if (toRemove.size === 0) {
      clack.log.info(t("제거한 경로 없음"));
      return;
    }
    project.repos = project.repos.filter((r) => !toRemove.has(`repo:${r}`));
    project.dirs = project.dirs.filter((d) => !toRemove.has(`dir:${d}`));
    clack.log.success(t("{n}개 경로 제거됨 (노트·raw 파일은 지우지 않습니다)", { n: toRemove.size }));
    return;
  }

  if (action === "add") {
    const title = await clack.text({ message: t("과제 이름"), validate: (v) => (v?.trim() ? undefined : t("입력하세요")) });
    bail(title);
    const id = await clack.text({
      message: t("과제 폴더명 (영문)"),
      validate: (v) =>
        !/^[a-z0-9][a-z0-9-]*$/.test((v ?? "").trim())
          ? t("영소문자·숫자·하이픈만")
          : cfg.projects.some((p) => p.id === (v ?? "").trim())
            ? t("이미 있는 슬러그")
            : undefined,
    });
    bail(id);
    cfg.projects.push({ id: (id as string).trim(), title: (title as string).trim(), repos: [], dirs: [] });
    clack.log.success(t("과제 추가됨 — 경로는 \"기존 과제에 경로 추가\"로 등록하세요"));
    return;
  }

  if (action === "remove") {
    if (cfg.projects.length <= 1) {
      clack.log.warn(t("과제가 1개뿐이라 제거할 수 없습니다 (최소 1개 필요)"));
      return;
    }
    const pid = await pickProject(cfg);
    const ok = await clack.confirm({ message: t("{p}를 제거할까요? (노트 파일은 지우지 않습니다)", { p: pid }) });
    bail(ok);
    if (ok) {
      cfg.projects = cfg.projects.filter((p) => p.id !== pid);
      clack.log.success(t("{p} 제거됨", { p: pid }));
    }
  }
}

async function pickProject(cfg: Config): Promise<string> {
  const pick = await clack.select({
    message: t("과제 선택"),
    options: cfg.projects.map((p) => ({ value: p.id, label: `${p.id}  ${pc.dim(p.title)}` })),
  });
  bail(pick);
  return pick as string;
}

async function editNotesDir(cfg: Config): Promise<void> {
  const dir = await clack.text({
    message: t("노트 저장 위치 (기존 노트는 자동 이동하지 않습니다)"),
    initialValue: cfg.notesDir,
    validate: (v) => (v?.trim() ? undefined : t("경로를 입력하세요")),
  });
  bail(dir);
  cfg.notesDir = contractTilde(path.resolve(expandTilde((dir as string).trim())));
}

async function editLanguage(cfg: Config): Promise<void> {
  const lang = await clack.select({
    message: t("노트 문체"),
    options: [
      { value: "mixed", label: t("혼합 (기술 영문 + 한국어 마커)") },
      { value: "ko", label: t("한국어") },
      { value: "en", label: "English" },
    ],
    initialValue: cfg.language,
  });
  bail(lang);
  cfg.language = lang as Config["language"];
}

async function editEngine(cfg: Config): Promise<void> {
  const hasClaude = detectClaudeCli();
  const hasCodex = detectCodexCli();
  const engine = await clack.select({
    message: t("터미널 작성 엔진 (oln today가 내 구독으로 노트를 작성할 때 사용)"),
    options: [
      { value: "claude", label: t("claude -p (Claude 구독)"), hint: hasClaude ? t("감지됨") : t("미설치") },
      { value: "codex", label: t("codex exec (Codex 구독)"), hint: hasCodex ? t("감지됨") : t("미설치") },
      { value: "none", label: t("사용 안 함"), hint: t("하네스 안(/labnote)에서만 작성") },
    ],
    initialValue: cfg.engine,
  });
  bail(engine);
  if ((engine === "claude" && !hasClaude) || (engine === "codex" && !hasCodex)) {
    clack.log.warn(t("{engine} CLI가 아직 감지되지 않습니다 — 설치해야 동작합니다", { engine: engine as string }));
  }
  cfg.engine = engine as Config["engine"];

  if (cfg.engine !== "none") {
    const model = await clack.text({
      message: t("모델 지정 (비우면 해당 CLI의 기본 모델 사용)"),
      placeholder: cfg.engine === "claude" ? t("예: sonnet, haiku, opus") : t("예: gpt-5"),
      initialValue: cfg.engineModel ?? "",
      defaultValue: "",
    });
    bail(model);
    const m = (model as string).trim();
    if (m) cfg.engineModel = m;
    else delete cfg.engineModel;
  }
}

async function editAuthor(cfg: Config): Promise<void> {
  const name = await clack.text({
    message: t("이름"),
    initialValue: cfg.author.name,
    validate: (v) => (v?.trim() ? undefined : t("입력하세요")),
  });
  bail(name);
  const patterns = await clack.text({
    message: t("git author 매칭 패턴 (쉼표 구분)"),
    initialValue: cfg.author.gitAuthors.join(", "),
    validate: (v) => (v?.trim() ? undefined : t("하나 이상 입력")),
  });
  bail(patterns);
  cfg.author.name = (name as string).trim();
  cfg.author.gitAuthors = (patterns as string)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 섹션 편집 중 ESC — 저장하지 않고 메뉴로 돌아가기 위한 신호 */
class SetupCancel extends Error {}

function bail(value: unknown): void {
  if (clack.isCancel(value)) throw new SetupCancel();
}
