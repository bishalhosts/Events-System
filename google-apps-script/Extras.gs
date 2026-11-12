/** Receipts (PDF in Drive), CSV exports, QR token feed for image download, archive. */

const htmlEsc_ = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * Called AFTER check-in succeeded and outside the attendance lock, so a PDF failure
 * never affects attendance. Safe to call again (idempotent). force=true (admin) regenerates.
 * Drive files stay private to the owner; only admins receive the URL.
 */
function generateReceipt(sid, eventId, participantId, force) {
  return wrap_(sid, () => {
    const u = requireStaff_(false);
    if (!canAccess_(u, eventId)) throw new Error('FORBIDDEN: Not assigned to this event');
    const ev = getEventRow_(eventId).v;
    const cs = SpreadsheetApp.openById(ev[6]).getSheetByName('Checked In');
    const rows = cs.getDataRange().getValues();
    const i = rows.findIndex((r, k) => k > 0 && r[2] === participantId);
    if (i < 0) throw new Error('NOT_FOUND: Participant has not checked in');
    const r = rows[i];
    const out = (id, url) => ({ receipt_id: id, url: u.role === 'ADMIN' ? url : '' });
    if (r[10] && !(force && u.role === 'ADMIN')) return out(r[9], r[10]);
    const rid = 'RC-' + Utilities.getUuid().slice(0, 8).toUpperCase();
    const org = P.getProperty('ORG_NAME') || 'Your Organization';
    const when = Utilities.formatDate(new Date(r[6]), tz_(), 'yyyy-MM-dd HH:mm:ss');
    const row = (k, v) => '<tr><td style="padding:6px;color:#555">' + k + '</td><td style="padding:6px"><b>' + htmlEsc_(v) + '</b></td></tr>';
    const b = brand_();
    const html = brandHeader_(b, 'Attendance Receipt') + '<table>' +
      row('Receipt ID', rid) + row('Event', ev[1]) + row('Participant', r[3]) + row('Email', r[4]) + row('Phone', r[5]) +
      row('Participant ID', r[2]) + row('Check-in', when) + row('Checked in by', r[8]) +
      '</table><p style="color:#777;font-size:11px">Verify this receipt: ' + htmlEsc_(ScriptApp.getService().getUrl() + '?verify=' + rid) + '</p>' + brandFooter_(b);
    const pdf = HtmlService.createHtmlOutput(html).getBlob().getAs('application/pdf').setName(rid + '.pdf');
    const file = subFolder_(eventId, 'Receipts').createFile(pdf);
    const lock = LockService.getScriptLock(); lock.waitLock(10000);
    try {
      const cur = cs.getRange(i + 1, 10, 1, 2).getValues()[0];
      if (cur[1] && !force) return out(cur[0], cur[1]);          // another request won the race
      cs.getRange(i + 1, 10, 1, 2).setValues([[rid, file.getUrl()]]);
      audit_(u, 'RECEIPT', eventId, rid);
    } finally { lock.releaseLock(); }
    return out(rid, file.getUrl());
  });
}

// ---- CSV export (formula-injection safe) ----
function csvCell_(v) {
  let s = v instanceof Date ? Utilities.formatDate(v, tz_(), 'yyyy-MM-dd HH:mm:ss') : String(v == null ? '' : v);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}
function exportCSV(sid, eventId, kind) {
  return wrap_(sid, () => {
    const u = requireStaff_(true);
    const ss = SpreadsheetApp.openById(getEventRow_(eventId).v[6]);
    const done = ss.getSheetByName('Checked In').getDataRange().getValues();
    let head, body;
    if (kind === 'participants') {
      head = ['participant_id', 'full_name', 'email', 'phone', 'organization', 'registration_number', 'qr_status', 'checked_in'];
      const ids = new Set(done.slice(1).map(r => r[2]));
      body = ss.getSheetByName('Participants').getDataRange().getValues().slice(1).map(r => [r[0], r[1], r[2], r[3], r[4], r[5], r[6] ? 'GENERATED' : 'NONE', ids.has(r[0]) ? 'YES' : 'NO']);
    } else if (kind === 'absent') {
      const ids = new Set(done.slice(1).map(r => r[2]));
      head = ['participant_id', 'full_name', 'email', 'phone', 'organization'];
      body = ss.getSheetByName('Participants').getDataRange().getValues().slice(1).filter(r => !ids.has(r[0])).map(r => r.slice(0, 5));
    } else {
      head = ['participant_id', 'name', 'email', 'phone', 'checkin_time', 'staff', 'receipt_id'];
      body = done.slice(1).map(r => [r[2], r[3], r[4], r[5], r[6], r[8], r[9]]);
    }
    audit_(u, 'EXPORT_' + kind, eventId, body.length + ' rows');
    return { name: (kind === 'absent' ? 'not-arrived-' : kind === 'participants' ? 'participants-' : 'attendance-') + eventId + '.csv',
             csv: '\ufeff' + [head].concat(body).map(r => r.map(csvCell_).join(',')).join('\n') };
  });
}

/** Admin-only token feed; the browser renders QR images (tokens never leave the admin session). */
function getQRTokens(sid, eventId, participantId) {
  return wrap_(sid, () => {
    requireStaff_(true);
    const ps = SpreadsheetApp.openById(getEventRow_(eventId).v[6]).getSheetByName('Participants').getDataRange().getValues().slice(1);
    return ps.filter(r => r[6] && r[7] !== 'REVOKED' && (!participantId || r[0] === participantId)).map(r => ({ id: r[0], name: r[1], token: r[6] }));
  });
}
/** Explicit secure regeneration: old token is replaced and stops working immediately. */
function regenerateQR(sid, eventId, participantId) {
  return wrap_(sid, () => {
    const u = requireStaff_(true);
    const lock = LockService.getScriptLock(); lock.waitLock(10000);
    try {
      const sh = SpreadsheetApp.openById(getEventRow_(eventId).v[6]).getSheetByName('Participants');
      const rows = sh.getDataRange().getValues();
      for (let i = 1; i < rows.length; i++) if (rows[i][0] === participantId) {
        sh.getRange(i + 1, 7, 1, 2).setValues([[newToken_(), 'GENERATED']]);
        audit_(u, 'REGENERATE_QR', eventId, participantId); return { ok: true };
      }
      throw new Error('NOT_FOUND');
    } finally { lock.releaseLock(); }
  });
}
function setEventStatus(sid, eventId, status) {
  return wrap_(sid, () => {
    const u = requireStaff_(true);
    if (['ACTIVE', 'ARCHIVED'].indexOf(status) < 0) throw new Error('INVALID_INPUT');
    const e = getEventRow_(eventId);
    e.sh.getRange(e.row, 5).setValue(status);
    if (status === 'ARCHIVED') e.sh.getRange(e.row, 6).setValue(false);   // archiving also unpublishes
    audit_(u, 'EVENT_' + status, eventId); return { status };
  });
}
/** Run once from editor to brand receipts. */
function setBranding_(name, tagline, address) {
  P.setProperty('ORG_NAME', name); P.setProperty('ORG_TAGLINE', tagline || ''); P.setProperty('ORG_ADDRESS', address || '');
}
