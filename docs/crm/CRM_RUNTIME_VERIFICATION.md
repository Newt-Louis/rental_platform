# CRM runtime verification runbook

Use only a disposable PostgreSQL database; never production or UAT.

1. Start a uniquely named PostgreSQL container on a random loopback port.
2. Set `DATABASE_URL`/`CR_TEST_DATABASE_URL` only in the invoking process.
3. Apply the full migration chain to an empty database and seed it.
4. Run CRM event/lifecycle unit tests and `test/crm-business-event.e2e-spec.ts`.
5. Verify creation, activity rollback/success, transition retry, follow-up retention, cross-Mall and null-Mall denial, invalid-event rollback, partial timeline, and auto-LOST DRY_RUN.
6. Search runtime status writers; only `lead-lifecycle.service.ts` may update `Lead.status`.
7. Stop the exact disposable container and confirm production/UAT connections were unused.

Verification evidence does not replace required release approval.
