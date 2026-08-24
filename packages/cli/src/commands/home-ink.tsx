import React, { useRef, useState } from "react";
import { Box, Text, render, useApp, useInput } from "ink";
import { t } from "../lib/i18n.js";

export interface HomeMenuItem {
  key: string;
  label: string;
  hint: string;
  /** 이 항목부터 새 그룹 — 그룹 위에 표시할 섹션 라벨 */
  section?: string;
}

export interface HomeProjectLine {
  id: string;
  status: string;
  ok: boolean;
}

export interface HomeViewData {
  brand: string;
  context: string;
  heatmapTitle: string;
  heatmap: string;
  projects: HomeProjectLine[];
  items: HomeMenuItem[];
  /** 새 버전 알림 한 줄 (주 1회 확인 결과) */
  updateNotice?: string;
  /** 업데이트 후 첫 진입에 1회 보여줄 새 소식 (동봉 CHANGELOG 기반) */
  whatsNew?: { title: string; bullets: string[] };
}

/**
 * Ink 홈 대시보드 — 선택된 액션 key를 resolve하고 언마운트한다.
 * 실제 액션(clack 프롬프트·스피너 출력)은 언마운트 후 일반 터미널 흐름으로 실행된다.
 */
let stdinKeeper: ((b: Buffer) => void) | null = null;

/** 상시 무해 data 리스너 — 스트림을 flowing으로 유지해 이후 프롬프트 입력을 보장한다 */
function ensureStdinAlive(): void {
  if (stdinKeeper) return;
  stdinKeeper = () => {};
  process.stdin.on("data", stdinKeeper);
  process.stdin.resume();
}

/** 프로세스 종료 직전 정리 — flowing 유지용 리스너가 종료를 막지 않게 */
export function releaseStdin(): void {
  if (stdinKeeper) {
    process.stdin.off("data", stdinKeeper);
    stdinKeeper = null;
  }
  process.stdin.pause();
  process.stdin.unref();
}

export function runHomeApp(data: HomeViewData): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false;
    let result: string | null = null;
    // 주의: 여기서 바로 resolve하면 teardown이 끝나기 전에 다음 프롬프트(clack)가
    // 시작되어 입력 파이프라인이 꼬인다. 값만 저장하고 resolve는 teardown 후에.
    const settle = (v: string | null): void => {
      if (!settled) {
        settled = true;
        result = v;
      }
    };

    const App: React.FC = () => {
      const { exit } = useApp();
      const [idx, setIdx] = useState(0);
      const idxRef = useRef(0);
      const move = (delta: number): void => {
        const next = (idxRef.current + delta + data.items.length) % data.items.length;
        idxRef.current = next;
        setIdx(next);
      };

      useInput((input, key) => {
        if (key.escape || input === "q") {
          settle(null);
          exit();
          return;
        }
        if (key.upArrow || input === "k") {
          move(-1);
          return;
        }
        if (key.downArrow || input === "j") {
          move(1);
          return;
        }
        if (key.return) {
          settle(data.items[idxRef.current]?.key ?? null);
          exit();
          return;
        }
      });

      const pad = Math.max(8, ...data.projects.map((p) => p.id.length)) + 3;

      return (
        <Box flexDirection="column" paddingX={1} paddingTop={1}>
          {/* 헤더: 브랜드 + 컨텍스트 (단일 Text — 형제 박스 분할 시 좁은 폭에서 잘림) */}
          <Text>
            <Text color="green" bold>{"▚ "}</Text>
            <Text bold>{data.brand}</Text>
            <Text dimColor>{"   " + data.context}</Text>
          </Text>

          {/* 업데이트 알림 · 새 소식 */}
          {data.whatsNew && (
            <Box flexDirection="column" marginTop={1}>
              <Text color="cyan">{"▲ " + data.whatsNew.title}</Text>
              {data.whatsNew.bullets.map((b, i) => (
                <Text key={i} dimColor>{"  · " + b}</Text>
              ))}
            </Box>
          )}
          {data.updateNotice && (
            <Box marginTop={1}>
              <Text color="yellow">{"▲ " + data.updateNotice}</Text>
            </Box>
          )}

          {/* 최근 활동 */}
          <Box flexDirection="column" marginTop={1}>
            <Text dimColor>{data.heatmapTitle}</Text>
            <Text>{data.heatmap}</Text>
          </Box>

          {/* 과제 현황 */}
          {data.projects.length > 0 && (
            <Box flexDirection="column" marginTop={1}>
              <Text dimColor>{t("과제 현황")}</Text>
              {data.projects.map((p) => (
                <Text key={p.id}>
                  {"  "}
                  {p.id.padEnd(pad)}
                  {p.ok ? <Text color="green">{p.status}</Text> : <Text color="yellow">{p.status}</Text>}
                </Text>
              ))}
            </Box>
          )}

          {/* 메뉴 (그룹) */}
          <Box flexDirection="column" marginTop={1}>
            {data.items.map((it, i) => {
              const active = i === idx;
              return (
                <Box key={it.key} flexDirection="column">
                  {it.section && (
                    <Box marginTop={i === 0 ? 0 : 1}>
                      <Text dimColor>{it.section}</Text>
                    </Box>
                  )}
                  <Text>
                    <Text color="green">{active ? "❯ " : "  "}</Text>
                    <Text {...(active ? { color: "green", bold: true } : {})}>{it.label}</Text>
                    <Text dimColor>{"   " + it.hint}</Text>
                  </Text>
                </Box>
              );
            })}
          </Box>

          <Box marginTop={1}>
            <Text dimColor>{t("↑↓ 이동 · Enter 실행 · q 종료")}</Text>
          </Box>
        </Box>
      );
    };

    const instance = render(<App />, { exitOnCtrlC: true });
    void instance.waitUntilExit().then(async () => {
      instance.unmount();
      if (process.stdin.isTTY) process.stdin.setRawMode?.(false);
      // Ink 이탈 후유증 3종 복구 (계측으로 확인):
      // ① unref → 프롬프트 대기 중 이벤트 루프가 비어 프로세스가 조용히 죽음 → ref 복구
      // ② 'readable' 소비 흔적 → 이후 'data' 리스너가 붙어도 흐름이 재개되지 않아
      //    clack 프롬프트 입력이 영영 죽음 → 상시 무해 리스너 + resume으로 흐름 고정
      // ③ 잔여 입력(엔터 등) → 250ms 흡수로 다음 프롬프트 자동 제출 방지
      process.stdin.ref();
      ensureStdinAlive();
      await new Promise<void>((r) => {
        const swallow = (): void => {};
        process.stdin.on("data", swallow);
        setTimeout(() => {
          process.stdin.off("data", swallow);
          process.stdin.resume(); // Ink의 지연 pause까지 무력화
          r();
        }, 250);
      });
      settle(null);
      resolve(result);
    });
  });
}
