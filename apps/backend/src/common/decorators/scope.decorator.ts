import { SetMetadata } from '@nestjs/common';
import { ScopeDeclaration, ScopeType } from '../constants/scope.types';

// CR-101 Phase 1 -- descriptive metadata decorator, modeled directly on this
// codebase's existing @Public()/@Roles() pattern (SetMetadata + Reflector).
//
// PHASE 1/2 STATUS: purely descriptive. No guard reads SCOPE_KEY yet -- applying
// @Scope(...) to a route changes NOTHING about its current runtime authorization
// behavior. See docs/architecture-review/14-CR-101-SCOPE-MODEL.md and
// 17-CR-101-MIGRATION-PLAN.md for what each later phase does with this metadata.
//
// Class-level @Scope(...) sets a controller-wide default; a method-level
// @Scope(...) overrides it for that one route -- identical inheritance semantics
// to @Roles(), read the same way (Reflector.getAllAndOverride, method then class).

export const SCOPE_KEY = 'scope';

export const Scope = (declaration: ScopeDeclaration) => SetMetadata(SCOPE_KEY, declaration);

// Convenience shorthands for the most common declarations, so a typical route
// doesn't need to spell out the full ScopeDeclaration object shape.

export const GlobalScope = (reason: string) =>
  Scope({ type: ScopeType.GLOBAL, globalReason: reason });

export const UserScope = () => Scope({ type: ScopeType.USER_SCOPED });

export const SystemInternalScope = (reason: string) =>
  Scope({ type: ScopeType.SYSTEM_INTERNAL, globalReason: reason });
