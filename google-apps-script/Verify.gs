/** Public receipt check. Anonymous, so it exposes only: valid?, event name, masked name, time. Globally rate-limited. */
function maskName_(n) { return String(n || '').split(/\s+/).map(p => p.charAt(0) + '***').join(' '); }
function verifyReceipt(receiptId) {
  try {
    const id = String(receiptId || '').trim().toUpperCase();
    if (!/^RC-[0-9A-F]{8}$/.test(id)) return { success: false, code: 'INVALID', message: 'Invalid receipt ID format' };
    const cache = CacheService.getScriptCache(), k = 'V_' + Math.floor(Date.now() / 60000), n = Number(cache.get(k) || 0);
    if (n >= 60) return { success: false, code: 'RATE_LIMITED', message: 'Too many checks. Try again in a minute.' };
    cache.put(k, String(n + 1), 120);
    const evs = master_().getSheetByName('Events').getDataRange().getValues().slice(1).filter(r => r[4] !== 'DELETED');
    for (const ev of evs) {
      try {
        const hit = findRow_(SpreadsheetApp.openById(ev[6]).getSheetByName('Checked In'), 10, id);
        if (hit) return { success: true, data: { valid: true, event: ev[1], name: maskName_(hit[3]), time: Utilities.formatDate(new Date(hit[6]), tz_(), 'yyyy-MM-dd HH:mm') } };
      } catch (e) { /* skip unreadable event */ }
    }
    return { success: true, data: { valid: false } };
  } catch (e) { return { success: false, code: 'ERROR', message: 'Verification unavailable' }; }
}
