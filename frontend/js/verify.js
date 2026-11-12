const out = document.getElementById('out');
document.getElementById('go').onclick = () => {
  out.textContent = 'Checking...';
  google.script.run.withSuccessHandler(r => {
    if (!r.success) { out.textContent = r.message; return; }
    out.textContent = r.data.valid ? 'Valid receipt: ' + r.data.name + ' - ' + r.data.event + ' - ' + r.data.time : 'Receipt not found.';
  }).withFailureHandler(() => { out.textContent = 'Network error. Try again.'; }).verifyReceipt(document.getElementById('rid').value);
};
