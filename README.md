# QR Code Event Management & Attendance System
Google Apps Script (backend + hosting) · Google Sheets (database) · Google Drive (files) · Vanilla HTML/CSS/JS (frontend)

> Test status: `npm test` runs offline checks against a **mock** of Google services; it is not a substitute for live Google account checks.
> Do the manual checklist in section 13 before a real event.

---

## 1. What it does
- One landing page routes admins and scanner users into the existing admin dashboard and event scanner.
- Admin manages events, participants, QR codes, attendance, reports, receipts and scanner access from the dashboard.
- Each event has its own Google Spreadsheet and Drive folder; Sheets/Drive work in the background.
- Each participant gets a unique opaque QR token. Staff scan with a phone browser (no app).
- Attendance is written once per participant to a central log; the admin dashboard updates by polling.
- Admin can publish/unpublish an event's scanner; the backend enforces it on **every** scan.
- QR images are saved by name in Drive and in a printable Google Doc. Sending QR codes (email/WhatsApp) is done manually by the admin; there is no sending feature.

## 2. Requirements and status
| # | Requirement | Status |
|---|---|---|
| 1 | Google Sheets only as database; Drive only for files; no other backend | Done |
| 2 | Event create (retry-safe), edit, search, filter, archive, safe delete (type the name; soft delete) | Done |
| 3 | Event spreadsheet auto-created, or connect an existing one | Done |
| 4 | Participant import from any sheet with column mapping, dedupe, server-side search/pagination | Done |
| 5 | Participant edit, QR-status filter, CSV export | Done |
| 6 | Opaque random QR tokens (no personal data); generate only missing; explicit regeneration revokes old | Done |
| 7 | QR PNGs per participant in Drive, ZIP download, printable QR Google Doc | Done |
| 8 | Password-only admin login; admin-issued PIN-only scanner access with event scope, expiry, revocation, 6 h sessions and lockouts | Done |
| 9 | Scanner publish/unpublish enforced server-side on every check-in | Done |
| 10 | Mobile scanner: rear camera, flashlight, beep/vibrate, manual entry, scan-from-photo fallback, last 5 scans | Done (camera untested live) |
| 11 | Check-in under LockService, idempotent, one row per participant, server-confirmed success only | Done |
| 12 | Admin dashboard polling (adaptive 3 s → 30 s, pauses when tab hidden, no overlapping requests) | Done |
| 13 | PDF receipts (logo, color, footer, verify link) saved in Drive; failure never blocks attendance; re-issue | Done (PDF logo untested live) |
| 14 | Public receipt verification page (`?verify=RC-XXXXXXXX`, masked name, rate-limited) | Done |
| 15 | Reports: per-15-min chart, per-staff chart, attendance table with filters, PDF attendance report, CSV | Done |
| 16 | Walk-in check-in, admin undo check-in | Done |
| 17 | Audit log (viewer in admin), daily backup trigger, timezone setting (default Asia/Kathmandu) | Done |
| 18 | Settings screen: organization, logo, header color, footer, timezone | Done |
| 19 | Separate HTML / CSS / JS source files with a build step | Done |
| 20 | Responsive admin, scanner and receipt-verification layouts | Done (verify on target phones before an event) |
| — | Offline scanner queue | Not built |
| — | Multiple scan points per event (entrance / meals) | Not built |
| — | GitHub Pages frontend | Not used on purpose (cross-origin issues); GitHub stores source only |
| — | Backend file names exactly as the original prompt (`CheckIn.gs`, `Staff.gs`…) | Not done; names differ (section 4) |
| — | Per-scan rate limit; 2FA | Not built |

## 3. Architecture
```
Browser (admin)  ──google.script.run──▶ Google Apps Script (runs as OWNER) ──▶ Google Sheets (data)
Phones (3 staff) ──google.script.run──▶        same web app               ──▶ Google Drive (QR, PDFs)
```
- One Apps Script Web App serves the admin, scanner and verify pages. Nothing is cross-origin, so no CORS setup is needed.
- The app runs as the owner, so scanner users never get Sheets/Drive access. Admin identity is a password session; scanner identity is an admin-issued, event-scoped PIN session.
- Every server function validates the session and role itself; the browser is never trusted.

## 4. Project structure
```
frontend/                      <- EDIT THESE
  home.html admin.html scanner.html verify.html  page shells (with <!--@css--> / <!--@js--> markers)
  css/  main.css home.css admin.css scanner.css
  js/   common.js auth.js events.js event-detail.js qr-export.js
        staff-settings-reports.js dashboard-attendance.js scanner.js verify.js
scripts/build.js               merges frontend/ into the single-file HTML pages Apps Script needs
google-apps-script/            <- UPLOADED TO GOOGLE (clasp rootDir)
  Code.gs            editor setup, events, QR tokens, check-in (critical path)
  Admin.gs           password/session auth, scanner-key management, import, participants list
  EventsMgmt.gs      edit/delete/connect event, participant edit, dashboard totals
  Extras.gs          receipts (PDF), CSV export, QR token feed, archive
  Extras2.gs         reports, walk-in, undo, settings, audit log, backups
  QRDocs.gs          QR PNGs to Drive + printable Google Doc
  AttendanceReports.gs   attendance listing + PDF report
  Branding.gs        logo / color / footer for PDFs
  Drive.gs           folder layout helpers
  Verify.gs          public receipt verification
  FirstRun.gs        one-click initial setup
  Home.html Admin.html Scanner.html Verify.html GENERATED by the build - do not edit
  appsscript.json    manifest (scopes, web app settings)
tests/offline-harness.js       mock-based tests
package.json  .clasp.json.example  .claspignore  .gitignore  .vscode/
```
Apps Script cannot load `.css`/`.js` files directly, so `npm run build` inlines them into the four generated `.html` files (committed, so a plain `clasp push` also works).
No manual frontend merge is needed: the build bundles each page's CSS and JavaScript into its generated HTML. Apps Script loads all `.gs` files in a project together, so keep backend files grouped by feature; combining them would only create larger files, not a smaller deployment.

## 5. Data layout
**Drive** (created automatically)
```
QR Event System/
  Branding/logo.png
  EV-xxxx/                       one folder per event (named by event id; never rename)
    Event - <name> - EV-xxxx     event spreadsheet
    QR Codes/                    <Name> - <ParticipantID>.png
    QR Codes - <event>           printable Google Doc (QR + name + ID, 3 per row)
    Receipts/                    RC-XXXXXXXX.pdf
    Reports/                     attendance-YYYYMMDD-HHMM.pdf
  QR Event System - Master       (run organizeDrive() once on older projects)
QR Event System Backups/         daily copies
```
**Master spreadsheet**
- `Events`: event_id, event_name, event_date, venue, event_status (ACTIVE/ARCHIVED/DELETED), scanner_published, spreadsheet_id, created_at, updated_at, created_by, description, start_time, end_time, drive_folder_id
- `Scanner Keys`: key_id, label, salted PIN hash and keyed lookup, allowed_events, active_status, created_at, expires_at, revoked_at
- `Staff`: retained on existing installs for historical compatibility; no longer used for authentication
- `Audit Logs`: action_id, user_id, action, event_id, timestamp, details

**Event spreadsheet**
- `Participants`: participant_id, full_name, email, phone, organization, registration_number, qr_token (secret), qr_status, registration_date
- `Checked In`: attendance_id, event_id, participant_id, participant_name, email, phone, checkin_timestamp, staff_id, staff_name, receipt_id, receipt_url, checkin_status
- `QR Records`: participant_id, participant_name, token_hash, png_file_id, created_at

Do not edit these sheets by hand. The participant ID is the permanent key; names can repeat.

## 6. Setup in VS Code
1. Unzip, open the folder in VS Code, then in the terminal: `npm install` and `npm test`.
2. Go to https://script.google.com → New project. Copy the **Script ID** (Project Settings). Turn ON the Apps Script API at https://script.google.com/home/usersettings.
3. Copy `.clasp.json.example` to `.clasp.json` and paste the Script ID.
4. `npx clasp login`, then `npm run push` (builds the frontend, then uploads). Answer `y` if asked to overwrite the manifest.
5. `npx clasp open`. In Project Settings → Script properties add `ADMIN_PASSWORD_TEMP` = a strong password of at least 12 characters. In the editor, run **firstRun_** and approve permissions. It creates/migrates the master sheet, stores only a salted PBKDF2-derived password hash, installs the backup trigger and deletes the temporary property.
6. Deploy → New deployment → Web app → **Execute as: Me**, **Who has access: Anyone** → copy the `/exec` URL.
7. Open `<url>` for the single landing page. Choose **Admin Panel** or **QR Scanner**. Admin can also use `<url>?page=admin`; event scanner links are created with **Copy link**. Receipt verification: `<url>?verify=RC-XXXXXXXX`.
8. Later changes: edit `frontend/` or `google-apps-script/*.gs` → `npm run push` → Deploy → Manage deployments → Edit → **New version** (keeps the same URL).
9. Upgrading an older install: add `ADMIN_PASSWORD_TEMP` and run **firstRun_** once. It adds the scanner-key sheet and removes legacy Staff PIN hashes. Use **upgradeSchema_** and **organizeDrive_** only if required by that older installation.

## 7. Admin guide
1. Choose **Admin Panel** and sign in with the owner-configured password; no username or public registration exists. Under **Access**, create scanner PINs, assign events, set an optional expiry, edit access, rotate or revoke keys, or change the admin password.
   A generated PIN is displayed only once. If it is lost, rotate the active key or create another one. Revoked keys cannot be reactivated.
2. Create event → Open → **Import participants** (paste the source spreadsheet ID, load columns, map them, import).
3. **Generate missing QR tokens** → **Save QR to Drive + build Doc** (progress shown; safe to re-run).
4. Print or send the QR images/Doc yourself (manually). Treat them like tickets.
5. **Publish scanner**, copy the event link, and give it to scanner users with an active PIN scoped to that event.
6. Watch live attendance. Use Attendance, Reports, PDF report and CSV exports. Undo and walk-in as needed.
7. After the event: export, unpublish, archive.

## 8. Scanner guide
Open the landing page or event link → enter the admin-issued scanner PIN → choose an assigned event if prompted → **Start camera** and scan. No scanner username, account, or registration is needed. Green = checked in, orange = already checked in (shows the original time), red = invalid/unavailable.
If camera access is blocked, allow it for the HTTPS site in browser settings, then retry. Use "scan from photo" or manual token entry as a fallback. If you see "NOT confirmed" (network), scan again: a second scan never creates a duplicate.

## 9. Security
- Admin password and scanner PINs are never stored in plain text. Passwords/PINs use salted PBKDF2-HMAC-SHA256 derivation plus a server-side pepper; the PIN lookup is keyed and stored in the master sheet.
- Admin password lockout is 5 failures / 15 minutes; scanner PIN lockout is 5 repeated attempts for that key and 30 failed attempts globally / 15 minutes.
- Random session ids expire after 6 hours in CacheService. The server re-checks the session, password epoch, key status, expiry, event assignment, and scanner publication on every relevant call. PIN rotation/revocation invalidates existing sessions.
- Admin bootstrap/recovery functions end in `_` so they cannot be invoked through `google.script.run`. Initial setup uses a temporary Script Property that is deleted after hashing.
- QR token = HMAC-derived random value with no personal data. Regeneration replaces it immediately.
- The publish flag and attendance uniqueness are read from the sheet inside the lock, never from cache.
- Imported/edited text starting with `= + - @` is stored as plain text (formula injection blocked); CSV export does the same.
- HTML in PDFs and pages is escaped. Secrets live in Script Properties, never in code. `.clasp.json` is git-ignored.
- Known gaps: cache eviction signs users out; global scanner login throttling can temporarily affect all scanners; no per-scan rate limit or 2FA; QR/receipt Drive files are owner-private only.

## 10. Backend function reference
Called with `google.script.run`; each returns `{success, data}` or `{success:false, code, message}`.
- Auth: `loginAdmin loginScanner getScannerEvents changeAdminPassword logout`
- Events: `listEvents createEvent updateEvent deleteEvent setEventStatus setScannerPublished connectExistingSpreadsheet getEventSummary getDashboardSummary`
- Participants: `getSourceHeaders importParticipants getParticipants updateParticipant addWalkIn exportCSV`
- QR: `generateMissingQR regenerateQR getQRTokens getQRPending saveQRImages buildQRDoc getQRDocInfo`
- Attendance: `checkIn undoCheckIn getAttendance generateReceipt generateAttendancePDF getReport`
- Access/Settings: `createScannerKey listScannerKeys updateScannerKey rotateScannerKey revokeScannerKey getSettings saveSettings uploadLogo removeLogo getAuditLog`
- Public: `verifyReceipt`

## 11. Performance and quotas
- Batch `getValues/setValues`; token and duplicate lookups use `TextFinder` on one column; server-side pagination; QR/Doc work runs in batches.
- Dashboard polling backs off when idle to protect the daily Apps Script runtime quota (consumer accounts ≈ 90 min/day; Workspace higher).
- Each check-in takes roughly 1–2 s (untested at scale). Three staff are fine; test with your real participant count.
- Limits: ~6 min per execution, ~30 simultaneous executions, daily Drive/Doc/Sheet quotas.

## 12. Known problems / limits
Sessions lost on cache eviction · orphan spreadsheet if event creation fails midway · rare extra receipt PDF if two receipts are created at the same instant (only one is linked) ·
no offline queue · single admin page (dialogs, not separate pages) · PDF logo rendering from HTML is unverified.

## 13. Testing
**Automated:** `npm test` builds the frontend and runs mock-based checks for password/PIN authentication, lockouts, key scope/rotation/revocation, admin-only APIs, retry-safe event creation, imports, QR uniqueness, publish gates, duplicate check-in, undo, reports, receipt verification, and frontend/server API references.
It cannot prove real concurrency, quotas, PDF rendering, Apps Script KDF latency or camera behaviour.

**Manual checklist (live account):**
1. `firstRun_`; password-only admin login; wrong passwords are rate-limited.
2. Create event (double-click → one event); edit; search/filter; archive; delete needs the exact name.
3. Import a sheet with different headers; re-import → all skipped; connect an existing spreadsheet.
4. Generate QR twice (second = 0); Save QR to Drive twice (second = 0); regenerate one → only that PNG replaced; Doc opens, 3 per row.
5. Create a PIN for one event; scanner signs in with PIN only; scan → success; scan again → duplicate, one row.
6. Invalid QR; unpublish while the scanner page is open → next scan rejected; wrong event assignment → forbidden; rotate/revoke PIN → existing session rejected.
7. **Three phones scan different people at once** → no lost or duplicate rows. Same person on three phones → one row.
8. Dashboard updates without refresh; backs off when idle; pauses in a hidden tab.
9. Receipt PDF shows logo/color/footer; break Drive access → attendance still saved; re-issue works; `?verify=` page works.
10. CSV exports open in Excel; attendance PDF; undo and walk-in.
11. Camera denied → manual entry and photo fallback work; airplane mode → "NOT confirmed", never a false success.
12. 1,000–5,000 participants: import, search speed, QR Doc build, check-in latency.

## 14. Troubleshooting
| Problem | Fix |
|---|---|
| "Authorization required" / blank page | Redeploy as a new version; run any function once in the editor to re-approve scopes |
| Admin password forgotten | Set `ADMIN_PASSWORD_TEMP` in Script Properties and run `resetAdminPassword_` from the Apps Script editor |
| Scanner PIN fails | Check that it is active, not expired, assigned to the event, and that the event scanner is published; issue a new PIN if needed |
| Scanner camera does not open | Use the direct `/exec` link in the phone browser; allow camera; else photo/manual fallback |
| "Scanner unavailable" | Event is unpublished or archived: Publish it |
| "Not assigned to this event" | Admin → Access: edit the scanner key's event assignment |
| Import "Cannot open spreadsheet" | Share the source sheet with the owner account |
| Logo missing in PDF | Report it; fall back to a Google Doc template for receipts |
| "Exceeded maximum execution time" | Re-run; Doc/QR jobs resume where they stopped |
| Frontend change not visible | `npm run push`, then Deploy → New version |

## 15. Improvements roadmap (suggested order)
1. Run the manual checklist and fix whatever the live account reveals.
2. Verify admin tables, dialogs, manual scanner entry, and camera controls on common phone sizes and real devices.
3. Multiple scan points per event (entrance, lunch, certificate) with per-point attendance.
4. Offline scanner queue with a "pending" state and safe reconcile.
5. Rename/split backend files to the original prompt's names; add per-feature test files.
6. Token index sheet/cache for 10,000+ participants; per-scan rate limit; optional 2FA.
7. Receipt as a Google Doc template for guaranteed logo rendering; receipt access for staff via a server download action.
8. Separate admin pages (events / participants / reports) instead of one page with dialogs.
