import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const lock = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));
const changelog = readFileSync(new URL("../CHANGELOG.md", import.meta.url), "utf8");
const expectedTag = process.env.EXPECTED_TAG || process.env.GITHUB_REF_NAME;
const errors = [];

if (pkg.version !== lock.version || pkg.version !== lock.packages?.[""]?.version) {
  errors.push("package.json and package-lock.json versions differ");
}
if (!changelog.includes(`## ${pkg.version} -`)) {
  errors.push(`CHANGELOG.md has no ${pkg.version} release section`);
}
if (expectedTag && expectedTag !== "main" && expectedTag !== `v${pkg.version}`) {
  errors.push(`tag ${expectedTag} does not match package version ${pkg.version}`);
}
if (errors.length) {
  for (const error of errors) process.stderr.write(`release integrity: ${error}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Release integrity passed: iritoken@${pkg.version} / v${pkg.version}\n`);
}
