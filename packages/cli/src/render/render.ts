import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium, type Browser } from "playwright-core";
import { t } from "../lib/i18n.js";
import { noteBodyHtml, noteDocumentHtml } from "../note/render-html.js";

export class RenderError extends Error {
  constructor(
    message: string,
    public readonly fix: string,
  ) {
    super(message);
  }
}

/** 시스템 Chrome/Chromium으로 브라우저 열기 (브라우저 다운로드 없음) */
async function launch(): Promise<Browser> {
  for (const channel of ["chrome", "chromium", "msedge"] as const) {
    try {
      return await chromium.launch({ channel, headless: true });
    } catch {
      /* 다음 채널 시도 */
    }
  }
  throw new RenderError(
    t("렌더에 필요한 Chrome/Chromium을 찾을 수 없습니다"),
    t("Google Chrome을 설치하거나  npx playwright install chromium  후 다시 실행"),
  );
}

export interface RenderItem {
  md: string;
  /** FIG 이미지의 절대경로가 md 안에 있음 — file:// 로 로드 */
  outPath: string;
}

const PNG_WIDTH = 1182;

/** 일자별 PNG 렌더 (내용 높이에 맞춘 풀페이지 스크린샷, 2x 해상도) */
export async function renderPngs(
  items: RenderItem[],
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  if (items.length === 0) return;
  const browser = await launch();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "oln-render-"));
  try {
    const page = await browser.newPage({
      viewport: { width: PNG_WIDTH, height: 800 },
      deviceScaleFactor: 2,
    });
    let done = 0;
    for (const item of items) {
      const body = noteBodyHtml(item.md, (fig) => (fs.existsSync(fig.path) ? "file://" + fig.path : null));
      const html = noteDocumentHtml([body], { width: PNG_WIDTH });
      const htmlFile = path.join(tmp, `n${done}.html`);
      fs.writeFileSync(htmlFile, html, "utf8");
      await page.goto("file://" + htmlFile, { waitUntil: "networkidle" });
      fs.mkdirSync(path.dirname(item.outPath), { recursive: true });
      await page.screenshot({ path: item.outPath, fullPage: true });
      done += 1;
      onProgress?.(done, items.length);
    }
  } finally {
    await browser.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/** 기간 통합 PDF (A4, 하루당 페이지 분리) */
export async function renderPdf(mds: string[], outPath: string, footer?: string): Promise<void> {
  const browser = await launch();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "oln-render-"));
  try {
    const bodies = mds.map((md) => noteBodyHtml(md, (fig) => (fs.existsSync(fig.path) ? "file://" + fig.path : null)));
    const html = noteDocumentHtml(bodies, { ...(footer !== undefined ? { footer } : {}) });
    const htmlFile = path.join(tmp, "notes.html");
    fs.writeFileSync(htmlFile, html, "utf8");
    const page = await browser.newPage();
    await page.goto("file://" + htmlFile, { waitUntil: "networkidle" });
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    await page.pdf({
      path: outPath,
      format: "A4",
      printBackground: true,
      margin: { top: "14mm", bottom: "14mm", left: "12mm", right: "12mm" },
    });
  } finally {
    await browser.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
