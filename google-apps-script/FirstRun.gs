/**
 * FirstRun.gs - editor-only initial setup. Never put passwords in source code.
 * Before running: add ADMIN_PASSWORD_TEMP (12+ characters) in Script Properties, then run firstRun_().
 */
function firstRun_() {
  const configured = !!P.getProperty('ADMIN_PASSWORD_HASH');
  if (!configured && !validPassword_(P.getProperty('ADMIN_PASSWORD_TEMP') || ''))
    throw new Error('Add ADMIN_PASSWORD_TEMP (at least 12 characters) in Script Properties first.');
  const msg = setup_();
  ensureAuthSchema_();
  if (!configured) {
    const password = P.getProperty('ADMIN_PASSWORD_TEMP');
    initializeAdminPassword_(password);
  }
  P.deleteProperty('ADMIN_PASSWORD_TEMP');
  P.deleteProperty('OWNER_PIN_TEMP');
  if (!P.getProperty('ORG_NAME')) setBranding_('Your Organization', '', '');
  const trig = installBackupTrigger_();
  return msg + ' | Admin password configured | backup trigger: ' + trig;
}
