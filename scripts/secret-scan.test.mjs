import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';

async function initFixtureRepo() {
  const dir = await mkdtemp(join(tmpdir(), 'secret-scan-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 't@t.com'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 't'], { cwd: dir });
  return dir;
}

async function commitAll(dir) {
  execFileSync('git', ['add', '-A'], { cwd: dir });
  execFileSync('git', ['commit', '-q', '-m', 'test'], { cwd: dir });
}

function runScan(cwd) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [join(process.cwd(), 'scripts/secret-scan.mjs')], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.on('close', (code) => resolve({ code, output }));
  });
}

test('passes on a clean tree', async () => {
  const dir = await initFixtureRepo();
  await writeFile(join(dir, 'README.md'), '# fine\nJWT_SECRET=thiso-leasing-super-secret-jwt-2026\n');
  await commitAll(dir);
  const result = await runScan(dir);
  assert.equal(result.code, 0, result.output);
});

test('fails on the exact filenames that previously leaked real credentials', async () => {
  const dir = await initFixtureRepo();
  await writeFile(join(dir, '.env.uat-server'), 'FOO=bar\n');
  await commitAll(dir);
  const result = await runScan(dir);
  assert.notEqual(result.code, 0);
  assert.match(result.output, /forbidden filename/);
});

test('.env.uat-server.example is exempt from the forbidden-filename check', async () => {
  const dir = await initFixtureRepo();
  await writeFile(join(dir, '.env.uat-server.example'), 'JWT_SECRET=replace-with-a-unique-random-secret\n');
  await commitAll(dir);
  const result = await runScan(dir);
  assert.equal(result.code, 0, result.output);
});

test('fails on a real-looking high-entropy secret assignment', async () => {
  const dir = await initFixtureRepo();
  await writeFile(join(dir, 'config.env'), 'JWT_SECRET=ad8fdd13a6bd3a728120a8deec3167b63d5daa1afd99b26ae1ce03bde0a84e55\n');
  await commitAll(dir);
  const result = await runScan(dir);
  assert.notEqual(result.code, 0);
  assert.match(result.output, /assigned secret-like value/);
});

test('fails on an Anthropic-shaped API key regardless of surrounding key name', async () => {
  const dir = await initFixtureRepo();
  await writeFile(join(dir, 'notes.md'), 'key is sk-ant-api03-pkenAh33USyMZ4alHOwXS2opSVfh5LMxWM70bCkNgQ-s4UQdC\n');
  await commitAll(dir);
  const result = await runScan(dir);
  assert.notEqual(result.code, 0);
  assert.match(result.output, /Anthropic API key/);
});

test('does not flag a documented placeholder value', async () => {
  const dir = await initFixtureRepo();
  await writeFile(join(dir, '.env.example'), 'JWT_SECRET=replace-with-a-unique-random-secret-at-least-32-characters\n');
  await commitAll(dir);
  const result = await runScan(dir);
  assert.equal(result.code, 0, result.output);
});
