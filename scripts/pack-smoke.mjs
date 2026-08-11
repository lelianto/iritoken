import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const temp = mkdtempSync(join(tmpdir(), "tokenslim-pack-"));
const npmEnv = { ...process.env, npm_config_cache: join(temp, "npm-cache") };

try {
  const packed = JSON.parse(execFileSync("npm", ["pack", "--json"], { cwd: root, encoding: "utf8", env: npmEnv }));
  const filename = packed[0]?.filename;
  assert.equal(typeof filename, "string", "npm pack did not return a tarball name");
  const tarball = join(root, filename);
  const contents = packed[0].files.map((entry) => entry.path);
  for (const required of ["dist/index.js", "dist/index.d.ts", "dist/security.js", "docs/quality-benchmark.md", "LICENSE", "README.md", "SECURITY.md"]) {
    assert.ok(contents.includes(required), `tarball is missing ${required}`);
  }
  assert.ok(!contents.some((path) => /^(src|test|benchmark)\//.test(path)));

  execFileSync("npm", ["init", "-y"], { cwd: temp, stdio: "ignore", env: npmEnv });
  execFileSync("npm", ["install", "--ignore-scripts", tarball], { cwd: temp, stdio: "ignore", env: npmEnv });
  execFileSync(process.execPath, ["--input-type=module", "--eval", 'import { optimize, InputLimitError } from "tokenslim"; const r=optimize("a\\n\\n\\n\\nb"); if (!(r.text === "a\\n\\nb" && InputLimitError)) process.exit(1);'], { cwd: temp });

  const bin = join(temp, "node_modules", ".bin", "tokenslim");
  assert.ok(existsSync(bin));
  assert.match(execFileSync(bin, ["--version"], { cwd: temp, encoding: "utf8" }), /^tokenslim 0\.1\.0/);
  const installed = JSON.parse(readFileSync(join(temp, "node_modules", "tokenslim", "package.json"), "utf8"));
  assert.equal(installed.dependencies, undefined, "published package gained runtime dependencies");
  process.stdout.write(`Pack smoke test passed: ${filename}\n`);
  rmSync(tarball, { force: true });
} finally {
  rmSync(temp, { recursive: true, force: true });
}
