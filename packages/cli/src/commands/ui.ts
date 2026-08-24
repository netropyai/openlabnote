import { spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { loadConfig, notePath, type Config } from "../lib/config.js";
import { addDays, todayYmd } from "../lib/dates.js";
import { t } from "../lib/i18n.js";
import { contractTilde, expandTilde, olnHome } from "../lib/paths.js";
import { CLI_VERSION } from "../lib/version.js";
import { computeStates } from "../lib/state.js";
import { parseNote } from "../note/format.js";
import { escapeHtml as esc, noteBodyHtml } from "../note/render-html.js";
import { lintNote, type LintIssue } from "../note/lint.js";
import { die, info, nextLine, ok } from "../lib/ui.js";

const WINDOW_WEEKS = 12;

export interface UiOptions {
  port?: string;
  open?: boolean;
}

/**
 * 로컬 웹 뷰어 (읽기 전용) — 3단계 Cloud 대시보드의 원형.
 * 127.0.0.1 전용 바인딩. md가 정본이라는 원칙대로 파일은 건드리지 않는다.
 */
export async function uiCommand(opts: UiOptions): Promise<void> {
  let cfg = loadConfig(); // 부팅 검증 겸 마지막 정상본
  const port = Number(opts.port ?? 4870);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    die(t("포트가 잘못됐습니다: {p}", { p: String(opts.port) }), "oln ui --port 4870");
  }

  const server = http.createServer((req, res) => {
    // 서버가 오래 살아도 항상 현재 설정을 서빙한다 (reset·재설정 뒤에도 옛 데이터 방지)
    try {
      cfg = loadConfig();
    } catch {
      /* 일시적으로 깨진 설정 — 마지막 정상본으로 계속 */
    }
    void handle(cfg, req, res).catch((e) => {
      res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      res.end(String((e as Error).message));
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  }).catch((e: NodeJS.ErrnoException) => {
    if (e.code === "EADDRINUSE") die(t("포트 {p}가 사용 중입니다", { p: port }), `oln ui --port ${port + 1}`);
    throw e;
  });

  const url = `http://127.0.0.1:${port}`;
  ok(t("웹 뷰어 실행 중: {url}", { url }));
  info(t("Ctrl+C 로 종료합니다. 노트를 수정하면 브라우저에서 새로고침하세요."));
  nextLine("oln today", "oln catchup");
  if (opts.open !== false) {
    const opener = process.platform === "darwin" ? "open" : "xdg-open";
    spawnSync(opener, [url], { stdio: "ignore" });
  }
}

async function handle(cfg: Config, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const u = new URL(req.url ?? "/", "http://localhost");
  if (u.pathname === "/api/meta") {
    // 실행기(launchUiBackground)가 서버 신원을 확인하고 낡은 서버를 교체하는 데 쓴다
    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ app: "openlabnote-ui", pid: process.pid, olnHome: olnHome(), version: CLI_VERSION }));
    return;
  }
  if (u.pathname === "/") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(page(cfg));
    return;
  }
  if (u.pathname === "/api/overview") {
    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(await overview(cfg)));
    return;
  }
  if (u.pathname === "/api/note" && req.method === "POST") {
    const body = await readBody(req);
    const result = body ? saveNote(cfg, body.p, body.d, body.md) : null;
    res.writeHead(result ? 200 : 400, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(result ?? { error: "bad request" }));
    return;
  }
  if (u.pathname === "/api/note") {
    const p = u.searchParams.get("p") ?? "";
    const d = u.searchParams.get("d") ?? "";
    const data = readNote(cfg, p, d);
    res.writeHead(data ? 200 : 404, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(data ?? { error: "not found" }));
    return;
  }
  if (u.pathname === "/api/open") {
    const found = noteFile(cfg, u.searchParams.get("p") ?? "", u.searchParams.get("d") ?? "");
    if (found) {
      const opener = process.platform === "darwin" ? "open" : "xdg-open";
      spawnSync(opener, [process.platform === "darwin" ? "-t" : found.file, ...(process.platform === "darwin" ? [found.file] : [])], { stdio: "ignore" });
    }
    res.writeHead(found ? 204 : 404);
    res.end();
    return;
  }
  if (u.pathname === "/api/fig") {
    serveFig(cfg, u, res);
    return;
  }
  res.writeHead(404, { "content-type": "text/plain" });
  res.end("404");
}

interface OverviewProject {
  id: string;
  title: string;
  days: { date: string; kind: "note" | "draft" | "activity" }[];
}

async function overview(cfg: Config): Promise<{ notesDir: string; projects: OverviewProject[] }> {
  const until = todayYmd();
  const since = addDays(until, -(WINDOW_WEEKS * 7 - 1));
  const states = await computeStates(cfg, since, until);
  const projects: OverviewProject[] = [];
  for (const project of cfg.projects) {
    const dir = path.join(expandTilde(cfg.notesDir), project.id);
    const byDate = new Map<string, "note" | "draft" | "activity">();
    if (fs.existsSync(dir)) {
      for (const f of fs.readdirSync(dir)) {
        const m = /^(\d{4}-\d{2}-\d{2})(\.draft)?\.md$/.exec(f);
        if (!m) continue;
        const cur = byDate.get(m[1]!);
        if (m[2]) {
          if (!cur) byDate.set(m[1]!, "draft");
        } else byDate.set(m[1]!, "note");
      }
    }
    for (const [,] of states.get(project.id) ?? []) {
      // "기록만 있음(activity)"은 목록에 표시하지 않는다 — 노트(md/draft)만
    }
    projects.push({
      id: project.id,
      title: project.title,
      days: [...byDate.entries()].map(([date, kind]) => ({ date, kind })).sort((a, b) => b.date.localeCompare(a.date)),
    });
  }
  return { notesDir: contractTilde(expandTilde(cfg.notesDir)), projects };
}

function noteFile(cfg: Config, projectId: string, date: string): { file: string; draft: boolean } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !cfg.projects.some((p) => p.id === projectId)) return null;
  const fp = notePath(cfg, projectId, date);
  if (fs.existsSync(fp)) return { file: fp, draft: false };
  const draft = fp.replace(/\.md$/, ".draft.md");
  if (fs.existsSync(draft)) return { file: draft, draft: true };
  return null;
}

function readNote(cfg: Config, projectId: string, date: string): { md: string; html: string; draft: boolean; path: string } | null {
  const found = noteFile(cfg, projectId, date);
  if (!found) return null;
  const md = fs.readFileSync(found.file, "utf8");
  return {
    md,
    html: noteBodyHtml(md, (_fig, i) => `/api/fig?p=${encodeURIComponent(projectId)}&d=${date}&i=${i}`),
    draft: found.draft,
    path: contractTilde(found.file),
  };
}

interface SaveResult {
  ok: boolean;
  promoted: boolean;
  draft: boolean;
  issues: LintIssue[];
}

/** 편집 저장: 항상 저장(md가 정본) + lint 재검사. 초안이 통과하면 정식 노트로 승격 */
function saveNote(cfg: Config, projectId: string, date: string, md: string): SaveResult | null {
  const found = noteFile(cfg, projectId, date);
  if (!found || typeof md !== "string" || md.length > 1024 * 1024) return null;
  const lint = lintNote(md, { expectedDate: date, checkFigFiles: true });
  const normalized = md.endsWith("\n") ? md : md + "\n";
  if (found.draft && lint.ok) {
    const main = found.file.replace(/\.draft\.md$/, ".md");
    fs.writeFileSync(main, normalized, "utf8");
    fs.rmSync(found.file);
    return { ok: true, promoted: true, draft: false, issues: lint.issues };
  }
  fs.writeFileSync(found.file, normalized, "utf8");
  return { ok: lint.ok, promoted: false, draft: found.draft, issues: lint.issues };
}

function readBody(req: http.IncomingMessage): Promise<{ p: string; d: string; md: string } | null> {
  return new Promise((resolve) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > 2 * 1024 * 1024) {
        resolve(null);
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")) as { p: string; d: string; md: string });
      } catch {
        resolve(null);
      }
    });
    req.on("error", () => resolve(null));
  });
}

/** 노트에 실제로 선언된 FIG만 서빙 — 임의 경로 접근 차단 */
function serveFig(cfg: Config, u: URL, res: http.ServerResponse): void {
  const p = u.searchParams.get("p") ?? "";
  const d = u.searchParams.get("d") ?? "";
  const i = Number(u.searchParams.get("i") ?? "-1");
  const found = noteFile(cfg, p, d);
  if (!found) {
    res.writeHead(404);
    res.end();
    return;
  }
  const figs = parseNote(fs.readFileSync(found.file, "utf8")).figs;
  const fig = figs[i];
  if (!fig || !fs.existsSync(fig.path)) {
    res.writeHead(404);
    res.end();
    return;
  }
  const ext = path.extname(fig.path).toLowerCase();
  const mime =
    ext === ".png"
      ? "image/png"
      : ext === ".jpg" || ext === ".jpeg"
        ? "image/jpeg"
        : ext === ".gif"
          ? "image/gif"
          : ext === ".webp"
            ? "image/webp"
            : "application/octet-stream";
  res.writeHead(200, { "content-type": mime });
  fs.createReadStream(fig.path).pipe(res);
}

function page(cfg: Config): string {
  const L = {
    empty: t("이 날짜의 노트가 없습니다 — 기록만 있습니다. 터미널에서:  oln catchup"),
    pick: t("왼쪽에서 날짜를 선택하세요"),
    draft: t("초안 (lint 실패)"),
    activity: t("기록만"),
    refresh: t("새로고침"),
    notesAt: t("노트 저장소"),
    edit: t("수정"),
    openEditor: t("에디터로 열기"),
    save: t("저장하기"),
    cancel: t("취소"),
    saved: t("검사 통과 — 저장됨"),
    savedIssues: t("저장됨 — 검사 오류 {n}건"),
    promoted: t("초안이 정식 노트로 승격되었습니다"),
  };
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>openlabnote</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;500;700&family=IBM+Plex+Mono:wght@400;600&display=swap">
<style>
  :root{--paper:#F6F5F0;--ink:#191D1A;--mut:#5A6159;--green:#0B7A4B;--line:#E2E0D6;--card:#FFFFFF;--term:#0E1713;--tgreen:#8FE3B7;--amber:#8A6D1A;--ambersoft:#F1EDDD}
  *{box-sizing:border-box}
  body{margin:0;background:var(--paper);color:var(--ink);font-family:"IBM Plex Sans KR",-apple-system,"Apple SD Gothic Neo",sans-serif;line-height:1.6}
  header{display:flex;align-items:center;gap:14px;padding:12px 20px;border-bottom:1px solid var(--line);background:var(--card);position:sticky;top:0;z-index:10}
  header .logo{font-family:"IBM Plex Mono",monospace;font-weight:600}
  header .logo b{color:var(--green)}
  header .dir{font-family:"IBM Plex Mono",monospace;font-size:11.5px;color:var(--mut);flex:1}
  header button{font-family:"IBM Plex Mono",monospace;font-size:12px;border:1px solid var(--line);background:var(--card);border-radius:6px;padding:4px 12px;cursor:pointer;color:var(--ink)}
  header button:hover,header button:focus-visible{border-color:var(--green);outline:none}
  .layout{display:grid;grid-template-columns:280px 1fr;min-height:calc(100vh - 49px)}
  @media (max-width:760px){.layout{grid-template-columns:1fr}.side{border-right:none;border-bottom:1px solid var(--line);position:static;height:auto}}
  .side{border-right:1px solid var(--line);padding:16px;overflow-y:auto;position:sticky;top:49px;height:calc(100vh - 49px)}
  .pj{margin-bottom:18px}
  .pj .name{font-weight:700;font-size:14px}
  .pj .title{font-size:12px;color:var(--mut);margin-bottom:8px}
  .day{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;text-align:left;border:1px solid transparent;background:none;border-radius:6px;padding:5px 9px;cursor:pointer;font-family:"IBM Plex Mono",monospace;font-size:12.5px;color:var(--ink)}
  .day:hover{background:var(--card);border-color:var(--line)}
  .day.on,.day:focus-visible{background:var(--card);border-color:var(--green);outline:none}
  .b{font-size:10px;border-radius:99px;padding:0 7px;font-family:"IBM Plex Mono",monospace}
  .b.note{background:#DFF0E6;color:var(--green)} .b.draft{background:var(--ambersoft);color:var(--amber)} .b.activity{background:var(--line);color:var(--mut)}
  main{padding:28px clamp(20px,4vw,48px);max-width:860px}
  .paper{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:26px 32px;box-shadow:0 1px 3px rgba(0,0,0,.05)}
  .paper h2{font-size:20px;border-bottom:2px solid var(--ink);padding-bottom:8px;margin:0 0 14px}
  .paper h3{font-size:15px;color:var(--green);margin:18px 0 6px}
  .paper ul{margin:0;padding-left:20px}
  .paper li{margin:4px 0;font-size:14.5px}
  .paper code{font-family:"IBM Plex Mono",monospace;font-size:12.5px;background:#ECEAE2;border-radius:4px;padding:1px 5px}
  .paper figure{margin:14px 0}
  .paper img{max-width:100%;border:1px solid var(--line);border-radius:6px}
  .paper figcaption{font-size:12px;color:var(--mut);margin-top:4px}
  .meta{display:flex;gap:10px;align-items:center;margin:0 0 12px;font-family:"IBM Plex Mono",monospace;font-size:11.5px;color:var(--mut);min-height:18px}
  .tagd{background:var(--ambersoft);color:var(--amber);border-radius:99px;padding:1px 9px}
  .hint{color:var(--mut);font-size:14px;background:var(--card);border:1px dashed var(--line);border-radius:8px;padding:14px 18px}
  .hint code{font-family:"IBM Plex Mono",monospace;background:var(--term);color:var(--tgreen);border-radius:4px;padding:1px 7px;font-size:12px}
  .acts{margin-left:auto;display:flex;gap:6px}
  .acts button{font-family:"IBM Plex Mono",monospace;font-size:11px;border:1px solid var(--line);background:var(--card);border-radius:5px;padding:2px 10px;cursor:pointer;color:var(--ink)}
  .acts button:hover,.acts button:focus-visible{border-color:var(--green);outline:none}
  .acts button.pri{background:var(--green);border-color:var(--green);color:#fff}
  textarea.ed{width:100%;min-height:420px;font-family:"IBM Plex Mono",monospace;font-size:13px;line-height:1.7;border:1px solid var(--green);border-radius:10px;padding:18px 20px;background:var(--card);color:var(--ink);resize:vertical;box-sizing:border-box}
  textarea.ed:focus-visible{outline:2px solid var(--green)}
  .lintbox{margin:0 0 10px;border-radius:8px;padding:10px 14px;font-size:13px}
  .lintbox.good{background:#DFF0E6;color:var(--green)}
  .lintbox.bad{background:var(--ambersoft);color:var(--amber)}
  .lintbox ul{margin:4px 0 0;padding-left:18px}
</style></head><body>
<header><span class="logo">open<b>lab</b>note</span><span class="dir">${esc(L.notesAt)} ${esc(contractTilde(expandTilde(cfg.notesDir)))}</span><button onclick="load(true)">${esc(L.refresh)}</button></header>
<div class="layout">
  <aside class="side" id="side"></aside>
  <main><div class="meta" id="meta"><span id="metatext"></span><span class="acts" id="acts"></span></div><div id="lint" ></div><div id="pane" class="hint">${esc(L.pick)}</div></main>
</div>
<script>
const L=${JSON.stringify(L)};
let cur=null;
async function load(keep){
  const r=await fetch('/api/overview'); const data=await r.json();
  const side=document.getElementById('side'); side.innerHTML='';
  for(const p of data.projects){
    const box=document.createElement('div'); box.className='pj';
    const nm=document.createElement('div'); nm.className='name'; nm.textContent=p.id;
    const tt=document.createElement('div'); tt.className='title'; tt.textContent=p.title;
    box.appendChild(nm); box.appendChild(tt);
    for(const d of p.days){
      const b=document.createElement('button'); b.className='day'; b.dataset.p=p.id; b.dataset.d=d.date;
      const lab=d.kind==='note'?'md':d.kind==='draft'?'draft':L.activity;
      b.innerHTML='<span>'+d.date+'</span><span class="b '+d.kind+'">'+lab+'</span>';
      b.onclick=()=>show(p.id,d.date);
      box.appendChild(b);
    }
    side.appendChild(box);
  }
  if(keep&&cur) show(cur.p,cur.d);
  else{
    const h=new URLSearchParams(location.hash.slice(1));
    const hp=h.get('p'),hd=h.get('d');
    const hasHash=hp&&hd&&data.projects.some(pr=>pr.id===hp&&pr.days.some(x=>x.date===hd));
    if(hasHash){ show(hp,hd); }
    else{
      const first=data.projects.flatMap(p=>p.days.filter(x=>x.kind!=='activity').map(x=>({p:p.id,d:x.date})))[0];
      if(first) show(first.p,first.d);
    }
  }
}
let curNote=null;
async function show(p,d){
  cur={p,d};
  document.querySelectorAll('.day').forEach(x=>x.classList.toggle('on',x.dataset.p===p&&x.dataset.d===d));
  const mt=document.getElementById('metatext'); const acts=document.getElementById('acts');
  const pane=document.getElementById('pane'); const lint=document.getElementById('lint');
  lint.innerHTML='';
  const r=await fetch('/api/note?p='+encodeURIComponent(p)+'&d='+d);
  if(!r.ok){ mt.textContent=''; acts.innerHTML=''; curNote=null; pane.className='hint'; pane.textContent=L.empty; return; }
  const n=await r.json(); curNote=n;
  mt.textContent=n.path;
  if(n.draft){ const s=document.createElement('span'); s.className='tagd'; s.textContent=L.draft; mt.appendChild(s); }
  acts.innerHTML='';
  const eb=mkBtn(L.edit,()=>edit()); const ob=mkBtn(L.openEditor,()=>fetch('/api/open?p='+encodeURIComponent(p)+'&d='+d));
  acts.appendChild(eb); acts.appendChild(ob);
  pane.className='paper'; pane.innerHTML=n.html;
}
function mkBtn(label,fn,pri){ const b=document.createElement('button'); if(pri) b.className='pri'; b.textContent=label; b.onclick=fn; return b; }
function edit(){
  if(!curNote) return;
  const pane=document.getElementById('pane'); const acts=document.getElementById('acts');
  pane.className=''; pane.innerHTML='';
  const ta=document.createElement('textarea'); ta.className='ed'; ta.value=curNote.md; pane.appendChild(ta);
  acts.innerHTML='';
  acts.appendChild(mkBtn(L.save, async ()=>{
    const r=await fetch('/api/note',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({p:cur.p,d:cur.d,md:ta.value})});
    const out=await r.json();
    await load(true);
    const lint=document.getElementById('lint');
    const errs=(out.issues||[]).filter(i=>i.severity==='error');
    if(out.promoted){ lint.innerHTML='<div class="lintbox good">'+L.promoted+'</div>'; }
    else if(out.ok){ lint.innerHTML='<div class="lintbox good">'+L.saved+'</div>'; }
    else{
      const items=errs.map(i=>'<li>['+i.code+'] '+i.message.replace(/</g,'&lt;')+'</li>').join('');
      lint.innerHTML='<div class="lintbox bad">'+L.savedIssues.replace('{n}',errs.length)+'<ul>'+items+'</ul></div>';
    }
  },true));
  acts.appendChild(mkBtn(L.cancel,()=>show(cur.p,cur.d)));
}
load(false);
</script></body></html>`;
}
