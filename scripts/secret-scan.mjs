// Secret scanning gate (docs/security/SECRET_INCIDENT_REMEDIATION.md).
// Scans every git-tracked file for common secret patterns and for the exact
// filenames that leaked real credentials in commits 07a045c / 4ad127c, so a
// regression (e.g. `git add -f`) is caught before merge/deploy rather than
// after. Deliberately pattern-based, not entropy-based — cheap, dependency-free,
// consistent with the rest of scripts/*.mjs, and good enough to catch the
// shapes of secret this repo has actually leaked (long hex/base64 tokens,
// provider-prefixed API keys, embedded connection-string credentials).

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const root = process.cwd();

function trackedFiles() {
  const out = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' });
  return out.split('\n').filter(Boolean);
}

// Filenames that must never be re-tracked, regardless of content — these are
// the exact paths that leaked real UAT credentials/data. `.example` suffixed
// siblings are the intentional, secret-free replacements and are exempt.
const FORBIDDEN_FILENAMES = [
  /(^|\/)\.env\.uat-server$/,
  /(^|\/)artifacts\/uat-preflight\.env$/,
  /(^|\/)artifacts\/backups\/.*\.dump(\.(json|sha256))?$/,
];

// Content patterns for secret-shaped values. Kept intentionally narrow to
// avoid false positives on legitimate long strings (hashes in lockfiles,
// generated IDs, etc.) — matches only when a secret-sounding key name is
// immediately assigned a long opaque value, or a known provider key prefix
// appears, or a connection string embeds credentials.
// A word-hyphen-word "slug" (all lowercase letters/digits/hyphens, 3+
// hyphens) reads as human-written prose ("thiso-leasing-super-secret-jwt-2026"),
// not a generated secret — real tokens from crypto.randomBytes/uuid/base64
// essentially never come out as pure lowercase-plus-hyphens. Plain Shannon
// entropy doesn't reliably separate these (hex-charset secrets are capped at
// 4 bits/char, which reads *lower* than many wordy placeholders), so this
// shape check is used instead.
function looksLikeWordySlug(value) {
  return /^[a-z0-9]+(-[a-z0-9]+){3,}$/.test(value);
}

const CONTENT_PATTERNS = [
  {
    label: 'assigned secret-like value',
    // KEY = "...16+ opaque chars..." or KEY: "..." in env/js/ts/json/yaml
    pattern: /\b(?:[A-Z0-9_]*(?:SECRET|PASSWORD|API[_-]?KEY|TOKEN|PRIVATE[_-]?KEY)[A-Z0-9_]*)\s*[:=]\s*['"]?([A-Za-z0-9+/_.\-]{16,})['"]?/g,
    allow: (value) =>
      /(replace-with|change-?me|your-|xxx|placeholder|example|dummy|fake|secret-store|process\.env|\$\{)/i.test(value) ||
      looksLikeWordySlug(value),
  },
  {
    label: 'Anthropic API key',
    pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g,
  },
  {
    label: 'AWS access key ID',
    pattern: /\bAKIA[0-9A-Z]{16}\b/g,
  },
  {
    label: 'PEM private key block',
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
  },
  {
    label: 'connection string with embedded credentials',
    pattern: /\b[a-z][a-z0-9+.-]*:\/\/[A-Za-z0-9_.-]+:[^\s@'"]{6,}@/g,
    allow: (value) => /localhost|leasing123|changeme/i.test(value),
  },
];

const BINARY_EXT = new Set(['.png', '.jpg', '.jpeg', '.pdf', '.docx', '.xlsx', '.dump', '.ico', '.woff', '.woff2', '.ttf']);

function scanFile(relativePath) {
  const findings = [];
  for (const pattern of FORBIDDEN_FILENAMES) {
    if (pattern.test(relativePath)) {
      findings.push(`${relativePath}: forbidden filename (previously leaked real credentials — see docs/security/SECRET_INCIDENT_REMEDIATION.md)`);
      return findings; // don't also try to read a binary dump file
    }
  }

  const ext = relativePath.slice(relativePath.lastIndexOf('.'));
  if (BINARY_EXT.has(ext)) return findings;

  let content;
  try {
    content = readFileSync(`${root}/${relativePath}`, 'utf8');
  } catch {
    return findings; // unreadable/binary — skip rather than crash the gate
  }

  for (const { label, pattern, allow } of CONTENT_PATTERNS) {
    for (const match of content.matchAll(pattern)) {
      const value = match[1] ?? match[0];
      if (allow?.(value)) continue;
      const line = content.slice(0, match.index).split('\n').length;
      findings.push(`${relativePath}:${line}: possible ${label}`);
    }
  }
  return findings;
}

const files = trackedFiles();
const findings = files.flatMap(scanFile);

if (findings.length) {
  console.error(`Secret scan failed: ${findings.length} finding(s).`);
  for (const finding of findings) console.error(`- ${finding}`);
  console.error('\nIf this is a false positive, tighten the pattern in scripts/secret-scan.mjs — do not delete the check.');
  process.exit(1);
}

console.log(`PASS: secret scan found no issues across ${files.length} tracked files.`);
