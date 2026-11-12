$('adminLogin').onsubmit = async ev => { ev.preventDefault(); $('liBtn').disabled = true;
  const r = await AppBackend.request('loginAdmin', $('pw').value);
  $('liBtn').disabled=false;
  if(!r.success) return toast(r.message);
  SID=r.data.sid; sessionStorage.setItem('asid',SID); $('pw').value='';
  if(r.data.role!=='ADMIN'){ signedOut(); return toast('Admin access required'); }
  boot(r.data.name); };
$('out').onclick = () => { AppBackend.request('logout', SID); signedOut(); };

async function boot(name){ setTimeout(loadDash,300); $('loginView').classList.add('hide'); $('app').classList.remove('hide'); $('who').textContent=name; loadEvents(); }
if (SID) call('listEvents').then(r => r.success ? boot('') : signedOut());
