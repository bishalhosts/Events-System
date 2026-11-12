const $ = id => document.getElementById(id);
let pendingRq=null; /* same id on retry => server returns the existing event instead of a duplicate */
let SID = sessionStorage.getItem('asid'), CUR = null, page = 1, pollBusy = false, timer = null;
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function toast(m){ const e=$('msg'); e.textContent=m; e.style.display='block'; setTimeout(()=>e.style.display='none',3500); }
/** Promise wrapper around google.script.run; every call carries the session id. */
function call(fn, ...a){ return new Promise(res => google.script.run
  .withSuccessHandler(r => { if (r && r.code === 'UNAUTHORIZED') { signedOut(); } res(r); })
  .withFailureHandler(() => res({success:false,message:'Network error — please retry'}))[fn](SID, ...a)); }
function signedOut(){ SID=null; sessionStorage.removeItem('asid'); clearInterval(timer); $('app').classList.add('hide'); $('loginView').classList.remove('hide'); }
