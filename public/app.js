'use strict';

// ── Status list ───────────────────────────────────────────────────────────────
const DEFAULT_STATUSES = [
  { v: 'PRESENT',    label: 'Present' },
  { v: 'PHONE',      label: 'Phone muster' },
  { v: 'TEXT',       label: 'Text muster' },
  { v: 'APPT',       label: 'Appointment' },
  { v: 'SICK CALL',  label: 'Sick call' },
  { v: 'SIQ',        label: 'SIQ' },
  { v: 'LIGHT DUTY', label: 'Light duty' },
  { v: 'LEAVE',      label: 'Leave' },
  { v: 'TAD',        label: 'TAD' },
  { v: 'SCHOOL',     label: 'School' },
  { v: 'WATCH',      label: 'Watch' },
  { v: 'POST-WATCH', label: 'Post-watch' },
  { v: 'LIBERTY',    label: 'Liberty' },
  { v: 'LIMDU',      label: 'LIMDU' },
  { v: 'RPT N85',    label: 'Report to N85 Office' },
  { v: 'UA',         label: 'UA' },
];

const CORE_STATUS_VALS = DEFAULT_STATUSES.map(s => s.v);

function getStatuses() {
  const extra = JSON.parse(localStorage.getItem('extra_statuses') || '[]');
  return [...DEFAULT_STATUSES, ...extra.map(v => ({ v, label: v }))];
}
function addStatus(v) {
  const extra = JSON.parse(localStorage.getItem('extra_statuses') || '[]');
  if (!extra.includes(v)) { extra.push(v); localStorage.setItem('extra_statuses', JSON.stringify(extra)); }
}

// ── Team / Division options ───────────────────────────────────────────────────
const DEFAULT_TEAMS = ['BLUE', 'RED', 'WHITE'];
const DEFAULT_DIVS  = ['N85'];

function getTeams() { return [...new Set([...DEFAULT_TEAMS, ...JSON.parse(localStorage.getItem('extra_teams') || '[]')])]; }
function getDivs()  { return [...new Set([...DEFAULT_DIVS,  ...JSON.parse(localStorage.getItem('extra_divs')  || '[]')])]; }
function addTeam(v) { const e = JSON.parse(localStorage.getItem('extra_teams')||'[]'); if(!e.includes(v)){e.push(v);localStorage.setItem('extra_teams',JSON.stringify(e));} }
function addDiv(v)  { const e = JSON.parse(localStorage.getItem('extra_divs') ||'[]'); if(!e.includes(v)){e.push(v);localStorage.setItem('extra_divs', JSON.stringify(e));} }

function makeSelect(type, currentVal, callbackStr, extraStyle='') {
  const opts  = type === 'team' ? getTeams() : getDivs();
  const label = type === 'team' ? 'Team' : 'Division';
  const safe  = (currentVal || '').toUpperCase();
  const id    = `sel_${type}_${Math.random().toString(36).slice(2)}`;
  const optsHtml = [
    `<option value="">-- ${label} --</option>`,
    ...opts.map(o => `<option value="${o}" ${safe === o ? 'selected' : ''}>${o}</option>`),
    `<option value="__new__">+ Add new...</option>`,
  ].join('');
  return `<select id="${id}" style="font-size:12px;padding:3px 6px;height:28px;${extraStyle}"
    onchange="handleSelectChange('${id}','${type}',this.value,'${callbackStr}')">${optsHtml}</select>`;
}

async function handleSelectChange(selId, type, value, callbackStr) {
  if (value === '__new__') {
    const custom = prompt(`Enter new ${type === 'team' ? 'team' : 'division'} name:`);
    if (!custom || !custom.trim()) { document.getElementById(selId).value = ''; return; }
    const upper = custom.trim().toUpperCase();
    type === 'team' ? addTeam(upper) : addDiv(upper);
    await runCallback(callbackStr, upper);
    render(); renderRosterList();
    return;
  }
  await runCallback(callbackStr, value);
}

async function runCallback(str, value) {
  const [fn, id, field] = str.split(':');
  if (fn === 'saveField') await saveField(parseInt(id), field, value);
  if (fn === 'setHidden') { const el = document.getElementById(field); if (el) el.value = value; }
}

function resolveSelect(id, type) {
  const el = document.getElementById(id);
  if (!el) return '';
  if (el.value === '__new_team__' || el.value === '__new_div__' || el.value === '__new__') {
    const custom = prompt(`Enter new ${type} name:`);
    if (!custom || !custom.trim()) { el.value = ''; return ''; }
    const upper = custom.trim().toUpperCase();
    type === 'team' ? addTeam(upper) : addDiv(upper);
    el.insertBefore(new Option(upper, upper, true, true), el.lastElementChild);
    el.value = upper;
    return upper;
  }
  return el.value;
}

// ── State ─────────────────────────────────────────────────────────────────────
let members      = [];
let editingNote  = null;
let editingId    = null;
let musterAddOpen= false;
let sortDir      = 'asc';  // 'asc' | 'desc' | 'manual'
let dragSrcId    = null;

// ── API ───────────────────────────────────────────────────────────────────────
async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(path, opts);
  return r.json();
}

async function load() {
  const data = await api('GET', '/api/members');
  members = data.members || [];
  render(); renderRosterList();
}

// ── Actions ───────────────────────────────────────────────────────────────────
async function handleStatusChange(id, value, el) {
  if (value === '__new_status__') {
    const custom = prompt('Enter new status name:');
    if (!custom || !custom.trim()) { el.value = members.find(m=>m.id===id)?.status || ''; return; }
    const upper = custom.trim().toUpperCase();
    addStatus(upper);
    await setStatus(id, upper);
    return;
  }
  await setStatus(id, value);
}

async function setStatus(id, v) {
  await api('PUT', `/api/members/${id}`, { status: v });
  const m = members.find(x => x.id === id);
  if (m) m.status = v;
  render(); renderStats();
}

async function saveNote(id, v) {
  await api('PUT', `/api/members/${id}`, { note: v });
  const m = members.find(x => x.id === id);
  if (m) m.note = v;
}

async function saveField(id, field, value) {
  const payload = {};
  payload[field] = value;
  await api('PUT', `/api/members/${id}`, payload);
  const m = members.find(x => x.id === id);
  if (m) m[field] = (field === 'wc' || field === 'rate') ? value.toUpperCase() : value;
  render(); renderRosterList();
}

async function addMember() {
  const name = document.getElementById('nName').value.trim();
  const err  = document.getElementById('addErr');
  if (!name) { err.textContent = 'Name is required.'; err.style.display = 'block'; return; }
  err.style.display = 'none';
  const m = await api('POST', '/api/members', {
    name,
    rate: document.getElementById('nRate').value.trim(),
    sec:  resolveSelect('nSec', 'team'),
    wc:   resolveSelect('nWC', 'div'),
  });
  members.push(m);
  ['nName','nRate','nSec','nWC'].forEach(id => { const el = document.getElementById(id); if(el) el.value=''; });
  toggleAddPanel();
  render(); renderRosterList(); renderStats();
  toast('Member added');
}

async function addFromMuster() {
  const name = (document.getElementById('mName').value || '').trim();
  if (!name) { document.getElementById('mName').focus(); return; }
  const m = await api('POST', '/api/members', {
    name,
    rate: (document.getElementById('mRate').value || '').trim(),
    sec:  document.getElementById('mSec').value || '',
    wc:   document.getElementById('mWC').value  || '',
  });
  members.push(m);
  musterAddOpen = false;
  render(); renderRosterList(); renderStats();
  toast('Member added');
}

async function deleteMember(id) {
  if (!confirm('Remove this member from the roster?')) return;
  await api('DELETE', `/api/members/${id}`);
  members = members.filter(m => m.id !== id);
  render(); renderRosterList(); renderStats();
  toast('Member removed');
}

async function clearAll() {
  if (!confirm('This will permanently remove ALL members. Are you sure?')) return;
  await api('DELETE', '/api/members');
  members = [];
  render(); renderRosterList(); renderStats();
  toast('Roster cleared');
}

async function bulkImport() {
  const raw    = document.getElementById('importText').value.trim();
  const result = document.getElementById('importResult');
  if (!raw) { result.className = 'import-result err'; result.textContent = 'Nothing to import.'; return; }
  const rows   = raw.split('\n').map(l => l.trim()).filter(Boolean);
  const parsed = rows.map(line => {
    const cols  = line.includes('\t') ? line.split('\t') : line.split(',');
    const clean = cols.map(c => c.trim());
    return { name: clean[0]||'', rate: clean[1]||'', sec: clean[2]||'', wc: clean[3]||'' };
  }).filter(r => r.name);
  if (!parsed.length) { result.className = 'import-result err'; result.textContent = 'No valid rows found.'; return; }
  const res = await api('POST', '/api/members/bulk', { members: parsed });
  members.push(...(res.members || []));
  document.getElementById('importText').value = '';
  result.className = 'import-result ok';
  result.textContent = `Imported ${res.added} member${res.added !== 1 ? 's' : ''}.`;
  render(); renderRosterList(); renderStats();
  toast(`Imported ${res.added} members`);
}

function openEdit(id) {
  const m = members.find(x => x.id === id);
  if (!m) return;
  editingId = id;
  document.getElementById('eName').value = m.name;
  document.getElementById('eRate').value = m.rate || '';
  const eSec = document.getElementById('eSec');
  if (m.sec && ![...eSec.options].find(o => o.value === m.sec))
    eSec.insertBefore(new Option(m.sec, m.sec), eSec.lastElementChild);
  eSec.value = m.sec || '';
  const eWC = document.getElementById('eWC');
  if (m.wc && ![...eWC.options].find(o => o.value === m.wc))
    eWC.insertBefore(new Option(m.wc, m.wc), eWC.lastElementChild);
  eWC.value = m.wc || '';
  document.getElementById('editModal').style.display = 'flex';
  document.getElementById('eName').focus();
}
function closeEdit() { editingId = null; document.getElementById('editModal').style.display = 'none'; }

async function saveEdit() {
  if (!editingId) return;
  const name = document.getElementById('eName').value.trim();
  if (!name) return;
  const sec = resolveSelect('eSec', 'team');
  const wc  = resolveSelect('eWC', 'div');
  await api('PUT', `/api/members/${editingId}`, { name, rate: document.getElementById('eRate').value.trim(), sec, wc });
  const m = members.find(x => x.id === editingId);
  if (m) { m.name = name.toUpperCase(); m.rate = document.getElementById('eRate').value.trim().toUpperCase(); m.sec = sec; m.wc = wc.toUpperCase(); }
  closeEdit(); render(); renderRosterList(); toast('Member updated');
}

// ── Sort ──────────────────────────────────────────────────────────────────────
function setSort(dir) {
  sortDir = dir;
  if (dir === 'asc')  members.sort((a,b) => a.name.localeCompare(b.name));
  if (dir === 'desc') members.sort((a,b) => b.name.localeCompare(a.name));
  render(); renderRosterList();
}

// ── Drag to reorder ───────────────────────────────────────────────────────────
function onDragStart(e, id) {
  dragSrcId = id;
  e.dataTransfer.effectAllowed = 'move';
  e.currentTarget.style.opacity = '0.5';
}
function onDragEnd(e) { e.currentTarget.style.opacity = '1'; }
function onDragOver(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }
async function onDrop(e, targetId) {
  e.preventDefault();
  if (dragSrcId === targetId) return;
  const srcIdx = members.findIndex(m => m.id === dragSrcId);
  const tgtIdx = members.findIndex(m => m.id === targetId);
  if (srcIdx < 0 || tgtIdx < 0) return;
  const [moved] = members.splice(srcIdx, 1);
  members.splice(tgtIdx, 0, moved);
  sortDir = 'manual';
  // Persist order to server by saving all positions
  await api('POST', '/api/members/reorder', { order: members.map(m => m.id) });
  render(); renderRosterList();
}

// ── Render ────────────────────────────────────────────────────────────────────
function sections() { return [...new Set(members.map(m => m.sec).filter(Boolean))].sort((a,b) => a.localeCompare(b)); }

function renderStats() {
  const assigned = members.length;
  const reported = members.filter(m => m.status).length;
  const pending  = assigned - reported;
  const ua       = members.filter(m => m.status === 'UA').length;
  document.getElementById('stats').innerHTML = `
    <div class="stat"><div class="stat-n">${assigned}</div><div class="stat-l">Assigned</div></div>
    <div class="stat"><div class="stat-n ${reported===assigned&&assigned>0?'green':''}">${reported}</div><div class="stat-l">Reported</div></div>
    <div class="stat"><div class="stat-n ${pending>0?'amber':''}">${pending}</div><div class="stat-l">Pending</div></div>
    <div class="stat"><div class="stat-n ${ua>0?'red':''}">${ua}</div><div class="stat-l">UA</div></div>`;
}

function pill(status) {
  if (!status) return '<span class="pill pill-none">No status</span>';
  const st = getStatuses().find(s => s.v === status);
  return `<span class="pill pill-${CSS.escape(status)}">${st ? st.label : status}</span>`;
}

function toggleMusterAdd() {
  musterAddOpen = !musterAddOpen;
  render();
  if (musterAddOpen) setTimeout(() => { const el = document.getElementById('mName'); if (el) el.focus(); }, 50);
}

function render() {
  renderStats();
  const q  = (document.getElementById('search')||{value:''}).value.toLowerCase();
  const fs = (document.getElementById('filterSec')||{value:''}).value;
  const ft = (document.getElementById('filterSt')||{value:''}).value;

  const secSel = document.getElementById('filterSec');
  if (secSel) {
    const cur = secSel.value;
    secSel.innerHTML = '<option value="">All teams</option>';
    sections().forEach(s => { const o = new Option('Team '+s,s); if(s===cur)o.selected=true; secSel.add(o); });
  }
  const stSel = document.getElementById('filterSt');
  if (stSel) {
    const cur = stSel.value;
    stSel.innerHTML = '<option value="">All statuses</option>';
    getStatuses().forEach(s => { const o = new Option(s.label,s.v); if(s.v===cur)o.selected=true; stSel.add(o); });
    stSel.add(new Option('+ Add new...','__new_status__'));
  }

  const list = members.filter(m => {
    if (q && !m.name.toLowerCase().includes(q) && !(m.rate||'').toLowerCase().includes(q)) return false;
    if (fs && m.sec !== fs) return false;
    if (ft && m.status !== ft) return false;
    return true;
  });

  const rosterEl = document.getElementById('roster');

  const addPanel = musterAddOpen ? `
    <div class="add-panel" style="margin-bottom:1rem">
      <div class="add-panel-title"><i class="ti ti-user-plus"></i> Add member</div>
      <div class="add-grid">
        <div class="field"><label>Last, First MI</label><input type="text" id="mName" placeholder="SMITH, JOHN A"></div>
        <div class="field"><label>Rate</label><input type="text" id="mRate" placeholder="STG2" style="max-width:90px"></div>
        <div class="field"><label>Team</label>
          ${makeSelect('team','','setHidden:x:mSec','min-width:90px')}
          <input type="hidden" id="mSec">
        </div>
        <div class="field"><label>Division</label>
          ${makeSelect('div','','setHidden:x:mWC','min-width:100px')}
          <input type="hidden" id="mWC">
        </div>
        <div class="field" style="display:flex;align-items:flex-end;gap:6px">
          <button class="primary" onclick="addFromMuster()"><i class="ti ti-check"></i> Add</button>
          <button onclick="toggleMusterAdd()">Cancel</button>
        </div>
      </div>
    </div>` : '';

  const sortBar = `
    <div style="display:flex;gap:6px;align-items:center;margin-bottom:8px;flex-wrap:wrap">
      <span style="font-size:12px;color:var(--text-3)">Sort:</span>
      <button class="sm ${sortDir==='asc'?'primary':''}" onclick="setSort('asc')"><i class="ti ti-sort-ascending"></i> A–Z</button>
      <button class="sm ${sortDir==='desc'?'primary':''}" onclick="setSort('desc')"><i class="ti ti-sort-descending"></i> Z–A</button>
      <span style="font-size:11px;color:var(--text-3);margin-left:4px">or drag <i class="ti ti-grip-horizontal"></i> to reorder</span>
    </div>`;

  if (!list.length) {
    rosterEl.innerHTML = addPanel + sortBar + `<div class="empty"><i class="ti ti-users-group"></i><p>${members.length ? 'No members match the filter.' : 'No members yet. Hit Add member to get started.'}</p></div>`;
    return;
  }

  const bySec = {};
  list.forEach(m => { const k = m.sec||'—'; (bySec[k]=bySec[k]||[]).push(m); });
  const keys = Object.keys(bySec).sort((a,b)=>a.localeCompare(b));

  const rows = keys.map(sk => {
    const cards = bySec[sk].map(m => {
      const noteEl = editingNote === m.id
        ? `<div class="note-input-row"><input type="text" placeholder="Return date, verifier, detail..." value="${(m.note||'').replace(/"/g,'&quot;')}"
            onchange="saveNote(${m.id},this.value)" onblur="saveNote(${m.id},this.value)">
            <button class="sm" onclick="editingNote=null;render()"><i class='ti ti-check'></i> Done</button></div>`
        : m.note
          ? `<div class="card-note"><i class="ti ti-notes" style="font-size:12px"></i> ${m.note}
              <button class="icon sm" onclick="editingNote=${m.id};render()"><i class="ti ti-pencil" style="font-size:12px"></i></button></div>`
          : '';
      return `<div class="card${m.status==='UA'?' ua':''}${!m.status?' pending':''}"
          draggable="true"
          ondragstart="onDragStart(event,${m.id})"
          ondragend="onDragEnd(event)"
          ondragover="onDragOver(event)"
          ondrop="onDrop(event,${m.id})">
        <div style="cursor:grab;color:var(--text-3);padding:0 4px;align-self:stretch;display:flex;align-items:center">
          <i class="ti ti-grip-vertical" style="font-size:16px"></i>
        </div>
        <div class="card-body">
          <div class="card-top">
            ${pill(m.status)}
            <span class="card-name">${m.name}</span>
            <span class="card-meta">${m.rate||''}</span>
            <button class="icon sm" onclick="editingNote=${editingNote===m.id?null:m.id};render()" title="Add note" style="margin-left:auto"><i class="ti ti-pencil"></i></button>
          </div>
          <div style="display:flex;gap:8px;margin-top:5px;flex-wrap:wrap;align-items:center">
            <label style="font-size:11px;color:var(--text-3);display:flex;align-items:center;gap:5px">
              TEAM ${makeSelect('team', m.sec, `saveField:${m.id}:sec`)}
            </label>
            <label style="font-size:11px;color:var(--text-3);display:flex;align-items:center;gap:5px">
              DIVISION ${makeSelect('div', m.wc, `saveField:${m.id}:wc`)}
            </label>
          </div>
          ${noteEl}
        </div>
        <div class="card-actions">
          <select class="status-select sm" onchange="handleStatusChange(${m.id},this.value,this)">
            <option value="" ${!m.status?'selected':''}>-- status --</option>
            ${getStatuses().map(s=>`<option value="${s.v}" ${m.status===s.v?'selected':''}>${s.label}</option>`).join('')}
            <option value="__new_status__">+ Add new...</option>
          </select>
          <button class="icon del sm" onclick="deleteMember(${m.id})" title="Remove"><i class="ti ti-trash"></i></button>
        </div>
      </div>`;
    }).join('');
    return `<div class="sec-hdr"><span class="sec-hdr-label">Team ${sk}</span><span class="sec-hdr-count">${bySec[sk].length}</span><hr></div>
            <div class="roster">${cards}</div>`;
  }).join('');

  rosterEl.innerHTML = addPanel + sortBar + rows;
}

function renderRosterList() {
  const el  = document.getElementById('rosterList');
  const cnt = document.getElementById('rosterCount');
  if (!el) return;
  if (cnt) cnt.textContent = `(${members.length})`;
  if (!members.length) { el.innerHTML = '<div class="empty"><i class="ti ti-users"></i><p>No members yet.</p></div>'; return; }

  const sortBar = `
    <div style="display:flex;gap:6px;align-items:center;margin-bottom:10px;flex-wrap:wrap">
      <span style="font-size:12px;color:var(--text-3)">Sort:</span>
      <button class="sm ${sortDir==='asc'?'primary':''}" onclick="setSort('asc')"><i class="ti ti-sort-ascending"></i> A–Z</button>
      <button class="sm ${sortDir==='desc'?'primary':''}" onclick="setSort('desc')"><i class="ti ti-sort-descending"></i> Z–A</button>
      <span style="font-size:11px;color:var(--text-3);margin-left:4px">or drag to reorder</span>
    </div>`;

  el.innerHTML = sortBar + `<div class="roster" style="margin-bottom:1rem">${members.map(m => `
    <div class="card" style="flex-wrap:wrap;gap:8px"
        draggable="true"
        ondragstart="onDragStart(event,${m.id})"
        ondragend="onDragEnd(event)"
        ondragover="onDragOver(event)"
        ondrop="onDrop(event,${m.id})">
      <div style="cursor:grab;color:var(--text-3);padding:0 4px;display:flex;align-items:center">
        <i class="ti ti-grip-vertical" style="font-size:16px"></i>
      </div>
      <div class="card-body">
        <div class="card-top" style="flex-wrap:wrap">
          <span class="card-name">${m.name}</span>
          <span class="card-meta">${m.rate||''}</span>
        </div>
        <div style="display:flex;gap:8px;margin-top:6px;flex-wrap:wrap;align-items:center">
          <label style="font-size:11px;color:var(--text-3);display:flex;align-items:center;gap:5px">
            TEAM ${makeSelect('team', m.sec, `saveField:${m.id}:sec`)}
          </label>
          <label style="font-size:11px;color:var(--text-3);display:flex;align-items:center;gap:5px">
            DIVISION ${makeSelect('div', m.wc, `saveField:${m.id}:wc`)}
          </label>
        </div>
      </div>
      <div class="card-actions">
        <button class="sm" onclick="openEdit(${m.id})"><i class="ti ti-pencil"></i> Edit</button>
        <button class="icon del" onclick="deleteMember(${m.id})" title="Remove"><i class="ti ti-trash"></i></button>
      </div>
    </div>`).join('')}</div>`;
}

// ── Report ────────────────────────────────────────────────────────────────────
function generateReport() {
  const now    = new Date();
  const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const dt     = String(now.getDate()).padStart(2,'0') + months[now.getMonth()] + String(now.getFullYear()).slice(2);
  const hhmm   = String(now.getHours()).padStart(2,'0') + String(now.getMinutes()).padStart(2,'0');

  const cnt     = (...vs) => members.filter(m => vs.includes(m.status)).length;
  const ua      = cnt('UA');
  const pending = members.filter(m => !m.status).length;
  const acct    = members.length - ua - pending;

  const statuses = getStatuses();

  // Summary counts
  const summaryLines = [
    `PRESENT:          ${cnt('PRESENT')}`,
    `PHONE / TEXT:     ${cnt('PHONE','TEXT')}`,
    `APPT / SICK CALL: ${cnt('APPT','SICK CALL')}`,
    `SIQ / LIGHT DUTY: ${cnt('SIQ','LIGHT DUTY')}`,
    `LEAVE:            ${cnt('LEAVE')}`,
    `TAD:              ${cnt('TAD')}`,
    `SCHOOL:           ${cnt('SCHOOL')}`,
    `WATCH/POST-WATCH: ${cnt('WATCH','POST-WATCH')}`,
    `LIBERTY:          ${cnt('LIBERTY')}`,
    `LIMDU:            ${cnt('LIMDU')}`,
    `RPT N85 OFFICE:   ${cnt('RPT N85')}`,
    `UA:               ${ua}`,
    ...statuses.filter(s => !CORE_STATUS_VALS.includes(s.v)).map(s => `${s.label.toUpperCase().padEnd(17)} ${cnt(s.v)}`),
  ];

  // Full roster list by name with status
  const maxNameLen = Math.max(...members.map(m => m.name.length), 20);
  const rosterLines = members.map(m => {
    const st    = statuses.find(s => s.v === m.status);
    const label = m.status ? (st ? st.label.toUpperCase() : m.status) : 'NO STATUS';
    const note  = m.note ? ` (${m.note})` : '';
    return `  ${m.name.padEnd(maxNameLen + 2)} ${label}${note}`;
  });

  const report = [
    `MUSTER REPORT - ${dt} / ${hhmm}`,
    '',
    `ASSIGNED:        ${members.length}`,
    `ACCOUNTED FOR:   ${acct}`,
    `UNACCOUNTED:     ${ua + pending}`,
    '',
    ...summaryLines,
    '',
    'FULL ROSTER:',
    ...rosterLines,
    '',
    'SUBMITTED BY: ______________________',
  ].join('\n');

  document.getElementById('reportPre').textContent = report;
  const warn = document.getElementById('reportWarn');
  if (pending > 0) { warn.innerHTML = `<i class="ti ti-alert-triangle"></i> ${pending} member(s) have no status entered.`; warn.style.display='flex'; }
  else warn.style.display = 'none';

  switchTab('report', document.querySelectorAll('.tab')[2]);
}

function copyReport() {
  navigator.clipboard.writeText(document.getElementById('reportPre').textContent).then(() => toast('Copied to clipboard'));
}

// ── UI helpers ────────────────────────────────────────────────────────────────
function switchTab(name, el) {
  ['muster','roster','report'].forEach(t => document.getElementById('tab-'+t).style.display = t===name ? 'block' : 'none');
  document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
  if (el) el.classList.add('active');
  if (name === 'roster') renderRosterList();
  if (name === 'report') generateReport();
}

function toggleAddPanel() {
  const p = document.getElementById('addPanel');
  p.style.display = p.style.display === 'none' ? 'block' : 'none';
  document.getElementById('addErr').style.display = 'none';
  if (p.style.display !== 'none') document.getElementById('nName').focus();
}

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2400);
}

function setDate() {
  const now  = new Date();
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const mos  = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  document.getElementById('topDate').textContent = `${days[now.getDay()]} ${String(now.getDate()).padStart(2,'0')} ${mos[now.getMonth()]} ${now.getFullYear()}`;
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeEdit();
  if (e.key === 'Enter' && document.getElementById('editModal').style.display !== 'none') saveEdit();
});

setDate();
load();
