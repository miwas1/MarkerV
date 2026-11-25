# Security Specification — Student Submission Portals

## 1. Data Invariants
1. **Lecturer Ownership**: Every `/submissionLinks/{linkId}` document is created by an authenticated lecturer (`ownerId == request.auth.uid`). Only the owning lecturer can list, update, or delete their portals.
2. **Public Portal Lookup Without Enumeration**: Students can fetch a single portal configuration (`get`) by knowing its unique unguessable `linkId`, but unauthenticated visitors and other lecturers can NEVER `list` `/submissionLinks`.
3. **Zero-Trust Student Dropbox (PII Isolation)**: Every `/submissionLinks/{linkId}/submissions/{submissionId}` document contains student PII (e.g. Full Name, Matric Number, written answers, uploaded files). Students can ONLY `create` a submission when the parent link exists and `isOpen == true`, and must bind `ownerId` to the parent link's exact `ownerId` and `linkId` to the path `{linkId}`. Students and non-owning lecturers can NEVER `get`, `list`, `update`, or `delete` any submission.
4. **Master Gate & Cost-Safe Listing**: Single-document reads and writes on `submissions` verify the parent `submissionLinks/{linkId}` document via `get()`. List queries on `submissions` strictly evaluate `resource.data.ownerId == request.auth.uid` without calling `get()`, preventing O(n) read amplification while blocking cross-tenant reads.
5. **Auto-Mark Integrity (No Client-Forged Marks)**: Student `create` writes can NEVER submit marks, suggestions, or scores regardless of whether `autoMark` is enabled on the parent portal. Every incoming submission MUST have `marks.size() == 0`, `suggestions.size() == 0`, `totalEarned == 0`, `autoMarkEngine == 'none'`, and `autoMarkStatus == (parent.autoMark == true ? 'pending' : 'not_requested')`. Only the authenticated owning lecturer can write `marks`, `suggestions`, `totalEarned`, `autoMarkEngine`, and `autoMarkStatus == 'marked'` via `update`.
6. **Terminal State Locking**: Once a submission reaches `status == 'reviewed'`, further client updates are blocked.
7. **Temporal & Volumetric Integrity**: All `createdAt` / `updatedAt` timestamps must match `request.time`. Every ID matches `^[a-zA-Z0-9_\-]+$` (bounded length), every string has explicit `.size()` bounds, and every array is bounded (`1..12` entries) with element structure validation.

## 2. The "Dirty Dozen" Adversarial Payloads (Must Return PERMISSION_DENIED)
1. **Identity Spoofing on Portal Create**: Authenticated lecturer A creates `/submissionLinks/link_1` with `ownerId: "lecturer_B_uid"`.
2. **Ghost / Shadow Field Injection on Portal Create**: Authenticated lecturer creates `/submissionLinks/link_1` including extra field `isAdmin: true`.
3. **Portal Enumeration (List Scraping)**: Unauthenticated user or Lecturer B calls `list` on `/submissionLinks` without filtering to their own `ownerId`.
4. **Closed Portal Bypass**: Student attempts `create` on `/submissionLinks/closed_link/submissions/sub_1` when parent link has `isOpen: false`.
5. **Orphaned Submission Creation**: Student attempts `create` on `/submissionLinks/nonexistent_link/submissions/sub_1`.
6. **Owner Hijack on Submission Create**: Student submits to Lecturer A's open link with `ownerId: "attacker_uid"` in an attempt to gain read access to submissions.
7. **PII Leak via Submission Get/List**: Unauthenticated student or Lecturer B attempts `get` or `list` on `/submissionLinks/link_1/submissions/sub_1`.
8. **ID Poisoning**: Attacker attempts `create` with a 200-character or special-character document ID (`../admin` or 1.5KB string).
9. **Resource Exhaustion (Oversized String / Array)**: Student sends `combinedAnswer` of 50,000 characters or `fieldValues` with 50 items, or `attachmentImageDataUrl` > 240,000 chars.
10. **Auto-Mark Forgery on Any Link**: Student submits `autoMarkStatus: "marked"`, non-empty `marks`/`suggestions`, `autoMarkEngine != "none"`, or `totalEarned > 0` on either a manual or auto-mark-enabled portal.
11. **Timestamp Forgery / Immutable Field Mutation**: Lecturer updates a portal trying to modify `ownerId` or `createdAt`, or provides a backdated client timestamp for `updatedAt`.
12. **Terminal State Mutation**: Lecturer attempts to update a submission whose existing `status` is already `'reviewed'`.
