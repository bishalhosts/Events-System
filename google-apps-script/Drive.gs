/**
 * Drive.gs - ONE place that decides where every file lives.
 *
 * QR Event System/                 <- root (id in script property ROOT_FOLDER)
 *   <EVENT_ID>/                    <- one folder per event (name = event id, never renamed)
 *     Event - <name> - <id>        <- the event's Google Spreadsheet
 *     QR Codes/                    <- one PNG per participant: "<Name> - <ParticipantID>.png"
 *     QR Codes - <event> (Doc)     <- printable Google Doc: QR image + name + participant ID
 *     Receipts/                    <- RC-XXXXXXXX.pdf
 *   QR Event System - Master       <- master spreadsheet (after organizeDrive())
 * QR Event System Backups/         <- daily copies (see Extras2.gs)
 */
function rootFolder_() {
  const id = P.getProperty('ROOT_FOLDER');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* deleted: recreate below */ } }
  const f = DriveApp.createFolder('QR Event System');
  P.setProperty('ROOT_FOLDER', f.getId());
  return f;
}
function childFolder_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}
function eventFolder_(eventId) { return childFolder_(rootFolder_(), eventId); }
function subFolder_(eventId, name) { return childFolder_(eventFolder_(eventId), name); }

/** Safe file name: keeps letters/digits of any language, strips path and control characters. */
function safeName_(s) {
  return String(s || 'participant').replace(/[\\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || 'participant';
}

/** Run once from the editor to tidy an existing project: moves master + event sheets into the folder tree. */
function organizeDrive_() {
  const root = rootFolder_();
  DriveApp.getFileById(P.getProperty('MASTER_ID')).moveTo(root);
  let moved = 0;
  master_().getSheetByName('Events').getDataRange().getValues().slice(1).forEach(r => {
    try { DriveApp.getFileById(r[6]).moveTo(eventFolder_(r[0])); moved++; } catch (e) { console.error('Move failed ' + r[0] + ': ' + e); }
  });
  return 'Moved ' + moved + ' event spreadsheets';
}
