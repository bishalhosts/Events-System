/**
 * Branding.gs - one place for PDF header/footer branding (receipts + attendance report).
 * Admin edits everything from Settings: name, tagline, address, header color, footer text, logo.
 */
function brand_() {
  let logo = '';
  const id = P.getProperty('LOGO_FILE_ID');
  if (id) { try { logo = 'data:image/png;base64,' + Utilities.base64Encode(DriveApp.getFileById(id).getBlob().getBytes()); } catch (e) { /* logo deleted: render without it */ } }
  return {
    name: P.getProperty('ORG_NAME') || '', tagline: P.getProperty('ORG_TAGLINE') || '', address: P.getProperty('ORG_ADDRESS') || '',
    color: P.getProperty('BRAND_COLOR') || '#0f1b3d', footer: P.getProperty('BRAND_FOOTER') || '', logo
  };
}

/** Opens a wrapper <div>; brandFooter_() closes it. Color is validated on save, text is escaped. */
function brandHeader_(b, title) {
  return '<div style="font-family:Arial;padding:30px;color:#0f1b3d"><table style="width:100%;border-bottom:3px solid ' + b.color + ';margin-bottom:16px"><tr>' +
    (b.logo ? '<td style="width:90px"><img src="' + b.logo + '" style="max-height:64px;max-width:120px"></td>' : '') +
    '<td><div style="font-size:20px;font-weight:bold;color:' + b.color + '">' + htmlEsc_(b.name) + '</div>' +
    '<div style="color:#555;font-size:12px">' + htmlEsc_(b.tagline) + '</div><div style="color:#777;font-size:11px">' + htmlEsc_(b.address) + '</div></td></tr></table>' +
    '<h3 style="color:' + b.color + '">' + htmlEsc_(title) + '</h3>';
}
function brandFooter_(b) {
  return '<p style="margin-top:24px;color:#777;font-size:11px;border-top:1px solid #ddd;padding-top:8px">' + htmlEsc_(b.footer) + '</p></div>';
}

/** png = base64 of a PNG (the browser downsizes it first). Validates size and PNG signature server-side. */
function uploadLogo(sid, png) {
  return wrap_(sid, () => {
    const u = requireStaff_(true);
    if (!png || String(png).length > 250000) throw new Error('INVALID_INPUT: Logo too large (max ~180 KB)');
    const bytes = Utilities.base64Decode(png);
    if (bytes.length < 8 || bytes[0] !== -119 || bytes[1] !== 80 || bytes[2] !== 78 || bytes[3] !== 71) throw new Error('INVALID_INPUT: Not a PNG image');
    const folder = childFolder_(rootFolder_(), 'Branding');
    const old = P.getProperty('LOGO_FILE_ID');
    if (old) { try { DriveApp.getFileById(old).setTrashed(true); } catch (e) { /* already gone */ } }
    const file = folder.createFile(Utilities.newBlob(bytes, 'image/png', 'logo.png'));
    P.setProperty('LOGO_FILE_ID', file.getId());
    audit_(u, 'UPLOAD_LOGO', '', ''); return { ok: true };
  });
}
function removeLogo(sid) {
  return wrap_(sid, () => {
    const u = requireStaff_(true);
    const old = P.getProperty('LOGO_FILE_ID');
    if (old) { try { DriveApp.getFileById(old).setTrashed(true); } catch (e) { /* ignore */ } P.deleteProperty('LOGO_FILE_ID'); }
    audit_(u, 'REMOVE_LOGO', '', ''); return { ok: true };
  });
}
