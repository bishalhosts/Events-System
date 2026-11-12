function dlg(html){ $('dlgBody').innerHTML=html; if(!$('dlg').open) $('dlg').showModal(); }
$('dlgClose').onclick=()=>$('dlg').close();
async function accessDlg(result){
  const [kr,er]=await Promise.all([call('listScannerKeys'),call('listEvents')]);
  if(!kr.success||!er.success) return toast(!kr.success?kr.message:er.message);
  const edit=result&&result.editKey, active=er.data.events;
  const events=new Map(er.data.events.map(e=>[e.id,e.name]));
  const selected=new Set(edit?edit.events.split(','):[]);
  const allSelected=edit&&edit.events==='*';
  const options=[`<option value="*" ${allSelected?'selected':''}>All events (including future events)</option>`].concat(active.map(e=>`<option value="${esc(e.id)}" ${selected.has(e.id)?'selected':''}>${esc(e.name)} — ${esc(e.id)}${e.status==='ARCHIVED'?' (archived)':''}</option>`)).join('');
  const rows=kr.data.map(k=>{
    const assigned=k.events==='*'?'All events':k.events.split(',').map(id=>`${events.get(id)||'Unavailable'} (${id})`).map(esc).join(', ');
    const actions=`<button class="sec" data-key-action="edit" data-id="${esc(k.id)}">Edit</button> ${k.status==='ACTIVE'?`<button class="sec" data-key-action="rotate" data-id="${esc(k.id)}">Rotate PIN</button> <button class="sec" data-key-action="revoke" data-id="${esc(k.id)}">Revoke</button>`:'—'}`;
    return `<tr><td>${esc(k.label)}<br><small>${esc(k.id)}</small></td><td>${assigned}</td><td>${esc(k.status)}</td><td>${esc(k.expires||'Never')}</td><td>${actions}</td></tr>`;
  }).join('')||'<tr><td colspan="5">No scanner keys have been created.</td></tr>';
  dlg(`<h3>Access management</h3>
    <h4>${edit?'Edit scanner access':'Scanner access keys'}</h4><p>Each PIN is shown only when created or rotated. Assign only the events this scanner needs.</p>
    <form id="keyForm" ${edit?`data-edit-id="${esc(edit.id)}"`:''}><div class="row"><label for="keyLabel">Label</label><input id="keyLabel" value="${esc(edit?edit.label:'')}" required maxlength="80" placeholder="e.g. Main entrance"></div>
    <div class="row"><label for="keyEvents">Allowed events</label><select id="keyEvents" multiple size="4" required>${options}</select></div>
    <div class="row"><label for="keyExpiry">Expires on (optional)</label><input id="keyExpiry" type="date" value="${esc(edit?edit.expires:'')}"></div><button id="keyCreate" type="submit">${edit?'Save access changes':'Generate scanner PIN'}</button> ${edit?'<button class="sec" id="cancelKeyEdit" type="button">Cancel edit</button>':''}</form>
    <div id="keyResult" aria-live="polite"></div>
    <div style="max-height:35vh;overflow:auto"><table><thead><tr><th>Key</th><th>Events</th><th>Status</th><th>Expires</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table></div>
    <hr><h4>Change admin password</h4><form id="adminPasswordChange">
    <div class="row"><input id="currentAdminPassword" type="password" autocomplete="current-password" required maxlength="256" placeholder="Current password"></div>
    <div class="row"><input id="newAdminPassword" type="password" autocomplete="new-password" required minlength="12" maxlength="256" placeholder="New password (12+ characters)"></div>
    <div class="row"><input id="confirmAdminPassword" type="password" autocomplete="new-password" required minlength="12" maxlength="256" placeholder="Confirm new password"></div>
    <button type="submit">Change password</button></form>`);
  if(result&&result.pin) $('keyResult').innerHTML=`<p><b>${esc(result.label||'Scanner key')} — copy this PIN now; it cannot be viewed again.</b></p><div class="row"><input id="generatedPin" readonly value="${esc(result.pin)}" aria-label="New scanner PIN"><button class="sec" id="copyPin" type="button">Copy PIN</button></div>`;
  $('dlgBody').onsubmit=async ev=>{
    ev.preventDefault();
    if(ev.target.id==='keyForm'){
      const selected=Array.from($('keyEvents').selectedOptions).map(o=>o.value);
      if(selected.includes('*')&&selected.length!==1) return toast('Choose all events or specific events, not both');
      $('keyCreate').disabled=true;
      const editId=ev.target.dataset.editId;
      const r=editId
        ?await call('updateScannerKey',editId,$('keyLabel').value.trim(),selected,$('keyExpiry').value)
        :await call('createScannerKey',$('keyLabel').value.trim(),selected,$('keyExpiry').value);
      if(!r.success){$('keyCreate').disabled=false;return toast(r.message);}
      if(editId){toast('Scanner access updated');accessDlg();return;}
      accessDlg({label:$('keyLabel').value.trim(),pin:r.data.pin});
    }else if(ev.target.id==='adminPasswordChange'){
      const current=$('currentAdminPassword').value, next=$('newAdminPassword').value;
      if(next!==$('confirmAdminPassword').value) return toast('New passwords do not match');
      const r=await call('changeAdminPassword',current,next);
      if(!r.success) return toast(r.message);
      $('dlg').close(); $('dlgBody').innerHTML=''; signedOut(); toast('Admin password changed. Sign in with the new password.');
    }
  };
}
$('dlgBody').onclick=async ev=>{ const b=ev.target.closest('button'); if(!b) return;
  if(b.id==='copyPin'){
    if(navigator.clipboard&&navigator.clipboard.writeText) navigator.clipboard.writeText($('generatedPin').value).then(()=>toast('PIN copied')).catch(()=>toast('Copy failed; select and copy the PIN manually'));
    else { $('generatedPin').select(); toast(document.execCommand('copy')?'PIN copied':'Select and copy the PIN manually'); }
  }
  if(b.id==='cancelKeyEdit'){ accessDlg(); }
  if(b.dataset.keyAction==='edit'){
    const kr=await call('listScannerKeys'); if(!kr.success) return toast(kr.message);
    const key=kr.data.find(x=>x.id===b.dataset.id); if(key) accessDlg({editKey:key});
  }
  if(b.dataset.keyAction==='revoke'){
    if(!confirm('Revoke this scanner PIN? Existing scanner sessions will stop working.')) return;
    const r=await call('revokeScannerKey',b.dataset.id); if(!r.success) return toast(r.message);
    toast('Scanner PIN revoked'); accessDlg();
  }
  if(b.dataset.keyAction==='rotate'){
    if(!confirm('Rotate this PIN? The old PIN and its active sessions will stop working.')) return;
    const r=await call('rotateScannerKey',b.dataset.id); if(!r.success) return toast(r.message);
    accessDlg({label:'Rotated scanner key',pin:r.data.pin});
  }
  if(b.id==='logoUp'){ const f=$('logoFile').files[0]; if(!f) return toast('Choose an image first'); try{ const png=await fileToPng(f,400); const r=await call('uploadLogo',png); toast(r.success?'Logo uploaded':r.message); if(r.success) $('navSet').onclick(); }catch(err){ toast('Could not read image'); } }
  if(b.id==='logoRm'){ const r=await call('removeLogo'); toast(r.success?'Logo removed':r.message); $('navSet').onclick(); }
  if(b.id==='setSave'){ const r=await call('saveSettings',{name:$('sN').value,tagline:$('sT2').value,address:$('sA').value,timezone:$('sZ').value,color:$('sC').value,footer:$('sF').value}); toast(r.success?'Saved':r.message); } };
function fileToPng(file,max){ return new Promise((res,rej)=>{ const img=new Image(); img.onload=()=>{ const k=Math.min(1,max/Math.max(img.width,img.height)); const c=document.createElement('canvas'); c.width=Math.round(img.width*k); c.height=Math.round(img.height*k); c.getContext('2d').drawImage(img,0,0,c.width,c.height); res(c.toDataURL('image/png').split(',')[1]); }; img.onerror=rej; img.src=URL.createObjectURL(file); }); }
$('navAccess').onclick=()=>accessDlg();
$('navSet').onclick=async()=>{ const r=await call('getSettings'); if(!r.success) return toast(r.message); const s=r.data;
  dlg(`<h3>Settings</h3><div class="row"><input id="sN" placeholder="Organization name" value="${esc(s.name)}"></div><div class="row"><input id="sT2" placeholder="Tagline" value="${esc(s.tagline)}"></div><div class="row"><input id="sA" placeholder="Address" value="${esc(s.address)}"></div><div class="row"><input id="sZ" placeholder="Timezone e.g. Asia/Kathmandu" value="${esc(s.timezone)}"></div><div class="row"><label>Header color <input id="sC" type="color" value="${esc(s.color)}"></label></div><div class="row"><input id="sF" placeholder="PDF footer text" size="50" value="${esc(s.footer)}"></div><div class="row"><b>Logo</b> ${s.logo?`<img src="${s.logo}" style="max-height:48px">`:'<small>none</small>'} <input id="logoFile" type="file" accept="image/*"><button class="sec" id="logoUp">Upload</button>${s.logo?'<button class="sec" id="logoRm">Remove</button>':''}</div><button id="setSave">Save</button> <small>Used on receipts and all displayed times.</small>`); };
$('navAudit').onclick=async()=>{ const r=await call('getAuditLog',100); if(!r.success) return toast(r.message);
  dlg('<h3>Audit log</h3><div style="max-height:60vh;overflow:auto"><table>'+(r.data.map(x=>`<tr><td>${esc(x.time)}</td><td>${esc(x.action)}</td><td>${esc(x.user)}</td><td>${esc(x.event)}</td><td>${esc(x.details)}</td></tr>`).join('')||'<tr><td>No entries</td></tr>')+'</table></div>'); };
let charts=[];
$('rep').onclick=async()=>{ const r=await call('getReport',CUR.id); if(!r.success) return toast(r.message); const d=r.data;
  dlg(`<h3>${esc(CUR.name)} - report</h3><p>${d.checked} of ${d.total} checked in (${d.total?Math.round(d.checked*100/d.total):0}%)</p><canvas id="c1" height="140"></canvas><h4>By staff member</h4><canvas id="c2" height="100"></canvas>`);
  charts.forEach(c=>c.destroy()); charts=[
   new Chart($('c1'),{type:'bar',data:{labels:d.labels,datasets:[{label:'Check-ins per 15 min',data:d.counts,backgroundColor:'#0f1b3d'}]}}),
   new Chart($('c2'),{type:'bar',data:{labels:d.staffNames,datasets:[{label:'Check-ins',data:d.staffCounts,backgroundColor:'#14702f'}]},options:{indexAxis:'y'}})]; };
$('walk').onclick=async()=>{ const n=prompt('Walk-in full name'); if(!n) return; const r=await call('addWalkIn',CUR.id,n,prompt('Email (optional)')||'',prompt('Phone (optional)')||'',''); toast(r.success?'Walk-in checked in':r.message); loadPeople(); poll(); };

$('saveQR').onclick = async () => { const bt=$('saveQR'); bt.disabled=true; let saved=0, failed=false;
  for(;;){ const r=await call('getQRPending',CUR.id,25); if(!r.success){ toast(r.message); failed=true; break; }
    if(!r.data.items.length) break;
    const items=[]; for(const it of r.data.items){ items.push({id:it.id,png:(await qrDataUrl(it.token)).split(',')[1]}); }
    const s=await call('saveQRImages',CUR.id,items); if(!s.success||!s.data.saved){ toast(s.message||'Save stopped'); failed=true; break; }
    saved+=s.data.saved; bt.textContent=`Images saved ${saved}, ${r.data.remaining-s.data.saved} left`; }
  if(!failed){ let off=0; for(;;){ const d=await call('buildQRDoc',CUR.id,off); if(!d.success){ toast(d.message); failed=true; break; }
      bt.textContent=`Building Doc ${Math.min(d.data.next,d.data.total)}/${d.data.total}`; if(d.data.done){ toast('QR Doc ready'); window.open(d.data.url,'_blank'); break; } off=d.data.next; } }
  bt.textContent='Save QR to Drive + build Doc'; bt.disabled=false; };
$('openDoc').onclick = async () => { const r=await call('getQRDocInfo',CUR.id); if(r.success&&r.data.url) window.open(r.data.url,'_blank'); else toast(r.message||'No QR Doc yet - click Save QR to Drive'); };
