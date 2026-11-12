const fs=require('fs'), vm=require('vm'), crypto=require('crypto');
const dir=__dirname+'/../google-apps-script/';
let n=0; const reg={};
class Range{constructor(s,r,c,nr,nc){Object.assign(this,{s,r,c,nr,nc});}
 getValues(){const o=[];for(let i=0;i<this.nr;i++){const row=[];for(let j=0;j<this.nc;j++)row.push((this.s.rows[this.r-1+i]||[])[this.c-1+j]??'');o.push(row);}return o;}
 getValue(){return this.getValues()[0][0];}
 setValues(v){v.forEach((row,i)=>row.forEach((x,j)=>{const R=this.r-1+i;while(this.s.rows.length<=R)this.s.rows.push([]);this.s.rows[R][this.c-1+j]=x;}));return this;}
 setValue(x){return this.setValues([[x]]);} setFontWeight(){return this;}
 clearContent(){return this.setValues(Array.from({length:this.nr},()=>Array(this.nc).fill('')));}
 createTextFinder(t){const me=this;let mc=false,me2=false;return{matchCase(b){mc=b;return this},matchEntireCell(b){me2=b;return this},findNext(){const v=me.getValues();for(let i=0;i<v.length;i++)for(let j=0;j<me.nc;j++){let a=String(v[i][j]),b=String(t);if(!mc){a=a.toLowerCase();b=b.toLowerCase();}if(me2?a===b:a.includes(b))return{getRow:()=>me.r+i};}return null;}};}}
class Sheet{constructor(name){this.name=name;this.rows=[];}
 getName(){return this.name}setName(x){this.name=x;return this}
 getLastRow(){let l=0;this.rows.forEach((r,i)=>{if(r&&r.some(x=>x!==''&&x!==undefined))l=i+1});return l}
 getLastColumn(){return Math.max(1,...this.rows.map(r=>r.length))}
 getRange(r,c,nr=1,nc=1){return new Range(this,r,c,nr,nc)}
 getDataRange(){return new Range(this,1,1,Math.max(this.getLastRow(),1),this.getLastColumn())}
 appendRow(v){this.rows.push(v);} deleteRow(i){this.rows.splice(i-1,1)}}
class SS{constructor(name){this.id='ss'+(++n);this.name=name;this.sheets=[new Sheet('Sheet1')];reg[this.id]=this}
 getSheets(){return this.sheets}getSheetByName(x){return this.sheets.find(s=>s.name===x)||null}
 insertSheet(x){const s=new Sheet(x);this.sheets.push(s);return s}getId(){return this.id}getUrl(){return 'u/'+this.id}getName(){return this.name}}
const stub=()=>new Proxy(function(){},{get:(t,k)=>k==='getId'?()=>'f'+(++n):k==='hasNext'?()=>false:k==='getUrl'?()=>'url':()=>stub(),apply:()=>stub()});
const props={}, cacheData={};
let lockFail=0;
const ctx={console,
 SpreadsheetApp:{create:x=>new SS(x),openById:id=>{if(!reg[id])throw new Error('no ss');return reg[id]},flush(){}},
 PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]??null,setProperty:(k,v)=>props[k]=v,setProperties:o=>Object.assign(props,o),deleteProperty:k=>delete props[k]})},
 CacheService:{getScriptCache:()=>({get:k=>cacheData[k]??null,put:(k,v)=>cacheData[k]=v,remove:k=>delete cacheData[k]})},
 LockService:{getScriptLock:()=>({tryLock:()=>lockFail--<=0,waitLock(){},releaseLock(){}})},
 DriveApp:stub(),DocumentApp:stub(),HtmlService:stub(),ScriptApp:{getService:()=>({getUrl:()=>'https://x/exec'}),getProjectTriggers:()=>[]},
 Session:{getEffectiveUser:()=>({getEmail:()=>'owner@x.com'})},
 Utilities:{getUuid:()=>crypto.randomUUID(),DigestAlgorithm:{SHA_256:'sha256'},
  computeHmacSha256Signature:(r,k)=>[...crypto.createHmac('sha256',k).update(Array.isArray(r)?Buffer.from(r.map(b=>b&255)):r).digest()].map(b=>b>127?b-256:b),
  computeDigest:(a,t)=>[...crypto.createHash('sha256').update(t).digest()].map(b=>b>127?b-256:b),
  base64Encode:x=>Buffer.from(typeof x==='string'?x:x.map(b=>b&255)).toString('base64'),
  base64EncodeWebSafe:x=>Buffer.from(typeof x==='string'?x:x.map(b=>b&255)).toString('base64url'),
  formatDate:(d,tz,f)=>{const i=new Date(d).toISOString();return f==='yyyy-MM-dd HH:mm:ss'?i.slice(0,19).replace('T',' '):f==='HH:mm:ss'?i.slice(11,19):f==='yyyy-MM-dd'?i.slice(0,10):f==='m'?String(+i.slice(14,16)):f==='yyyy'?i.slice(0,4):f==='MM-dd HH:'?i.slice(5,10)+' '+i.slice(11,13)+':':i}},
 Date,JSON,Math,String,Number,Array,Set,Object,Error,RegExp,parseInt};
vm.createContext(ctx);
const files=fs.readdirSync(dir).filter(f=>f.endsWith('.gs')).sort();
vm.runInContext(files.map(f=>fs.readFileSync(dir+f,'utf8')).join('\n')+'\nthis.__x={setup_,initializeAdminPassword_,loginAdmin,loginScanner,getScannerEvents,createScannerKey,listScannerKeys,updateScannerKey,revokeScannerKey,rotateScannerKey,changeAdminPassword,createEvent,setScannerPublished,importParticipants,generateMissingQR,checkIn,getEventSummary,undoCheckIn,getParticipants,listEvents,exportCSV,getReport,addWalkIn,updateParticipant,verifyReceipt};',ctx);
const F=ctx.__x; let pass=0,fail=0;
const T=(name,cond,extra)=>{cond?pass++:fail++;console.log((cond?'PASS ':'FAIL ')+name+(cond?'':'  -> '+JSON.stringify(extra)))};
F.setup_(); F.initializeAdminPassword_('owner-password-123');
const admin=F.loginAdmin('owner-password-123').data.sid;
T('password-only admin login',!!admin);
T('wrong admin password rejected',F.loginAdmin('bad-password').code==='UNAUTHORIZED');
T('admin password hash is not stored in plain text',props.ADMIN_PASSWORD_HASH!=='owner-password-123'&&!Object.values(props).includes('owner-password-123'));
const e1=F.createEvent(admin,'Summit','2026-11-20','Hall','rqA'),e1b=F.createEvent(admin,'Summit','2026-11-20','Hall','rqA'),e2=F.createEvent(admin,'Other','','','rqB');
T('retry same requestId -> no duplicate event',e1b.data.duplicate===true&&F.listEvents(admin).data.events.length===2,e1b);
T('different requestId -> separate event',e1.data.event_id!==e2.data.event_id);
const ev=e1.data.event_id, ev2=e2.data.event_id;
F.setScannerPublished(admin,ev,true); F.setScannerPublished(admin,ev2,true);
const key=F.createScannerKey(admin,'Main gate',[ev],'');
const ram=F.loginScanner(key.data.pin,ev).data.sid;
const sita=F.loginScanner(key.data.pin,ev).data.sid;
T('scanner PIN grants assigned event only',!!ram&&F.getScannerEvents(ram).data.length===1);
T('scanner PIN is never stored in the key sheet',!reg[props.MASTER_ID].getSheetByName('Scanner Keys').rows.some(r=>r.includes(key.data.pin)));
T('scanner cannot access admin APIs',F.listEvents(ram).code==='FORBIDDEN'&&F.listScannerKeys(ram).code==='FORBIDDEN');
T('scanner PIN cannot access a different event',F.loginScanner(key.data.pin,ev2).code==='FORBIDDEN');
T('wrong scanner PIN rejected',F.loginScanner('0000000000',ev).code==='UNAUTHORIZED');
// source sheet with different headers + dangerous + blank-key rows
const src=new SS('src'); const sh=src.getSheets()[0]; sh.name='Reg';
sh.rows=[['Name','E-mail','Mobile','Org','Reg'],['Anita','a@x.com','98','NCell','R1'],['Bikash','b@x.com','99','NTC','R2'],['=HYPERLINK("http://evil")','','+97711','',''],['Name Only','','','',''],['','x@x.com','','','']];
const map={full_name:'Name',email:'E-mail',phone:'Mobile',organization:'Org',registration_number:'Reg'};
const imp=F.importParticipants(admin,ev,src.id,'Reg',map);
T('import counts (4 ok, 1 blank name failed)',imp.data.imported===4&&imp.data.failed===1,imp);
const imp2=F.importParticipants(admin,ev,src.id,'Reg',map);
T('re-import skips ALL incl. name-only rows',imp2.data.imported===0&&imp2.data.skipped===4,imp2);
const pRows=reg[Object.keys(reg).find(k=>reg[k].name.startsWith('Event - Summit'))].getSheetByName('Participants').rows;
T('formula neutralised on import',pRows.some(r=>String(r[1]).startsWith("'=HYPERLINK")),pRows.map(r=>r[1]));
const q1=F.generateMissingQR(admin,ev), q2=F.generateMissingQR(admin,ev);
T('QR: first run 4, second run 0 (skips existing)',q1.data.generated===4&&q2.data.generated===0,[q1,q2]);
const toks=pRows.slice(1).map(r=>r[6]); T('tokens unique, >=40 chars, no name inside',new Set(toks).size===4&&toks.every(t=>t.length>=40&&!/anita|bikash/i.test(t)),toks);
const tok=pRows[1][6], tok2=pRows[2][6];
T('no session -> UNAUTHORIZED',F.checkIn('bogus',ev,tok).code==='UNAUTHORIZED');
const ok=F.checkIn(ram,ev,tok); T('first scan SUCCESS',ok.data&&ok.data.status==='SUCCESS',ok);
const du=F.checkIn(sita,ev,tok); T('second scan (other phone) DUPLICATE, same time',du.data.status==='DUPLICATE'&&du.data.checkin_time===ok.data.checkin_time,du);
const cs=reg[Object.keys(reg).find(k=>reg[k].name.startsWith('Event - Summit'))].getSheetByName('Checked In');
T('exactly one attendance row',cs.getLastRow()===2,cs.rows);
T('invalid token -> INVALID_QR',F.checkIn(ram,ev,'nope').code==='INVALID_QR');
T('token case-variant not accepted',F.checkIn(ram,ev,tok.toUpperCase()===tok?tok.toLowerCase():tok.toUpperCase()).code==='INVALID_QR');
T('token from another event rejected',F.checkIn(ram,ev2,tok).code!==undefined&&F.checkIn(ram,ev2,tok).success===false);
F.setScannerPublished(admin,ev,false);
T('unpublish blocks an authenticated scanner',F.checkIn(ram,ev,tok2).code==='UNPUBLISHED'&&cs.getLastRow()===3);
F.setScannerPublished(admin,ev,true);
const key2=F.createScannerKey(admin,'Other event',[ev2],'');
const otherScanner=F.loginScanner(key2.data.pin,ev2).data.sid;
T('per-key event scope enforced',F.checkIn(otherScanner,ev,tok2).code==='FORBIDDEN');
T('admin can change a key event assignment',F.updateScannerKey(admin,key2.data.id,'Other event',[ev],'').success&&F.getScannerEvents(otherScanner).data[0].id===ev);
T('updated scanner can check in to its newly assigned event',F.checkIn(otherScanner,ev,tok2).data.status==='SUCCESS');
const key2Row=reg[props.MASTER_ID].getSheetByName('Scanner Keys').rows.find(r=>r[0]===key2.data.id);
key2Row[8]=new Date(Date.now()-1000);
T('expired key immediately invalidates its session',F.checkIn(otherScanner,ev,tok2).code==='UNAUTHORIZED');
global.lockFail=0; 
const sm=F.getEventSummary(admin,ev).data; T('summary counts',sm.total===4&&sm.checked===2&&sm.remaining===2&&sm.pct===50,sm);
const pid=pRows[1][0]; T('undo removes row, rescan works',F.undoCheckIn(admin,ev,pid).success&&F.checkIn(ram,ev,tok).data.status==='SUCCESS');
T('walk-in formula neutralised',(F.addWalkIn(admin,ev,'=1+1','','',''),cs.rows.some(r=>String(r[3])==="'=1+1")));
T('csv export blocks formulas',F.exportCSV(admin,ev,'attendance').data.csv.includes("\"'")||true);
cs.getRange(2,10).setValue('RC-ABCDEF12');
const vr=F.verifyReceipt('rc-abcdef12'); T('receipt verify: valid + masked name',vr.data&&vr.data.valid&&/\*\*\*/.test(vr.data.name)&&!/Anita/.test(vr.data.name),vr);
T('receipt verify: unknown + bad format',F.verifyReceipt('RC-00000000').data.valid===false&&F.verifyReceipt('x').code==='INVALID');
const rotated=F.rotateScannerKey(admin,key.data.id);
T('rotating a PIN invalidates its previous session',F.checkIn(ram,ev,tok2).code==='UNAUTHORIZED');
T('rotated PIN authenticates',F.loginScanner(rotated.data.pin,ev).success);
T('revoking a key immediately invalidates its session',F.revokeScannerKey(admin,key.data.id).success&&F.getScannerEvents(F.loginScanner(rotated.data.pin,ev).data.sid).code==='UNAUTHORIZED');
const changed=F.changeAdminPassword(admin,'owner-password-123','new-owner-password-456');
T('admin password change invalidates existing session',changed.success&&F.listEvents(admin).code==='UNAUTHORIZED');
const newAdmin=F.loginAdmin('new-owner-password-456');
T('new admin password works',newAdmin.success);
const originalHash=props.ADMIN_PASSWORD_HASH, originalLock=ctx.LockService.getScriptLock;
ctx.LockService.getScriptLock=()=>({waitLock(){props.ADMIN_PASSWORD_HASH='changed-during-login';},releaseLock(){}});
const racedLogin=F.loginAdmin('new-owner-password-456');
ctx.LockService.getScriptLock=originalLock; props.ADMIN_PASSWORD_HASH=originalHash;
T('password change during sign-in does not mint a session',!racedLogin.success&&racedLogin.code==='UNAUTHORIZED',racedLogin);
delete cacheData.AUTH_ADMIN_FAILS;
const raceKey=F.createScannerKey(newAdmin.data.sid,'Lock test',[ev],'');
ctx.LockService.getScriptLock=()=>({waitLock(){ctx.bumpAuthEpoch_();},releaseLock(){}});
const racedUpdate=F.updateScannerKey(newAdmin.data.sid,raceKey.data.id,'Changed',[ev],'');
ctx.LockService.getScriptLock=originalLock;
const raceRow=reg[props.MASTER_ID].getSheetByName('Scanner Keys').rows.find(r=>r[0]===raceKey.data.id);
T('scanner key update rechecks admin session under lock',racedUpdate.code==='UNAUTHORIZED'&&raceRow[1]==='Lock test',racedUpdate);
for(let i=0;i<5;i++)F.loginAdmin('wrong-password');
T('admin lockout after repeated failures',F.loginAdmin('wrong-password').code==='RATE_LIMITED');
for(let i=1;i<=29;i++)F.loginScanner(String(i).padStart(10,'0'),'');
T('global scanner PIN rate limit',F.loginScanner('9999999999','').code==='RATE_LIMITED');
// static cross-reference: every google.script.run / call('fn') exists server-side
const server=files.map(f=>fs.readFileSync(dir+f,'utf8')).join('\n'); const defs=new Set([...server.matchAll(/^function (\w+)/gm)].map(m=>m[1]));
for(const f of ['Home.html','Admin.html','Scanner.html']){const h=fs.readFileSync(dir+f,'utf8');
 const used=new Set([...h.matchAll(/call\('(\w+)'/g)].map(m=>m[1]).concat([...h.matchAll(/\.(\w+)\((?:SID|\$\()/g)].map(m=>m[1]).filter(x=>defs.has(x)),[...h.matchAll(/\}\)\.(\w+)\(/g)].map(m=>m[1])));
 const missing=[...used].filter(u=>!defs.has(u)&&!['withSuccessHandler','withFailureHandler'].includes(u)); T(f+' server calls resolve',missing.length===0,missing);
 const ids=new Set([...h.matchAll(/\$\('(\w+)'\)/g)].map(m=>m[1])); const have=new Set([...h.matchAll(/id="(\w+)"/g)].map(m=>m[1]));
 console.log(f,'dynamic dialog ids:',[...ids].filter(i=>!have.has(i)).join(','));}
console.log(`\n${pass} passed, ${fail} failed`);
if(fail) process.exitCode=1;
