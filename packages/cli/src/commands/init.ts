import * as clack from "@clack/prompts";
import fs from "node:fs";
import path from "node:path";
import pc from "picocolors";
import { ConfigSchema, configExists, isRemoteEntry, saveConfig, type Config } from "../lib/config.js";
import { getLocale, setLocale, t, type Locale } from "../lib/i18n.js";
import { PATH_INPUT_CANCEL, pathInput } from "../lib/path-input.js";
import { contractTilde, expandTilde } from "../lib/paths.js";
import { expandRemoteTilde, sshRunAsync, sshTestAsync } from "../lib/remote.js";
import { installSshKey } from "../lib/ssh-repair.js";
import { discoverRemoteRepos, listSshHosts, scanEnvironment, searchDirsByName, type RemoteRepoCandidate, type ScanResult } from "../lib/scan.js";
import { die, isInteractive } from "../lib/ui.js";

/** ESC(취소 키)는 "이전 단계로" — 첫 단계에서만 종료 확인 */
const BACK = Symbol("back");
type Step<T> = T | typeof BACK;

interface Draft {
  uiLanguage: Locale;
  scan?: ScanResult;
  author?: Config["author"];
  remotes: Config["remotes"];
  remoteRepos: RemoteRepoCandidate[];
  /** 원격 서버의 하네스 존재 여부 (연결된 호스트만) */
  remoteHarness: { host: string; claude: boolean; codex: boolean }[];
  projects: Config["projects"];
  notesDir?: string;
  language?: Config["language"];
  engine?: Config["engine"];
  sources?: Config["sources"];
}

export async function initCommand(opts: { force?: boolean } = {}): Promise<void> {
  if (!isInteractive()) {
    die(t("초기 설정은 대화형 터미널에서 실행해야 합니다"), t("터미널에서  oln init  실행 (또는 Claude Code에서 /labnote setup)"));
  }

  console.clear(); // 이전 터미널 히스토리와 섞이지 않게 깨끗한 화면에서 시작

  // 기존 설정 덮어쓰기 확인은 마법사 진입 전에 한 번만
  if (configExists() && !opts.force) {
    const go = await clack.confirm({
      message: t("설정이 이미 있습니다. 처음부터 다시 설정할까요? (기존 설정은 덮어씁니다)"),
    });
    if (clack.isCancel(go) || !go) {
      clack.outro(t("취소됨 — 부분 수정은  oln setup"));
      return;
    }
  }

  const draft: Draft = { uiLanguage: getLocale(), remotes: [], remoteRepos: [], remoteHarness: [], projects: [] };

  // 각 단계는 자기 질문만 보이는 화면에서 진행된다 (헤더에 전체 진행 표시)
  const steps: { label: string; run: (d: Draft) => Promise<Step<void>> }[] = [
    { label: "언어", run: stepLanguageUi },
    { label: "원격", run: stepRemotes },
    { label: "소스", run: stepSources },
    { label: "작성자", run: stepAuthor },
    { label: "과제", run: stepProjects },
    { label: "저장 위치", run: stepNotesDir },
    { label: "엔진", run: stepEngine },
  ];

  let i = 0;
  while (i < steps.length) {
    console.clear();
    printWizardHeader(steps.map((st) => st.label), i);
    const r = await steps[i]!.run(draft);
    if (r === BACK) {
      if (i === 0) {
        const quit = await clack.confirm({ message: t("설정을 취소할까요? (지금까지 입력은 저장되지 않습니다)"), initialValue: false });
        if (quit === true) {
          clack.cancel(t("초기 설정을 취소했습니다 — 언제든  oln init  으로 다시 시작"));
          return;
        }
      } else {
        i -= 1;
      }
    } else {
      i += 1;
    }
  }
  console.clear();

  const cfg: Config = ConfigSchema.parse({
    version: 1,
    uiLanguage: draft.uiLanguage,
    author: draft.author,
    notesDir: draft.notesDir,
    language: draft.language ?? (draft.uiLanguage === "en" ? "en" : "mixed"),
    engine: draft.engine,
    sources: draft.sources ?? {
      claudeCode: draft.scan?.harnesses.find((h) => h.name === "Claude Code")?.found ?? true,
      codex: draft.scan?.harnesses.find((h) => h.name === "Codex")?.found ?? true,
      git: true,
    },
    projects: draft.projects,
    remotes: draft.remotes.map((r) => ({
      host: r.host,
      claudeCode: draft.sources?.claudeCode ?? r.claudeCode,
      codex: draft.sources?.codex ?? r.codex,
    })),
    sink: { type: "local" },
  });
  saveConfig(cfg);

  clack.log.success(`${t("설정 저장 완료")}  ${pc.dim("~/.openlabnote/config.json")}`);
  clack.note(
    [
      pc.cyan(t("oln today        오늘 일을 정리해보세요")),
      pc.cyan(t("oln catchup      밀린 날짜 채우기")),
      "",
      t("Claude Code를 쓰신다면 플러그인도 설치할 수 있습니다:"),
      pc.cyan("/plugin marketplace add netropyai/openlabnote"),
      pc.cyan("/plugin install labnote@openlabnote"),
      "",
      pc.dim(t("주 1회 npm에서 새 버전을 확인합니다 (전송: 패키지 이름뿐) — 끄기: oln setup update-check")),
    ].join("\n"),
    t("다음 단계"),
  );
  const go = await clack.select({
    message: t("준비 완료"),
    options: [{ value: "home", label: t("홈으로 가기 (Enter)") }],
  });
  void go; // ESC여도 홈으로
  const { homeCommand } = await import("./home.js");
  await homeCommand();
}

/** 마법사 진행 헤더 — 현재 단계만 강조해 "지금 무엇을 답하는지"에 초점을 준다 */
function printWizardHeader(labels: string[], current: number): void {
  const parts = labels.map((l, idx) => {
    if (idx < current) return pc.dim(`${t(l)} ✓`);
    if (idx === current) return pc.cyan(pc.bold(`● ${t(l)}`));
    return pc.dim(t(l));
  });
  console.log(`${pc.bold("openlabnote")} ${pc.dim(t("설정"))}  ${parts.join(pc.dim("  ·  "))}`);
  console.log(pc.dim(t("ESC = 이전 단계")));
  console.log("");
}

/* ── 단계들 ─────────────────────────────────────────────── */

async function stepLanguageUi(d: Draft): Promise<Step<void>> {
  const v = await clack.select({
    message: "언어를 선택하세요 · Choose your language",
    options: [
      { value: "ko", label: "한국어" },
      { value: "en", label: "English" },
    ],
    initialValue: d.uiLanguage,
  });
  if (clack.isCancel(v)) return BACK;
  d.uiLanguage = v as Locale;
  setLocale(d.uiLanguage);

  // 환경 스캔은 조용히 — 결과는 다음 단계들의 기본값·힌트로만 쓰인다
  if (!d.scan) {
    const spin = clack.spinner();
    spin.start(t("환경 스캔 중 (하네스·git·리포)"));
    d.scan = scanEnvironment();
    spin.stop(t("스캔 완료"));
  }
  return undefined;
}

async function stepAuthor(d: Draft): Promise<Step<void>> {
  clack.log.info(
    t("연구노트 작성자명은 과제 협약에 등록된 이름과 일치해야 합니다.\n   국내 과제는 보통 한국 이름을 쓰고, 외국인 연구자는 외국인등록증의 한국명을 권장합니다."),
  );
  const name = await clack.text({
    message: t("이름 (연구노트 작성자 표기 — 과제에 등록된 이름)"),
    placeholder: t("예: 홍길동"),
    initialValue: d.author?.name ?? "",
    validate: (v) => (v?.trim() ? undefined : t("이름을 입력하세요")),
  });
  if (clack.isCancel(name)) return BACK;

  // git 커밋을 수집하지 않으면 author 패턴 질문은 생략 (이름을 기본 패턴으로)
  if (d.sources && !d.sources.git) {
    d.author = { name: (name as string).trim(), gitAuthors: [(name as string).trim()] };
    return undefined;
  }

  const defaults =
    d.author?.gitAuthors.join(", ") ??
    [d.scan?.gitName, d.scan?.gitEmail?.split("@")[0]].filter(Boolean).join(", ");
  const patterns = await clack.text({
    message: t("git 커밋 author 매칭 패턴 (쉼표 구분 — 커밋의 author 이름에 이 문자열이 포함되면 내 커밋, 대소문자 무시)"),
    initialValue: defaults,
    validate: (v) => (v?.trim() ? undefined : t("패턴을 하나 이상 입력하세요")),
  });
  if (clack.isCancel(patterns)) return BACK;

  d.author = {
    name: (name as string).trim(),
    gitAuthors: (patterns as string)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  };
  return undefined;
}

/** 원격 서버 등록 — 과제(저장소 선택)보다 먼저 물어, 원격 리포도 선택 목록에 나오게 한다 */
async function stepRemotes(d: Draft): Promise<Step<void>> {
  const use = await clack.confirm({
    message: t("원격 개발 서버에서도 작업하시나요? (SSH로 원격 리포 커밋·하네스 세션까지 수집합니다)"),
    initialValue: d.remotes.length > 0,
  });
  if (clack.isCancel(use)) return BACK;
  const prevSelected = d.remotes.map((r) => r.host); // 뒤로 갔다 와도 이전 선택 유지
  d.remotes = [];
  d.remoteRepos = [];
  d.remoteHarness = [];
  if (!use) return undefined;

  const known = listSshHosts();
  let hosts: string[] = [];
  let wantCustom = known.length === 0;
  if (known.length > 0) {
    const prevHosts = prevSelected.filter((x) => known.includes(x));
    const picks = await clack.multiselect({
      message: t("SSH 호스트 선택 (~/.ssh/config에서 발견 — space로 복수 선택, 키 인증 필요)"),
      options: [
        ...known.map((x) => ({ value: x, label: x })),
        { value: "__custom__", label: t("＋ 직접 입력…"), hint: "user@host" },
      ],
      initialValues: prevHosts,
      required: false,
    });
    if (clack.isCancel(picks)) return BACK;
    hosts = (picks as string[]).filter((v) => v !== "__custom__");
    wantCustom = (picks as string[]).includes("__custom__");
  }
  while (wantCustom) {
    const typed = await clack.text({
      message: t("추가할 SSH 호스트 (빈 입력 = 완료)"),
      placeholder: t("예: serverA"),
      defaultValue: "",
    });
    if (clack.isCancel(typed)) break;
    const v = (typed as string).trim();
    if (!v) break;
    if (!hosts.includes(v)) hosts.push(v);
  }

  for (const h of hosts) {
    const spin = clack.spinner();
    spin.start(t("{host} 연결 테스트 중", { host: h }));
    let test = await sshTestAsync(h);
    spin.stop(`${h} — ${test.detail}`);

    if (!test.ok) {
      // 자동 수집은 키 인증이 필요하다. 비밀번호는 "키를 심는 1회"로만 쓴다.
      const how = await clack.select({
        message: t("{host}: 키 인증이 안 되어 있습니다. 어떻게 할까요?", { host: h }),
        options: [
          { value: "copyid", label: t("지금 비밀번호 한 번 입력해서 키 등록 (권장)"), hint: "ssh-copy-id" },
          { value: "keep", label: t("일단 등록만 해두기 — 나중에 키 연결") },
          { value: "skip", label: t("이 호스트 건너뛰기") },
        ],
      });
      if (clack.isCancel(how) || how === "skip") continue;
      if (how === "keep") {
        d.remotes.push({ host: h, claudeCode: true, codex: true });
        continue;
      }
      if (!(await installSshKey(h))) continue;
      test = await sshTestAsync(h);
      if (!test.ok) {
        clack.log.warn(t("{host}: 키 등록 후에도 연결이 안 됩니다 — 건너뜁니다 ({err})", { host: h, err: test.detail }));
        continue;
      }
      clack.log.success(t("{host}: 키 인증 연결 확인", { host: h }));
    }
    await registerConnectedHost(d, h);
  }
  return undefined;
}

/** 연결된 호스트 등록 + 원격 스캔 (하네스 존재·리포 발굴) — 진행 단계·경과를 계속 보여준다 */
async function registerConnectedHost(d: Draft, h: string): Promise<void> {
  d.remotes.push({ host: h, claudeCode: true, codex: true });
  const spin = clack.spinner();
  const started = Date.now();
  let phase = t("하네스 확인 중 (~/.claude · ~/.codex)");
  spin.start(t("{host}: {phase}", { host: h, phase }));
  const tick = setInterval(() => {
    const sec = Math.round((Date.now() - started) / 1000);
    spin.message(t("{host}: {phase} — {sec}s", { host: h, phase, sec }));
  }, 1000);
  try {
    const probe = await sshRunAsync(h, "test -d ~/.claude/projects && echo CLAUDE; test -d ~/.codex/sessions && echo CODEX; true", 15_000);
    const claude = probe.stdout.includes("CLAUDE");
    const codex = probe.stdout.includes("CODEX");
    d.remoteHarness.push({ host: h, claude, codex });

    phase = t("git 리포 찾는 중 (홈 깊이 4 — 서버가 크면 수십 초)");
    spin.message(t("{host}: {phase}", { host: h, phase }));
    const found = await discoverRemoteRepos(h);
    d.remoteRepos.push(...found);
    clearInterval(tick);
    spin.stop(
      t("{host}: 리포 {n}개 · Claude Code {c} · Codex {x}", {
        host: h,
        n: found.length,
        c: claude ? "✓" : "–",
        x: codex ? "✓" : "–",
      }),
    );
  } catch (e) {
    clearInterval(tick);
    spin.stop(t("{host}: 원격 스캔 실패", { host: h }));
    throw e;
  }
}


/** 어떤 기록 소스를 수집할지 — 로컬+원격 감지 결과를 근거로 제안한다. 최소 1개 필수. */
async function stepSources(d: Draft): Promise<Step<void>> {
  const claudeLocal = d.scan?.harnesses.find((h) => h.name === "Claude Code")?.found ?? false;
  const codexLocal = d.scan?.harnesses.find((h) => h.name === "Codex")?.found ?? false;
  const claudePlaces = [
    ...(claudeLocal ? [t("로컬")] : []),
    ...d.remoteHarness.filter((r) => r.claude).map((r) => r.host),
  ];
  const codexPlaces = [
    ...(codexLocal ? [t("로컬")] : []),
    ...d.remoteHarness.filter((r) => r.codex).map((r) => r.host),
  ];
  const gitHint =
    t("과제에 등록할 저장소에서 수집") +
    (d.remoteRepos.length > 0 ? t(" · 원격 리포 {n}개 발견", { n: d.remoteRepos.length }) : "");

  const initial: string[] = [];
  if (d.sources ? d.sources.claudeCode : claudePlaces.length > 0) initial.push("claudeCode");
  if (d.sources ? d.sources.codex : codexPlaces.length > 0) initial.push("codex");
  if (d.sources ? d.sources.git : true) initial.push("git");

  const picks = await clack.multiselect({
    message: t("어떤 기록을 수집할까요? (space로 켜고 끄기 — 최소 1개)"),
    options: [
      {
        value: "claudeCode",
        label: t("Claude Code 세션"),
        hint: claudePlaces.length > 0 ? t("감지: {places}", { places: claudePlaces.join(" · ") }) : t("미감지"),
      },
      {
        value: "codex",
        label: t("Codex 세션"),
        hint: codexPlaces.length > 0 ? t("감지: {places}", { places: codexPlaces.join(" · ") }) : t("미감지"),
      },
      { value: "git", label: t("git 커밋"), hint: gitHint },
    ],
    initialValues: initial.length > 0 ? initial : ["git"],
    required: true,
  });
  if (clack.isCancel(picks)) return BACK;
  const set = new Set(picks as string[]);
  d.sources = {
    claudeCode: set.has("claudeCode"),
    codex: set.has("codex"),
    git: set.has("git"),
  };
  return undefined;
}

async function stepProjects(d: Draft): Promise<Step<void>> {
  const projects: Config["projects"] = [];
  clack.log.step(t("수행 중인 과제(연구노트를 쓸 단위)를 등록합니다"));
  let n = 1;
  for (;;) {
    const title = await clack.text({
      message: t("과제 {n} 이름 (정식 과제명 또는 짧은 이름)", { n }),
      placeholder: t("예: 뉴럴 렌더링 기반 자율주행 시뮬레이션"),
      initialValue: d.projects[n - 1]?.title ?? "",
      validate: (v) => (v?.trim() ? undefined : t("과제 이름을 입력하세요")),
    });
    if (clack.isCancel(title)) {
      if (projects.length > 0) break;
      return BACK;
    }

    const id = await clack.text({
      message: t("과제 폴더명 (영문 — 노트가 이 폴더에 쌓입니다)"),
      initialValue: d.projects[n - 1]?.id ?? suggestSlug(title as string, n),
      validate: (v) =>
        !/^[a-z0-9][a-z0-9-]*$/.test((v ?? "").trim())
          ? t("영소문자·숫자·하이픈만")
          : projects.some((p) => p.id === (v ?? "").trim())
            ? t("이미 있는 슬러그")
            : undefined,
    });
    if (clack.isCancel(id)) return BACK;

    let repos: string[] = [];
    if (d.sources && !d.sources.git) {
      clack.log.info(t("git 수집이 꺼져 있어 저장소 선택을 건너뜁니다 (나중에: oln setup sources)"));
    } else {
      const asked = await askRepos(d, projects.flatMap((p) => p.repos), d.projects[n - 1]?.repos);
      if (asked === BACK) return BACK;
      repos = asked;
    }

    projects.push({ id: (id as string).trim(), title: (title as string).trim(), repos, dirs: [] });

    const more = await clack.confirm({ message: t("과제를 더 등록할까요?"), initialValue: false });
    if (clack.isCancel(more) || !more) break;
    n += 1;
  }
  d.projects = projects;
  return undefined;
}

/** 로컬 발견 리포 + 원격 발견 리포를 한 목록에서 선택 */
async function askRepos(d: Draft, taken: string[], previous?: string[]): Promise<Step<string[]>> {
  const localOptions = (d.scan?.repos ?? [])
    .filter((r) => !taken.includes(contractTilde(r.path)))
    .map((r) => ({
      value: contractTilde(r.path),
      label: `${path.basename(r.path)}  ${pc.dim(`${contractTilde(path.dirname(r.path))} · ${t("마지막 커밋 {date}", { date: r.lastCommit })}`)}`,
    }));
  const remoteOptions = d.remoteRepos
    .filter((r) => !taken.includes(r.entry))
    .map((r) => ({
      value: r.entry,
      label: `${path.posix.basename(r.display)}  ${pc.dim(`${r.entry.split(":")[0]}:${r.display} · ${t("마지막 커밋 {date}", { date: r.lastCommit })}`)}`,
    }));

  let selected: string[] = [];
  let wantManual = false;
  const options = [...localOptions, ...remoteOptions];
  if (options.length > 0) {
    // 목록이 길어도 바로 타이핑해서 좁힐 수 있는 검색 멀티셀렉트 (clack 네이티브)
    const initial = previous?.filter((v) => options.some((o) => o.value === v)) ?? [];
    const picks = await clack.autocompleteMultiselect({
      message: t("이 과제에 속한 저장소 선택 — 글자 입력 = 검색 · Tab = 선택 (없으면 그냥 enter)"),
      options: [
        ...options,
        { value: "__add__", label: t("＋ 목록에 없는 경로 직접 추가…"), hint: t("Tab 자동완성") },
      ],
      ...(initial.length > 0 ? { initialValues: initial } : {}),
      required: false,
    });
    if (clack.isCancel(picks)) return BACK;
    selected = (picks as string[]).filter((v) => v !== "__add__");
    wantManual = (picks as string[]).includes("__add__");
  } else {
    clack.log.info(t("발견된 리포가 없어 직접 입력합니다"));
    wantManual = true;
  }
  while (wantManual) {
    // 지금까지 등록된 경로를 매번 보여준다 — 뭘 넣었는지 잊지 않게
    if (selected.length > 0) {
      clack.log.info(
        `${t("지금까지 등록: {n}개", { n: selected.length })}\n${selected.map((s) => pc.dim(`  ${s}`)).join("\n")}`,
      );
    }
    const extra = await pathInput(t("추가할 경로 (폴더 이름만 치면 검색 · 빈 입력 = 완료 · 원격은 호스트:~/경로)"));
    if (extra === PATH_INPUT_CANCEL) break;
    if (isRemoteEntry(extra)) {
      const added = await verifyAndAddRemote(extra, selected);
      if (added) clack.log.success(t("추가됨: {path}", { path: extra }));
      continue;
    }
    const abs = expandTilde(extra);
    if (!fs.existsSync(abs)) {
      // 경로가 아니라 단어면 폴더 이름 검색으로
      if (!extra.includes("/") && !extra.startsWith("~")) {
        const hits = searchDirsByName(extra).filter((h) => !selected.includes(contractTilde(h)));
        if (hits.length === 0) {
          clack.log.warn(t("'{q}' 이름이 들어간 폴더를 찾지 못했습니다 (홈 아래 깊이 4)", { q: extra }));
          continue;
        }
        const picks = await clack.multiselect({
          message: t("'{q}' 폴더 검색 결과 — space로 선택, enter로 확정", { q: extra }),
          options: hits.map((h) => ({
            value: contractTilde(h),
            label: contractTilde(h),
            ...(fs.existsSync(path.join(h, ".git")) ? { hint: "git" } : {}),
          })),
          required: false,
        });
        if (clack.isCancel(picks)) continue;
        for (const v of picks as string[]) {
          selected.push(v);
          clack.log.success(t("추가됨: {path}", { path: v }));
        }
        continue;
      }
      clack.log.warn(t("경로가 없습니다: {path} — 추가하지 않았습니다", { path: extra }));
      continue;
    }
    selected.push(contractTilde(abs));
    clack.log.success(t("추가됨: {path}", { path: contractTilde(abs) }));
  }
  return selected;
}

/** 원격 경로("호스트:~/경로")를 실제로 확인하고 결과를 명확히 알려준 뒤 추가한다 */
async function verifyAndAddRemote(entry: string, selected: string[]): Promise<boolean> {
  const idx = entry.indexOf(":");
  const host = entry.slice(0, idx);
  const rpath = entry.slice(idx + 1);
  const spin = clack.spinner();
  spin.start(t("{host}에서 경로 확인 중", { host }));
  const expanded = await expandRemoteTilde(host, rpath);
  const check = expanded ? await sshRunAsync(host, `test -d ${JSON.stringify(expanded)} && echo OK`, 12_000) : null;

  if (!check || check.connectionFailed) {
    spin.stop(t("{host}: 연결 실패", { host }));
    const keep = await clack.confirm({
      message: t("지금은 연결할 수 없습니다. 나중에 연결된다면 그대로 등록할까요?"),
      initialValue: true,
    });
    if (clack.isCancel(keep) || !keep) {
      clack.log.info(t("추가하지 않았습니다: {path}", { path: entry }));
      return false;
    }
    selected.push(entry);
    return true;
  }
  if (!check.ok || !check.stdout.includes("OK")) {
    spin.stop(t("{host}: 경로가 없습니다 — {path}", { host, path: rpath }));
    const keep = await clack.confirm({
      message: t("원격에 이 경로가 없습니다. 그래도 등록할까요? (보통은 오타입니다)"),
      initialValue: false,
    });
    if (clack.isCancel(keep) || !keep) {
      clack.log.info(t("추가하지 않았습니다: {path}", { path: entry }));
      return false;
    }
    selected.push(entry);
    return true;
  }
  spin.stop(t("{host}: 경로 확인됨", { host }));
  selected.push(entry);
  return true;
}

async function stepNotesDir(d: Draft): Promise<Step<void>> {
  const presets = ["~/openlabnote", "~/Documents/openlabnote"];
  const customPrev = d.notesDir && !presets.includes(d.notesDir) ? d.notesDir : null;
  const pick = await clack.select({
    message: t("노트를 어디에 저장할까요? (md 파일이 여기 쌓입니다 — 백업·git 관리 가능한 내 폴더)"),
    options: [
      { value: "~/openlabnote", label: "~/openlabnote", hint: t("기본") },
      { value: "~/Documents/openlabnote", label: "~/Documents/openlabnote" },
      ...(customPrev ? [{ value: customPrev, label: customPrev, hint: t("이전 입력") }] : []),
      { value: "__custom__", label: t("직접 입력…"), hint: t("Tab 자동완성") },
    ],
    initialValue: d.notesDir ?? "~/openlabnote",
  });
  if (clack.isCancel(pick)) return BACK;
  if (pick !== "__custom__") {
    d.notesDir = pick as string;
    return undefined;
  }
  const custom = await pathInput(t("노트 저장 경로"), expandTilde("~/openlabnote"));
  if (custom === PATH_INPUT_CANCEL) return BACK;
  d.notesDir = contractTilde(path.resolve(expandTilde(custom)));
  return undefined;
}

async function stepEngine(d: Draft): Promise<Step<void>> {
  const scan = d.scan;
  if (!scan?.claudeCliFound && !scan?.codexCliFound) {
    clack.log.warn(
      t("claude/codex CLI가 없어 터미널 단독 작성(oln today)은 비활성화됩니다.\n하네스 안(/labnote)에서 작성하거나, CLI 설치 후 oln setup engine 으로 켜세요."),
    );
    d.engine = "none";
    return undefined;
  }
  const options: { value: Config["engine"]; label: string; hint?: string }[] = [];
  if (scan.claudeCliFound) options.push({ value: "claude", label: t("claude -p (Claude 구독)"), hint: t("감지됨") });
  if (scan.codexCliFound) options.push({ value: "codex", label: t("codex exec (Codex 구독)"), hint: t("감지됨") });
  options.push({ value: "none", label: t("사용 안 함"), hint: t("요약·작성은 하네스 안(/labnote)에서 — oln today는 수집까지만") });

  const engine = await clack.select({
    message: t("터미널에서 정리할 때(oln today) 어떤 엔진으로 노트를 작성할까요? (내 구독 사용)"),
    options,
    initialValue: d.engine ?? options[0]?.value,
  });
  if (clack.isCancel(engine)) return BACK;
  d.engine = engine as Config["engine"];
  return undefined;
}

/* ── 헬퍼 ─────────────────────────────────────────────── */

function suggestSlug(title: string, n: number): string {
  const ascii = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  return /^[a-z0-9]/.test(ascii) ? ascii : `project-${n}`;
}
