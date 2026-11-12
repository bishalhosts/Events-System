let dashBusy=false;
async function loadDash(){ if(document.hidden||CUR||!SID||dashBusy) return; dashBusy=true; const r=await call('getDashboardSummary'); dashBusy=false; if(!r.success) return; const d=r.data;
  $('dE').textContent=d.events;$('dA').textContent=d.active;$('dS').textContent=d.published;$('dP').textContent=d.participants;$('dC').textContent=d.checked; }
setInterval(loadDash,5000);
let evDeb; $('evQ').oninput=()=>{ clearTimeout(evDeb); evDeb=setTimeout(loadEvents,300); }; $('evF').onchange=loadEvents;
async function editEvent(e){ const n=prompt('Event name',e.name); if(!n) return; const r=await call('updateEvent',e.id,{name:n,date:prompt('Date (YYYY-MM-DD)',e.date)||'',venue:prompt('Venue',e.venue)||'',description:prompt('Description',e.description)||'',start:prompt('Start time (HH:MM)',e.start)||'',end:prompt('End time (HH:MM)',e.end)||''});
  toast(r.success?'Event updated':r.message); loadEvents(); }
async function delEvent(e){ const t=prompt('This hides the event and closes its scanner. Data is kept in Drive/Sheets.\nType the exact event name to confirm:'); if(t===null) return;
  const r=await call('deleteEvent',e.id,t); toast(r.success?'Event deleted (data kept)':r.message); loadEvents(); }
$('conn').onclick=async()=>{ const id=prompt('Existing spreadsheet ID (it must be shared with the owner account):'); if(!id) return; const r=await call('connectExistingSpreadsheet',CUR.id,id.trim()); toast(r.success?'Connected: '+r.data.name:r.message); poll(); loadPeople(); };
$('csvP').onclick=()=>csv('participants');
let AO={page:1};
async function attLoad(){ AO.q=$('aq').value; AO.staff=$('as').value; AO.from=$('af').value; AO.to=$('at').value;
  const r=await call('getAttendance',CUR.id,AO.page,AO); if(!r.success) return toast(r.message); const d=r.data;
  if($('as').options.length<2) d.staff.forEach(s=>$('as').add(new Option(s,s)));
  $('arows').innerHTML=d.rows.map(x=>`<tr><td>${esc(x.name)}</td><td>${esc(x.phone)}</td><td>${esc(x.time)}</td><td>${esc(x.staff)}</td><td>${x.url?`<a href="${esc(x.url)}" target="_blank">${esc(x.receipt)}</a>`:esc(x.receipt)}</td></tr>`).join('')||'<tr><td colspan=5>No attendance</td></tr>';
  $('apg').textContent=`Page ${d.page} · ${d.total} records`; $('aprev').disabled=AO.page<=1; $('anext').disabled=AO.page*d.size>=d.total; }
$('att').onclick=()=>{ AO={page:1}; dlg('<h3>Attendance</h3><div class="row"><input id="aq" placeholder="Search"><select id="as"><option value="">All staff</option></select><input id="af" type="date"><input id="at" type="date"><button id="ago">Apply</button></div><div style="max-height:50vh;overflow:auto"><table><thead><tr><th>Name</th><th>Phone</th><th>Time</th><th>Staff</th><th>Receipt</th></tr></thead><tbody id="arows"></tbody></table></div><div class="row"><button class="sec" id="aprev">Prev</button><span id="apg"></span><button class="sec" id="anext">Next</button></div>');
  $('ago').onclick=()=>{AO.page=1;attLoad();}; $('aprev').onclick=()=>{AO.page--;attLoad();}; $('anext').onclick=()=>{AO.page++;attLoad();}; attLoad(); };
$('pdfRep').onclick=async()=>{ const bt=$('pdfRep'); bt.disabled=true; const r=await call('generateAttendancePDF',CUR.id,{from:(AO.from||''),to:(AO.to||''),staff:(AO.staff||''),q:(AO.q||'')}); bt.disabled=false;
  if(r.success){ toast('PDF saved ('+r.data.rows+' rows)'); window.open(r.data.url,'_blank'); } else toast(r.message); };
