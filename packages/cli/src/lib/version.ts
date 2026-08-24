import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/** 이 CLI의 버전 (package.json) — dist/lib/ 기준 두 단계 위가 패키지 루트 */
export const CLI_VERSION = (require("../../package.json") as { version: string }).version;
