import { describe, expect, it } from "vitest";
import { maskSecret, scanSecrets } from "../src/lib/redact.js";

// GitHub push protection이 리터럴 키 패턴을 차단하므로 런타임에 조립한다 (실제 키 아님)
const FAKE_AWS_KEY = ["AKIA", "IOSFODNN7", "EXAMPL2"].join("");
const FAKE_AWS_SECRET = ["aB3dE6gH9jK2", "mN5pQ8sT1vW4", "yZ7bC0dF3hJ6kM9q"].join("");

function ids(text: string): string[] {
  return scanSecrets(text).map((f) => f.ruleId);
}

describe("scanSecrets — 탐지", () => {
  it("AWS access key", () => {
    expect(ids(`- 배포에 ${FAKE_AWS_KEY} 사용`)).toContain("aws-access-key");
  });

  it("개인키 블록", () => {
    expect(ids("-----BEGIN RSA PRIVATE KEY-----\nabc")).toContain("private-key");
    expect(ids("-----BEGIN OPENSSH PRIVATE KEY-----")).toContain("private-key");
  });

  it("GitHub 토큰 (classic + fine-grained)", () => {
    expect(ids(`token ghp_${"a1B2".repeat(9)}`)).toContain("github-token");
    expect(ids(`github_pat_${"Z9x_".repeat(8)}`)).toContain("github-token");
  });

  it("Anthropic 키는 anthropic으로만 잡힌다 (openai 중복 아님)", () => {
    const found = ids(`sk-ant-api03-${"aB3-".repeat(8)}`);
    expect(found).toContain("anthropic-key");
    expect(found).not.toContain("openai-key");
  });

  it("OpenAI 키", () => {
    expect(ids(`sk-proj-${"Ab1".repeat(12)}`)).toContain("openai-key");
  });

  it("Google · Slack · Stripe · npm · JWT", () => {
    expect(ids(`AIzaSy${"A1b-C".repeat(6)}Abc`)).toContain("google-api-key");
    expect(ids("xoxb-123456789012-abcDEF")).toContain("slack-token");
    expect(ids(`sk_live_${"a1B2".repeat(6)}`)).toContain("stripe-key");
    expect(ids(`npm_${"a1B2c3D4e5F6".repeat(3)}`)).toContain("npm-token");
    expect(ids("eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.abcDEF-ghiJKL_mno")).toContain("jwt");
  });

  it("URL 내 비밀번호", () => {
    expect(ids("postgres://admin:re4l-Passw0rd@db.host/x")).toContain("url-credentials");
  });

  it("컨텍스트형: aws secret · 일반 대입", () => {
    expect(ids(`aws_secret_access_key = "${FAKE_AWS_SECRET}"`)).toContain(
      "aws-secret-key",
    );
    expect(ids(`api_key: "q9RzT3wLm82vKdE1"`)).toContain("generic-assignment");
  });

  it("oln Cloud 토큰", () => {
    expect(ids(`Bearer oln_${"0af9".repeat(12)}`)).toContain("oln-cloud-token");
  });
});

describe("scanSecrets — 오탐 방지", () => {
  it("플레이스홀더는 무시", () => {
    expect(ids('api_key: "YOUR_API_KEY_HERE1"')).toEqual([]);
    expect(ids('token = "xxxxxxxxxxxxxxxxxx"')).toEqual([]);
    expect(ids("password: \"<your-password-here>\"")).toEqual([]);
    expect(ids('secret: "${ENV_SECRET_VALUE}"')).toEqual([]);
  });

  it("일반 노트 텍스트는 통과", () => {
    const note = [
      "## @August 27, 2026",
      "",
      "### Physics server flags",
      "- `--enable-gpu` 플래그로 렌더 파이프라인 안정화 (fps 31→58)",
      "- git rebase 후 sk-learn 모델 재학습, token bucket 리밋 조정",
      "- https://github.com/netropyai/openlabnote/pull/12 리뷰 반영",
    ].join("\n");
    expect(scanSecrets(note)).toEqual([]);
  });

  it("짧은 대입값·경로는 무시", () => {
    expect(ids('secret: "short"')).toEqual([]);
  });
});

describe("결과 형식", () => {
  it("라인 번호와 마스킹", () => {
    const text = `첫 줄\n둘째 줄 ${FAKE_AWS_KEY} 끝`;
    const [f] = scanSecrets(text);
    expect(f?.line).toBe(2);
    expect(f?.masked).toBe("AKIA…MPL2");
    expect(JSON.stringify(f)).not.toContain(FAKE_AWS_KEY);
  });

  it("maskSecret은 원문을 노출하지 않는다", () => {
    expect(maskSecret("supersecretvalue123")).toBe("supe…e123");
    expect(maskSecret("tiny")).toBe("▪▪▪▪");
  });

  it("같은 시크릿 중복 보고 없음", () => {
    const text = FAKE_AWS_KEY;
    expect(scanSecrets(text).length).toBe(1);
  });
});
