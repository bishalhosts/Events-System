/** AttendanceReports.gs - filtered attendance listing and PDF attendance report (admin only). */

/** opts: {q, staff, from:'yyyy-MM-dd', to:'yyyy-MM-dd'} - dates compare in the event timezone. */
function filterAttendance_(rows, o) {
  const q = String(o.q || '').toLowerCase();
  return rows.filter(r => {
    const day = Utilities.formatDate(new Date(r[6]), tz_(), 'yyyy-MM-dd');
    if (o.from && day < o.from) return false;
    if (o.to && day > o.to) return false;
    if (o.staff && r[8] !== o.staff) return false;
    return !q || (r[3] + ' ' + r[4] + ' ' + r[5]).toLowerCase().indexOf(q) >= 0;
  }).sort((a, b) => new Date(b[6]) - new Date(a[6]));
}

function getAttendance(sid, eventId, page, o) {
  return wrap_(sid, () => {
    requireStaff_(true);
    o = o || {};
    const all = SpreadsheetApp.openById(getEventRow_(eventId).v[6]).getSheetByName('Checked In').getDataRange().getValues().slice(1);
    const rows = filterAttendance_(all, o), size = 25, p = Math.max(1, Number(page) || 1);
    return {
      total: rows.length, page: p, size,
      staff: Array.from(new Set(all.map(r => r[8]))).sort(),
      rows: rows.slice((p - 1) * size, p * size).map(r => ({
        name: r[3], email: r[4], phone: r[5], staff: r[8], receipt: r[9], url: r[10],
        time: Utilities.formatDate(new Date(r[6]), tz_(), 'yyyy-MM-dd HH:mm:ss') }))
    };
  });
}

function generateAttendancePDF(sid, eventId, o) {
  return wrap_(sid, () => {
    const u = requireStaff_(true);
    o = o || {};
    const ev = getEventRow_(eventId).v, ss = SpreadsheetApp.openById(ev[6]);
    const all = ss.getSheetByName('Checked In').getDataRange().getValues().slice(1);
    const rows = filterAttendance_(all, o).slice(0, 3000);                    // hard cap keeps the run inside quota
    const total = Math.max(ss.getSheetByName('Participants').getLastRow() - 1, 0);
    const td = s => '<td style="border-bottom:1px solid #ddd;padding:4px;font-size:11px">' + htmlEsc_(s) + '</td>';
    const brand = brand_();
    const html = brandHeader_(brand, 'Attendance report - ' + ev[1]) + '<p>Registered: ' + total + ' | Checked in (all): ' + all.length + ' | Attendance: ' +
      (total ? Math.round(all.length * 100 / total) : 0) + '% | In this report: ' + rows.length + '</p>' +
      '<p style="font-size:11px;color:#666">Filters: ' + htmlEsc_([o.from, o.to, o.staff, o.q].filter(Boolean).join(' / ') || 'none') +
      ' | Generated ' + Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd HH:mm') + '</p><table style="width:100%;border-collapse:collapse"><tr>' +
      ['Name', 'Email', 'Phone', 'Check-in', 'Staff'].map(h => '<th style="text-align:left;padding:4px;background:#eef0f4;font-size:11px">' + h + '</th>').join('') + '</tr>' +
      rows.map(r => '<tr>' + td(r[3]) + td(r[4]) + td(r[5]) + td(Utilities.formatDate(new Date(r[6]), tz_(), 'yyyy-MM-dd HH:mm')) + td(r[8]) + '</tr>').join('') + '</table>' + brandFooter_(brand);
    const name = 'attendance-' + Utilities.formatDate(new Date(), tz_(), 'yyyyMMdd-HHmm') + '.pdf';
    const file = subFolder_(eventId, 'Reports').createFile(HtmlService.createHtmlOutput(html).getBlob().getAs('application/pdf').setName(name));
    audit_(u, 'ATTENDANCE_PDF', eventId, rows.length + ' rows');
    return { url: file.getUrl(), rows: rows.length };
  });
}
