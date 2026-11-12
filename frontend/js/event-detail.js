function openEvent(e){ CUR=e; page=1; $('listView').classList.add('hide'); $('evView').classList.remove('hide'); $('evName').textContent=e.name; poll(); loadPeople();
  idle=0; lastChecked=null; sched(); }
/* Adaptive polling: 3s while attendance changes, backs off to 10s/30s when idle (protects the daily Apps Script runtime quota). */
let idle=0,lastChecked=null;
function sched(){ clearTimeout(timer); if(!CUR) return; const d=idle>20?30000:idle>5?10000:3000;
  timer=setTimeout(async()=>{ if(!document.hidden) await poll(); sched(); },d); }
document.addEventListener('visibilitychange',()=>{ if(!document.hidden&&CUR){ idle=0; poll(); sched(); } });
$('back').onclick=()=>{ clearTimeout(timer); CUR=null; $('evView').classList.add('hide'); $('listView').classList.remove('hide'); loadEvents(); };
async function poll(){ if(pollBusy||!CUR) return; pollBusy=true;           // no overlapping polls
  const r=await call('getEventSummary',CUR.id); pollBusy=false; if(!r.success||!CUR) return; const d=r.data; idle=(d.checked===lastChecked)?idle+1:0; lastChecked=d.checked;
  $('sT').textContent=d.total;$('sC').textContent=d.checked;$('sR').textContent=d.remaining;$('sP').textContent=d.pct+'%';
  $('recent').innerHTML=d.recent.map(x=>`<tr><td>${esc(x.name)}</td><td>${esc(x.time)}</td><td>${esc(x.staff)}</td></tr>`).join('')||'<tr><td>No check-ins yet</td></tr>'; }
async function loadPeople(){ const r=await call('getParticipants',CUR.id,page,$('q').value,$('st').value,$('qrF').value); if(!r.success) return toast(r.message);
  window.PEOPLE={}; r.data.rows.forEach(p=>PEOPLE[p.id]=p);
  $('ppl').innerHTML=r.data.rows.map(p=>`<tr><td>${esc(p.name)}</td><td>${esc(p.email)}</td><td>${esc(p.phone)}</td><td>${p.qr}</td><td>${p.checked?'✔ Checked in':'Pending'}</td><td><button class="sec" data-a="ed" data-id="${esc(p.id)}">Edit</button> ${p.qr==='GENERATED'?`<button class="sec" data-a="qr" data-id="${esc(p.id)}" data-n="${esc(p.name)}">QR</button> <button class="sec" data-a="rg" data-id="${esc(p.id)}">Regenerate</button>`:''} ${p.checked?`<button class="sec" data-a="ud" data-id="${esc(p.id)}">Undo</button> <button class="sec" data-a="rc" data-id="${esc(p.id)}">Receipt</button>`:''}</td></tr>`).join('')||'<tr><td colspan=6>No participants</td></tr>';
  $('pg').textContent=`Page ${r.data.page} · ${r.data.total} total`; $('prev').disabled=page<=1; $('next').disabled=page*r.data.size>=r.data.total; }
let deb; $('q').oninput=()=>{ clearTimeout(deb); deb=setTimeout(()=>{page=1;loadPeople();},350); }; $('st').onchange=$('qrF').onchange=()=>{page=1;loadPeople();};
$('prev').onclick=()=>{page--;loadPeople();}; $('next').onclick=()=>{page++;loadPeople();};
$('genQR').onclick=async()=>{ $('genQR').disabled=true; const r=await call('generateMissingQR',CUR.id); $('genQR').disabled=false;
  toast(r.success?`Generated ${r.data.generated}, skipped ${r.data.skipped}`:r.message); loadPeople(); };
$('impBtn').onclick=()=>$('imp').classList.toggle('hide');
$('loadH').onclick=async()=>{ const r=await call('getSourceHeaders',$('srcId').value.trim(),$('srcTab').value.trim()); if(!r.success) return toast(r.message);
  const f=['full_name','email','phone','organization','registration_number'];
  $('map').innerHTML=f.map(k=>`<div class="row"><label style="width:170px">${k}${k==='full_name'?' *':''}</label><select data-k="${k}"><option value="">— none —</option>${r.data.headers.map(h=>`<option>${esc(h)}</option>`).join('')}</select></div>`).join('')+'<button id="doImp">Import</button>';
  $('doImp').onclick=async()=>{ const m={}; document.querySelectorAll('#map select').forEach(s=>{ if(s.value) m[s.dataset.k]=s.value; });
    $('doImp').disabled=true; const x=await call('importParticipants',CUR.id,$('srcId').value.trim(),$('srcTab').value.trim()||r.data.sheets[0],m); $('doImp').disabled=false;
    toast(x.success?`Imported ${x.data.imported}, skipped ${x.data.skipped}, failed ${x.data.failed}`:x.message); loadPeople(); poll(); }; };
