import pc from "picocolors";

/**
 * 여러 작업의 진행을 한 화면에서 제자리 갱신하는 라이브 태스크 리스트 (TTY 전용).
 * 이벤트 루프가 살아있는 동안(비동기 엔진) 120ms마다 다시 그린다.
 */

const FRAMES = ["◐", "◓", "◑", "◒"];

export type TaskStatus = "pend" | "run" | "ok" | "warn" | "err";

interface Task {
  label: string;
  status: TaskStatus;
  note: string;
  startedAt?: number;
  endedAt?: number;
}

function fmtElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}:${String(s % 60).padStart(2, "0")}` : `${s}s`;
}

export class TaskList {
  private readonly tasks: Task[];
  private timer: NodeJS.Timeout | null = null;
  private lastLines = 0;
  private frame = 0;
  private readonly startAt = Date.now();

  constructor(
    labels: string[],
    private readonly headerFn: (done: number, total: number, elapsed: string) => string,
  ) {
    this.tasks = labels.map((label) => ({ label, status: "pend", note: "" }));
  }

  static get supported(): boolean {
    return Boolean(process.stdout.isTTY);
  }

  start(): void {
    if (!TaskList.supported) return;
    process.stdout.write("\x1b[?25l"); // 커서 숨김
    this.render();
    this.timer = setInterval(() => {
      this.frame += 1;
      this.render();
    }, 120);
  }

  run(i: number): void {
    const t = this.tasks[i];
    if (!t) return;
    t.status = "run";
    t.startedAt = Date.now();
  }

  done(i: number, status: Exclude<TaskStatus, "pend" | "run">, note = ""): void {
    const t = this.tasks[i];
    if (!t) return;
    t.status = status;
    t.note = note;
    t.endedAt = Date.now();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (!TaskList.supported) return;
    this.render();
    process.stdout.write("\x1b[?25h"); // 커서 복원
  }

  private line(t: Task): string {
    const secs = t.startedAt ? fmtElapsed((t.endedAt ?? Date.now()) - t.startedAt) : "";
    switch (t.status) {
      case "pend":
        return pc.dim(`  · ${t.label}`);
      case "run":
        return `  ${pc.cyan(FRAMES[this.frame % FRAMES.length] ?? "◐")} ${t.label} ${pc.dim(secs)}`;
      case "ok":
        return `  ${pc.green("✓")} ${t.label} ${pc.dim(secs)}${t.note ? "  " + pc.dim(t.note) : ""}`;
      case "warn":
        return `  ${pc.yellow("!")} ${t.label} ${pc.yellow(t.note)}`;
      case "err":
        return `  ${pc.red("✗")} ${t.label} ${pc.red(t.note)}`;
    }
  }

  private render(): void {
    const done = this.tasks.filter((t) => t.status === "ok" || t.status === "warn" || t.status === "err").length;
    const lines = [
      pc.bold(this.headerFn(done, this.tasks.length, fmtElapsed(Date.now() - this.startAt))),
      ...this.tasks.map((t) => this.line(t)),
    ];
    const out =
      (this.lastLines > 0 ? `\x1b[${this.lastLines}A\x1b[0J` : "") + lines.join("\n") + "\n";
    process.stdout.write(out);
    this.lastLines = lines.length;
  }
}
