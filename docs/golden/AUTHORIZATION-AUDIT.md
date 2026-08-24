# Authorization Audit

Status: ACTIVE CONTINUOUS AUDIT

Authorization is accepted only when Mall/Tenant scope is applied to the data query or mutation. A frontend role check, hidden button, controller decorator, or sibling endpoint is not sufficient evidence.

## Audit dimensions

| Dimension | Required evidence |
|---|---|
| List/read | scoped query plus cross-Mall denial test |
| Mutation | scoped lookup before mutation plus denial test |
| Files/export | record ownership scope before stream/generation |
| Jobs/events | explicit tenant/Mall context and idempotent handling |
| UI | action visibility consistent with backend authority; never treated as security |

Known historical gaps were remediated in CR101 phases, but adjacent domains must be verified against current code before being marked closed. Wave 1 Fitout is presentation-only and does not modify authorization.
