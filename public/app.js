'use strict';

// ── Status definitions ────────────────────────────────────────────
const DEFAULT_STATUSES = [
  { v:'PHONE',      label:'Phone muster' },
  { v:'APPT',       label:'Appointment' },
  { v:'SICK CALL',  label:'Sick call' },
  { v:'SIQ',        label:'SIQ' },
  { v:'LEAVE',      label:'Leave' },
  { v:'TAD',        label:'TAD' },
  { v:'POST-WATCH', label:'Post-watch' },
  { v:'LIBERTY',    label:'Liberty' },
  { v:'RPT N85',    label:'Rpt to N85 Office' },
  { v:'UA',         label:'UA' },
];
const CORE_VALS = DEFAULT_STATUSES.map(s=>s.v);
const INPERSON_VALS = ['PRESENT','IN-PERSON','PHONE','APPT','SICK CALL','SIQ','LEAVE','TAD','POST-WATCH','LIBERTY','RPT N85','UA'];
const TEXT_VALS = ['TEXT'];

function getStatuses() {
  const extra = JSON.parse(localStorage.getItem('extra_statuses')||'[]');
  return [...DEFAULT_STATUSES, ...extra.map(v=>({v,label:v}))];
}
function addCustomStatus(name) {
  if (!name) { const el=document.getElementById('newStatusName'); name=(el?.value||'').trim(); if(el)el.value=''; }
  if (!name) return;
  const u = name.toUpperCase();
  const extra = JSON.parse(localStorage.getItem('extra_statuses')||'[]');
  if (!extra.includes(u)) { extra.push(u); localStorage.setItem('extra_statuses',JSON.stringify(extra)); }
  renderStatusChips(); renderSelectOptions(); renderMuster(); toast(`"${u}" added`);
}
function deleteCustomStatus(v) {
  if (!confirm(`Remove "${v}"?`)) return;
  const extra = JSON.parse(localStorage.getItem('extra_statuses')||'[]').filter(s=>s!==v);
  localStorage.setItem('extra_statuses',JSON.stringify(extra));
  members.forEach(m=>{ if(m.status===v){ m.status=''; api('PUT',`/api/members/${m.id}`,{status:''}); }});
  renderStatusChips(); renderSelectOptions(); renderMuster(); toast(`"${v}" removed`);
}
function renderStatusChips() {
  const el = document.getElementById('statusChips'); if(!el)return;
  const extra = JSON.parse(localStorage.getItem('extra_statuses')||'[]');
  const builtIn = DEFAULT_STATUSES.map(s=>`<span style="font-size:12px;background:var(--surface);border:1px solid var(--border);border-radius:20px;padding:3px 10px;color:var(--text-2)">${s.label}</span>`).join('');
  const custom = extra.length
    ? extra.map(v=>`<span style="display:inline-flex;align-items:center;gap:5px;font-size:12px;background:var(--warn-bg);border:1px solid color-mix(in srgb,var(--warn) 30%,transparent);border-radius:20px;padding:3px 10px;color:var(--warn)">${v}<button onclick="deleteCustomStatus('${v}')" style="background:none;border:none;cursor:pointer;padding:0;color:var(--danger);font-size:15px;line-height:1">×</button></span>`).join('')
    : '<span style="font-size:12px;color:var(--text-3)">No custom statuses yet.</span>';
  el.innerHTML = `<div style="width:100%"><div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--text-3);margin-bottom:5px">Built-in</div><div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:10px">${builtIn}</div><div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--text-3);margin-bottom:5px">Custom</div><div style="display:flex;gap:5px;flex-wrap:wrap">${custom}</div></div>`;
}

// ── Team / Division options ────────────────────────────────────────
const DEF_TEAMS = ['BLUE','RED','WHITE'];
const DEF_DIVS  = ['N85'];
function getTeams() { return [...new Set([...DEF_TEAMS,...JSON.parse(localStorage.getItem('extra_teams')||'[]')])]; }
function getDivs()  { return [...new Set([...DEF_DIVS, ...JSON.parse(localStorage.getItem('extra_divs') ||'[]')])]; }
function addTeamOpt(v) { const e=JSON.parse(localStorage.getItem('extra_teams')||'[]'); if(!e.includes(v)){e.push(v);localStorage.setItem('extra_teams',JSON.stringify(e));} }
function addDivOpt(v)  { const e=JSON.parse(localStorage.getItem('extra_divs') ||'[]'); if(!e.includes(v)){e.push(v);localStorage.setItem('extra_divs', JSON.stringify(e));} }

function populateSel(id, opts, cur) {
  const el = document.getElementById(id); if(!el)return;
  el.innerHTML = `<option value="">--</option>${opts.map(o=>`<option value="${o}" ${cur===o?'selected':''}>${o}</option>`).join('')}<option value="__new__">+ Add new...</option>`;
  el.onchange = async function(){
    if(this.value==='__new__'){
      const label = id.includes('Sec')||id==='eSec'||id==='mSec' ? 'team':'division';
      const c=prompt(`New ${label}:`); if(!c||!c.trim()){this.value='';return;}
      const u=c.trim().toUpperCase();
      label==='team'?addTeamOpt(u):addDivOpt(u);
      renderSelectOptions();
      setTimeout(()=>{ const f=document.getElementById(id); if(f){f.value=u;} },50);
    }
  };
}
function renderSelectOptions() {
  const teams=getTeams(), divs=getDivs();
  ['mSec','nSec','eSec'].forEach(id=>populateSel(id,teams,document.getElementById(id)?.value||''));
  ['mWC','nWC','eWC'].forEach(id=>populateSel(id,divs,document.getElementById(id)?.value||''));
  // team filters
  ['ipTeam','txTeam'].forEach(id=>{
    const el=document.getElementById(id); if(!el)return;
    const cur=el.value;
    el.innerHTML=`<option value="">All teams</option>${teams.map(t=>`<option value="${t}"${cur===t?' selected':''}>${t}</option>`).join('')}`;
  });
}

// ── State ────────────────────────────────────────────────────────
let members     = [];
let editingId   = null;
let editingNote = null;
let ipView      = 'all';   // all | pending | done
let txView      = 'all';   // all | pending | done
let sortDir     = 'manual';
let showTeamDiv = localStorage.getItem('showTeamDiv')!=='false';
let submittedBy = localStorage.getItem('submittedBy')||'';
let reportPlain = '';
let dragSrcId   = null;

// ── API ──────────────────────────────────────────────────────────
async function api(method,path,body){
  const opts={method,headers:{'Content-Type':'application/json'}};
  if(body) opts.body=JSON.stringify(body);
  const r=await fetch(path,opts); return r.json();
}
async function load(){
  const data=await api('GET','/api/members');
  members=data.members||[];
  // Migrate legacy status values into flags
  const LEGACY={'IN-PERSON':'inPerson','PRESENT':'inPerson','TEXT':'texted'};
  members.forEach(m=>{
    if(m.inPerson===undefined) m.inPerson=false;
    if(m.texted===undefined)   m.texted=false;
    if(LEGACY[m.status]){
      m[LEGACY[m.status]]=true; m.status='';
      api('PUT',`/api/members/${m.id}`,{status:'',[LEGACY[m.status]]:true});
    }
  });
  renderSelectOptions();
  renderMuster(); renderRosterList();
}

// ── Stats ────────────────────────────────────────────────────────


// ── Pills ────────────────────────────────────────────────────────
function pill(status){
  if(!status) return '<span class="pill pill-none">No status</span>';
  const st=getStatuses().find(s=>s.v===status);
  const cls='pill-'+status.replace(/\s/g,'\\ ');
  return `<span class="pill ${CSS.escape?'pill-'+status:cls}">${st?st.label:status}</span>`;
}

function setSort(dir){
  sortDir=dir;
  if(dir==='asc')  members.sort((a,b)=>a.name.localeCompare(b.name));
  if(dir==='desc') members.sort((a,b)=>b.name.localeCompare(a.name));
  document.getElementById('sortAscBtn')?.classList.toggle('primary',dir==='asc');
  document.getElementById('sortDescBtn')?.classList.toggle('primary',dir==='desc');
  renderMuster(); renderRosterList();
}
function onDragStart(e,id){ dragSrcId=id; e.dataTransfer.effectAllowed='move'; e.currentTarget.style.opacity='.45'; }
function onDragEnd(e){ e.currentTarget.style.opacity='1'; }
function onDragOver(e){ e.preventDefault(); e.dataTransfer.dropEffect='move'; }
async function onDrop(e,tgtId){
  e.preventDefault(); if(dragSrcId===tgtId)return;
  const si=members.findIndex(m=>m.id===dragSrcId), ti=members.findIndex(m=>m.id===tgtId);
  if(si<0||ti<0)return;
  const [mv]=members.splice(si,1); members.splice(ti,0,mv);
  sortDir='manual';
  await api('POST','/api/members/reorder',{order:members.map(m=>m.id)});
  renderMuster(); renderRosterList();
}

// ── Toggles ──────────────────────────────────────────────────────
function toggleIPAdd(){
  const p=document.getElementById('ipAddPanel');
  p.style.display=p.style.display==='none'?'block':'none';
  if(p.style.display!=='none') document.getElementById('mName')?.focus();
}
function toggleRosterAdd(){
  const p=document.getElementById('rosterAddPanel');
  p.style.display=p.style.display==='none'?'block':'none';
  if(p.style.display!=='none') document.getElementById('nName')?.focus();
}
function toggleStatuses(){
  const p=document.getElementById('statusManagePanel');
  p.style.display=p.style.display==='none'?'block':'none';
  if(p.style.display!=='none') renderStatusChips();
}
function toggleTeamDiv(){
  showTeamDiv=!showTeamDiv;
  localStorage.setItem('showTeamDiv',showTeamDiv);
  const btn=document.getElementById('tdBtn');
  if(btn) btn.innerHTML=`<i class="ti ti-eye${showTeamDiv?'':'-off'}"></i>`;
  renderMuster(); renderRosterList();
}

// ── Sub-tab helpers ──────────────────────────────────────────────
function dynamicSubTabs(list, view, setFn, doneVals, doneLabel){
  // Always show All. Then Pending (no status / not in doneVals and no status),
  // then one tab per status that actually has members.
  const tabs = [{key:'all', label:'All', count:list.length}];

  const pendingCount = list.filter(m=>!m.status).length;
  if(pendingCount>0) tabs.push({key:'pending', label:'Pending', count:pendingCount, warn:true});

  const doneCount = list.filter(m=>doneVals.includes(m.status)).length;
  if(doneCount>0) tabs.push({key:'done', label:doneLabel, count:doneCount, ok:true});

  // One tab per other status present in the list
  const seen = {};
  list.forEach(m=>{
    if(!m.status || doneVals.includes(m.status)) return;
    seen[m.status] = (seen[m.status]||0)+1;
  });
  const statuses = getStatuses();
  Object.keys(seen).sort().forEach(v=>{
    const st = statuses.find(x=>x.v===v);
    tabs.push({key:'st:'+v, label: st?st.label:v, count:seen[v], danger: v==='UA'});
  });

  return tabs.map(t=>
    `<button class="sub-tab ${view===t.key?'active':''}" onclick="${setFn}('${t.key}')"
      style="${t.warn?'color:var(--warn)':t.ok?'color:var(--success)':t.danger?'color:var(--danger)':''}">
      ${t.label} <span class="badge">${t.count}</span></button>`
  ).join('');
}

// Order statuses for section display: done first, then others, pending last
function groupByStatus(list, doneVals, doneLabel){
  const statuses = getStatuses();
  const groups = [];

  const done = list.filter(m=>doneVals.includes(m.status));
  if(done.length) groups.push({label:doneLabel, color:'var(--success)', bg:'var(--success-bg)', members:done});

  const others = {};
  list.forEach(m=>{
    if(!m.status || doneVals.includes(m.status)) return;
    (others[m.status]=others[m.status]||[]).push(m);
  });
  Object.keys(others).sort().forEach(v=>{
    const st = statuses.find(x=>x.v===v);
    const isUA = v==='UA';
    groups.push({
      label: st?st.label:v,
      color: isUA?'var(--danger)':'var(--text-2)',
      bg:    isUA?'var(--danger-bg)':'var(--neutral-bg)',
      members: others[v]
    });
  });

  const pending = list.filter(m=>!m.status);
  if(pending.length) groups.push({label:'Pending', color:'var(--warn)', bg:'var(--warn-bg)', members:pending});

  return groups;
}

// ── IN-PERSON RENDER ─────────────────────────────────────────────
function setMusterView(v){ musterView=v; renderMuster(); }
let musterView='all';

function renderMuster(){
  const q=(document.getElementById('ipSearch')?.value||'').toLowerCase();
  const ft=document.getElementById('ipTeam')?.value||'';
  renderSelectOptions();

  let list=members.filter(m=>{
    if(q&&!m.name.toLowerCase().includes(q)&&!(m.rate||'').toLowerCase().includes(q))return false;
    if(ft&&m.sec!==ft)return false;
    return true;
  });

  document.getElementById('ipSubTabs').innerHTML = musterSubTabs(list, musterView);

  const el=document.getElementById('ipRoster'); if(!el)return;

  // Filtered views
  if(musterView==='pending'){
    const p=list.filter(m=>!m.inPerson&&!m.texted&&!m.status);
    el.innerHTML = p.length?`<div class="roster">${p.map(musterCard).join('')}</div>`
      :`<div class="empty"><i class="ti ti-circle-check"></i><p>Everyone is accounted for.</p></div>`;
    return;
  }
  if(musterView==='inperson'){
    const f=list.filter(m=>m.inPerson);
    el.innerHTML = f.length?`<div class="roster">${f.map(musterCard).join('')}</div>`
      :`<div class="empty"><i class="ti ti-users"></i><p>No one has checked in yet.</p></div>`;
    return;
  }
  if(musterView==='texted'){
    const f=list.filter(m=>m.texted);
    el.innerHTML = f.length?`<div class="roster">${f.map(musterCard).join('')}</div>`
      :`<div class="empty"><i class="ti ti-message"></i><p>No one has texted in yet.</p></div>`;
    return;
  }
  if(musterView.startsWith('st:')){
    const v=musterView.slice(3);
    const f=list.filter(m=>m.status===v);
    el.innerHTML = f.length?`<div class="roster">${f.map(musterCard).join('')}</div>`
      :`<div class="empty"><i class="ti ti-users"></i><p>None in this status.</p></div>`;
    return;
  }

  // ── ALL view — sections by other status only ──
  const statuses=getStatuses();
  const others={};
  list.forEach(m=>{ if(m.status) (others[m.status]=others[m.status]||[]).push(m); });
  const mustered = list.filter(m=>!m.status && (m.inPerson||m.texted));
  const pending  = list.filter(m=>!m.status && !m.inPerson && !m.texted);

  let html='', first=true;
  const add=(label,color,bg,arr)=>{
    if(!arr.length)return;
    html += secHdr(label,color,bg,arr.length,!first) + `<div class="roster">${arr.map(musterCard).join('')}</div>`;
    first=false;
  };

  add('Mustered','var(--success)','var(--success-bg)',mustered);
  Object.keys(others).sort().forEach(v=>{
    const st=statuses.find(x=>x.v===v);
    const ua=v==='UA';
    add(st?st.label:v, ua?'var(--danger)':'var(--text-2)', ua?'var(--danger-bg)':'var(--neutral-bg)', others[v]);
  });
  add('Pending','var(--warn)','var(--warn-bg)',pending);

  el.innerHTML = html || `<div class="empty"><i class="ti ti-users"></i><p>No members found.</p></div>`;
}

function musterSubTabs(list, view){
  const total = members.length;
  const tabs=[{key:'all',label:'All',count:list.length}];

  const ipCount=list.filter(m=>m.inPerson).length;
  const txCount=list.filter(m=>m.texted).length;
  tabs.push({key:'inperson',label:'In-Person Muster',count:`${ipCount}/${total}`,ok:true});
  tabs.push({key:'texted',label:'Texted In',count:`${txCount}/${total}`,tx:true});

  const pendingCount=list.filter(m=>!m.inPerson&&!m.texted&&!m.status).length;
  if(pendingCount>0) tabs.push({key:'pending',label:'Pending',count:pendingCount,warn:true});

  const seen={};
  list.forEach(m=>{ if(m.status) seen[m.status]=(seen[m.status]||0)+1; });
  const statuses=getStatuses();
  Object.keys(seen).sort().forEach(v=>{
    const st=statuses.find(x=>x.v===v);
    tabs.push({key:'st:'+v,label:st?st.label:v,count:seen[v],danger:v==='UA'});
  });

  return tabs.map(t=>
    `<button class="sub-tab ${view===t.key?'active':''}" onclick="setMusterView('${t.key}')"
      style="${t.warn?'color:var(--warn)':t.ok?'color:var(--success)':t.tx?'color:#0369a1':t.danger?'color:var(--danger)':''}">
      ${t.label} <span class="badge">${t.count}</span></button>`).join('');
}

function secHdr(label,color,bg,count,mt=false){
  return `<div class="sec-hdr" style="${mt?'margin-top:16px':''}">
    <span class="sec-hdr-label" style="color:${color}">${label}</span>
    <span class="sec-hdr-count" style="background:${bg};color:${color}">${count}</span>
    <hr></div>`;
}

function musterCard(m){
  const noteEl = m.note?`<div class="card-note"><i class="ti ti-notes" style="font-size:11px"></i> ${m.note}</div>`:'';
  const metaRow = showTeamDiv ? `<div class="card-meta-row">
      <span class="field-lbl">TEAM</span>
      <select onchange="saveField(${m.id},'sec',this.value)" style="font-size:11px;padding:2px 5px;height:24px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text)">
        <option value="">--</option>${getTeams().map(t=>`<option value="${t}" ${m.sec===t?'selected':''}>${t}</option>`).join('')}<option value="__new__">+</option>
      </select>
      <span class="field-lbl" style="margin-left:5px">DIV</span>
      <select onchange="saveField(${m.id},'wc',this.value)" style="font-size:11px;padding:2px 5px;height:24px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text)">
        <option value="">--</option>${getDivs().map(d=>`<option value="${d}" ${m.wc===d?'selected':''}>${d}</option>`).join('')}<option value="__new__">+</option>
      </select>
    </div>` : '';

  // Pills — only what is actually selected. No "Both".
  let pills='';
  if(m.inPerson) pills += `<span class="pill pill-IN-PERSON">In-Person Muster</span>`;
  if(m.texted)   pills += `<span class="pill pill-TEXT">Texted In</span>`;
  if(m.status){
    const st=getStatuses().find(x=>x.v===m.status);
    pills += `<span class="pill pill-${m.status}">${st?st.label:m.status}</span>`;
  }
  if(!pills) pills = `<span class="pill pill-none">No status</span>`;

  const hasAny = m.inPerson||m.texted||!!m.status;

  return `<div class="card${hasAny?'':' pending'}${m.status==='UA'?' ua-card':''}"
      draggable="true" ondragstart="onDragStart(event,${m.id})" ondragend="onDragEnd(event)" ondragover="onDragOver(event)" ondrop="onDrop(event,${m.id})">
    <div style="cursor:grab;color:var(--text-3);padding:0 2px;display:flex;align-items:center;align-self:stretch"><i class="ti ti-grip-vertical" style="font-size:15px"></i></div>
    <div class="card-body">
      <div class="card-top">
        ${pills}
        <span class="card-name">${m.name}</span>
        <span class="card-meta">${m.rate||''}</span>
      </div>
      ${metaRow}
      ${noteEl}
    </div>
    <div class="card-actions">
      <button class="act-btn ${m.inPerson?'done':''}" onclick="toggleFlag(${m.id},'inPerson')" title="In-Person Muster">
        <i class="ti ti-user-check"></i><span class="act-lbl">In-Person</span>
      </button>
      <button class="act-btn ${m.texted?'done-tx':''}" onclick="toggleFlag(${m.id},'texted')" title="Texted In">
        <i class="ti ti-message"></i><span class="act-lbl">Texted</span>
      </button>
      <button class="clear-btn" onclick="clearAllStatus(${m.id})" title="Clear all statuses" ${hasAny?'':'disabled'}>
        <i class="ti ti-eraser"></i><span class="act-lbl">Clear</span>
      </button>
      <button class="more-btn" onclick="openSheet(${m.id})" title="More">⋯</button>
    </div>
  </div>`;
}

// Issue 3 + 4: one action clears every status type
async function clearAllStatus(id){
  await api('PUT',`/api/members/${id}`,{status:'',note:'',inPerson:false,texted:false});
  const m=members.find(x=>x.id===id);
  if(m){ m.status=''; m.note=''; m.inPerson=false; m.texted=false; }
  renderMuster();
}

async function clearStatus(id){
  await api('PUT',`/api/members/${id}`,{status:'',note:''});
  const m=members.find(x=>x.id===id); if(m){m.status='';m.note='';}
  renderMuster();
}

async function toggleFlag(id, flag){
  const m=members.find(x=>x.id===id); if(!m)return;
  const val = !m[flag];
  await api('PUT',`/api/members/${id}`,{[flag]:val});
  m[flag]=val;
  renderMuster();
}

// ── One-tap set + status sheet ────────────────────────────────────
async function quickSet(id, status){
  await api('PUT',`/api/members/${id}`,{status});
  const m=members.find(x=>x.id===id); if(m) m.status=status;
  renderMuster();
}

let sheetMemberId = null;
const SHEET_ICONS = {
  'PRESENT':'ti-user-check','IN-PERSON':'ti-user-check','PHONE':'ti-phone','TEXT':'ti-message',
  'APPT':'ti-calendar','SICK CALL':'ti-stethoscope','SIQ':'ti-bed','LEAVE':'ti-plane',
  'TAD':'ti-briefcase','POST-WATCH':'ti-moon','LIBERTY':'ti-beach','RPT N85':'ti-building',
  'UA':'ti-alert-triangle',
};

function openSheet(id){
  sheetMemberId = id;
  const m = members.find(x=>x.id===id); if(!m) return;
  document.getElementById('sheetTitle').textContent = m.name;
  const opts = getStatuses().map(st=>`
    <button class="sheet-opt ${m.status===st.v?'sel':''}" onclick="pickStatus('${st.v}')">
      <i class="ti ${SHEET_ICONS[st.v]||'ti-circle'}"></i> ${st.label}
    </button>`).join('');
  document.getElementById('sheetOpts').innerHTML = `
    <button class="sheet-opt ${m.inPerson?'sel':''}" onclick="flagFromSheet('inPerson')"><i class="ti ti-user-check"></i> ${m.inPerson?'✓ ':''}In-Person Muster</button>
    <button class="sheet-opt ${m.texted?'sel':''}" onclick="flagFromSheet('texted')"><i class="ti ti-message"></i> ${m.texted?'✓ ':''}Texted In</button>
    <div style="height:1px;background:var(--border);margin:6px 0"></div>
    <button class="sheet-opt ${!m.status?'sel':''}" onclick="pickStatus('')"><i class="ti ti-circle-dashed"></i> Clear status</button>
    ${opts}
    <button class="sheet-opt" onclick="addStatusFromSheet()" style="border-style:dashed;color:var(--accent-text)"><i class="ti ti-plus"></i> Add new status...</button>
    <button class="sheet-opt" onclick="noteFromSheet()"><i class="ti ti-notes"></i> ${m.note?'Edit note':'Add note'}</button>
    <button class="sheet-opt" onclick="deleteFromSheet()" style="color:var(--danger)"><i class="ti ti-trash"></i> Remove member</button>`;
  document.getElementById('statusSheet').style.display='flex';
}
function closeSheet(){ sheetMemberId=null; document.getElementById('statusSheet').style.display='none'; }
async function flagFromSheet(flag){ const id=sheetMemberId; closeSheet(); await toggleFlag(id,flag); }
async function pickStatus(v){
  const id=sheetMemberId; const m=members.find(x=>x.id===id); closeSheet();
  if(!v){ await quickSet(id,''); await api('PUT',`/api/members/${id}`,{note:''}); if(m)m.note=''; renderMuster(); return; }
  const st=getStatuses().find(x=>x.v===v);
  const n=prompt(`Note for "${st?st.label:v}" (optional — leave blank for none):`, m?.note||'');
  await api('PUT',`/api/members/${id}`,{status:v, note:(n===null?'':n)});
  if(m){ m.status=v; m.note=(n===null?'':n); }
  renderMuster();
}
function addStatusFromSheet(){
  const c=prompt('New status name:'); if(!c||!c.trim())return;
  const u=c.trim().toUpperCase(); addCustomStatus(u);
  pickStatus(u);
}
function noteFromSheet(){
  const id=sheetMemberId; const m=members.find(x=>x.id===id); if(!m)return;
  const n=prompt('Note:', m.note||''); closeSheet();
  if(n===null)return;
  saveNote(id,n).then(()=>{ renderMuster(); });
}
function deleteFromSheet(){ const id=sheetMemberId; closeSheet(); deleteMember(id); }

// ── Actions ──────────────────────────────────────────────────────
async function handleStatusChange(id, val, el, tab){
  if(val==='__new_status__'){
    const c=prompt('New status name:'); if(!c||!c.trim()){el.value=members.find(m=>m.id===id)?.status||'';return;}
    const u=c.trim().toUpperCase(); addCustomStatus(u);
    val=u;
  }
  await api('PUT',`/api/members/${id}`,{status:val});
  const m=members.find(x=>x.id===id); if(m) m.status=val;
  renderMuster();
}

async function setStatus(id,v){
  await api('PUT',`/api/members/${id}`,{status:v});
  const m=members.find(x=>x.id===id); if(m) m.status=v;
  renderMuster();
}

async function saveNote(id,v){
  await api('PUT',`/api/members/${id}`,{note:v});
  const m=members.find(x=>x.id===id); if(m) m.note=v;
}

async function saveField(id,field,value){
  if(value==='__new__'){
    const label=field==='sec'?'team':'division';
    const c=prompt(`New ${label}:`); if(!c||!c.trim())return;
    value=c.trim().toUpperCase();
    field==='sec'?addTeamOpt(value):addDivOpt(value);
    renderSelectOptions();
  }
  await api('PUT',`/api/members/${id}`,{[field]:value});
  const m=members.find(x=>x.id===id); if(m) m[field]=value;
  renderMuster(); renderRosterList();
}

async function addFromIP(){
  const name=document.getElementById('mName')?.value.trim();
  if(!name) return;
  const m=await api('POST','/api/members',{
    name,
    rate:document.getElementById('mRate')?.value.trim()||'',
    sec:document.getElementById('mSec')?.value||'',
    wc:document.getElementById('mWC')?.value||'',
  });
  members.push(m); toggleIPAdd();
  ['mName','mRate'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
  renderMuster(); renderRosterList(); toast('Member added');
}

async function addMember(){
  const name=document.getElementById('nName')?.value.trim();
  const err=document.getElementById('addErr');
  if(!name){if(err){err.textContent='Name required.';err.style.display='block';}return;}
  if(err) err.style.display='none';
  const m=await api('POST','/api/members',{
    name,
    rate:document.getElementById('nRate')?.value.trim()||'',
    sec:document.getElementById('nSec')?.value||'',
    wc:document.getElementById('nWC')?.value||'',
  });
  members.push(m); toggleRosterAdd();
  ['nName','nRate'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
  renderMuster(); renderRosterList(); toast('Member added');
}

async function deleteMember(id){
  if(!confirm('Remove this member?'))return;
  await api('DELETE',`/api/members/${id}`);
  members=members.filter(m=>m.id!==id);
  renderMuster(); renderRosterList(); toast('Removed');
}

async function clearAll(){
  if(!confirm(`This will permanently delete all ${members.length} members and every muster entry.\n\nThis action is NOT recoverable. Back up your roster first if you have not already.\n\nContinue?`))return;
  const typed = prompt('To confirm, type DELETE in capital letters:');
  if(typed!=='DELETE'){ toast('Cancelled — roster not cleared'); return; }
  await api('DELETE','/api/members'); members=[];
  renderMuster(); renderRosterList(); toast('Roster cleared');
}

async function bulkImport(){
  const raw=document.getElementById('importText')?.value.trim();
  const res=document.getElementById('importResult');
  if(!raw){if(res){res.className='import-result err';res.textContent='Nothing to import.';}return;}
  const rows=raw.split('\n').map(l=>l.trim()).filter(Boolean).map(l=>{
    const c=l.includes('\t')?l.split('\t'):l.split(',');
    return{name:c[0]?.trim()||'',rate:c[1]?.trim()||'',sec:c[2]?.trim()||'',wc:c[3]?.trim()||''};
  }).filter(r=>r.name);
  if(!rows.length){if(res){res.className='import-result err';res.textContent='No valid rows.';}return;}
  const data=await api('POST','/api/members/bulk',{members:rows});
  members.push(...(data.members||[]));
  if(document.getElementById('importText')) document.getElementById('importText').value='';
  if(res){res.className='import-result ok';res.textContent=`Imported ${data.added}.`;}
  renderMuster(); renderRosterList(); toast(`Imported ${data.added} members`);
}

// ── Edit modal ──────────────────────────────────────────────────
function openEdit(id){
  const m=members.find(x=>x.id===id); if(!m)return;
  editingId=id;
  const setVal=(elId,val)=>{const e=document.getElementById(elId);if(e)e.value=val;};
  setVal('eName',m.name); setVal('eRate',m.rate||'');
  const eSec=document.getElementById('eSec');
  if(eSec){
    populateSel('eSec',getTeams(),m.sec||'');
    if(m.sec&&![...eSec.options].find(o=>o.value===m.sec)){
      eSec.insertBefore(new Option(m.sec,m.sec),eSec.lastElementChild);
    }
    eSec.value=m.sec||'';
  }
  const eWC=document.getElementById('eWC');
  if(eWC){
    populateSel('eWC',getDivs(),m.wc||'');
    if(m.wc&&![...eWC.options].find(o=>o.value===m.wc)){
      eWC.insertBefore(new Option(m.wc,m.wc),eWC.lastElementChild);
    }
    eWC.value=m.wc||'';
  }
  document.getElementById('editModal').style.display='flex';
  document.getElementById('eName')?.focus();
}
function closeEdit(){ editingId=null; document.getElementById('editModal').style.display='none'; }
async function saveEdit(){
  if(!editingId)return;
  const name=document.getElementById('eName')?.value.trim(); if(!name)return;
  const sec=document.getElementById('eSec')?.value||'';
  const wc=document.getElementById('eWC')?.value||'';
  const rate=document.getElementById('eRate')?.value.trim()||'';
  await api('PUT',`/api/members/${editingId}`,{name,rate,sec,wc});
  const m=members.find(x=>x.id===editingId);
  if(m){m.name=name.toUpperCase();m.rate=rate.toUpperCase();m.sec=sec;m.wc=wc.toUpperCase();}
  closeEdit(); renderMuster(); renderRosterList(); toast('Updated');
}

// ── Roster list ──────────────────────────────────────────────────
function renderRosterList(){
  const el=document.getElementById('rosterList'); if(!el)return;
  const cnt=document.getElementById('rosterCount');

  const q=(document.getElementById('rosterSearch')?.value||'').toLowerCase();
  const ft=document.getElementById('rosterTeam')?.value||'';

  const ts=document.getElementById('rosterTeam');
  if(ts){ const cur=ts.value; ts.innerHTML=`<option value="">All teams</option>${getTeams().map(t=>`<option value="${t}"${cur===t?' selected':''}>${t}</option>`).join('')}`; }

  const list=members.filter(m=>{
    if(q&&!m.name.toLowerCase().includes(q)&&!(m.rate||'').toLowerCase().includes(q))return false;
    if(ft&&m.sec!==ft)return false;
    return true;
  });

  if(cnt) cnt.textContent = ft||q ? `(${list.length} of ${members.length})` : `(${members.length})`;

  if(!list.length){
    el.innerHTML=`<div class="empty"><i class="ti ti-users"></i><p>${members.length?'No members match the filter.':'No members yet.'}</p></div>`;
    return;
  }

  el.innerHTML=list.map(m=>`
    <div class="roster-card" draggable="true" ondragstart="onDragStart(event,${m.id})" ondragend="onDragEnd(event)" ondragover="onDragOver(event)" ondrop="onDrop(event,${m.id})">
      <div style="cursor:grab;color:var(--text-3);padding:0 3px"><i class="ti ti-grip-vertical"></i></div>
      <div style="flex:1;min-width:0">
        <div style="font-size:14px;font-weight:600">${m.name} <span style="font-size:12px;font-weight:400;color:var(--text-3)">${m.rate||''}</span></div>
        <div style="font-size:12px;color:var(--text-3);margin-top:1px">${[m.sec,m.wc].filter(Boolean).join(' · ')||'No team/division'}</div>
      </div>
      <div style="display:flex;gap:5px">
        <button class="sm" onclick="openEdit(${m.id})"><i class="ti ti-pencil"></i></button>
        <button class="icon del" onclick="deleteMember(${m.id})"><i class="ti ti-trash"></i></button>
      </div>
    </div>`).join('');
}

function toggleBulkImport(){
  const p=document.getElementById('bulkImportPanel');
  p.style.display = p.style.display==='none'?'block':'none';
}

function handleCsvFile(e){
  const file=e.target.files?.[0]; if(!file)return;
  const reader=new FileReader();
  reader.onload=async ev=>{
    const text=ev.target.result;
    const rows=text.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
    // Skip a header row if it looks like one
    if(rows.length && /name/i.test(rows[0].split(/[,\t]/)[0]||'')) rows.shift();
    const parsed=rows.map(l=>{
      const c = l.includes('\t') ? l.split('\t') : splitCsvLine(l);
      return {name:(c[0]||'').trim(), rate:(c[1]||'').trim(), sec:(c[2]||'').trim(), wc:(c[3]||'').trim()};
    }).filter(r=>r.name);
    if(!parsed.length){ toast('No valid rows found in file'); return; }
    const data=await api('POST','/api/members/bulk',{members:parsed});
    members.push(...(data.members||[]));
    renderMuster(); renderRosterList();
    const res=document.getElementById('importResult');
    if(res){ res.className='import-result ok'; res.textContent=`Imported ${data.added} from ${file.name}.`; }
    toast(`Imported ${data.added} members`);
  };
  reader.readAsText(file);
  e.target.value='';
}

// Handles quoted CSV fields, e.g.  "SMITH, JOHN A",STG2,BLUE,N85
function splitCsvLine(line){
  const out=[]; let cur=''; let inQ=false;
  for(let i=0;i<line.length;i++){
    const ch=line[i];
    if(ch==='"'){ if(inQ&&line[i+1]==='"'){cur+='"';i++;} else inQ=!inQ; }
    else if(ch===','&&!inQ){ out.push(cur); cur=''; }
    else cur+=ch;
  }
  out.push(cur);
  return out;
}

function backupRoster(){
  if(!members.length){ toast('Roster is empty — nothing to back up'); return; }
  const esc = v => { v=(v||''); return /[",\n]/.test(v) ? '"'+v.replace(/"/g,'""')+'"' : v; };
  const lines=['Name,Rate,Team,Division',
    ...members.map(m=>[esc(m.name),esc(m.rate),esc(m.sec),esc(m.wc)].join(','))];
  const blob=new Blob([lines.join('\n')],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  const d=new Date();
  a.href=url;
  a.download=`roster-backup-${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast(`Backed up ${members.length} members to CSV`);
}

// ── Report ───────────────────────────────────────────────────────
function getHidden(){ return JSON.parse(localStorage.getItem('report_hidden')||'[]'); }
function toggleLine(key){ const h=getHidden(); const i=h.indexOf(key); if(i>=0)h.splice(i,1);else h.push(key); localStorage.setItem('report_hidden',JSON.stringify(h)); buildReport(); }

function getSubmitters(){ return [...new Set(['BLUE','RED','WHITE',...JSON.parse(localStorage.getItem('extra_submitters')||'[]')])]; }
function addSubmitterOpt(v){ const e=JSON.parse(localStorage.getItem('extra_submitters')||'[]'); if(!e.includes(v)){e.push(v);localStorage.setItem('extra_submitters',JSON.stringify(e));} }
function handleSubmitterChange(v){
  if(v==='__new__'){const c=prompt('Name/title:');if(!c||!c.trim())return;const u=c.trim().toUpperCase();addSubmitterOpt(u);submittedBy=u;}
  else submittedBy=v;
  localStorage.setItem('submittedBy',submittedBy);
  buildReport();
}

function buildReport(){
  const now=new Date();
  const months=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const days=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const dt=String(now.getDate()).padStart(2,'0')+months[now.getMonth()]+String(now.getFullYear()).slice(2);
  const hhmm=String(now.getHours()).padStart(2,'0')+String(now.getMinutes()).padStart(2,'0');
  const statuses=getStatuses();
  const total=members.length;

  const ipCount   = members.filter(m=>m.inPerson).length;
  const txCount   = members.filter(m=>m.texted).length;
  const pending   = members.filter(m=>!m.inPerson&&!m.texted&&!m.status).length;
  const accounted = members.filter(m=>m.inPerson||m.texted||m.status).length;

  // Clean, deduped status label
  const label = m => {
    const parts=[];
    if(m.inPerson) parts.push('In-Person Muster');
    if(m.texted)   parts.push('Texted In');
    if(m.status){
      const st=statuses.find(x=>x.v===m.status);
      const lbl=st?st.label:m.status;
      if(!parts.includes(lbl)) parts.push(lbl);
    }
    return parts.length?parts.join(', '):'No status';
  };

  const usedCountsPlain={};
  members.forEach(m=>{ if(m.status) usedCountsPlain[m.status]=(usedCountsPlain[m.status]||0)+1; });

  // ── Plain text ──
  const maxR=Math.max(...members.map(m=>(m.rate||'').length),4);
  const maxN=Math.max(...members.map(m=>m.name.length),20);
  const rosterPlainLines=members.map(m=>{
    const note=m.note?` (${m.note})`:'';
    return `  ${(m.rate||'').padEnd(maxR+1)}${m.name.padEnd(maxN+2)}${label(m)}${note}`;
  });

  reportPlain=[
    'MUSTER REPORT',
    `${days[now.getDay()].toUpperCase()} ${dt} / ${hhmm}`,
    '',
    `PERSONNEL ASSIGNED:  ${total}`,
    `IN-PERSON MUSTER:    ${ipCount}/${total}`,
    `TEXTED IN:           ${txCount}/${total}`,
    `ACCOUNTED FOR:       ${accounted}/${total}`,
    `PENDING:             ${pending}`,
    ...Object.keys(usedCountsPlain).sort().map(v=>{
      const st=statuses.find(x=>x.v===v);
      return `${(st?st.label:v).toUpperCase().padEnd(20)} ${usedCountsPlain[v]}`;
    }),
    '',
    'FULL ROSTER:',
    ...rosterPlainLines,
    '',
    `SUBMITTED BY: ${submittedBy||'______________________'}`,
  ].join('\n');

  // ── HTML ──
  const card=(lbl,val,color,bg)=>`
    <div style="background:${bg};border:1px solid ${color==='var(--text)'?'var(--border)':`color-mix(in srgb,${color} 25%,transparent)`};border-radius:10px;padding:9px 11px;min-width:0">
      <div style="font-size:9px;color:${color==='var(--text)'?'var(--text-3)':color};text-transform:uppercase;letter-spacing:.05em;margin-bottom:3px;opacity:.85;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${lbl}</div>
      <div style="font-size:19px;font-weight:700;color:${color};white-space:nowrap">${val}</div>
    </div>`;

  const rosterHtml=members.map((m,i)=>{
    const lb=label(m);
    const none=!m.inPerson&&!m.texted&&!m.status;
    const ua=m.status==='UA';
    const color=ua?'var(--danger)':none?'var(--text-3)':(m.inPerson||m.texted)?'var(--success)':'var(--text-2)';
    const note=m.note?`<span style="font-size:11px;color:var(--text-3)"> · ${m.note}</span>`:'';
    return `<div class="rpt-roster-row" style="${i%2?'background:var(--surface-alt)':''}">
      <span class="rpt-rate">${m.rate||''}</span>
      <span class="rpt-name">${m.name}${note}</span>
      <span class="rpt-status" style="color:${color}">${lb}</span>
    </div>`;
  }).join('');

  // Issue 5: one box per status actually used — no "Other Statuses" bucket
  const usedCounts={};
  members.forEach(m=>{ if(m.status) usedCounts[m.status]=(usedCounts[m.status]||0)+1; });
  const statusCards = Object.keys(usedCounts).sort().map(v=>{
    const st=statuses.find(x=>x.v===v);
    const lbl=st?st.label:v;
    const ua=v==='UA';
    const color = ua ? 'var(--danger)' : 'var(--pro-text)';
    const bg    = ua ? 'var(--danger-bg)' : 'var(--pro-bg)';
    return card(lbl, usedCounts[v], color, bg);
  }).join('');

  const subEl=document.getElementById('submittedByRow');
  if(subEl) subEl.innerHTML=`
    <span style="font-size:13px;font-weight:500;color:var(--text-2)">Submitted by</span>
    <select style="font-size:13px;padding:5px 10px;border:1px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);width:auto" onchange="handleSubmitterChange(this.value)">
      <option value="">-- Select --</option>
      ${getSubmitters().map(x=>`<option value="${x}" ${submittedBy===x?'selected':''}>${x}</option>`).join('')}
      <option value="__new__">+ Add new...</option>
    </select>
    ${submittedBy?`<span style="font-size:12px;color:var(--success);font-weight:600">✓ ${submittedBy}</span>`:''}`;

  const warn=document.getElementById('reportWarn');
  if(warn){ if(pending>0){warn.innerHTML=`<i class="ti ti-alert-triangle"></i> ${pending} member(s) not yet accounted for.`;warn.style.display='flex';}else warn.style.display='none'; }

  document.getElementById('reportBody').innerHTML=`
    <div style="font-size:12px;color:var(--text-3);margin-bottom:12px">${days[now.getDay()]} · ${String(now.getDate()).padStart(2,'0')} ${months[now.getMonth()]} ${now.getFullYear()} · ${hhmm}</div>

    <div class="rpt-cards">
      ${card('Personnel Assigned', total, 'var(--text)', 'var(--surface-alt)')}
      ${card('In-Person Muster', ipCount+'/'+total, 'var(--success)', 'var(--success-bg)')}
      ${card('Texted In', txCount+'/'+total, '#0369a1', '#e0f2fe')}
      ${card('Accounted For', accounted+'/'+total, 'var(--success)', 'var(--success-bg)')}
      ${card('Pending', pending, pending>0?'var(--danger)':'var(--text)', pending>0?'var(--danger-bg)':'var(--surface-alt)')}
      ${statusCards}
    </div>

    <div style="font-size:11px;font-weight:600;color:var(--text-3);text-transform:uppercase;letter-spacing:.05em;margin:14px 0 6px">Full roster · ${total} members</div>
    <div style="border:1px solid var(--border);border-radius:10px;overflow:hidden;padding:3px">${rosterHtml}</div>`;
}

function copyReport(){ navigator.clipboard.writeText(reportPlain).then(()=>toast('Copied!')); }

// ── Tab switching ────────────────────────────────────────────────
function switchMain(name, el){
  ['muster','roster','report'].forEach(t=>{
    const te=document.getElementById('tab-'+t); if(te) te.style.display=t===name?'block':'none';
  });
  document.querySelectorAll('.main-tab').forEach(b=>b.classList.remove('active'));
  if(el) el.classList.add('active');
  if(name==='roster') renderRosterList();
  if(name==='report') buildReport();
  if(name==='muster') renderMuster();
}

// ── Utility ──────────────────────────────────────────────────────
function toast(msg){ const el=document.getElementById('toast'); el.textContent=msg; el.classList.add('show'); setTimeout(()=>el.classList.remove('show'),2200); }
function setDate(){ const n=new Date(); const days=['Sun','Mon','Tue','Wed','Thu','Fri','Sat']; const mos=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']; document.getElementById('topDate').textContent=`${days[n.getDay()]} ${String(n.getDate()).padStart(2,'0')} ${mos[n.getMonth()]} ${n.getFullYear()}`; }

document.addEventListener('keydown',e=>{ if(e.key==='Escape') closeEdit(); if(e.key==='Enter'&&document.getElementById('editModal')?.style.display!=='none') saveEdit(); });

setDate();
load();
