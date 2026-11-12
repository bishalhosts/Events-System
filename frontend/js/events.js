async function loadEvents(){
  const r = await call('listEvents'); if(!r.success) return toast(r.message);
  window.SCAN_URL = r.data.url; const t=$('events'); t.innerHTML='';
  $('noEv').classList.toggle('hide', r.data.events.length>0);
  r.data.events.filter(e=>(!$('evF').value||e.status===$('evF').value)&&e.name.toLowerCase().includes($('evQ').value.toLowerCase())).forEach(e=>{ const tr=document.createElement('tr');
    tr.innerHTML=`<td>${esc(e.name)}${e.status==='ARCHIVED'?' <span class="pill off">Archived</span>':''}</td><td>${esc(e.date)}</td><td><span class="pill ${e.published?'on':'off'}">${e.published?'Published':'Unpublished'}</span></td><td></td>`;
    const open=btn('Open',()=>openEvent(e)), tg=btn(e.published?'Unpublish':'Publish',async()=>{
      if(e.published && !confirm('Unpublish? All check-ins for this event will be blocked.')) return;
      const x=await call('setScannerPublished',e.id,!e.published); toast(x.success?'Scanner '+(e.published?'unpublished':'published'):x.message); loadEvents(); }),
      ed=btn('Edit',()=>editEvent(e)),dl=btn('Delete',()=>delEvent(e)),ar=btn(e.status==='ARCHIVED'?'Restore':'Archive',async()=>{ if(e.status!=='ARCHIVED' && !confirm('Archive event? Scanner will be unpublished.')) return; const x=await call('setEventStatus',e.id,e.status==='ARCHIVED'?'ACTIVE':'ARCHIVED'); toast(x.success?'Updated':x.message); loadEvents(); }),
      cp=btn('Copy link',()=>{ navigator.clipboard.writeText(r.data.url+'?page=scanner&event='+e.id); toast('Scanner link copied'); });
    tr.lastChild.append(open,' ',tg,' ',cp,' ',ar,' ',ed,' ',dl); t.append(tr); }); }
function btn(t,f){ const b=document.createElement('button'); b.className='sec'; b.textContent=t; b.onclick=f; return b; }
$('create').onclick = async () => { const n=$('newName').value.trim(); if(!n) return toast('Enter a name');
  $('create').disabled=true; pendingRq=pendingRq||('rq'+Date.now()+Math.random().toString(36).slice(2,8)); const x=await call('createEvent',n,$('newDate').value,$('newVenue').value,pendingRq); if(x.success) pendingRq=null;
  $('create').disabled=false; toast(x.success?'Event created':x.message); if(x.success){$('newName').value='';loadEvents();} };
