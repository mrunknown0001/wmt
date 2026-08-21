# WMT — QA Audit Report

**Application:** WMT (Work Management Tool) — wmt.bfcgroup.ph
**Audit date:** 2026-08-21
**Auditor:** Claude Code (software-test skill)
**Environments inspected:** local (Podman), staging (10.10.0.101, Docker), production (178.128.20.226, bare-metal)

---

## 1. Executive Summary

This audit combined static inspection with live testing against all three environments,
including reproduction of reported defects against real production data. Findings are
evidence-backed; anything not reproduced is labelled as such rather than asserted.

The application's **authorization layer is in good shape** — IDOR probes against
notifications, AI conversations and personal to-dos all found correct owner scoping, and
`parent_id` on tasks is properly project-scoped. The defects that matter cluster in two
places instead: **operational configuration** (things silently not running or not
delivering) and a **single class of validation gap** where a foreign key is checked for
existence but not for ownership.

The most serious finding is not a code bug: **production has never delivered an email**,
and every message it would have sent has been written to a log file that never rotates.

### Findings

| Severity | Count |
|---|---|
| Critical | 2 |
| High | 4 |
| Medium | 5 |
| Low | 3 |
| Enhancement | 4 |

| Confidence | Count |
|---|---|
| Confirmed | 11 |
| Likely | 2 |
| Potential | 2 |
| Recommendation | 3 |

**Automated tests:** 511 passed, 0 failed (33 files, 476 → 511 methods).

---

## 2. Architecture

Verified from `composer.json`, `package.json` and live inspection — not assumed from config.

```
Laravel        : ^13.8            PHP           : ^8.3 (8.4.24 in prod)
React          : ^19.2.7          Inertia       : ^3.1 server / ^3.4 client
Database       : MySQL 8.0        Redis         : cache, session, queue
Queue          : redis (wmt-queue.service on prod; container on staging)
Broadcasting   : pusher protocol via soketi
Realtime client: laravel-echo ^2.3.7 + pusher-js ^8.5.0
Push           : Firebase Cloud Messaging (firebase ^12.15.0 + FcmService)
Auth           : session (web) + Sanctum ^4.3 (API)
Authorization  : spatie/laravel-permission ^8.0 + 11 policies
Export         : phpoffice/phpspreadsheet ^5.8
Backup         : spatie/laravel-backup (local + Google Drive)
```

**Volume:** 86 controllers · 58 models · 11 policies · 31 services · 9 events ·
18 notifications · 106 migrations · 211 web routes · 104 API routes · 3 broadcast channels.

**Note:** `app/Jobs/` does not exist. All asynchronous work is queued *notifications*, not
jobs. This matters for §10 — there is no `$tries`/`$backoff`/`failed()` surface to audit.

---

## 3. Testing Coverage

| Area | Tested | Result |
|---|---|---|
| Authentication | Yes | PASS |
| Authorization / IDOR | Yes | PASS |
| Validation | Yes | **FAIL** (QA-001) |
| Approval workflow | Yes | PASS |
| Task recurrence | Yes | PASS (reported defect not reproduced) |
| Realtime (Echo/soketi) | Yes | PASS (infra), **WARNING** (coverage gaps) |
| Queue | Yes | PASS |
| Scheduled tasks | Yes | **FAIL** (QA-003, now fixed) |
| Email delivery | Yes | **FAIL** (QA-002) |
| Backups | Yes | **FAIL** (QA-004, QA-005 — both fixed) |
| File uploads / storage | Yes | PASS (fixed earlier this session) |
| Export | Yes | WARNING (QA-010) |
| FCM | Yes | PASS |
| Logging / PII | Yes | **FAIL** (QA-006, QA-007) |
| Performance | Partial | WARNING (QA-012, QA-013) |

---

## 4. Critical Findings

### QA-001 — A task can be filed into another project's section

**Severity:** CRITICAL · **Confidence:** CONFIRMED · **Category:** Data integrity / cross-tenant

**Location:** `app/Http/Requests/PatchTaskRequest.php:38`,
`app/Http/Requests/StoreTaskRequest.php:58`, `app/Http/Requests/UpdateTaskRequest.php:63`

**Reproduction**
1. Create project A and project B.
2. Create a section in project B.
3. Create a task in project A.
4. `PATCH /projects/{A}/tasks/{task}/patch` with `section_id` = project B's section id.

**Expected:** rejected (422) — a section belongs to exactly one project.
**Actual:** HTTP **200**; the task is filed into the foreign section.

```
http_status                 => 200
task_project                => 1
section_belongs_to_project  => 2
task_section_id_after       => 1      (the foreign section)
accepted_foreign_section    => true
```

**Root cause:** all three task Form Requests validate `section_id` with
`exists:task_sections,id` — existence only, never ownership. No controller re-checks it.

That this is an oversight rather than a design choice is established by two comparisons in
the same codebase:
- `parent_id` **is** scoped — `TaskController.php:66` does
  `->where('project_id', $project->id)`.
- The approval module **is** scoped — `ApprovalItemController.php:179,338` reject a section
  that does not belong to the project.

**Business impact:** a task can disappear from its own board into another project's
grouping. Board/list grouping, filtering, section-scoped automation and section-based
reporting all key off `section_id`. Because sections carry project context, this leaks a
project's structure into another project's data.

**Technical impact:** breaks the implicit invariant `task.project_id ==
task.section.project_id`, which grouping code relies on without checking.

**Recommended fix**
```php
'section_id' => ['sometimes', 'nullable',
    Rule::exists('task_sections', 'id')->where('project_id', $this->route('project')->id)],
```
Apply to all three requests. Consider a DB-level composite guard as defence in depth.

**Affected files:** the three Form Requests; `TaskController::patchField/store/update`;
`Api\TaskController`; `StandaloneTaskController`.

**Regression risks:** board grouping, list section rows, `SectionRouter`, section-scoped
automation conditions, project duplication, exports.

**Recommended test** (fails today, passes after the fix):
```php
public function test_a_task_cannot_be_filed_into_another_projects_section(): void
{
    Permission::findOrCreate('manage-tasks');
    $user = User::factory()->create(); $user->givePermissionTo('manage-tasks');
    $mine = Project::factory()->create(); $theirs = Project::factory()->create();
    $task = Task::factory()->create(['project_id' => $mine->id, 'status' => 'to_do']);
    $foreign = TaskSection::create(['project_id' => $theirs->id, 'name' => 'X', 'position' => 0]);

    $this->actingAs($user)
        ->patchJson("/projects/{$mine->id}/tasks/{$task->id}/patch", ['section_id' => $foreign->id])
        ->assertStatus(422);

    $this->assertNull($task->fresh()->section_id);
}
```

**Acceptance criteria:** a foreign `section_id` is refused on store, update and patch;
a same-project section still works; existing task/section tests pass.

---

### QA-002 — Production has never delivered an email

**Severity:** CRITICAL · **Confidence:** CONFIRMED · **Category:** Configuration / data exposure

**Location:** production `.env` — `MAIL_MAILER=log` (staging identical)

**Evidence**
```
MAIL_MAILER=log
"To:" headers in storage/logs/laravel.log : 93
distinct recipients                       : 12   (incl. external @gmail.com)
```

`log` is not a delivery driver. Laravel renders each message and writes the whole thing —
headers and body — into `laravel.log` instead of sending it.

**Business impact:** no user has ever received a task assignment, mention, due reminder,
overdue notice or escalation from production. The escalation ladder, the reminder
schedule and the approval notifications are all effectively inert by email.
Spatie's *backup failure* notifications go the same way (see QA-004), so the system
cannot report its own failures.

**Technical impact:** 93 complete emails — recipients, task titles, comment text — sitting
in a plaintext file that never rotates (QA-007). This is a larger PII exposure than QA-006.

**Recommended fix**
1. Configure a real mailer, or set a deliberate `MAIL_ENABLED=false` flag gating the mail
   channel in `ChecksEmailPreference::channelsFor()` so "off" means *not rendered* rather
   than *written to disk*.
2. Scrub the rendered mail already in the log.
3. Re-check that escalation and approval notifications arrive.

**Acceptance criteria:** a test notification is received by a real mailbox, or email is
explicitly disabled and nothing is written to the log.

---

## 5. High Priority Findings

### QA-003 — The Laravel scheduler was never installed on production *(FIXED this session)*

**Severity:** HIGH · **Confidence:** CONFIRMED · **Category:** Configuration

**Evidence (before fix)**
```
root crontab            : none (exit 1)
www-data crontab        : none (exit 1)
artisan cron anywhere   : none
systemd timers          : none
systemd services        : wmt-queue.service only
```

Nothing ran `php artisan schedule:run`, so every scheduled command had never executed:
`automation:run-scheduled`, `tasks:send-reminders` (escalations, due-soon, overdue),
`tasks:process-delegations`, `approvals:check-deadlines`, `backup:run`, `backup:clean`,
`attachments:purge`, `trash:purge`.

This was the single root cause behind two separately-reported symptoms — "time-triggered
automation not working" and "escalation notifications not working". Neither feature was
defective; nothing was calling them.

**Fix applied:** `* * * * *` cron installed for `www-data`. Verified firing.
Before enabling, the level-4 escalation backlog (12 tasks, up to 80 days overdue) was
flattened so executives were not sent a burst for work nobody had been warned about.

**Residual risk:** the cron redirects to `/dev/null`, so failures remain invisible.
Combined with QA-002 this is two independent silences over the same failures.

---

### QA-004 — `backup:run` produced no backup for its entire life *(FIXED this session)*

**Severity:** HIGH · **Confidence:** CONFIRMED · **Category:** Data protection

**Location:** production `.env` — `BACKUP_ARCHIVE_PASSWORD=`

**Evidence**
```
Dumping database wmt...                             ✓
Zipping 1 files and directories...
Backup failed because: ZipArchive::close(): Invalid argument.
```

**Root cause:** `.env` had the key present with **no value**. `env()` returns `''`, not
`null`. `vendor/spatie/laravel-backup/src/Tasks/Backup/Zip.php:25` tests
`if ($password !== null)`, so an empty string **enables** encryption; libzip then refuses
to encrypt with an empty password and fails at `close()` with a message that names neither
encryption nor the password. The config comment says *"Set to `null` to disable
encryption"* — and a blank `.env` line looks exactly like that.

This is **not** the compression-pairing trap already guarded by
`tests/Feature/BackupZipConfigTest.php`; that pairing was valid (`CM_DEFLATE` + level 9).
Same symptom, different cause — which is why the existing guard did not catch it.

**Fix applied:** line commented out, config cache rebuilt, backup verified:
`db-dumps/mysql-wmt.sql`, 1,084,568 bytes, inside a structurally valid archive.

**Recommendation:** extend `BackupZipConfigTest` to fail on a non-null-but-empty password.

---

### QA-005 — Offsite backup destination silently failing *(FIXED this session)*

**Severity:** HIGH · **Confidence:** CONFIRMED · **Category:** Data protection

**Evidence**
```
Copying zip to disk named local...   Successfully copied
Could not connect to disk google: UnableToReadFile: Unable to read file
  from location: WMT. File not found
```

**Root cause:** the `google` disk is rooted at `Backup/WMT`; Spatie writes into a
`{backup.name}` subfolder (`WMT`) which **had never been created**. Spatie lists the
destination before copying, and `masbug/flysystem-google-drive-ext` throws on a missing
directory instead of returning an empty list. Credentials were never at fault —
`backup:check-token` reported valid throughout, and a write probe to the disk root
succeeded.

**Aggravating factor:** `backup:run` exits 0 if *any* destination succeeds, so it printed
"Backup completed!" while the offsite copy failed. With the cron redirecting to
`/dev/null`, this could have persisted indefinitely.

**Fix applied:** destination folder created; verified by downloading the archive back from
Drive and opening it — `db-dumps/mysql-wmt.sql`, 1,084,568 bytes.

**Recommendation:** a check asserting a *recent* file exists on the `google` disk, not just
that the command exited 0. `VerifyGoogleDriveBackup` already exists and may be intended
for this.

---

### QA-006 — Credentials published to a public Git repository

**Severity:** HIGH · **Confidence:** CONFIRMED · **Category:** Secrets exposure

**Location:** commit `541a0f0`, `origin/dev-v4`, `github.com/mrunknown0001/wmt` (public)

`.env.podman` was committed containing `APP_KEY`, `DB_PASSWORD`, `DB_ROOT_PASSWORD`,
`REDIS_PASSWORD` and `PUSHER_APP_SECRET`. `.gitignore` covered only `.env`,
`.env.backup` and `.env.production`, so any new per-environment file was tracked by default.

**Blast radius:** local-development credentials only — that MySQL binds to `localhost:13306`
and soketi never leaves the compose network. **Production and staging credentials are not
affected**; they hold their own `.env` outside the repository.

**Partial fix applied:** `19d841a` untracks the file and ignores `.env.*` with the three
templates as exceptions. **The values remain in history** and are still fetchable.

**Recommended fix:** rotate the local `APP_KEY` (cheap and complete — makes the published
value worthless), then decide separately on a history rewrite, which requires a force-push
to a public branch. Check whether `dev`, `dev-v2`, `dev-v3` or `master` also contain it.

---

## 6. Medium Priority Findings

### QA-007 — Application log never rotates and holds PII

**Severity:** MEDIUM · **Confidence:** CONFIRMED · **Category:** Data retention

`LOG_STACK=single` on production: one file, growing indefinitely, nothing ages out.
It currently holds 93 rendered emails (QA-002) and, until fixed this session, 32 lines
recording submitters' addresses from a public form.

**Fix:** `LOG_STACK=daily` plus a retention setting; scrub existing PII.

---

### QA-008 — Broadcast auth can take down all realtime on an unseeded database

**Severity:** MEDIUM · **Confidence:** LIKELY · **Category:** Configuration fragility

**Location:** `routes/channels.php:12,18`

```php
return $project && $user->hasPermissionTo('view-projects');
```

`hasPermissionTo()` **throws** `PermissionDoesNotExist` when the permission row is missing —
it does not return false. On a fresh or partially-seeded database `/broadcasting/auth`
returns 500, no private channel subscribes, and **all realtime stops** with nothing visible
in the UI.

Production is currently seeded correctly (verified: `view-projects`, `view-tasks`,
`manage-projects` all exist), so this is latent rather than active — hence LIKELY.

The codebase already recognises the hazard: `ApprovalProjectPolicy` was changed to `can()`
for exactly this reason, with a comment explaining it. `channels.php` was not.

**Fix:** `$user->can('view-projects')`. Two lines.

---

### QA-009 — Realtime coverage gaps: two controllers broadcast nothing

**Severity:** MEDIUM · **Confidence:** CONFIRMED · **Category:** Realtime

| Controller | Methods | Broadcasts |
|---|---|---|
| `TaskSectionController` | 4 | 0 → **fixed this session** |
| `StandaloneTaskController` | 7 | **0** |

Standalone (non-project) task changes still notify nobody. Unlike sections, these have no
shared channel today — a per-user channel would be needed, so this is a design task, not a
copy of the section fix.

Separately, **every** broadcast uses `->toOthers()`. That is correct, but means testing
realtime in a single browser tab always looks broken. Worth documenting for QA.

---

### QA-010 — Export failures are invisible to the user *(FIXED this session)*

**Severity:** MEDIUM · **Confidence:** CONFIRMED · **Category:** Error handling / UX

The Export button used `window.location.href = …`, handing the request to the browser and
giving the application no callback and no status. A server error therefore produced a
button that appeared to do nothing — no download, no dialog, no message.

**Reported as** a 503 on every project. **Investigation found** the origin returned **200
with real XLSX payloads** for those exact requests (10,297 / 7,045 bytes), from Cloudflare
client IPs — so the 503 originated at the edge, not the application. The *reported*
symptom (silent no-op) was real and is now fixed; the 503's origin is **unresolved** and
sits outside the application.

**Fix applied:** fetched instead of navigated; failures raise the page's existing toast
naming the status code, 419 is reported as an expired session, and the button shows
progress.

**Residual risk:** production `memory_limit` is **128M** with `max_execution_time 30`.
A 29-task project produces ~10 KB; a few thousand tasks would exhaust either. If the 503
recurs, this is the first place to look.

---

### QA-011 — View tabs left sub-panels on screen *(FIXED this session)*

**Severity:** MEDIUM · **Confidence:** CONFIRMED · **Category:** Frontend state

Clicking List/Board/Calendar/Gantt/Dashboard while the Custom Fields or Automation panel
was open highlighted the tab and appeared to do nothing; a reload was required.

**Reported as** a routing bug. **Actually** neither is a route — both are panels inside the
project page toggled by local state, rendering *above* the view content rather than in
place of it. The tab click worked; the panel simply stayed on top.

This also explains why the reporter's Forms attempt was inconclusive: **Forms is a real
Inertia route**, so it never had the problem.

**Fix applied:** the five tabs and `drillDown` now close both panels. Custom Fields is
hidden rather than unmounted, preserving `cfManagerRef`.

---

## 7. Low Priority Findings

### QA-012 — Unbounded task payload on the project page
**Severity:** LOW · **Confidence:** POTENTIAL · **Category:** Performance

`ProjectController::show` loads **every** task in the project with `withCount`/`withSum`
and subtasks, unpaginated, into a 5,100-line React page which computes all five view modes
client-side. Eager loading is correct (no N+1), but the payload is unbounded. Largest
production project is currently ~54 tasks, so this is not yet a live problem — hence
POTENTIAL. It will not scale to a few thousand.

### QA-013 — In-memory pagination in the approver inbox
**Severity:** LOW · **Confidence:** POTENTIAL · **Category:** Performance

`MyApprovalsController::index` runs three unbounded `->get()` calls, merges them, then
paginates the collection in PHP and filters search with `str_contains`. Correct at current
volume; degrades linearly with approval history.

### QA-014 — Escalation skips rungs, and a vacant rung is recorded as done
**Severity:** LOW · **Confidence:** CONFIRMED · **Category:** Business logic

Escalation levels only ever climb, so a task discovered 5+ days late jumps straight to
level 2 — the assignee (level 1) is never told. If that rung's audience is vacant (assignee
with no team/department, on a project they own — the owner is excluded from their own
escalation), the escalation reaches nobody, and the level is still recorded so it never
retries. Reproduced on staging.

Partially mitigated this session: the count is now honest (0, not 1) and a
`Task escalation reached nobody` warning is logged. **The rung-skipping behaviour is
unchanged** and is a deliberate design decision awaiting a product call.

---

## 8. Security Findings

| Area | Result |
|---|---|
| Authentication | PASS — inactive users blocked at login; Sanctum for API |
| IDOR — notifications | PASS — all actions scoped via `$request->user()->notifications()` |
| IDOR — AI conversations | PASS — explicit `user_id` ownership check on show/destroy/sendMessage |
| IDOR — personal to-dos | PASS — explicit ownership check on update/destroy/reorder |
| IDOR — activity log | PASS — `hasRole('admin')` inside the controller |
| Mass assignment | PASS — no `update($request->all())` found in controllers |
| **Cross-project FK** | **FAIL — QA-001** |
| File upload / download | PASS — private disk + authorizing route (fixed earlier this session) |
| Secrets in VCS | **FAIL — QA-006** |
| PII in logs | **FAIL — QA-002, QA-007** |
| Rate limiting | PASS — `throttle:10,1` on both public form endpoints |
| User enumeration | Fixed this session — public form failure messages merged |
| SSH (infrastructure) | **WARNING** — `sshd` on the public production host still accepts password authentication |

---

## 9. Database Findings

**Good:** series-number generation is concurrency-safe — `Project::claimNextSeries` and
`ApprovalProject::claimNextSeries` both use `DB::transaction` + `lockForUpdate` +
`saveQuietly`. `approval_item_shares` has a proper composite unique index. Attachment
models correctly use typed value columns.

**Concerns:**
- **QA-001** — no ownership constraint between `tasks.section_id` and `tasks.project_id`.
- `settings.escalation_tiers` stores **strings**, not integers:
  `[{"days":"1","enabled":"1"}, …]`. Comparisons are loose (`>=`, `!empty`) so it works
  today, but tightening any of them to `===` would silently disable escalation. LOW /
  RECOMMENDATION.
- Approval workflow transactions and row locking were added this session
  (`ApprovalWorkflowEngine::withLockedItem`); previously `advance()` had neither, allowing
  two concurrent approvers to both progress a chain.

---

## 10. Queue / Redis Findings

`app/Jobs/` does not exist — all async work is queued **notifications**. There is therefore
no `$tries`/`$backoff`/`failed()` surface, and no idempotency layer to audit.

- `failed_jobs`: **0** on production and staging.
- Queue worker healthy on both (`wmt-queue.service`; container on staging).
- **Idempotency:** notifications are not idempotent. A retry would re-send. Not currently
  causing duplicates (`failed_jobs` empty), so RECOMMENDATION rather than a finding.
- `TaskUpdated` is `ShouldBroadcastNow`, so realtime does not depend on the queue —
  verified end-to-end with a WebSocket client on both staging and production.
- Cache invalidation: `Setting::current()` is `rememberForever` with an explicit
  `Setting::clearCache()` on update. Correct, but easy to miss in tests — it caught this
  auditor out once.

---

## 11. Realtime Findings

Infrastructure verified working on **both** environments with a real WebSocket client
(subscribe → publish → receive):

```
staging     SUBSCRIBED private-project.1 → EVENT RECEIVED task.updated
production  publish ok; nginx→soketi upgrade returns 101
local       PATCH via controller → EVENT RECEIVED task.updated
```

- `/broadcasting/auth` returns 200 with a valid signature.
- Channel authorization is enforced server-side (`routes/channels.php`).
- **QA-008** — `hasPermissionTo()` in channel callbacks is a latent single point of failure.
- **QA-009** — `StandaloneTaskController` broadcasts nothing.
- Note: `TaskUpdated` is dispatched **only from controllers**, never the model layer. Any
  model-level write (observer, tinker, service) bypasses realtime. This bit the auditor
  during testing and produced a false "realtime is broken" reading; it also caused a real
  gap in `TaskCompletionService`, fixed this session.

---

## 12. FCM Findings

**PASS.** `FcmService` correctly removes dead tokens:

```php
if ($response->status() === 404 || $response->status() === 400) {
    if (in_array($error, ['UNREGISTERED', 'INVALID_ARGUMENT'])) {
        DeviceToken::where('token', $token)->delete();
```

Production logs show `FCM v1 send success` for multiple tokens per user (multi-device
working). Deep-link URLs are present in notification payloads. No duplicate-send evidence.

---

## 13. Frontend Findings

- **QA-011** — view tabs vs sub-panels (fixed).
- **QA-010** — export gave no feedback on failure (fixed).
- Three separate notification renderers (`Inbox/Index.jsx`, `NotificationBell.jsx`,
  `NotificationToast.jsx`) each carried their own `switch (data.type)` with a
  `'New notification'` default, and had drifted apart: the inbox was missing 7 types, the
  bell 3, and the toast **14** — every approval notification appeared there as
  "New notification". Fixed this session, but **the structural risk remains**: nothing fails
  when a new type is added to only one of the three. See ENH-002.
- `Projects/Show.jsx` is **5,100+ lines** with 79 hooks and 27 inline components. Every
  frontend defect in this report and the user's own report lives in that one file.
  See ENH-001.
- A display-only default (`value={x ?? 9}` never written to state) caused scheduled
  automation rules to save with no time at all — fixed this session. Worth grepping for
  the same pattern elsewhere.

---

## 14. Performance Findings

- **QA-012 / QA-013** — unbounded payload and in-memory pagination (both POTENTIAL).
- Production `memory_limit=128M`, `max_execution_time=30` — relevant to export (QA-010).
- No N+1 found in the paths inspected; `ProjectController::show` and `ExportController`
  both eager-load correctly, including `customFieldValues.selectedOption`.
- The scheduler now runs `automation:run-scheduled` **every minute** (required for
  minute-precision triggers). A non-matching run costs one indexed query; the task sweep
  only happens on the matching minute. Acceptable, but it is 1,440 boots/day.

---

## 15. UX Findings

- Silent failures were the dominant theme of this audit: export, escalation, automation,
  backups and email all failed without telling anyone. Several are now surfaced.
- Escalation rung-skipping (QA-014) means the person best placed to act — the assignee —
  is often never told.
- Calendar and Gantt read only the built-in `due_date`, not custom date fields. **Working
  as designed**, but a documented setup trap: a schedule built on a custom date field
  yields empty views with no explanation. RECOMMENDATION — training material, not code.

---

## 16. Test Gaps

511 tests pass, but coverage is uneven:

| Module | Test files |
|---|---|
| Task | 7 |
| Project | 5 |
| User | 4 |
| Approval | 3 |
| Automation | 2 |
| Report | 2 |
| Escalation, Notification, Calendar | 1 each |
| **Attachments** | **0** |
| **Folders** | **0** |

Untested services of note: `FolderService`, `ApprovalApproverResolver`,
`ApprovalChainVersioningService`, `SectionRouter`, `UserHandover`.

**No CI exists** — `.github/` is absent. During this session the suite caught a broken
cascade guard, an invalid test assumption and a self-inflicted regression. Nothing runs it
automatically.

---

## 17. Recommended Fix Order

**Phase 1 — Immediate**
1. QA-001 — scope `section_id` to the project (3 Form Requests + regression test).
2. QA-002 — configure a real mailer or an explicit off switch; scrub rendered mail.

**Phase 2 — High**
3. QA-006 — rotate the local `APP_KEY`; decide on history rewrite.
4. QA-008 — `hasPermissionTo` → `can` in `channels.php`.
5. QA-007 — `LOG_STACK=daily` + retention.
6. Verify tonight's first real `backup:run` / `backup:clean` (QA-004/005 fixes).

**Phase 3 — Stability**
7. QA-009 — realtime for standalone tasks.
8. QA-014 — product decision on escalation rung-skipping.
9. Add CI running `vendor/bin/phpunit`.
10. Attachment and folder test coverage.

**Phase 4 — Enhancements**
11. ENH-001 … ENH-004 below.

---

## 18. Claude Implementation Queue

### TASK-001 — CRITICAL — Scope `section_id` to its project

**Problem:** `exists:task_sections,id` checks existence, not ownership; a task can be filed
into another project's section (HTTP 200, reproduced).

**Required changes**
1. In `StoreTaskRequest`, `UpdateTaskRequest`, `PatchTaskRequest`, replace the rule with a
   `Rule::exists(...)->where('project_id', …)` scoped to the route's project.
2. Handle the standalone-task path, where there is no route project.
3. Confirm `Api\TaskController` and `StandaloneTaskController` share the same requests.
4. Add the regression test in §4.
5. Consider a data audit for existing mismatched rows.

**Files:** `app/Http/Requests/{Store,Update,Patch}TaskRequest.php`,
`app/Http/Controllers/TaskController.php`, `app/Http/Controllers/Api/TaskController.php`,
`app/Http/Controllers/StandaloneTaskController.php`, `tests/Feature/`.

**Acceptance criteria:** foreign `section_id` refused (422) on store/update/patch;
same-project sections unaffected; standalone tasks unaffected; full suite green.

---

### TASK-002 — CRITICAL — Make email delivery real or explicitly off

**Problem:** `MAIL_MAILER=log`; 93 rendered emails to 12 recipients sit in a non-rotating log.

**Required changes**
1. Configure a real mailer, **or** add `MAIL_ENABLED` gating the mail channel in
   `app/Notifications/Concerns/ChecksEmailPreference.php` so "off" renders nothing.
2. Scrub rendered mail from `storage/logs/laravel.log`.
3. Set `LOG_STACK=daily` with retention (TASK-005).
4. Verify an escalation email actually arrives.

**Files:** `.env` (prod/staging), `config/mail.php`,
`app/Notifications/Concerns/ChecksEmailPreference.php`.

**Acceptance criteria:** either a real mailbox receives a test notification, or nothing is
written to the log when disabled; no `To:` headers remain in the log.

---

### TASK-003 — HIGH — Rotate the exposed local `APP_KEY`

**Required changes:** regenerate `APP_KEY` in `.env.podman`; restart the local stack;
audit `dev`, `dev-v2`, `dev-v3`, `master` for the same file; decide on history rewrite
(force-push to a public branch — needs explicit owner approval).

**Acceptance criteria:** published key no longer valid anywhere; no `.env.*` tracked.

---

### TASK-004 — MEDIUM — Harden broadcast channel authorization

**Required changes:** `routes/channels.php:12,18` — `hasPermissionTo()` → `can()`.
Add a test asserting `/broadcasting/auth` returns 403 (not 500) when the permission row is
absent.

**Acceptance criteria:** a missing permission denies the channel instead of 500-ing;
realtime unaffected when seeded.

---

### TASK-005 — MEDIUM — Log rotation and retention

**Required changes:** `LOG_STACK=daily`, set `LOG_DAILY_DAYS`; confirm the scheduler's
`/dev/null` redirect is still wanted now that failures can be seen.

---

### ENH-001 — Decompose `Projects/Show.jsx`

5,100+ lines, 79 hooks, 27 inline components. Every frontend defect found in this audit and
in the user's own report lives in this file. Extract the five view modes and the panels.

### ENH-002 — One notification-message module

Three renderers each own a copy of the same `switch`, and they had drifted by 7, 3 and 14
types respectively. A shared module — the way `columnPrefs.js` and `taskCompletion.js`
already work — makes the next omission structurally impossible.

### ENH-003 — Assert backups exist, not just that the command exited 0

`backup:run` returns success if *any* destination succeeds. Add a check that a **recent**
archive exists on the `google` disk. `VerifyGoogleDriveBackup` may already be intended for
this.

### ENH-004 — CI

No `.github/`. A workflow running `vendor/bin/phpunit` on push would have caught several
defects found manually during this session.

---

## CLAUDE IMPLEMENTATION INSTRUCTIONS

The next session should:

1. Read this report in full before changing anything.
2. Fix **TASK-001** first — it is the only confirmed code-level data-integrity defect.
3. Then **TASK-002**; note it is largely configuration, and the log scrub is a production
   write requiring owner approval.
4. Then TASK-003 → TASK-005.
5. Do not modify unrelated functionality.
6. Preserve existing business rules — in particular: escalation levels only climb, a
   defaulted custom field resets rather than carries on recurrence, and approval decisions
   are never granted to administrators by role.
7. Add a regression test for every confirmed bug fixed.
8. Run `vendor/bin/phpunit` before and after; the baseline is **511 passing**.
9. Deploy staging first, verify, then production through `./deploy-production.sh`.
10. Do not mark an issue fixed unless its acceptance criteria are met.

**Environment notes for the implementer**
- Production is bare-metal at `/var/www/wmt`, tracks the `production` branch, deploys via
  `sudo ./deploy-production.sh` (which runs `composer install`, `npm ci`, `migrate`,
  `optimize`, `queue:restart`).
- `php artisan config:clear` is mandatory before running tests in a container — a cached
  config overrides `phpunit.xml`'s `DB_CONNECTION=sqlite` and would point the suite at a
  live MySQL.
- `php artisan test` misreports results in these containers (`HOME` is not writable);
  use `vendor/bin/phpunit`.

---

## 19. Final Summary

```
Total Issues:     14 findings + 4 enhancements
Critical:         2
High:             4
Medium:           5
Low:              3
Enhancements:     4

Confirmed:        11
Likely:           2
Potential:        2
Recommendations:  3

Automated Tests:  511 passed, 0 failed
```

**Highest risk areas**
1. Configuration that fails silently — scheduler, mailer, backups. Three separate features
   were completely inert in production and nothing reported it.
2. Foreign keys validated for existence but not ownership (QA-001).
3. A single 5,100-line frontend file concentrating most UI defects.
4. No CI, and zero coverage on attachments and folders.

**Recommended immediate actions**
1. Fix QA-001 (cross-project section).
2. Decide email: real mailer or explicit off — then scrub the log.
3. Rotate the exposed local `APP_KEY`.
4. Confirm tomorrow's 02:00 backup and 08:00 escalation actually run.

**Recommended long-term improvements**
1. CI running the suite on every push.
2. Decompose `Projects/Show.jsx`.
3. A single source of truth for notification rendering.
4. Health checks that assert *outcomes* (a backup exists, an email was delivered) rather
   than exit codes.

---

*Findings marked "fixed this session" were repaired and deployed during the audit window;
they are retained here because they document real defects and their root causes.*
