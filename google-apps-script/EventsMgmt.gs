/** EventsMgmt.gs - edit/delete/connect events, participant edit, main dashboard summary. */

/** Run once on an existing project: adds the spec's extra Events columns (K:N). New setups get them automatically. */
function upgradeSchema_() {
  master_().getSheetByName('Events').getRange(1, 11, 1, 4).setValues([['description', 'start_time', 'end_time', 'drive_folder_id']]).setFontWeight('bold');
  return 'Events schema upgraded';
}

function updateEvent(sid, eventId, f) {
  return wrap_(sid, () => {
    const u = requireStaff_(true);
    const name = String(f.name || '').trim();
    if (!name || name.length > 120 || String(f.description || '').length > 500) throw new Error('INVALID_INPUT: Check name/description length');
    const lock = LockService.getScriptLock(); lock.waitLock(10000);
    try {
      const e = getEventRow_(eventId);
      e.sh.getRange(e.row, 2, 1, 3).setValues([[name, f.date || '', String(f.venue || '').slice(0, 200)]]);
      e.sh.getRange(e.row, 9).setValue(new Date());
      e.sh.getRange(e.row, 11, 1, 3).setValues([[String(f.description || ''), f.start || '', f.end || '']]);
      audit_(u, 'UPDATE_EVENT', eventId, name); return { ok: true };
    } finally { lock.releaseLock(); }
  });
}

/**
 * Safe delete: requires typing the exact event name. Soft delete only - the event is hidden, its scanner
 * is closed, and all Sheets/Drive data is kept. Restore by setting event_status back to ACTIVE in the master sheet.
 */
function deleteEvent(sid, eventId, confirmName) {
  return wrap_(sid, () => {
    const u = requireStaff_(true);
    const e = getEventRow_(eventId);
    if (String(confirmName) !== String(e.v[1])) throw new Error('INVALID_INPUT: Typed name does not match');
    e.sh.getRange(e.row, 5, 1, 2).setValues([['DELETED', false]]);
    audit_(u, 'DELETE_EVENT', eventId, e.v[1]); return { ok: true };
  });
}

/** Point an event at an existing spreadsheet. Refuses if the event already has attendance (would orphan it). */
function connectExistingSpreadsheet(sid, eventId, ssId) {
  return wrap_(sid, () => {
    const u = requireStaff_(true);
    const e = getEventRow_(eventId);
    const old = SpreadsheetApp.openById(e.v[6]).getSheetByName('Checked In');
    if (old && old.getLastRow() > 1) throw new Error('INVALID_INPUT: Event already has check-ins; create a new event instead');
    let ss;
    try { ss = SpreadsheetApp.openById(String(ssId).trim()); } catch (err) { throw new Error('NOT_FOUND: Cannot open spreadsheet. Share it with the owner account.'); }
    Object.keys(EVENT_SHEETS).forEach(n => {
      let sh = ss.getSheetByName(n);
      if (!sh) { sh = ss.insertSheet(n); sh.getRange(1, 1, 1, EVENT_SHEETS[n].length).setValues([EVENT_SHEETS[n]]).setFontWeight('bold'); }
      else if (sh.getLastRow() > 0 && String(sh.getRange(1, 1).getValue()) !== EVENT_SHEETS[n][0])
        throw new Error('INVALID_INPUT: Tab "' + n + '" exists with other columns. Use Import participants from that sheet instead.');
    });
    e.sh.getRange(e.row, 7).setValue(ss.getId());
    audit_(u, 'CONNECT_SHEET', eventId, ss.getName()); return { name: ss.getName() };
  });
}

function updateParticipant(sid, eventId, participantId, f) {
  return wrap_(sid, () => {
    const u = requireStaff_(true);
    const name = String(f.name || '').trim();
    if (!name || name.length > 120 || String(f.email || '').length > 120 || String(f.phone || '').length > 40) throw new Error('INVALID_INPUT');
    const lock = LockService.getScriptLock(); lock.waitLock(10000);
    try {
      const sh = SpreadsheetApp.openById(getEventRow_(eventId).v[6]).getSheetByName('Participants');
      const ids = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues() : [];
      const i = ids.findIndex(r => r[0] === participantId);
      if (i < 0) throw new Error('NOT_FOUND');
      sh.getRange(i + 2, 2, 1, 4).setValues([[cellSafe_(name), cellSafe_(f.email || ''), cellSafe_(f.phone || ''), cellSafe_(f.org || '')]]);
      audit_(u, 'UPDATE_PARTICIPANT', eventId, participantId); return { ok: true };
    } finally { lock.releaseLock(); }
  });
}

/** Cross-event totals. Short cache is display-only; it never decides attendance or publication. */
function getDashboardSummary(sid) {
  return wrap_(sid, () => {
    requireStaff_(true);
    const cache = CacheService.getScriptCache(), hit = cache.get('DASH');
    if (hit) return JSON.parse(hit);
    const evs = master_().getSheetByName('Events').getDataRange().getValues().slice(1).filter(r => r[4] !== 'DELETED');
    const active = evs.filter(r => r[4] === 'ACTIVE');
    let participants = 0, checked = 0;
    active.forEach(r => { try {
      const ss = SpreadsheetApp.openById(r[6]);
      participants += Math.max(ss.getSheetByName('Participants').getLastRow() - 1, 0);
      checked += Math.max(ss.getSheetByName('Checked In').getLastRow() - 1, 0);
    } catch (e) { console.error('Dashboard skip ' + r[0] + ': ' + e); } });
    const out = { events: evs.length, active: active.length, published: active.filter(r => r[5] === true).length, participants, checked };
    cache.put('DASH', JSON.stringify(out), 15);   // opening every event sheet is slow: keep it off the 5s poll path
    return out;
  });
}

function getCurrentUser(sid) { return wrap_(sid, () => { const u = requireStaff_(true); return { name: u.name, role: u.role }; }); }
