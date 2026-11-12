const $ = id => document.getElementById(id);
let pendingRq=null; /* same id on retry => server returns the existing event instead of a duplicate */
let SID = sessionStorage.getItem('asid'), CUR = null, page = 1, pollBusy = false, timer = null;
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function toast(m){ const e=$('msg'); e.textContent=m; e.style.display='block'; setTimeout(()=>e.style.display='none',3500); }
/** Promise wrapper around the Apps Script bridge; every call carries the session id. */
function call(fn, ...a){ return AppBackend.request(fn, SID, ...a).then(r => {
  if (r && r.code === 'UNAUTHORIZED') signedOut();
  return r;
}); }
function signedOut(){ SID=null; sessionStorage.removeItem('asid'); clearInterval(timer); $('app').classList.add('hide'); $('loginView').classList.remove('hide'); }
