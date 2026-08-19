# 05 — Task Efficiency (Clicks & Complexity)

> Phase 5. Interaction counts traced through actual routes/dialogs, not estimated.
> Targets: Frequent task ≤ 3 steps, Important task ≤ 5 steps, Rare/Admin task can be
> deeper.

## Create a Proposal (frequent, core revenue task)

```text
CURRENT (once the user has discovered where this lives — see FR-02):
Dashboard → Sidebar: Quy trình bán hàng → Booking
  → find/open the right Booking
  → open booking detail → "Convert to Proposal" action
  → fill ConvertToProposalDialog (prefilled, but still a full dialog)
  → submit → redirected to Proposal detail
  → separately click "Submit for approval"

7 interactions, 2 screens, 1 hidden discovery problem (doesn't count toward the
click total but is the dominant real-world cost for a new user)
```

```text
PROPOSED:
Dashboard/My Work → "+ Tạo đề xuất" primary action
  → picks a Booking (or creates one inline if none exists yet, unit+lead
    combined into one step since both are required together)
  → confirm prefilled terms → submit (single action creates proposal AND
    optionally submits for approval as one confirmed step)

3–4 interactions, 1 screen
```
Target: Important task ≤5 — currently exceeds it once discovery cost is included;
proposed meets it.

## Approve a Deal (frequent, executive task)

```text
CURRENT:
Notification bell or Dashboard tile → /approvals
  → find the right pending item in the list
  → open linked Proposal in a new context to see deal terms (FR-04)
  → return to Approvals
  → click Approve/Reject
  → (if reject) provide reason

6 interactions, 2 screens (context switch is the expensive part)
```

```text
PROPOSED:
Dashboard "Needs Attention" → approval card already shows deal context inline
  → Approve/Reject directly from the card (reason modal only on reject)

2–3 interactions, 1 screen
```
Meets the ≤3-step target for a frequent task once FR-04 is fixed.

## Report a Tenant Issue (frequent, tenant-facing task) — already good

```text
CURRENT:
Tenant Portal → "+ Tạo yêu cầu" → fill 5-field dialog → submit

3 interactions, 1 screen — already at target, no change recommended.
```
This confirms the target is achievable in this codebase's own patterns — Tickets
is the proof, not a hypothetical.

## Record a Payment (frequent, finance task)

```text
CURRENT:
Billing → Invoices tab → find invoice → open detail → "Record Payment" →
fill 5-field dialog (amount, method, reference, date, notes; has a
"fill remaining amount" quick-fill) → submit

5 interactions, 1 screen (dialog) — at the edge of the "important task" target,
acceptable given quick-fill already reduces field entry.
```
No change recommended — this one is already efficient; documented as a positive
baseline other finance-adjacent forms (e.g., Parking rate adjustment, which reuses
the same dialog pattern) should keep matching.

## Create a Parking Contract (important, occasional task)

```text
CURRENT:
Parking → "+ Hợp đồng" → single non-tabbed dialog with ~11–17 fields
(base terms + a fee-rate grid) depending on contract type → submit

2 interactions but ~15 fields in one unbroken scroll — clicks are low,
cognitive load is high (README/research confirms this is the single largest
un-tabbed form in the app).
```
```text
PROPOSED: keep at 2 interactions (don't force a wizard for an occasional task
per Phase 11 guidance — "wizard only when it reduces cognitive load"), but group
the fee-rate grid visually as a distinct "Biểu phí" sub-section with a header,
matching the pattern already used in ConvertToProposalDialog's "Phí & Điều khoản
(tuỳ chọn)" section. Field count doesn't need to drop; visual grouping does.
```

## Summary table

| Task | Frequency | Current steps | Target | Current meets target? | Fix cost |
|---|---|---|---|---|---|
| Create Proposal | Frequent | 7 (+discovery cost) | ≤3 | No | Medium — nav entry point + confirm-and-submit combine |
| Approve Deal | Frequent | 6 | ≤3 | No | Low — surface context inline (same fix as FR-04) |
| Report Ticket | Frequent | 3 | ≤3 | **Yes** | None — reference pattern |
| Record Payment | Frequent | 5 | ≤5 (treated as important) | Yes | None |
| Create Parking Contract | Occasional | 2 (high field density) | ≤5 (rare/admin can be deeper) | Yes (clicks); No (density) | Low — visual grouping only |
| Convert Proposal→Contract | Important, high-stakes | 1 click, 0 preview | N/A (efficiency isn't the problem — safety is) | See FR-06 | Add confirmation, accept +1 click for safety |

**Key insight:** this platform's efficiency problem is not "too many clicks" in
general — several core flows are already near target. The actual pattern is
**missing entry points** (Proposal creation) and **missing context at the decision
point** (Approvals), both fixable without adding steps, and in the Approvals case
by *removing* a context-switch rather than adding UI.
