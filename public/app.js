'use strict';

// ── Status definitions ────────────────────────────────────────────
const DEFAULT_STATUSES = [
  { v:'PRESENT',    label:'Present' },
  { v:'IN-PERSON',  label:'In-Person Muster' },
  { v:'PHONE',      label:'Phone muster' },
  { v:'TEXT',       label:'Text muster' },
  { v:'APPT',       label:'Appointment' },
  { v:'SICK CALL',  label:'Sick call' },
  { v:'SIQ',        label:'SIQ' },
  { v:'LEAVE',      label:'Leave' },
  { v:'TAD',        label:'TAD' },
  { v:'POST-WATCH', label:'Post-watch' },
  { v:'LIBERTY',    label:'Liberty' },
  { v:'RPT N85',    label:'Rpt N85 Office' },
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
  renderStatusChips(); renderSelectOptions(); renderIP(); toast(`"${u}" added`);
}
function deleteCustomStatus(v) {
  if (!confirm(`Remove "${v}"?`)) return;
  const extra = JSON.parse(localStorage.getItem('extra_statuses')||'[]').filter(s=>s!==v);
  localStorage.setItem('extra_statuses',JSON.stringify(extra));
  members.forEach(m=>{ if(m.status===v){ m.status=''; api('PUT',`/api/members/${m.id}`,{status:''}); }});
  renderStatusChips(); renderSelectOptions(); renderIP(); toast(`"${v}" removed`);
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
  renderSelectOptions();
  renderStats(); renderIP(); renderTX(); renderRosterList();
}

// ── Stats ────────────────────────────────────────────────────────
function renderStats(){
  const total=members.length;
  const ip=members.filter(m=>INPERSON_VALS.includes(m.status)).length;
  const tx=members.filter(m=>TEXT_VALS.includes(m.status)).length;
  const ua=members.filter(m=>m.status==='UA').length;
  document.getElementById('stats').innerHTML=`
    <div class="stat"><div class="stat-n">${total}</div><div class="stat-l">Assigned</div></div>
    <div class="stat"><div class="stat-n ${ip===total&&total>0?'green':''}">${ip}</div><div class="stat-l">In-Person</div></div>
    <div class="stat"><div class="stat-n ${tx>0?'green':''}">${tx}</div><div class="stat-l">Texted</div></div>
    <div class="stat"><div class="stat-n ${ua>0?'red':''}">${ua}</div><div class="stat-l">UA</div></div>`;
}

// ── Pills ────────────────────────────────────────────────────────
function pill(status){
  if(!status) return '<span class="pill pill-none">No status</span>';
  const st=getStatuses().find(s=>s.v===status);
  const cls='pill-'+status.replace(/\s/g,'\\ ');
  return `<span class="pill ${CSS.escape?'pill-'+status:cls}">${st?st.label:status}</span>`;
}

// ── Sort / Drag ──────────────────────────────────────────────────
function setSort(dir){
  sortDir=dir;
  if(dir==='asc')  members.sort((a,b)=>a.name.localeCompare(b.name));
  if(dir==='desc') members.sort((a,b)=>b.name.localeCompare(a.name));
  document.getElementById('sortAscBtn')?.classList.toggle('primary',dir==='asc');
  document.getElementById('sortDescBtn')?.classList.toggle('primary',dir==='desc');
  renderIP(); renderTX(); renderRosterList();
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
  renderIP(); renderTX(); renderRosterList();
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
  renderIP(); renderRosterList();
}

// ── Sub-tab helpers ──────────────────────────────────────────────
function subTabsHtml(view,pending,done,setFn,prefix){
  const all=pending+done;
  return ['all','pending','done'].map(v=>{
    const count=v==='all'?all:v==='pending'?pending:done;
    const label=v==='done'?'Checked In':v.charAt(0).toUpperCase()+v.slice(1);
    const warn=v==='pending'&&pending>0;
    const ok=v==='done'&&done===members.length&&members.length>0;
    return `<button class="sub-tab ${view===v?'active':''}" onclick="${setFn}('${v}')" style="${warn?'color:var(--warn)':ok?'color:var(--success)':''}">${label} <span class="badge">${count}</span></button>`;
  }).join('');
}

// ── IN-PERSON RENDER ─────────────────────────────────────────────
function setIPView(v){ ipView=v; renderIP(); }

function renderIP(){
  renderStats();
  const q=(document.getElementById('ipSearch')?.value||'').toLowerCase();
  const ft=document.getElementById('ipTeam')?.value||'';
  renderSelectOptions();

  let list=members.filter(m=>{
    if(q&&!m.name.toLowerCase().includes(q)&&!(m.rate||'').toLowerCase().includes(q))return false;
    if(ft&&m.sec!==ft)return false;
    return true;
  });

  const done=list.filter(m=>m.status&&m.status!=='UA'&&!TEXT_VALS.includes(m.status));
  const pending=list.filter(m=>!m.status||m.status==='UA'||TEXT_VALS.includes(m.status));
  const show=ipView==='pending'?pending:ipView==='done'?done:list;

  document.getElementById('ipSubTabs').innerHTML=subTabsHtml(ipView,
    members.filter(m=>!m.status||m.status==='UA'||TEXT_VALS.includes(m.status)).length,
    members.filter(m=>m.status&&m.status!=='UA'&&!TEXT_VALS.includes(m.status)).length,
    'setIPView','ip');

  const el=document.getElementById('ipRoster');
  if(!show.length){
    el.innerHTML=`<div class="empty"><i class="ti ti-${ipView==='pending'?'circle-check':'users'}"></i><p>${ipView==='pending'?'All checked in!':ipView==='done'?'No one checked in yet.':'No members found.'}</p></div>`;
    return;
  }

  if(ipView==='all'){
    let html='';
    if(pending.length) html+=secHdr('Pending','var(--warn)','var(--warn-bg)',pending.length)+`<div class="roster">${pending.map(ipCard).join('')}</div>`;
    if(done.length) html+=secHdr('Checked In','var(--success)','var(--success-bg)',done.length,pending.length>0)+`<div class="roster">${done.map(ipCard).join('')}</div>`;
    el.innerHTML=html;
  } else {
    el.innerHTML=`<div class="roster">${show.map(ipCard).join('')}</div>`;
  }
}

function secHdr(label,color,bg,count,mt=false){
  return `<div class="sec-hdr" style="${mt?'margin-top:16px':''}">
    <span class="sec-hdr-label" style="color:${color}">${label}</span>
    <span class="sec-hdr-count" style="background:${bg};color:${color}">${count}</span>
    <hr></div>`;
}

function ipCard(m){
  const isDone=m.status&&m.status!=='UA'&&!TEXT_VALS.includes(m.status);
  const noteEl=editingNote===m.id
    ?`<div class="note-row"><input type="text" placeholder="Note..." value="${(m.note||'').replace(/"/g,'&quot;')}" onchange="saveNote(${m.id},this.value)" onblur="saveNote(${m.id},this.value)"><button class="sm" onclick="editingNote=null;renderIP()"><i class="ti ti-check"></i></button></div>`
    :m.note?`<div class="card-note"><i class="ti ti-notes" style="font-size:11px"></i> ${m.note} <button class="icon sm" onclick="editingNote=${m.id};renderIP()"><i class="ti ti-pencil" style="font-size:11px"></i></button></div>`:'';
  const metaRow=`<div class="card-meta-row${showTeamDiv?'':' hidden'}">
    <span class="field-lbl">TEAM</span>
    <select onchange="saveField(${m.id},'sec',this.value)" style="font-size:11px;padding:2px 5px;height:24px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text)">
      <option value="">--</option>${getTeams().map(t=>`<option value="${t}" ${m.sec===t?'selected':''}>${t}</option>`).join('')}<option value="__new__">+</option>
    </select>
    <span class="field-lbl" style="margin-left:5px">DIV</span>
    <select onchange="saveField(${m.id},'wc',this.value)" style="font-size:11px;padding:2px 5px;height:24px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text)">
      <option value="">--</option>${getDivs().map(d=>`<option value="${d}" ${m.wc===d?'selected':''}>${d}</option>`).join('')}<option value="__new__">+</option>
    </select>
  </div>`;
  return `<div class="card${!isDone?' pending':''}${m.status==='UA'?' ua-card':''}"
      draggable="true" ondragstart="onDragStart(event,${m.id})" ondragend="onDragEnd(event)" ondragover="onDragOver(event)" ondrop="onDrop(event,${m.id})">
    <div style="cursor:grab;color:var(--text-3);padding:0 3px;display:flex;align-items:center;align-self:stretch"><i class="ti ti-grip-vertical" style="font-size:15px"></i></div>
    <div class="card-body">
      <div class="card-top">
        ${pill(m.status)}
        <span class="card-name">${m.name}</span>
        <span class="card-meta">${m.rate||''}</span>
        <button class="icon sm" onclick="editingNote=${editingNote===m.id?null:m.id};renderIP()" style="margin-left:auto"><i class="ti ti-pencil" style="font-size:13px"></i></button>
      </div>
      ${metaRow}
      ${noteEl}
    </div>
    <div class="card-actions">
      <select class="status-sel" onchange="handleStatusChange(${m.id},this.value,this,'ip')">
        <option value="">-- status --</option>
        ${getStatuses().map(s=>`<option value="${s.v}" ${m.status===s.v?'selected':''}>${s.label}</option>`).join('')}
        <option value="__new_status__">+ Add new...</option>
      </select>
      <button class="icon del sm" onclick="deleteMember(${m.id})"><i class="ti ti-trash" style="font-size:13px"></i></button>
    </div>
  </div>`;
}

// ── TEXT MUSTER RENDER ───────────────────────────────────────────
function setTXView(v){ txView=v; renderTX(); }

function renderTX(){
  renderStats();
  const q=(document.getElementById('txSearch')?.value||'').toLowerCase();
  const ft=document.getElementById('txTeam')?.value||'';

  let list=members.filter(m=>{
    if(q&&!m.name.toLowerCase().includes(q)&&!(m.rate||'').toLowerCase().includes(q))return false;
    if(ft&&m.sec!==ft)return false;
    return true;
  });

  const texted=list.filter(m=>m.status==='TEXT');
  const pending=list.filter(m=>m.status!=='TEXT');
  const show=txView==='pending'?pending:txView==='done'?texted:list;

  document.getElementById('txSubTabs').innerHTML=subTabsHtml(txView,
    members.filter(m=>m.status!=='TEXT').length,
    members.filter(m=>m.status==='TEXT').length,
    'setTXView','tx');

  // rebuild team filter
  const ts=document.getElementById('txTeam');
  if(ts){ const cur=ts.value; ts.innerHTML=`<option value="">All teams</option>${getTeams().map(t=>`<option value="${t}"${cur===t?' selected':''}>${t}</option>`).join('')}`; }

  const el=document.getElementById('txRoster');
  if(!show.length){
    el.innerHTML=`<div class="empty"><i class="ti ti-message"></i><p>${txView==='pending'?'Everyone texted in!':txView==='done'?'No one has texted in yet.':'No members.'}</p></div>`;
    return;
  }

  if(txView==='all'){
    let html='';
    if(pending.length) html+=secHdr('Pending text','var(--warn)','var(--warn-bg)',pending.length)+`<div class="roster">${pending.map(txCard).join('')}</div>`;
    if(texted.length) html+=secHdr('Texted In','var(--success)','var(--success-bg)',texted.length,pending.length>0)+`<div class="roster">${texted.map(txCard).join('')}</div>`;
    el.innerHTML=html;
  } else {
    el.innerHTML=`<div class="roster">${show.map(txCard).join('')}</div>`;
  }
}

function txCard(m){
  const ok=m.status==='TEXT';
  const noteEl=m.note?`<div class="card-note"><i class="ti ti-notes" style="font-size:11px"></i> ${m.note}</div>`:'';
  return `<div class="card${ok?'':' pending'}">
    <div class="card-body">
      <div class="card-top">
        ${ok?'<span class="pill pill-TEXT">Text muster</span>':'<span class="pill pill-none">Pending</span>'}
        <span class="card-name">${m.name}</span>
        <span class="card-meta">${m.rate||''}${m.sec?' · '+m.sec:''}</span>
      </div>
      ${noteEl}
    </div>
    <div class="card-actions">
      <button class="checkin-btn ${ok?'':'primary'}" onclick="markText(${m.id},${ok})">
        ${ok?'<i class="ti ti-x"></i> Unmark':'<i class="ti ti-check"></i> Mark texted'}
      </button>
    </div>
  </div>`;
}

async function markText(id, isTexted){
  await api('PUT',`/api/members/${id}`,{status:isTexted?'':' TEXT'.trim()});
  const m=members.find(x=>x.id===id); if(m) m.status=isTexted?'':'TEXT';
  renderStats(); renderTX();
}

// ── Actions ──────────────────────────────────────────────────────
async function handleStatusChange(id, val, el, tab){
  if(val==='__new_status__'){
    const c=prompt('New status name:'); if(!c||!c.trim()){el.value=members.find(m=>m.id===id)?.status||'';return;}
    const u=c.trim().toUpperCase(); addCustomStatus(u);
    val=u;
  }
  await api('PUT',`/api/members/${id}`,{status:val});
  const m=members.find(x=>x.id===id); if(m) m.status=val;
  renderStats(); if(tab==='ip') renderIP(); else renderTX();
}

async function setStatus(id,v){
  await api('PUT',`/api/members/${id}`,{status:v});
  const m=members.find(x=>x.id===id); if(m) m.status=v;
  renderStats(); renderIP(); renderTX();
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
  renderIP(); renderRosterList();
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
  renderStats(); renderIP(); renderRosterList(); toast('Member added');
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
  renderStats(); renderIP(); renderRosterList(); toast('Member added');
}

async function deleteMember(id){
  if(!confirm('Remove this member?'))return;
  await api('DELETE',`/api/members/${id}`);
  members=members.filter(m=>m.id!==id);
  renderStats(); renderIP(); renderTX(); renderRosterList(); toast('Removed');
}

async function clearAll(){
  if(!confirm('Remove ALL members permanently?'))return;
  await api('DELETE','/api/members'); members=[];
  renderStats(); renderIP(); renderTX(); renderRosterList(); toast('Roster cleared');
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
  renderStats(); renderIP(); renderTX(); renderRosterList(); toast(`Imported ${data.added} members`);
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
  closeEdit(); renderIP(); renderRosterList(); toast('Updated');
}

// ── Roster list ──────────────────────────────────────────────────
function renderRosterList(){
  const el=document.getElementById('rosterList'); if(!el)return;
  const cnt=document.getElementById('rosterCount'); if(cnt) cnt.textContent=`(${members.length})`;
  if(!members.length){el.innerHTML='<div class="empty"><i class="ti ti-users"></i><p>No members yet.</p></div>';return;}
  el.innerHTML=members.map(m=>`
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
  const hidden=getHidden();
  const cnt=(...vs)=>members.filter(m=>vs.includes(m.status)).length;
  const ua=cnt('UA');
  const ipAcct=members.filter(m=>m.status&&m.status!=='UA'&&!TEXT_VALS.includes(m.status)).length;
  const txAcct=cnt('TEXT');
  const pending=members.filter(m=>!m.status).length;

  // Section groups for report
  const ipDefs=[
    {key:'IP_ASSIGNED',  label:'Assigned',          val:members.length},
    {key:'IP_ACCOUNTED', label:'In-Person Accounted',val:ipAcct},
    {key:'IP_TEXT',      label:'Text Muster',        val:txAcct},
    {key:'IP_UNACCT',    label:'Unaccounted',        val:ua+pending},
    {key:'_div1'},
    {key:'IP_PRESENT',   label:'Present',            val:cnt('PRESENT')},
    {key:'IP_INPERSON',  label:'In-Person Muster',   val:cnt('IN-PERSON')},
    {key:'IP_PHONE',     label:'Phone muster',       val:cnt('PHONE')},
    {key:'IP_TEXT2',     label:'Text muster',        val:txAcct},
    {key:'IP_APPT',      label:'Appt / Sick',        val:cnt('APPT','SICK CALL')},
    {key:'IP_SIQ',       label:'SIQ',                val:cnt('SIQ')},
    {key:'IP_LEAVE',     label:'Leave',              val:cnt('LEAVE')},
    {key:'IP_TAD',       label:'TAD',                val:cnt('TAD')},
    {key:'IP_POSTWATCH', label:'Post-Watch',         val:cnt('POST-WATCH')},
    {key:'IP_LIBERTY',   label:'Liberty',            val:cnt('LIBERTY')},
    {key:'IP_N85',       label:'Rpt N85 Office',     val:cnt('RPT N85')},
    {key:'IP_UA',        label:'UA',                 val:ua},
    ...statuses.filter(s=>!CORE_VALS.includes(s.v)).map(s=>({key:'CUSTOM_'+s.v,label:s.label,val:cnt(s.v)})),
  ];

  const acctStmt=localStorage.getItem('acct_statement')||'none';
  const stmtLine=acctStmt==='all_present'?'All present and accounted for.'
    :acctStmt==='with_exceptions'?'All present and accounted for with the exceptions below.'
    :'';

  // Plain text
  const plainSummary=ipDefs.filter(d=>!d.key.startsWith('_')&&!hidden.includes(d.key))
    .map(d=>`${d.label.padEnd(22)} ${String(d.val).padStart(3)}`);
  const maxR=Math.max(...members.map(m=>(m.rate||'').length),4);
  const maxN=Math.max(...members.map(m=>m.name.length),20);
  const rosterPlainLines=members.map(m=>{
    const st=statuses.find(s=>s.v===m.status);
    const label=m.status?(st?st.label.toUpperCase():m.status):'NO STATUS';
    const note=m.note?` (${m.note})`:'';
    return `  ${(m.rate||'').padEnd(maxR+1)}${m.name.padEnd(maxN+2)}${label}${note}`;
  });
  reportPlain=[
    `MUSTER REPORT`,`${days[now.getDay()].toUpperCase()} ${dt} / ${hhmm}`,'',
    ...plainSummary,
    ...(stmtLine?['',stmtLine]:[]),
    '','FULL ROSTER:',...rosterPlainLines,'',
    `SUBMITTED BY: ${submittedBy||'______________________'}`,
  ].join('\n');

  // HTML
  const summaryHtml=ipDefs.map(d=>{
    if(d.key.startsWith('_'))return`<div style="height:1px;background:var(--border);margin:3px 0"></div>`;
    const isHid=hidden.includes(d.key);
    const danger=(d.key==='IP_UNACCT'||d.key==='IP_UA')&&d.val>0;
    const success=(d.key==='IP_PRESENT'||d.key==='IP_INPERSON'||d.key==='IP_ACCOUNTED')&&d.val>0;
    const vc=isHid?'var(--text-3)':danger?'var(--danger)':success?'var(--success)':'var(--text)';
    return`<div class="rpt-row${isHid?' rpt-hid':''}" onclick="toggleLine('${d.key}')">
      <span class="rpt-row-label">${d.label}</span>
      <div style="display:flex;align-items:center;gap:8px">
        <span class="rpt-row-val" style="color:${vc}">${d.val}</span>
        <span style="font-size:10px;color:var(--text-3);width:50px;text-align:right">${isHid?'hidden':'tap to hide'}</span>
      </div>
    </div>`;
  }).join('');

  const rosterHtml=members.map((m,i)=>{
    const st=statuses.find(s=>s.v===m.status);
    const label=m.status?(st?st.label:'???'):'No status';
    const vc=m.status==='UA'?'var(--danger)':m.status==='PRESENT'||m.status==='IN-PERSON'?'var(--success)':!m.status?'var(--text-3)':'var(--text-2)';
    const note=m.note?`<span style="font-size:11px;color:var(--text-3)"> · ${m.note}</span>`:'';
    return`<div class="rpt-roster-row" style="${i%2?'background:var(--surface-alt)':''}">
      <span class="rpt-rate">${m.rate||''}</span>
      <span class="rpt-name">${m.name}${note}</span>
      <span class="rpt-status" style="color:${vc}">${label}</span>
    </div>`;
  }).join('');

  const stmtHtml=['all_present','with_exceptions','none'].map(opt=>{
    const sel=acctStmt===opt;
    const label=opt==='all_present'?'All present and accounted for':opt==='with_exceptions'?'All present and accounted for with the exceptions below':'No statement';
    return`<label style="display:flex;align-items:center;gap:8px;padding:7px 10px;border:1px solid ${sel?'var(--accent)':'var(--border)'};border-radius:8px;cursor:pointer;background:${sel?'var(--accent-bg)':'transparent'}">
      <input type="radio" name="stmt" value="${opt}" ${sel?'checked':''} onchange="localStorage.setItem('acct_statement',this.value);buildReport()" style="width:auto;padding:0;border:none">
      <span style="font-size:13px;color:${sel?'var(--accent-text)':'var(--text-2)'};font-weight:${sel?'600':'400'}">${label}</span>
    </label>`;
  }).join('');

  const subEl=document.getElementById('submittedByRow');
  if(subEl) subEl.innerHTML=`
    <span style="font-size:13px;font-weight:500;color:var(--text-2)">Submitted by</span>
    <select style="font-size:13px;padding:5px 10px;border:1px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);width:auto" onchange="handleSubmitterChange(this.value)">
      <option value="">-- Select --</option>
      ${getSubmitters().map(s=>`<option value="${s}" ${submittedBy===s?'selected':''}>${s}</option>`).join('')}
      <option value="__new__">+ Add new...</option>
    </select>
    ${submittedBy?`<span style="font-size:12px;color:var(--success);font-weight:600">✓ ${submittedBy}</span>`:''}`;

  const warn=document.getElementById('reportWarn');
  if(warn){ if(pending>0){warn.innerHTML=`<i class="ti ti-alert-triangle"></i> ${pending} member(s) have no status.`;warn.style.display='flex';}else warn.style.display='none'; }

  document.getElementById('reportBody').innerHTML=`
    <div style="margin-bottom:14px">
      <div class="rpt-header-title">Muster Report</div>
      <div style="font-size:12px;color:var(--text-3);margin-top:2px">${days[now.getDay()]} · ${String(now.getDate()).padStart(2,'0')} ${months[now.getMonth()]} ${now.getFullYear()} · ${hhmm}</div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px">
      <div style="background:var(--surface-alt);border:1px solid var(--border);border-radius:10px;padding:10px 12px">
        <div style="font-size:10px;color:var(--text-3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:3px">Assigned</div>
        <div style="font-size:22px;font-weight:700">${members.length}</div>
      </div>
      <div style="background:var(--success-bg);border:1px solid color-mix(in srgb,var(--success) 25%,transparent);border-radius:10px;padding:10px 12px">
        <div style="font-size:10px;color:var(--success);text-transform:uppercase;letter-spacing:.05em;margin-bottom:3px;opacity:.8">Accounted</div>
        <div style="font-size:22px;font-weight:700;color:var(--success)">${ipAcct+txAcct}</div>
      </div>
      <div style="background:${ua+pending>0?'var(--danger-bg)':'var(--surface-alt)'};border:1px solid ${ua+pending>0?'color-mix(in srgb,var(--danger) 25%,transparent)':'var(--border)'};border-radius:10px;padding:10px 12px">
        <div style="font-size:10px;color:${ua+pending>0?'var(--danger)':'var(--text-3)'};text-transform:uppercase;letter-spacing:.05em;margin-bottom:3px;opacity:.8">Pending</div>
        <div style="font-size:22px;font-weight:700;color:${ua+pending>0?'var(--danger)':'var(--text)'}">${ua+pending}</div>
      </div>
    </div>

    <div class="rpt-hint">Tap any row to hide from the copied report</div>
    <div style="border:1px solid var(--border);border-radius:10px;overflow:hidden;margin-bottom:14px;padding:2px 0">
      ${summaryHtml}
    </div>

    <div style="font-size:11px;font-weight:600;color:var(--text-3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Accountability statement</div>
    <div style="display:flex;flex-direction:column;gap:5px;margin-bottom:14px">${stmtHtml}</div>

    <div style="font-size:11px;font-weight:600;color:var(--text-3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Full roster · ${members.length} members</div>
    <div style="border:1px solid var(--border);border-radius:10px;overflow:hidden;padding:3px">${rosterHtml}</div>`;
}

function copyReport(){ navigator.clipboard.writeText(reportPlain).then(()=>toast('Copied!')); }

// ── Tab switching ────────────────────────────────────────────────
function switchMain(name, el){
  ['inperson','text','roster','report'].forEach(t=>{
    const te=document.getElementById('tab-'+t); if(te) te.style.display=t===name?'block':'none';
  });
  document.querySelectorAll('.main-tab').forEach(b=>b.classList.remove('active'));
  if(el) el.classList.add('active');
  if(name==='roster') renderRosterList();
  if(name==='report') buildReport();
  if(name==='text') renderTX();
}

// ── Utility ──────────────────────────────────────────────────────
function toast(msg){ const el=document.getElementById('toast'); el.textContent=msg; el.classList.add('show'); setTimeout(()=>el.classList.remove('show'),2200); }
function setDate(){ const n=new Date(); const days=['Sun','Mon','Tue','Wed','Thu','Fri','Sat']; const mos=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']; document.getElementById('topDate').textContent=`${days[n.getDay()]} ${String(n.getDate()).padStart(2,'0')} ${mos[n.getMonth()]} ${n.getFullYear()}`; }

document.addEventListener('keydown',e=>{ if(e.key==='Escape') closeEdit(); if(e.key==='Enter'&&document.getElementById('editModal')?.style.display!=='none') saveEdit(); });

setDate();
load();
