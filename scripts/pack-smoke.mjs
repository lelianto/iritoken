import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const rootPackage = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const temp = mkdtempSync(join(tmpdir(), "iritoken-pack-"));
const npmEnv = { ...process.env, npm_config_cache: join(temp, "npm-cache") };

try {
  const packed = JSON.parse(execFileSync("npm", ["pack", "--json"], { cwd: root, encoding: "utf8", env: npmEnv }));
  const filename = packed[0]?.filename;
  assert.equal(typeof filename, "string", "npm pack did not return a tarball name");
  assert.ok(packed[0].size <= 250_000, `tarball is unexpectedly large: ${packed[0].size} bytes`);
  const tarball = join(root, filename);
  const contents = packed[0].files.map((entry) => entry.path);
  for (const required of ["dist/index.js", "dist/index.d.ts", "dist/security.js", "dist/stream.js", "dist/integrations/messages.js", "docs/quality-benchmark.md", "docs/integrations.md", "assets/logo.svg", "CHANGELOG.md", "LICENSE", "README.md", "SECURITY.md"]) {
    assert.ok(contents.includes(required), `tarball is missing ${required}`);
  }
  assert.ok(!contents.some((path) => /^(src|test|benchmark)\//.test(path)));
  assert.ok(!contents.includes("assets/context-optimization.png"));
  assert.ok(!contents.includes("assets/cleaning-pipeline.png"));

  execFileSync("npm", ["init", "-y"], { cwd: temp, stdio: "ignore", env: npmEnv });
  execFileSync("npm", ["install", "--ignore-scripts", tarball], { cwd: temp, stdio: "ignore", env: npmEnv });
  execFileSync(process.execPath, ["--input-type=module", "--eval", 'import { optimize, InputLimitError } from "iritoken"; const r=optimize("\\x1b[31ma\\x1b[0m\\n\\n\\n\\nb"); if (!(r.text === "a\\n\\nb" && InputLimitError)) process.exit(1);'], { cwd: temp });
  execFileSync(process.execPath, ["--input-type=module", "--eval", 'import { createOptimizeTransform, createTerminalOptimizeTransform } from "iritoken/stream"; import { optimizeMessages } from "iritoken/integrations/messages"; if (!(createOptimizeTransform() && createTerminalOptimizeTransform() && optimizeMessages([{role:"tool",content:"ok"}]).messages.length === 1)) process.exit(1);'], { cwd: temp });

  const bin = join(temp, "node_modules", ".bin", "iritoken");
  assert.ok(existsSync(bin));
  assert.equal(execFileSync(bin, ["--version"], { cwd: temp, encoding: "utf8" }).trim(), `iritoken ${rootPackage.version}`);
  const installed = JSON.parse(readFileSync(join(temp, "node_modules", "iritoken", "package.json"), "utf8"));
  assert.equal(installed.version, rootPackage.version, "installed package version does not match source metadata");
  assert.equal(installed.dependencies, undefined, "published package gained runtime dependencies");
  process.stdout.write(`Pack smoke test passed: ${filename}\n`);
  rmSync(tarball, { force: true });
} finally {
  rmSync(temp, { recursive: true, force: true });
}
