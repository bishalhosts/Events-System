/** Reports, walk-ins, undo, settings, audit viewer, staff PIN reset, backups. */

/** Fast single-row lookup (server-side TextFinder; case-sensitive, exact, then re-verified). */
function findRow_(sh, col, value) {
  if (!value || sh.getLastRow() < 2) return null;
  const f = sh.getRange(2, col, sh.getLastRow() - 1, 1).createTextFinder(String(value)).matchCase(true).matchEntireCell(true).findNext();
  if (!f) return null;
  const row = sh.getRange(f.getRow(), 1, 1, sh.getLastColumn()).getValues()[0];
  return row[col - 1] === value ? row : null;
}

function getSettings(sid) {
  return wrap_(sid, () => { requireStaff_(true);
    return { name: P.getProperty('ORG_NAME') || '', tagline: P.getProperty('ORG_TAGLINE') || '', address: P.getProperty('ORG_ADDRESS') || '', timezone: tz_(), color: P.getProperty('BRAND_COLOR') || '#0f1b3d', footer: P.getProperty('BRAND_FOOTER') || '', logo: brand_().logo }; });
}
function saveSettings(sid, s) {
  return wrap_(sid, () => {
    const u = requireStaff_(true);
    ['name', 'tagline', 'address'].forEach(k => { if (String(s[k] || '').length > 200) throw new Error('INVALID_INPUT: ' + k + ' too long'); });
    if (!/^#[0-9a-fA-F]{6}$/.test(s.color || '#0f1b3d')) throw new Error('INVALID_INPUT: Color must look like #0f1b3d');
    if (String(s.footer || '').length > 300) throw new Error('INVALID_INPUT: Footer too long');
    try { Utilities.formatDate(new Date(), s.timezone, 'yyyy'); } catch (e) { throw new Error('INVALID_INPUT: Unknown timezone'); }
    P.setProperties({ ORG_NAME: s.name || '', ORG_TAGLINE: s.tagline || '', ORG_ADDRESS: s.address || '', TIMEZONE: s.timezone, BRAND_COLOR: s.color || '#0f1b3d', BRAND_FOOTER: s.footer || '' });
    audit_(u, 'SAVE_SETTINGS', '', ''); return { ok: true };
  });
}

/** Admin-only: creates the participant (with token) and checks them in, in one locked step. */
function addWalkIn(sid, eventId, name, email, phone, org) {
  return wrap_(sid, () => {
    const u = requireStaff_(true);
    name = String(name || '').trim(); if (!name || name.length > 120) throw new Error('INVALID_INPUT: Name required');
    const lock = LockService.getScriptLock(); lock.waitLock(10000);
    try {
      const ss = SpreadsheetApp.openById(getEventRow_(eventId).v[6]), now = new Date(), pid = 'P-' + Utilities.getUuid().slice(0, 8);
      ss.getSheetByName('Participants').appendRow([pid, cellSafe_(name), cellSafe_(email || ''), cellSafe_(phone || ''), cellSafe_(org || ''), 'WALKIN', newToken_(), 'GENERATED', now]);
      ss.getSheetByName('Checked In').appendRow(['AT-' + Utilities.getUuid().slice(0, 8), eventId, pid, cellSafe_(name), cellSafe_(email || ''), cellSafe_(phone || ''), now, u.id, u.name, '', '', 'CHECKED_IN']);
      audit_(u, 'WALK_IN', eventId, pid); return { participant_id: pid };
    } finally { lock.releaseLock(); }
  });
}

/** Admin-only, logged. Removes the attendance row so the person can be scanned again. */
function undoCheckIn(sid, eventId, participantId) {
  return wrap_(sid, () => {
    const u = requireStaff_(true);
    const lock = LockService.getScriptLock(); lock.waitLock(10000);
    try {
      const cs = SpreadsheetApp.openById(getEventRow_(eventId).v[6]).getSheetByName('Checked In');
      const col = cs.getLastRow() > 1 ? cs.getRange(2, 3, cs.getLastRow() - 1, 1).getValues() : [];
      const i = col.findIndex(r => r[0] === participantId);
      if (i < 0) throw new Error('NOT_FOUND: Not checked in');
      cs.deleteRow(i + 2); audit_(u, 'UNDO_CHECKIN', eventId, participantId); return { ok: true };
    } finally { lock.releaseLock(); }
  });
}

/** Check-ins per 15 min, per staff member, and totals - computed from one sheet read. */
function getReport(sid, eventId) {
  return wrap_(sid, () => {
    requireStaff_(true);
    const ss = SpreadsheetApp.openById(getEventRow_(eventId).v[6]);
    const rows = ss.getSheetByName('Checked In').getDataRange().getValues().slice(1);
    const buckets = {}, staff = {};
    rows.forEach(r => {
      const d = new Date(r[6]), m = Math.floor(Number(Utilities.formatDate(d, tz_(), 'm')) / 15) * 15;
      const k = Utilities.formatDate(d, tz_(), 'MM-dd HH:') + (m < 10 ? '0' : '') + m;
      buckets[k] = (buckets[k] || 0) + 1; staff[r[8]] = (staff[r[8]] || 0) + 1;
    });
    const keys = Object.keys(buckets).sort();
    const total = Math.max(ss.getSheetByName('Participants').getLastRow() - 1, 0);
    return { total, checked: rows.length, labels: keys, counts: keys.map(k => buckets[k]), staffNames: Object.keys(staff), staffCounts: Object.values(staff) };
  });
}

function getAuditLog(sid, limit) {
  return wrap_(sid, () => {
    requireStaff_(true);
    const sh = master_().getSheetByName('Audit Logs'), n = Math.min(Number(limit) || 100, 300), last = sh.getLastRow();
    if (last < 2) return [];
    const k = Math.min(n, last - 1);
    return sh.getRange(last - k + 1, 1, k, 6).getValues().reverse()
      .map(r => ({ user: r[1], action: r[2], event: r[3], time: Utilities.formatDate(new Date(r[4]), tz_(), 'MM-dd HH:mm:ss'), details: r[5] }));
  });
}

// ---- Backups: run installBackupTrigger() once from the editor ----
function dailyBackup_() {
  const props = P.getProperty('BACKUP_FOLDER');
  const folder = props ? DriveApp.getFolderById(props) : DriveApp.createFolder('QR Event System Backups');
  if (!props) P.setProperty('BACKUP_FOLDER', folder.getId());
  const stamp = Utilities.formatDate(new Date(), tz_(), 'yyyyMMdd');
  const ids = [P.getProperty('MASTER_ID')].concat(master_().getSheetByName('Events').getDataRange().getValues().slice(1)
    .filter(r => r[4] === 'ACTIVE').map(r => r[6]));
  ids.forEach(id => { try { const f = DriveApp.getFileById(id); f.makeCopy(f.getName() + ' ' + stamp, folder); } catch (e) { console.error('Backup failed for ' + id + ': ' + e); } });
}
function installBackupTrigger_() {
  const triggers = ScriptApp.getProjectTriggers();
  if (triggers.some(t => t.getHandlerFunction() === 'dailyBackup_')) return 'Already installed';
  triggers.filter(t => t.getHandlerFunction() === 'dailyBackup').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('dailyBackup_').timeBased().everyDays(1).atHour(2).create(); return 'Installed';
}
