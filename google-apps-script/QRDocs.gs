/**
 * QRDocs.gs - stores QR images in Drive and builds a printable Google Doc (QR + participant name).
 * No email, no third-party QR service: the admin's browser draws each QR from the token and
 * uploads the PNG here, so tokens never leave Google + the admin's own session.
 * Everything is batched and resumable (Apps Script runs are limited to ~6 minutes).
 */
const QR_REC_HEAD = ['participant_id', 'participant_name', 'token_hash', 'png_file_id', 'created_at'];
const QR_DOC_BATCH = 30;

function qrRecSheet_(ss) {
  let sh = ss.getSheetByName('QR Records');
  if (!sh) { sh = ss.insertSheet('QR Records'); sh.getRange(1, 1, 1, QR_REC_HEAD.length).setValues([QR_REC_HEAD]).setFontWeight('bold'); }
  return sh;
}
/** Only a short hash is stored, so a regenerated token is detected without storing tokens twice. */
function tokenHash_(token) {
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token)).slice(0, 12);
}

/** Participants whose QR image is missing or stale (token regenerated). Admin only. */
function getQRPending(sid, eventId, limit) {
  return wrap_(sid, () => {
    requireStaff_(true);
    const ss = SpreadsheetApp.openById(getEventRow_(eventId).v[6]);
    const have = {};
    qrRecSheet_(ss).getDataRange().getValues().slice(1).forEach(r => { have[r[0]] = r[2]; });
    const pending = ss.getSheetByName('Participants').getDataRange().getValues().slice(1)
      .filter(r => r[6] && r[7] !== 'REVOKED' && have[r[0]] !== tokenHash_(r[6]));
    return { remaining: pending.length, items: pending.slice(0, Math.min(Number(limit) || 25, 50)).map(r => ({ id: r[0], name: r[1], token: r[6] })) };
  });
}

/** items: [{id, png}] png = base64 without the data: prefix. Replaces stale files. */
function saveQRImages(sid, eventId, items) {
  return wrap_(sid, () => {
    const u = requireStaff_(true);
    if (!Array.isArray(items) || items.length > 50) throw new Error('INVALID_INPUT: Max 50 per batch');
    const lock = LockService.getScriptLock(); lock.waitLock(20000);
    try {
      const ss = SpreadsheetApp.openById(getEventRow_(eventId).v[6]);
      const people = {};
      ss.getSheetByName('Participants').getDataRange().getValues().slice(1).forEach(r => { people[r[0]] = r; });
      const folder = subFolder_(eventId, 'QR Codes'), rec = qrRecSheet_(ss);
      const recRows = rec.getDataRange().getValues(), rowOf = {};
      recRows.forEach((r, i) => { if (i > 0) rowOf[r[0]] = i + 1; });
      const adds = []; let saved = 0;
      items.forEach(it => {
        const p = people[it.id];
        if (!p || !p[6] || !it.png || String(it.png).length > 300000) return;       // unknown id / oversize: skip
        const old = rowOf[it.id] ? recRows[rowOf[it.id] - 1][3] : null;
        if (old) { try { DriveApp.getFileById(old).setTrashed(true); } catch (e) { /* already gone */ } }
        const file = folder.createFile(Utilities.newBlob(Utilities.base64Decode(it.png), 'image/png', safeName_(p[1]) + ' - ' + p[0] + '.png'));
        const row = [p[0], p[1], tokenHash_(p[6]), file.getId(), new Date()];
        if (rowOf[it.id]) rec.getRange(rowOf[it.id], 1, 1, 5).setValues([row]); else adds.push(row);
        saved++;
      });
      if (adds.length) rec.getRange(rec.getLastRow() + 1, 1, adds.length, 5).setValues(adds);   // one batch write
      audit_(u, 'SAVE_QR_IMAGES', eventId, saved + ' files');
      return { saved };
    } finally { lock.releaseLock(); }
  });
}

/**
 * Builds the printable Doc in resumable batches. First call (offset 0) creates a new Doc and
 * trashes the previous one; later calls append the next QR_DOC_BATCH people as a 3-column table.
 */
function buildQRDoc(sid, eventId, offset) {
  return wrap_(sid, () => {
    const u = requireStaff_(true);
    offset = Number(offset) || 0;
    const ev = getEventRow_(eventId).v, ss = SpreadsheetApp.openById(ev[6]), key = 'QRDOC_' + eventId;
    const all = qrRecSheet_(ss).getDataRange().getValues().slice(1).sort((a, b) => String(a[1]).localeCompare(String(b[1])));
    let doc;
    if (offset === 0) {
      const prev = P.getProperty(key);
      if (prev) { try { DriveApp.getFileById(prev).setTrashed(true); } catch (e) { /* ignore */ } }
      doc = DocumentApp.create('QR Codes - ' + ev[1]);
      DriveApp.getFileById(doc.getId()).moveTo(eventFolder_(eventId));
      P.setProperty(key, doc.getId());
      doc.getBody().appendParagraph(ev[1] + ' - participant QR codes').setHeading(DocumentApp.ParagraphHeading.HEADING1);
      doc.getBody().appendParagraph('Confidential: each QR checks in one person. Do not share this document.');
    } else {
      doc = DocumentApp.openById(P.getProperty(key));
    }
    const slice = all.slice(offset, offset + QR_DOC_BATCH), rows = [];
    for (let i = 0; i < slice.length; i += 3) rows.push([0, 1, 2].map(k => (slice[i + k] ? ' ' : '')));
    if (rows.length) {
      const table = doc.getBody().appendTable(rows);
      slice.forEach((r, i) => {
        const cell = table.getCell(Math.floor(i / 3), i % 3);
        try {
          const img = DriveApp.getFileById(r[3]).getBlob();
          cell.getChild(0).asParagraph().appendInlineImage(img).setWidth(120).setHeight(120);
        } catch (e) { cell.appendParagraph('(image missing - run Save QR again)'); }
        cell.appendParagraph(String(r[1])).setBold(true).setFontSize(10);
        cell.appendParagraph(String(r[0])).setFontSize(8);
      });
    }
    doc.saveAndClose();
    const next = offset + QR_DOC_BATCH, done = next >= all.length;
    if (done) audit_(u, 'BUILD_QR_DOC', eventId, all.length + ' QR');
    return { next, total: all.length, done, url: DriveApp.getFileById(P.getProperty(key)).getUrl() };
  });
}

function getQRDocInfo(sid, eventId) {
  return wrap_(sid, () => {
    requireStaff_(true);
    const id = P.getProperty('QRDOC_' + eventId);
    if (!id) return { url: '' };
    try { return { url: DriveApp.getFileById(id).getUrl() }; } catch (e) { return { url: '' }; }
  });
}
