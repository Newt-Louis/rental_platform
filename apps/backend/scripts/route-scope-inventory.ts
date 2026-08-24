// CR-101 Phase 1 -- static route/scope inventory tool.
//
// Statically parses every *.controller.ts file (TypeScript compiler API, no live
// NestJS app bootstrap, no DB/env dependency -- runnable in CI or locally with
// nothing but the source tree) and reports, per route handler: HTTP method,
// path, controller, handler name, declared @Roles, declared @Scope (if any),
// and a coverage `status`.
//
// Usage:  npx ts-node scripts/route-scope-inventory.ts [--json]
//
// Phase 1/2 status: read-only reporting tool. Does not affect application
// startup (main.ts / app.module.ts are untouched and never imported by this
// script) and is not wired into any build/test/CI step yet -- Phase 5
// (docs/architecture-review/17-CR-101-MIGRATION-PLAN.md) is what turns "run this
// manually" into "CI fails the PR if this reports UNDECLARED/UNKNOWN for a
// changed route."

import * as ts from 'typescript';
import * as fs from 'fs';
import * as path from 'path';

type HttpMethodDecorator = 'Get' | 'Post' | 'Patch' | 'Put' | 'Delete';
const HTTP_DECORATORS: HttpMethodDecorator[] = ['Get', 'Post', 'Patch', 'Put', 'Delete'];

type Status = 'DECLARED' | 'UNDECLARED' | 'EXEMPT' | 'UNKNOWN';

interface RouteEntry {
  file: string;
  controller: string;
  handler: string;
  method: string;
  path: string;
  roles: string[] | 'ADMIN-ONLY-CLASS' | null;
  scope: string | null;
  status: Status;
}

function findControllerFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      findControllerFiles(full, acc);
    } else if (entry.name.endsWith('.controller.ts') && !entry.name.endsWith('.spec.ts')) {
      acc.push(full);
    }
  }
  return acc;
}

function decoratorText(node: ts.Node): string {
  return node.getText();
}

function getDecorators(node: ts.HasDecorators): readonly ts.Decorator[] {
  return ts.canHaveDecorators(node) ? ts.getDecorators(node) ?? [] : [];
}

function decoratorName(dec: ts.Decorator): string {
  const expr = dec.expression;
  if (ts.isCallExpression(expr)) {
    return expr.expression.getText();
  }
  return expr.getText();
}

function findHttpDecorator(decs: readonly ts.Decorator[]): { method: HttpMethodDecorator; subPath: string } | null {
  for (const dec of decs) {
    const name = decoratorName(dec);
    if ((HTTP_DECORATORS as string[]).includes(name)) {
      let subPath = '';
      if (ts.isCallExpression(dec.expression) && dec.expression.arguments.length > 0) {
        const arg = dec.expression.arguments[0];
        if (ts.isStringLiteral(arg)) subPath = arg.text;
      }
      return { method: name as HttpMethodDecorator, subPath };
    }
  }
  return null;
}

function findControllerBasePath(decs: readonly ts.Decorator[]): string | null {
  for (const dec of decs) {
    if (decoratorName(dec) === 'Controller') {
      if (ts.isCallExpression(dec.expression) && dec.expression.arguments.length > 0) {
        const arg = dec.expression.arguments[0];
        if (ts.isStringLiteral(arg)) return arg.text;
      }
      return '';
    }
  }
  return null;
}

function findRolesDecorator(decs: readonly ts.Decorator[]): string[] | 'ADMIN-ONLY-CLASS' | null {
  for (const dec of decs) {
    if (decoratorName(dec) === 'Roles' && ts.isCallExpression(dec.expression)) {
      const args = dec.expression.arguments.map((a) => a.getText());
      if (args.length === 1 && args[0].includes('Role.ADMIN') && !args[0].includes('...')) {
        return 'ADMIN-ONLY-CLASS';
      }
      return args;
    }
  }
  return null;
}

function findScopeDecorator(decs: readonly ts.Decorator[]): string | null {
  for (const dec of decs) {
    const name = decoratorName(dec);
    if (name === 'Scope' || name === 'GlobalScope' || name === 'UserScope' || name === 'SystemInternalScope') {
      return decoratorText(dec);
    }
  }
  return null;
}

function hasPublicDecorator(decs: readonly ts.Decorator[]): boolean {
  return decs.some((d) => decoratorName(d) === 'Public');
}

function classifyStatus(scope: string | null, isPublic: boolean): Status {
  if (isPublic) return 'EXEMPT';
  if (scope) {
    if (scope.includes('GLOBAL') || scope.includes('GlobalScope') || scope.includes('SystemInternalScope')) return 'EXEMPT';
    return 'DECLARED';
  }
  return 'UNDECLARED';
}

function scanFile(file: string, entries: RouteEntry[]) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);

  ts.forEachChild(source, (node) => {
    if (!ts.isClassDeclaration(node) || !node.name) return;
    const classDecs = getDecorators(node);
    const basePath = findControllerBasePath(classDecs);
    if (basePath === null) return; // not a @Controller class

    const classRoles = findRolesDecorator(classDecs);
    const classScope = findScopeDecorator(classDecs);
    const classPublic = hasPublicDecorator(classDecs);

    for (const member of node.members) {
      if (!ts.isMethodDeclaration(member) || !member.name) continue;
      const methodDecs = getDecorators(member);
      const http = findHttpDecorator(methodDecs);
      if (!http) continue;

      const methodRoles = findRolesDecorator(methodDecs);
      const methodScope = findScopeDecorator(methodDecs);
      const methodPublic = hasPublicDecorator(methodDecs);

      const roles = methodRoles ?? classRoles;
      const scope = methodScope ?? classScope;
      const isPublic = methodPublic || classPublic;

      const fullPath = ['', basePath, http.subPath].filter(Boolean).join('/').replace(/\/+/g, '/');

      entries.push({
        file: path.relative(process.cwd(), file),
        controller: node.name.text,
        handler: member.name.getText(),
        method: http.method.toUpperCase(),
        path: fullPath || '/',
        roles,
        scope,
        status: classifyStatus(scope, isPublic),
      });
    }
  });
}

function main() {
  const modulesDir = path.join(__dirname, '..', 'src', 'modules');
  const filesDir = path.join(__dirname, '..', 'src', 'files');
  const files = [...findControllerFiles(modulesDir), ...(fs.existsSync(filesDir) ? findControllerFiles(filesDir) : [])];

  const entries: RouteEntry[] = [];
  for (const file of files) scanFile(file, entries);

  const asJson = process.argv.includes('--json');
  if (asJson) {
    console.log(JSON.stringify(entries, null, 2));
    return;
  }

  const byStatus = entries.reduce<Record<Status, number>>(
    (acc, e) => ((acc[e.status] = (acc[e.status] ?? 0) + 1), acc),
    { DECLARED: 0, UNDECLARED: 0, EXEMPT: 0, UNKNOWN: 0 },
  );

  console.log(`Route Scope Inventory -- ${entries.length} routes across ${files.length} controller files\n`);
  console.log(`  DECLARED:   ${byStatus.DECLARED}`);
  console.log(`  EXEMPT:     ${byStatus.EXEMPT}`);
  console.log(`  UNDECLARED: ${byStatus.UNDECLARED}`);
  console.log(`  UNKNOWN:    ${byStatus.UNKNOWN}\n`);

  const undeclared = entries.filter((e) => e.status === 'UNDECLARED');
  if (undeclared.length) {
    console.log(`UNDECLARED routes (no @Scope, no @Public) -- ${undeclared.length}:`);
    for (const e of undeclared) {
      console.log(`  ${e.method.padEnd(6)} ${e.path.padEnd(45)} ${e.controller}.${e.handler} (${e.file})`);
    }
  }
}

main();
