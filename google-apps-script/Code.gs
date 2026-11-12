/**
 * QR Event Attendance - backend core (Google Apps Script).
 * Deploy as Web App: Execute as "Me", access "Anyone". Run firstRun_() once as the owner.
 */
const P = PropertiesService.getScriptProperties();
const SHEETS = {
  Events: ['event_id','event_name','event_date','venue','event_status','scanner_published','spreadsheet_id','created_at','updated_at','created_by','description','start_time','end_time','drive_folder_id'],
  'Scanner Keys': ['key_id','label','pin_salt','pin_hash','pin_lookup','allowed_events','active_status','created_at','expires_at','revoked_at'],
  'Audit Logs': ['action_id','user_id','action','event_id','timestamp','details']
};
const EVENT_SHEETS = {
  Participants: ['participant_id','full_name','email','phone','organization','registration_number','qr_token','qr_status','registration_date'],
  'Checked In': ['attendance_id','event_id','participant_id','participant_name','email','phone','checkin_timestamp','staff_id','staff_name','receipt_id','receipt_url','checkin_status']
};

/** Editor-only setup: creates the master spreadsheet and server-side secrets. */
function setup_() {
  if (P.getProperty('MASTER_ID')) return 'Already set up';
  const ss = SpreadsheetApp.create('QR Event System - Master');
  Object.keys(SHEETS).forEach((n, i) => {
    const sh = i === 0 ? ss.getSheets()[0].setName(n) : ss.insertSheet(n);
    sh.getRange(1, 1, 1, SHEETS[n].length).setValues([SHEETS[n]]).setFontWeight('bold');
  });
  P.setProperty('MASTER_ID', ss.getId());
  P.setProperty('TOKEN_SECRET', Utilities.getUuid() + Utilities.getUuid());
  P.setProperty('AUTH_EPOCH', '1');
  return 'Master sheet: ' + ss.getUrl();
}

const master_ = () => SpreadsheetApp.openById(P.getProperty('MASTER_ID'));
const tz_ = () => P.getProperty('TIMEZONE') || 'Asia/Kathmandu';

// ---------- Web entry ----------
function doGet(e) {
  if (e.parameter.verify !== undefined) {
    const v = HtmlService.createTemplateFromFile('Verify'); v.rid = String(e.parameter.verify).replace(/[^A-Za-z0-9-]/g, '').slice(0, 20);
    return v.evaluate().setTitle('Verify receipt').addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  if (e.parameter.page === 'admin') {
    const a = HtmlService.createTemplateFromFile('Admin'); a.baseUrl = ScriptApp.getService().getUrl();
    return a.evaluate().setTitle('Event Admin').addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  if (e.parameter.page !== 'scanner' && e.parameter.event === undefined) {
    const h = HtmlService.createTemplateFromFile('Home'); h.baseUrl = ScriptApp.getService().getUrl();
    return h.evaluate().setTitle('QR Event System').addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  const t = HtmlService.createTemplateFromFile('Scanner');
  t.eventId = String(e.parameter.event || '').replace(/[^A-Za-z0-9_-]/g, '');
  return t.evaluate().setTitle('Event Scanner')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ---------- Auth (server-side, every call) ----------
function audit_(user, action, eventId, details) {
  master_().getSheetByName('Audit Logs').appendRow(['A-' + Utilities.getUuid().slice(0, 8), user.id, action, eventId || '', new Date(), details || '']);
}

// ---------- Events ----------
function getEventRow_(eventId) {
  const sh = master_().getSheetByName('Events');
  const rows = sh.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) if (rows[i][0] === eventId) return { sh, row: i + 1, v: rows[i] };
  throw new Error('EVENT_NOT_FOUND');
}

/** Idempotent via client-supplied requestId so retries don't duplicate. */
function createEvent(sid, name, date, venue, requestId) {
  return wrap_(sid, () => {
    const u = requireStaff_(true);
    if (!name || name.length > 120) throw new Error('INVALID_INPUT');
    const lock = LockService.getScriptLock(); lock.waitLock(10000);
    try {
      const id = 'EV-' + String(requestId || Utilities.getUuid()).replace(/[^A-Za-z0-9]/g, '').slice(0, 24);
      const evSheet = master_().getSheetByName('Events');
      if (evSheet.getDataRange().getValues().some(r => r[0] === id)) return { event_id: id, duplicate: true };
      const ss = SpreadsheetApp.create('Event - ' + name + ' - ' + id);
      DriveApp.getFileById(ss.getId()).moveTo(eventFolder_(id));   // keep each event's files together
      Object.keys(EVENT_SHEETS).forEach((n, i) => {
        const sh = i === 0 ? ss.getSheets()[0].setName(n) : ss.insertSheet(n);
        sh.getRange(1, 1, 1, EVENT_SHEETS[n].length).setValues([EVENT_SHEETS[n]]).setFontWeight('bold');
      });
      const now = new Date();
      evSheet.appendRow([id, name, date, venue, 'ACTIVE', false, ss.getId(), now, now, u.id]);
      audit_(u, 'CREATE_EVENT', id, name);
      return { event_id: id };
    } finally { lock.releaseLock(); }
  });
}

function setScannerPublished(sid, eventId, published) {
  return wrap_(sid, () => {
    const u = requireStaff_(true);
    const lock = LockService.getScriptLock(); lock.waitLock(10000);
    try {
      const e = getEventRow_(eventId);
      e.sh.getRange(e.row, 6).setValue(!!published);
      e.sh.getRange(e.row, 9).setValue(new Date());
      audit_(u, published ? 'PUBLISH_SCANNER' : 'UNPUBLISH_SCANNER', eventId);
      return { scanner_published: !!published };
    } finally { lock.releaseLock(); }
  });
}

// ---------- QR tokens (opaque; no personal data) ----------
function newToken_() {
  const raw = Utilities.getUuid() + Utilities.getUuid() + Date.now() + Math.random();
  const sig = Utilities.computeHmacSha256Signature(raw, P.getProperty('TOKEN_SECRET'));
  return Utilities.base64EncodeWebSafe(sig).replace(/=+$/, '');
}

/** Batch-fills ONLY missing tokens; existing tokens are never touched. */
function generateMissingQR(sid, eventId) {
  return wrap_(sid, () => {
    const u = requireStaff_(true);
    const lock = LockService.getScriptLock(); lock.waitLock(20000);
    try {
      const sh = SpreadsheetApp.openById(getEventRow_(eventId).v[6]).getSheetByName('Participants');
      const n = sh.getLastRow() - 1; if (n < 1) return { generated: 0 };
      const rng = sh.getRange(2, 7, n, 2); const vals = rng.getValues(); let g = 0;
      vals.forEach(r => { if (!r[0]) { r[0] = newToken_(); r[1] = 'GENERATED'; g++; } });
      rng.setValues(vals);
      audit_(u, 'GENERATE_QR', eventId, g + ' new');
      return { generated: g, skipped: n - g };
    } finally { lock.releaseLock(); }
  });
}

// ---------- Check-in (the critical path) ----------
function checkIn(sid, eventId, token) {
  return wrap_(sid, () => {
    requireScanner_();                                  // Reject unauthenticated callers before taking the lock.
    if (!token || String(token).length > 200) throw new Error('INVALID_QR');
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(15000)) throw new Error('BUSY: try again');
    try {                                               // short critical section
      const staff = requireScanner_();                  // Recheck revocation and scope under the attendance lock.
      if (!canAccess_(staff, eventId)) throw new Error('FORBIDDEN: Not assigned to this event');
      const ev = getEventRow_(eventId).v;               // 2. event exists
      if (ev[4] !== 'ACTIVE' || ev[5] !== true)         // 3. published? (read fresh, never cached)
        throw new Error('UNPUBLISHED: Scanner unavailable for this event');
      const ss = SpreadsheetApp.openById(ev[6]);
      const p = findRow_(ss.getSheetByName('Participants'), 7, String(token));   // 4-6. token + membership (indexed lookup)
      if (!p || p[7] === 'REVOKED') throw new Error('INVALID_QR: Invalid QR code');
      const cs = ss.getSheetByName('Checked In');
      const ex = findRow_(cs, 3, p[0]);                                         // 7. already checked in?
      const fmt = d => Utilities.formatDate(new Date(d), tz_(), 'yyyy-MM-dd HH:mm:ss');
      if (ex) return { status: 'DUPLICATE', participant_id: p[0], name: p[1], checkin_time: fmt(ex[6]) }; // idempotent
      const now = new Date();
      cs.appendRow(['AT-' + Utilities.getUuid().slice(0, 8), eventId, p[0], p[1], p[2], p[3], now, staff.id, staff.name, '', '', 'CHECKED_IN']);
      SpreadsheetApp.flush();                           // confirmed before we report success
      return { status: 'SUCCESS', participant_id: p[0], name: p[1], organization: p[4], checkin_time: fmt(now) };
    } finally { lock.releaseLock(); }
  });
}

// ---------- Dashboard (lightweight, poll-friendly) ----------
function getEventSummary(sid, eventId) {
  return wrap_(sid, () => {
    requireStaff_(true);
    const ev = getEventRow_(eventId).v;
    const ss = SpreadsheetApp.openById(ev[6]);
    const total = Math.max(ss.getSheetByName('Participants').getLastRow() - 1, 0);
    const cs = ss.getSheetByName('Checked In');
    const checked = Math.max(cs.getLastRow() - 1, 0);
    const k = Math.min(10, checked);
    const recent = k ? cs.getRange(cs.getLastRow() - k + 1, 4, k, 6).getValues().reverse()
      .map(r => ({ name: r[0], time: Utilities.formatDate(new Date(r[3]), tz_(), 'HH:mm:ss'), staff: r[5] })) : [];
    return { total, checked, remaining: total - checked, pct: total ? Math.round(checked * 100 / total) : 0,
             scanner_published: ev[5] === true, recent };
  });
}
