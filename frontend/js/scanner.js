const URL_EVENT_ID = new URLSearchParams(location.search).get('event') || '';
const $ = id => document.getElementById(id), st = $('status');
let scanner, busy = false, cameraRunning = false, torchOn = false;
let SID = sessionStorage.getItem('scannerSid') || '', EVENT_ID = '', availableEvents = [];
let ac;

function show(cls, msg){
  if (cls === 'ok') beep(true); else if (cls === 'err' || cls === 'dup') beep(false);
  st.className = cls; st.textContent = msg;
}
function beep(ok){
  try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); const o = ac.createOscillator(); o.frequency.value = ok ? 880 : 300; o.connect(ac.destination); o.start(); setTimeout(() => o.stop(), ok ? 120 : 300); } catch(e) {}
}
function clearSession(){
  if (scanner && cameraRunning) scanner.stop().catch(() => {
    $('loginError').textContent='The camera did not stop cleanly. Close this page before continuing.';
    $('loginError').classList.remove('hide');
  });
  cameraRunning = false; busy = false; torchOn = false;
  $('start').disabled=false; $('stop').disabled=true; $('torch').disabled=true;
  SID = ''; EVENT_ID = ''; availableEvents = [];
  sessionStorage.removeItem('scannerSid');
  $('scannerApp').classList.add('hide'); $('eventPicker').classList.add('hide'); $('access').classList.remove('hide');
}
function scannerCall(fn, ...args){
  return AppBackend.request(fn, ...args);
}
function chooseEvent(events, preferred){
  availableEvents = events || [];
  if (!availableEvents.length) {
    clearSession(); $('loginError').textContent = 'No active, published events are assigned to this PIN.';
    $('loginError').classList.remove('hide'); return;
  }
  if (preferred && availableEvents.some(e => e.id === preferred)) {
    activateEvent(availableEvents.find(e => e.id === preferred)); return;
  }
  if (availableEvents.length === 1) { activateEvent(availableEvents[0]); return; }
  $('access').classList.add('hide'); $('scannerApp').classList.add('hide');
  $('eventSelect').innerHTML = availableEvents.map(e => `<option value="${encodeURIComponent(e.id)}">${escapeText(e.name)} — ${escapeText(e.date)}</option>`).join('');
  $('eventPicker').classList.remove('hide');
}
function escapeText(value){ const e=document.createElement('span'); e.textContent=String(value||''); return e.innerHTML; }
function activateEvent(event){
  EVENT_ID = event.id; $('evid').textContent = ' — ' + event.id; $('activeEvent').textContent = event.name;
  $('access').classList.add('hide'); $('eventPicker').classList.add('hide'); $('scannerApp').classList.remove('hide');
  $('loginError').classList.add('hide'); show('', 'Ready to scan');
}
function restoreSession(){
  if (!SID) return;
  scannerCall('getScannerEvents', SID).then(r => {
    if (!r.success) {
      clearSession(); $('loginError').textContent='Scanner session expired or revoked. Enter the PIN again.';
      $('loginError').classList.remove('hide'); return;
    }
    chooseEvent(r.data, URL_EVENT_ID);
  });
}
$('scannerLogin').onsubmit = async ev => {
  ev.preventDefault(); $('loginButton').disabled = true; $('loginError').classList.add('hide');
  const r = await scannerCall('loginScanner', $('pin').value, URL_EVENT_ID);
  $('loginButton').disabled = false;
  if (!r.success) {
    $('loginError').textContent = r.message || 'Access denied. Check the PIN and try again.';
    $('loginError').classList.remove('hide'); return;
  }
  SID = r.data.sid; sessionStorage.setItem('scannerSid', SID); $('pin').value='';
  chooseEvent(r.data.events, URL_EVENT_ID);
};
$('useEvent').onclick = () => {
  const id = decodeURIComponent($('eventSelect').value), event = availableEvents.find(e => e.id === id);
  if (event) activateEvent(event);
};
$('scannerOut').onclick = async () => {
  let stopError=false;
  if (cameraRunning) {
    try { await scanner.stop(); }
    catch(e) { stopError=true; }
    cameraRunning = false;
  }
  if (SID) AppBackend.request('logout', SID);
  clearSession(); $('pin').value='';
  $('loginError').textContent=stopError?'Camera did not stop cleanly. Close this page before signing in again.':'';
  $('loginError').classList.toggle('hide',!stopError);
};

function submit(token){
  if (busy || !SID || !EVENT_ID) return;
  busy = true; show('', 'Checking…');
  AppBackend.request('checkIn', SID, EVENT_ID, token).then(r => {
      busy = false;
      if (!r.success) {
        if (r.code === 'BACKEND_UNAVAILABLE' || r.code === 'BACKEND_ERROR' || r.code === 'TIMEOUT') {
          return show('warn', 'Network error — attendance NOT confirmed. Check the connection and scan again.');
        }
        const messages = {
          INVALID_QR:'Invalid QR code', UNPUBLISHED:'Scanner unavailable for this event',
          UNAUTHORIZED:'Scanner access expired or revoked. Enter the PIN again.',
          FORBIDDEN:'This PIN is not assigned to this event', EVENT_NOT_FOUND:'Event not found'
        };
        if (r.code === 'UNAUTHORIZED') {
          clearSession(); $('loginError').textContent=messages.UNAUTHORIZED;
          $('loginError').classList.remove('hide'); return;
        }
        return show('err', messages[r.code] || r.message);
      }
      const d = r.data; addRecent(d);
      if (d.status === 'SUCCESS') {
        show('ok', '✔ ' + d.name + ' checked in at ' + d.checkin_time);
        if (navigator.vibrate) navigator.vibrate(150);
        AppBackend.request('generateReceipt', SID, EVENT_ID, d.participant_id).then(x => {
          st.textContent += x.success ? ' · receipt ' + x.data.receipt_id : ' · receipt unavailable';
        });
      } else show('dup', 'Already checked in: ' + d.name + ' (' + d.checkin_time + ')');
      setTimeout(() => busy = false, 1200);
    })
    .catch(() => { busy = false; show('warn', 'Network error — attendance NOT confirmed. Scan again.'); });
}
function permissionDenied(error){
  const text = String(error && (error.name + ' ' + error.message) || error).toLowerCase();
  return text.indexOf('notallowed') >= 0 || text.indexOf('permission') >= 0 || text.indexOf('denied') >= 0;
}
$('start').onclick = async () => {
  if (!SID || !EVENT_ID || cameraRunning) return;
  scanner = new Html5Qrcode('reader');
  const config = {fps:10, qrbox:250}, onScan = text => submit(text);
  try {
    await scanner.start({facingMode:'environment'}, config, onScan);
  } catch(firstError) {
    if (permissionDenied(firstError)) {
      show('err', 'Camera permission is blocked. Allow camera access for this HTTPS site in browser settings, then retry. You can also scan from a photo or enter a token.');
      return;
    }
    try {
      const cameras = await Html5Qrcode.getCameras();
      if (!cameras.length) throw firstError;
      await scanner.start(cameras[0].id, config, onScan);
    } catch(error) {
      show('err', 'No usable camera was found. Check browser camera permissions, or use photo/manual entry.');
      return;
    }
  }
  cameraRunning = true; $('start').disabled = true; $('stop').disabled = false; $('torch').disabled = false;
  show('', 'Camera ready');
};
$('torch').onclick = async () => {
  try { torchOn = !torchOn; await scanner.applyVideoConstraints({advanced:[{torch:torchOn}]}); }
  catch(e) { torchOn = false; show('warn', 'Flashlight is not supported on this device'); }
};
$('stop').onclick = async () => {
  $('torch').disabled = true;
  try { if (scanner && cameraRunning) await scanner.stop(); }
  catch(e) { show('warn', 'Could not stop the camera cleanly. Close the page if it remains active.'); }
  cameraRunning = false; $('start').disabled = false; $('stop').disabled = true;
};
$('photo').onchange = async ev => {
  const f=ev.target.files[0]; if(!f||!SID||!EVENT_ID) return;
  try { submit(await new Html5Qrcode('tmp').scanFile(f,false)); }
  catch(e) { show('err','No QR found in photo'); }
  ev.target.value='';
};
$('send').onclick = () => { const v=$('manual').value.trim(); if(v) submit(v); };
$('manual').onkeydown = ev => { if(ev.key==='Enter'){ ev.preventDefault(); $('send').click(); } };

const recentScans=[];
function addRecent(d){
  recentScans.unshift(new Date().toLocaleTimeString()+'  '+d.name+'  '+d.status);
  if(recentScans.length>5) recentScans.pop();
  $('recent').innerHTML='';
  recentScans.forEach(t=>{const li=document.createElement('li');li.textContent=t;$('recent').appendChild(li);});
}
restoreSession();
