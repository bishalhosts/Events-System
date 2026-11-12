const out = document.getElementById('out');
const rid = document.getElementById('rid');
const params = new URLSearchParams(location.search);
rid.value = params.get('rid') || params.get('verify') || rid.value;
document.getElementById('go').onclick = async () => {
  out.textContent = 'Checking...';
  const r = await AppBackend.request('verifyReceipt', rid.value);
  if (!r.success) { out.textContent = r.message; return; }
  out.textContent = r.data.valid ? 'Valid receipt: ' + r.data.name + ' - ' + r.data.event + ' - ' + r.data.time : 'Receipt not found.';
};
