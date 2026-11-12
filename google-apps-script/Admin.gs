/** Password and scanner-key authentication. The app runs as the owner; users never access Sheets directly. */
const SESSION_TTL = 21600; // 6h, CacheService maximum
const AUTH_KDF_ITERATIONS = 60000;
const ADMIN_PASSWORD_MIN_LENGTH = 12;
let SESSION_ = null;

function deriveCredentialHash_(salt, password) {
  const key = String(password);
  let u = Utilities.computeHmacSha256Signature(String(salt) + '\x00\x00\x00\x01', key);
  const result = u.slice();
  for (let i = 1; i < AUTH_KDF_ITERATIONS; i++) {
    u = Utilities.computeHmacSha256Signature(u, key);
    for (let j = 0; j < result.length; j++) result[j] ^= u[j];
  }
  const peppered = Utilities.computeHmacSha256Signature(result, P.getProperty('TOKEN_SECRET'));
  return Utilities.base64EncodeWebSafe(peppered).replace(/=+$/, '');
}
function sameSecret_(a, b) {
  a = String(a || ''); b = String(b || '');
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
function authEpoch_() { return P.getProperty('AUTH_EPOCH') || '1'; }
function bumpAuthEpoch_() {
  const next = Number(authEpoch_()) + 1;
  P.setProperty('AUTH_EPOCH', String(next));
  return String(next);
}
function newSession_(value) {
  const sid = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(
    Utilities.getUuid() + Date.now() + Utilities.getUuid(), P.getProperty('TOKEN_SECRET')
  )).replace(/=+$/, '');
  CacheService.getScriptCache().put('S_' + sid, value + ':' + authEpoch_(), SESSION_TTL);
  return sid;
}
function authFailure_(cacheKey, code, message) {
  const cache = CacheService.getScriptCache(), failures = Number(cache.get(cacheKey) || 0);
  if (failures >= 5) return { success: false, code: 'RATE_LIMITED', message: 'Too many attempts. Wait 15 minutes.' };
  cache.put(cacheKey, String(failures + 1), 900);
  return { success: false, code, message };
}
function credentialLookup_(pin) {
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(
    'SCANNER:' + pin, P.getProperty('TOKEN_SECRET')
  )).replace(/=+$/, '');
}
function validPassword_(password) {
  return typeof password === 'string' && password.length >= ADMIN_PASSWORD_MIN_LENGTH && password.length <= 256;
}
function saveAdminPassword_(password, onlyIfUnset) {
  if (!validPassword_(password)) throw new Error('INVALID_INPUT: Admin password must be at least 12 characters');
  const salt = Utilities.getUuid() + Utilities.getUuid();
  const hash = deriveCredentialHash_(salt, password);
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    if (onlyIfUnset && P.getProperty('ADMIN_PASSWORD_HASH'))
      throw new Error('ALREADY_CONFIGURED: Use the Admin access panel to change the password');
    P.setProperties({ ADMIN_PASSWORD_SALT: salt, ADMIN_PASSWORD_HASH: hash });
    bumpAuthEpoch_();
  } finally { lock.releaseLock(); }
}
function initializeAdminPassword_(password) {
  saveAdminPassword_(String(password || ''), true);
}
/** Editor-only recovery. Set ADMIN_PASSWORD_TEMP in Script Properties, then run this function in Apps Script. */
function resetAdminPassword_() {
  const password = P.getProperty('ADMIN_PASSWORD_TEMP');
  if (!password) throw new Error('Add ADMIN_PASSWORD_TEMP in Script Properties first.');
  saveAdminPassword_(password, false);
  P.deleteProperty('ADMIN_PASSWORD_TEMP');
  P.deleteProperty('OWNER_PIN_TEMP');
  return 'Admin password reset; sign in again.';
}
/** Spreadsheet formulas in imported text are neutralised (leading apostrophe = stored as plain text). */
const cellSafe_ = v => (typeof v === 'string' && /^[=+\-@]/.test(v)) ? "'" + v : v;
/** Stable duplicate key; falls back to name+phone when a row has no email and no registration number. */
const pKey_ = (name, email, phone, reg) => {
  const z = v => String(v == null ? '' : v).replace(/^'/, '').trim().toLowerCase();   // ignore the text-marker apostrophe
  return (z(email) || z(reg)) ? z(email) + '|' + z(reg) : 'n|' + z(name) + '|' + z(phone);
};
function canAccess_(u, eventId) { return u.allowed === '*' || u.allowed.split(',').map(s => s.trim()).indexOf(eventId) >= 0; }
function ensureAuthSchema_() {
  const ss = master_();
  let sh = ss.getSheetByName('Scanner Keys');
  if (!sh) {
    sh = ss.insertSheet('Scanner Keys');
    sh.getRange(1, 1, 1, SHEETS['Scanner Keys'].length).setValues([SHEETS['Scanner Keys']]).setFontWeight('bold');
  }
  const staff = ss.getSheetByName('Staff');
  if (staff && staff.getLastRow() > 1 && staff.getLastColumn() >= 8) {
    staff.getRange(2, 7, staff.getLastRow() - 1, 2).clearContent();
  }
  if (!P.getProperty('AUTH_EPOCH')) P.setProperty('AUTH_EPOCH', '1');
}
function createScannerEvents_(allowed) {
  const all = master_().getSheetByName('Events').getDataRange().getValues().slice(1);
  return all.filter(r => r[4] === 'ACTIVE' && r[5] === true && canAccess_({ allowed }, r[0]))
    .map(r => ({ id: r[0], name: r[1], date: String(r[2]), venue: r[3] }));
}
function scannerKeyRow_(keyId) { return findRow_(master_().getSheetByName('Scanner Keys'), 1, keyId); }
function keyExpired_(expiresAt) { return !!expiresAt && new Date(expiresAt).getTime() <= Date.now(); }
function scannerUser_(keyId, sessionLookup) {
  const r = scannerKeyRow_(keyId);
  if (!r || r[6] !== true || keyExpired_(r[8])) throw new Error('UNAUTHORIZED: Scanner access key is inactive or expired');
  if (!sameSecret_(r[4], sessionLookup)) throw new Error('UNAUTHORIZED: Scanner key was rotated');
  return { id: r[0], name: r[1], role: 'SCANNER', allowed: String(r[5] || '') };
}
function requireStaff_(adminOnly) {
  const entry = SESSION_ && CacheService.getScriptCache().get('S_' + SESSION_);
  if (!entry) throw new Error('UNAUTHORIZED: Please sign in');
  const parts = String(entry).split(':'), role = parts[0], epoch = parts[parts.length - 1];
  if (epoch !== authEpoch_()) throw new Error('UNAUTHORIZED: Session expired; sign in again');
  if (role === 'A' && parts.length === 2) {
    return { id: 'ADMIN', name: 'Administrator', role: 'ADMIN', allowed: '*' };
  }
  if (role === 'K' && parts.length === 4) {
    if (adminOnly) throw new Error('FORBIDDEN: Admin only');
    if (parts[3] !== authEpoch_()) throw new Error('UNAUTHORIZED: Session expired; sign in again');
    return scannerUser_(parts[1], parts[2]);
  }
  throw new Error('UNAUTHORIZED: Invalid session');
}
function requireScanner_() {
  const user = requireStaff_(false);
  if (user.role !== 'SCANNER') throw new Error('FORBIDDEN: Scanner access key required');
  return user;
}
function loginAdmin(password) {
  try {
    const cacheKey = 'AUTH_ADMIN_FAILS', cache = CacheService.getScriptCache();
    if (Number(cache.get(cacheKey) || 0) >= 5) return { success: false, code: 'RATE_LIMITED', message: 'Too many attempts. Wait 15 minutes.' };
    const salt = P.getProperty('ADMIN_PASSWORD_SALT'), expected = P.getProperty('ADMIN_PASSWORD_HASH');
    if (!salt || !expected || typeof password !== 'string' || password.length > 256 ||
        !sameSecret_(deriveCredentialHash_(salt, password), expected)) {
      return authFailure_(cacheKey, 'UNAUTHORIZED', 'Invalid admin password');
    }
    const lock = LockService.getScriptLock(); lock.waitLock(10000);
    try {
      if (P.getProperty('ADMIN_PASSWORD_SALT') !== salt || P.getProperty('ADMIN_PASSWORD_HASH') !== expected)
        return authFailure_(cacheKey, 'UNAUTHORIZED', 'Invalid admin password');
      cache.remove(cacheKey);
      return { success: true, data: { sid: newSession_('A'), name: 'Administrator', role: 'ADMIN' } };
    } finally { lock.releaseLock(); }
  } catch (e) { return { success: false, code: 'ERROR', message: 'Admin sign-in failed' }; }
}
function loginScanner(pin, eventId) {
  pin = String(pin || '').trim();
  const cache = CacheService.getScriptCache(), globalKey = 'AUTH_SCANNER_GLOBAL_FAILS';
  if (Number(cache.get(globalKey) || 0) >= 30)
    return { success: false, code: 'RATE_LIMITED', message: 'Too many scanner attempts. Wait 15 minutes.' };
  const validFormat = /^\d{10}$/.test(pin), lookup = validFormat ? credentialLookup_(pin) : 'INVALID';
  const cacheKey = 'AUTH_SCANNER_FAILS_' + lookup;
  if (Number(CacheService.getScriptCache().get(cacheKey) || 0) >= 5)
    return { success: false, code: 'RATE_LIMITED', message: 'Too many attempts for this key. Wait 15 minutes.' };
  const r = findRow_(master_().getSheetByName('Scanner Keys'), 5, lookup);
  if (!validFormat || !r || r[6] !== true || keyExpired_(r[8]) ||
      !sameSecret_(deriveCredentialHash_(r[2], pin), r[3])) {
    cache.put(globalKey, String(Number(cache.get(globalKey) || 0) + 1), 900);
    return authFailure_(cacheKey, 'UNAUTHORIZED', 'Invalid or expired scanner access key');
  }
  const events = createScannerEvents_(String(r[5] || ''));
  if (!events.length) return { success: false, code: 'UNPUBLISHED', message: 'No active, published events are assigned to this key' };
  if (eventId && !events.some(e => e.id === String(eventId)))
    return { success: false, code: 'FORBIDDEN', message: 'This access key is not assigned to that event' };
  CacheService.getScriptCache().remove(cacheKey);
  return { success: true, data: { sid: newSession_('K:' + r[0] + ':' + lookup), name: r[1], events } };
}
function getScannerEvents(sid) {
  return wrap_(sid, () => {
    const user = requireScanner_();
    return createScannerEvents_(user.allowed);
  });
}
function logout(sid) {
  CacheService.getScriptCache().remove('S_' + String(sid || ''));
  return { success: true };
}
function wrap_(sid, fn) {
  try { SESSION_ = sid; return { success: true, data: fn() }; }
  catch (err) { return { success: false, code: String(err.message).split(':')[0], message: String(err.message).replace(/^[A-Z_]+:\s*/, '') }; }
  finally { SESSION_ = null; }
}

function normalizeAllowedEvents_(value) {
  const ids = Array.isArray(value) ? value.map(String) : String(value || '').split(',').map(s => s.trim()).filter(Boolean);
  if (ids.length === 1 && ids[0] === '*') return '*';
  if (!ids.length || ids.indexOf('*') >= 0 || ids.some(id => !/^EV-[A-Za-z0-9]+$/.test(id)))
    throw new Error('INVALID_INPUT: Select one or more events, or use all events');
  const eventRows = master_().getSheetByName('Events').getDataRange().getValues();
  const known = new Set(eventRows.slice(1).filter(r => r[4] !== 'DELETED').map(r => r[0]));
  if (ids.some(id => !known.has(id))) throw new Error('INVALID_INPUT: One or more events are unavailable');
  return Array.from(new Set(ids)).join(',');
}
function parseExpiry_(value) {
  if (!value) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
  if (!m) throw new Error('INVALID_INPUT: Choose a valid expiration date');
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59);
  if (d.getFullYear() !== Number(m[1]) || d.getMonth() !== Number(m[2]) - 1 || d.getDate() !== Number(m[3]) || d.getTime() <= Date.now())
    throw new Error('INVALID_INPUT: Expiration must be a future date');
  return d;
}
function newScannerPin_() {
  const hex = Utilities.getUuid().replace(/-/g, '').slice(0, 10);
  return String(parseInt(hex, 16) % 10000000000).padStart(10, '0');
}
function createScannerKey_(label, allowed, expires) {
  const pin = newScannerPin_(), salt = Utilities.getUuid() + Utilities.getUuid();
  const id = 'K-' + Utilities.getUuid().replace(/-/g, '').slice(0, 12);
  return {
    id, pin, salt, hash: deriveCredentialHash_(salt, pin), lookup: credentialLookup_(pin),
    label, allowed, expires
  };
}
function createScannerKey(sid, label, allowedEvents, expiresOn) {
  return wrap_(sid, () => {
    requireStaff_(true);
    label = String(label || '').trim();
    if (!label || label.length > 80) throw new Error('INVALID_INPUT: Enter a label up to 80 characters');
    const allowed = normalizeAllowedEvents_(allowedEvents), expires = parseExpiry_(expiresOn);
    const key = createScannerKey_(label, allowed, expires);
    const lock = LockService.getScriptLock(); lock.waitLock(10000);
    try {
      const actor = requireStaff_(true);
      master_().getSheetByName('Scanner Keys').appendRow([
        key.id, key.label, key.salt, key.hash, key.lookup, key.allowed, true, new Date(), key.expires, ''
      ]);
      audit_(actor, 'CREATE_SCANNER_KEY', '', key.id + ':' + label);
      return { id: key.id, pin: key.pin };
    } finally { lock.releaseLock(); }
  });
}
function listScannerKeys(sid) {
  return wrap_(sid, () => {
    requireStaff_(true);
    const sh = master_().getSheetByName('Scanner Keys'), rows = sh.getDataRange().getValues().slice(1);
    return rows.map(r => ({
      id: r[0], label: r[1], events: String(r[5] || ''), status: r[6] !== true ? 'REVOKED' : (keyExpired_(r[8]) ? 'EXPIRED' : 'ACTIVE'),
      created: r[7] instanceof Date ? Utilities.formatDate(r[7], tz_(), 'yyyy-MM-dd') : String(r[7] || ''),
      expires: r[8] instanceof Date ? Utilities.formatDate(r[8], tz_(), 'yyyy-MM-dd') : String(r[8] || '')
    }));
  });
}
function updateScannerKey(sid, keyId, label, allowedEvents, expiresOn) {
  return wrap_(sid, () => {
    requireStaff_(true);
    label = String(label || '').trim();
    if (!label || label.length > 80) throw new Error('INVALID_INPUT: Enter a label up to 80 characters');
    const allowed = normalizeAllowedEvents_(allowedEvents), expires = parseExpiry_(expiresOn);
    const lock = LockService.getScriptLock(); lock.waitLock(10000);
    try {
      const actor = requireStaff_(true);
      const sh = master_().getSheetByName('Scanner Keys'), rows = sh.getDataRange().getValues();
      for (let i = 1; i < rows.length; i++) if (rows[i][0] === keyId) {
        sh.getRange(i + 1, 2).setValue(label);
        sh.getRange(i + 1, 6).setValue(allowed);
        sh.getRange(i + 1, 9).setValue(expires);
        audit_(actor, 'UPDATE_SCANNER_KEY', '', keyId + ':' + label);
        return { ok: true };
      }
      throw new Error('NOT_FOUND');
    } finally { lock.releaseLock(); }
  });
}
function revokeScannerKey(sid, keyId) {
  return wrap_(sid, () => {
    requireStaff_(true);
    const lock = LockService.getScriptLock(); lock.waitLock(10000);
    try {
      const actor = requireStaff_(true);
      const sh = master_().getSheetByName('Scanner Keys'), rows = sh.getDataRange().getValues();
      for (let i = 1; i < rows.length; i++) if (rows[i][0] === keyId) {
        sh.getRange(i + 1, 7, 1, 1).setValue(false);
        sh.getRange(i + 1, 10, 1, 1).setValue(new Date());
        audit_(actor, 'REVOKE_SCANNER_KEY', '', keyId);
        return { ok: true };
      }
      throw new Error('NOT_FOUND');
    } finally { lock.releaseLock(); }
  });
}
function rotateScannerKey(sid, keyId) {
  return wrap_(sid, () => {
    requireStaff_(true);
    const pin = newScannerPin_(), salt = Utilities.getUuid() + Utilities.getUuid();
    const hash = deriveCredentialHash_(salt, pin), lookup = credentialLookup_(pin);
    const lock = LockService.getScriptLock(); lock.waitLock(10000);
    try {
      const actor = requireStaff_(true);
      const sh = master_().getSheetByName('Scanner Keys'), rows = sh.getDataRange().getValues();
      for (let i = 1; i < rows.length; i++) if (rows[i][0] === keyId) {
        if (rows[i][6] !== true || keyExpired_(rows[i][8])) throw new Error('INVALID_INPUT: Create a new key for revoked or expired access');
        sh.getRange(i + 1, 3, 1, 3).setValues([[salt, hash, lookup]]);
        audit_(actor, 'ROTATE_SCANNER_KEY', '', keyId);
        return { id: keyId, pin };
      }
      throw new Error('NOT_FOUND');
    } finally { lock.releaseLock(); }
  });
}
function changeAdminPassword(sid, currentPassword, newPassword) {
  return wrap_(sid, () => {
    const u = requireStaff_(true);
    const salt = P.getProperty('ADMIN_PASSWORD_SALT'), expected = P.getProperty('ADMIN_PASSWORD_HASH');
    if (!salt || !expected || !sameSecret_(deriveCredentialHash_(salt, String(currentPassword || '')), expected))
      throw new Error('UNAUTHORIZED: Current password is incorrect');
    if (!validPassword_(newPassword)) throw new Error('INVALID_INPUT: New password must be at least 12 characters');
    if (sameSecret_(String(currentPassword || ''), newPassword))
      throw new Error('INVALID_INPUT: Choose a different password');
    const newSalt = Utilities.getUuid() + Utilities.getUuid();
    const newHash = deriveCredentialHash_(newSalt, newPassword);
    const lock = LockService.getScriptLock(); lock.waitLock(10000);
    try {
      if (P.getProperty('ADMIN_PASSWORD_SALT') !== salt || P.getProperty('ADMIN_PASSWORD_HASH') !== expected)
        throw new Error('UNAUTHORIZED: Admin password changed in another session');
      requireStaff_(true);
      P.setProperties({ ADMIN_PASSWORD_SALT: newSalt, ADMIN_PASSWORD_HASH: newHash });
      bumpAuthEpoch_();
      audit_(u, 'CHANGE_ADMIN_PASSWORD', '', '');
      return { ok: true };
    } finally { lock.releaseLock(); }
  });
}

// ---- Events list ----
function listEvents(sid) {
  return wrap_(sid, () => {
    requireStaff_(true);
    return { url: ScriptApp.getService().getUrl(),
      events: master_().getSheetByName('Events').getDataRange().getValues().slice(1)
        .filter(r => r[4] !== 'DELETED')
        .map(r => ({ id: r[0], name: r[1], date: String(r[2]), venue: r[3], status: r[4], published: r[5] === true, description: r[10] || '', start: r[11] || '', end: r[12] || '' })) };
  });
}

// ---- Import with column mapping ----
function getSourceHeaders(sid, ssId, sheetName) {
  return wrap_(sid, () => {
    requireStaff_(true);
    const ss = SpreadsheetApp.openById(ssId);
    const sh = sheetName ? ss.getSheetByName(sheetName) : ss.getSheets()[0];
    if (!sh) throw new Error('NOT_FOUND: Sheet tab not found');
    return { sheets: ss.getSheets().map(s => s.getName()), headers: sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String) };
  });
}
/** mapping: {full_name:'Header', email:'Header', ...}. Skips blanks and duplicates (email / reg no). */
function importParticipants(sid, eventId, ssId, sheetName, mapping) {
  return wrap_(sid, () => {
    const u = requireStaff_(true);
    if (!mapping || !mapping.full_name) throw new Error('INVALID_INPUT: Map the name column');
    const src = SpreadsheetApp.openById(ssId).getSheetByName(sheetName);
    if (!src) throw new Error('NOT_FOUND: Sheet tab not found');
    const data = src.getDataRange().getValues(), hdr = data[0].map(String);
    const idx = k => mapping[k] ? hdr.indexOf(mapping[k]) : -1;
    if (idx('full_name') < 0) throw new Error('INVALID_INPUT: Mapped column not found');
    const lock = LockService.getScriptLock(); lock.waitLock(20000);
    try {
      const dst = SpreadsheetApp.openById(getEventRow_(eventId).v[6]).getSheetByName('Participants');
      const seen = new Set(dst.getDataRange().getValues().slice(1).map(r => pKey_(r[1], r[2], r[3], r[5])));
      const out = []; let skipped = 0, failed = 0;
      data.slice(1).forEach(r => {
        const g = k => (idx(k) >= 0 ? String(r[idx(k)]).trim() : '');
        if (!g('full_name')) { failed++; return; }
        const key = pKey_(g('full_name'), g('email'), g('phone'), g('registration_number'));
        if (seen.has(key)) { skipped++; return; }
        seen.add(key);
        out.push(['P-' + Utilities.getUuid().slice(0, 8), cellSafe_(g('full_name')), cellSafe_(g('email')), cellSafe_(g('phone')), cellSafe_(g('organization')), cellSafe_(g('registration_number')), '', 'NONE', new Date()]);
      });
      if (out.length) dst.getRange(dst.getLastRow() + 1, 1, out.length, 9).setValues(out);   // single batch write
      audit_(u, 'IMPORT', eventId, out.length + ' imported');
      return { imported: out.length, skipped, failed };
    } finally { lock.releaseLock(); }
  });
}

/** Server-side search + pagination. Token is never returned. */
function getParticipants(sid, eventId, page, q, status, qr) {
  return wrap_(sid, () => {
    requireStaff_(true);
    const ss = SpreadsheetApp.openById(getEventRow_(eventId).v[6]);
    const done = new Set(ss.getSheetByName('Checked In').getDataRange().getValues().slice(1).map(r => r[2]));
    q = String(q || '').toLowerCase();
    let rows = ss.getSheetByName('Participants').getDataRange().getValues().slice(1).map(r => ({
      id: r[0], name: r[1], email: r[2], phone: r[3], org: r[4], qr: r[6] ? 'GENERATED' : 'NONE', checked: done.has(r[0]) }));
    if (q) rows = rows.filter(r => (r.name + r.email + r.phone).toLowerCase().indexOf(q) >= 0);
    if (qr === 'generated') rows = rows.filter(r => r.qr === 'GENERATED');
    if (qr === 'none') rows = rows.filter(r => r.qr === 'NONE');
    if (status === 'checked') rows = rows.filter(r => r.checked);
    if (status === 'pending') rows = rows.filter(r => !r.checked);
    const size = 25, p = Math.max(1, Number(page) || 1);
    return { total: rows.length, page: p, size, rows: rows.slice((p - 1) * size, p * size) };
  });
}
