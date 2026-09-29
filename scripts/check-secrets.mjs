import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
function listFiles(directory = "") {
  const found = [];
  for (const entry of readdirSync(directory || ".", { withFileTypes: true })) {
    const path = join(directory, entry.name).replaceAll("\\", "/");
    if (entry.isDirectory()) {
      if (
        ![
          ".git",
          "node_modules",
          "dist",
          ".wrangler",
          "private",
          "backups",
          "coverage",
        ].includes(entry.name)
      )
        found.push(...listFiles(path));
    } else if (entry.isFile()) found.push(path);
  }
  return found;
}
const files = existsSync(".git")
  ? execFileSync(
      "git",
      ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
      { encoding: "utf8" },
    )
      .split("\0")
      .filter(Boolean)
  : listFiles();
const publishable = [...new Set(files)].filter(existsSync);
const patterns = [
  /\bre_[A-Za-z0-9_]{20,}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{25,}\b/,
  /\bsk-[A-Za-z0-9_-]{20,}\b/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
];
const brazilianDomain =
  /(?:^|[^a-z0-9.-])(?:[a-z0-9-]+\.)+(?:com|dev|net|org)\.br\b/i;
const email = /\b[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})\b/gi;
const phone = /(?:^|[^\w])\+\d{1,3}[\s().-]*(?:\d[\s().-]*){8,14}(?!\d)/m;
const invalid = [];
for (const file of publishable) {
  if (
    /(?:^|\/)(?:\.env(?:\..*)?|\.dev\.vars(?:\..*)?|wrangler\.jsonc)$/.test(
      file,
    ) &&
    !file.endsWith(".example")
  ) {
    invalid.push(file);
    continue;
  }
  if (
    /\.(png|jpg|woff2?|ico)$/.test(file) ||
    file === "scripts/check-secrets.mjs"
  )
    continue;
  const content = readFileSync(file, "utf8");
  const realEmail = [...content.matchAll(email)].some(
    (match) =>
      !["example.com", "exemplo.com", "ejemplo.com"].includes(
        match[1].toLowerCase(),
      ),
  );
  if (
    patterns.some((pattern) => pattern.test(content)) ||
    brazilianDomain.test(content) ||
    realEmail ||
    phone.test(content)
  )
    invalid.push(file);
}
if (invalid.length) {
  console.error(
    "Potential secrets found. Review these files without printing their values:",
    invalid.join(", "),
  );
  process.exit(1);
}
console.log(
  `Checked ${publishable.length} publishable files: no matching secret patterns. This check complements manual review.`,
);
