import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const src = path.join(root, 'apps', 'frontend', 'src');
const violations = [];

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(absolute) : [absolute];
  });
}

for (const file of walk(src).filter((value) => /\.(tsx|ts)$/.test(value))) {
  const source = fs.readFileSync(file, 'utf8');
  const relative = path.relative(root, file).replaceAll('\\', '/');
  const forbidden = [
    [/\bwindow\.prompt\s*\(/, 'window.prompt'],
    [/\bwindow\.confirm\s*\(/, 'window.confirm'],
    [/(^|[^\w.])confirm\s*\(/m, 'native confirm'],
  ];

  for (const [pattern, label] of forbidden) {
    if (pattern.test(source)) violations.push(`${relative}: uses ${label}`);
  }
}

if (violations.length) {
  console.error('UX static check failed: destructive actions must use accessible application dialogs.');
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log('PASS: no native prompt/confirm interactions remain in frontend source.');
