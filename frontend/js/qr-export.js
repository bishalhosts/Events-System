function saveBlob(blob,name){ const l=document.createElement('a'); l.href=URL.createObjectURL(blob); l.download=name; l.click(); setTimeout(()=>URL.revokeObjectURL(l.href),2000); }
const safeName = s => String(s).replace(/[^\w\-]+/g,'_').slice(0,60);
function qrDataUrl(text){ return new Promise(res=>{ const d=document.createElement('div'); new QRCode(d,{text,width:320,height:320,correctLevel:QRCode.CorrectLevel.M});
  setTimeout(()=>res(d.querySelector('canvas').toDataURL('image/png')),60); }); }
$('ppl').onclick = async ev => { const b=ev.target.closest('button[data-a]'); if(!b) return; const id=b.dataset.id; b.disabled=true;
  if(b.dataset.a==='qr'){ const r=await call('getQRTokens',CUR.id,id); if(r.success&&r.data[0]){ saveBlob(await (await fetch(await qrDataUrl(r.data[0].token))).blob(), safeName(b.dataset.n)+'-'+id+'.png'); } else toast(r.message||'No QR'); }
  if(b.dataset.a==='ed'){ const p=PEOPLE[id]; const n=prompt('Full name',p.name); if(n){ const r=await call('updateParticipant',CUR.id,id,{name:n,email:prompt('Email',p.email)||'',phone:prompt('Phone',p.phone)||'',org:prompt('Organization',p.org)||''}); toast(r.success?'Participant updated':r.message); loadPeople(); } }
  if(b.dataset.a==='rg'){ if(confirm('Regenerate? The old QR stops working immediately.')){ const r=await call('regenerateQR',CUR.id,id); toast(r.success?'New QR token issued':r.message); } }
  if(b.dataset.a==='ud'){ if(confirm('Undo this check-in? The participant can be scanned again.')){ const r=await call('undoCheckIn',CUR.id,id); toast(r.success?'Check-in removed':r.message); loadPeople(); poll(); } }
  if(b.dataset.a==='rc'){ const force=!confirm('OK = open the existing receipt.\nCancel = re-issue it with the current branding.'); const r=await call('generateReceipt',CUR.id,id,force); if(r.success&&r.data.url) window.open(r.data.url,'_blank'); else toast(r.success?'Receipt '+r.data.receipt_id:r.message); }
  b.disabled=false; };
$('zipQR').onclick = async () => { const bt=$('zipQR'); bt.disabled=true; const r=await call('getQRTokens',CUR.id); if(!r.success||!r.data.length){ bt.disabled=false; return toast(r.message||'Generate QR tokens first'); }
  const zip=new JSZip(); for(let i=0;i<r.data.length;i++){ bt.textContent=`Rendering ${i+1}/${r.data.length}`; const u=await qrDataUrl(r.data[i].token); zip.file(safeName(r.data[i].name)+'-'+r.data[i].id+'.png',u.split(',')[1],{base64:true}); }
  saveBlob(await zip.generateAsync({type:'blob'}),'qr-codes-'+CUR.id+'.zip'); bt.textContent='Download all QR (ZIP)'; bt.disabled=false; };
async function csv(kind){ const r=await call('exportCSV',CUR.id,kind); if(!r.success) return toast(r.message); saveBlob(new Blob([r.data.csv],{type:'text/csv'}),r.data.name); }
$('csvA').onclick=()=>csv('attendance'); $('csvN').onclick=()=>csv('absent');
