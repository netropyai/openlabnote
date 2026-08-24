/** 노트 포맷 v1 → HTML. 뷰어(oln ui)와 export(PNG·PDF)가 공유하는 렌더러. */

export interface FigRef {
  path: string;
  caption: string;
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** 본문 HTML (컨테이너 없음). figSrc가 null을 반환하면 그림은 캡션 라인으로 대체 */
export function noteBodyHtml(md: string, figSrc: (fig: FigRef, index: number) => string | null): string {
  const out: string[] = [];
  let inList = false;
  let figIndex = -1;
  const closeList = (): void => {
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
  };
  for (const line of md.split("\n")) {
    const fig = /^<!--\s*FIG:\s*(.+?)\s*\|\s*(.+?)\s*-->$/.exec(line);
    if (fig) {
      figIndex += 1;
      closeList();
      const ref = { path: fig[1]!, caption: fig[2]! };
      const src = figSrc(ref, figIndex);
      if (src) {
        out.push(
          `<figure><img src="${escapeHtml(src)}" alt="${escapeHtml(ref.caption)}"><figcaption>${escapeHtml(ref.caption)}</figcaption></figure>`,
        );
      } else {
        out.push(`<p class="figref">[fig] ${escapeHtml(ref.caption)}</p>`);
      }
      continue;
    }
    if (line.startsWith("## @")) {
      closeList();
      out.push(`<h2>${escapeHtml(line.slice(4))}</h2>`);
    } else if (line.startsWith("### ")) {
      closeList();
      out.push(`<h3>${escapeHtml(line.slice(4))}</h3>`);
    } else if (/^- /.test(line)) {
      if (!inList) {
        out.push("<ul>");
        inList = true;
      }
      const body = escapeHtml(line.slice(2)).replace(/`([^`]+)`/g, "<code>$1</code>");
      out.push(`<li>${body}</li>`);
    } else if (line.trim() !== "") {
      closeList();
      out.push(`<p>${escapeHtml(line)}</p>`);
    }
  }
  closeList();
  return out.join("\n");
}

/**
 * export용 완결 HTML 문서 (일자별 PNG · 기간 PDF 공용).
 * 웹폰트를 쓰지 않는다 — 렌더마다 네트워크 요청이 생기는 함정(METHOD 교훈). 시스템 한글 폰트 스택 사용.
 */
export function noteDocumentHtml(bodies: string[], opts: { width?: number; footer?: string } = {}): string {
  const width = opts.width ?? 1182;
  const pages = bodies
    .map((b) => `<article class="note">${b}</article>`)
    .join('\n<div class="pagebreak"></div>\n');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box}
  html,body{margin:0;padding:0;background:#FFFFFF}
  body{width:${width}px;font-family:"Apple SD Gothic Neo","Noto Sans KR","Noto Sans CJK KR","Malgun Gothic",sans-serif;
       color:#191D1A;line-height:1.65;font-size:16px}
  .note{padding:40px 48px}
  h2{font-size:24px;border-bottom:2.5px solid #191D1A;padding-bottom:10px;margin:0 0 18px;font-weight:700}
  h3{font-size:17px;color:#0B7A4B;margin:20px 0 6px;font-weight:700}
  ul{margin:0;padding-left:22px}
  li{margin:5px 0}
  code{font-family:"SF Mono",Menlo,Consolas,monospace;font-size:13.5px;background:#ECEAE2;border-radius:4px;padding:1px 6px}
  figure{margin:16px 0}
  img{max-width:100%;border:1px solid #E2E0D6;border-radius:6px}
  figcaption{font-size:13px;color:#5A6159;margin-top:5px}
  .figref{color:#5A6159;font-size:13.5px}
  .footer{padding:0 48px 28px;font-size:12px;color:#8A9088;font-family:"SF Mono",Menlo,monospace}
  .pagebreak{page-break-after:always;break-after:page;height:0}
  @media print{ .note{padding:24px 8px} body{width:auto} }
</style></head><body>
${pages}
${opts.footer ? `<div class="footer">${escapeHtml(opts.footer)}</div>` : ""}
</body></html>`;
}
