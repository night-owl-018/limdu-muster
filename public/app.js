'use strict';

// ── Status list ───────────────────────────────────────────────────────────────
const DEFAULT_STATUSES = [
  { v: 'PRESENT',    label: 'Present' },
  { v: 'PHONE',      label: 'Phone muster' },
  { v: 'TEXT',       label: 'Text muster' },
  { v: 'APPT',       label: 'Appointment' },
  { v: 'SICK CALL',  label: 'Sick call' },
  { v: 'SIQ',        label: 'SIQ' },
  { v: 'LEAVE',      label: 'Leave' },
  { v: 'TAD',        label: 'TAD' },
  { v: 'POST-WATCH', label: 'Post-watch' },
  { v: 'LIBERTY',    label: 'Liberty' },
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

function toggleManageStatuses() {
  const p = document.getElementById('manageStatusPanel');
  p.style.display = p.style.display === 'none' ? 'block' : 'none';
  if (p.style.display !== 'none') renderManageStatusList();
}

function renderManageStatusList() {
  const el    = document.getElementById('manageStatusList');
  if (!el) return;
  const extra = JSON.parse(localStorage.getItem('extra_statuses') || '[]');
  const builtIn = DEFAULT_STATUSES.map(s => s.label);

  // Built-in statuses — shown as non-deletable chips
  const builtInHtml = DEFAULT_STATUSES.map(s => `
    <span style="display:inline-flex;align-items:center;gap:4px;background:var(--surface-1);border:1px solid var(--border);border-radius:20px;padding:4px 12px;font-size:12px;color:var(--text-2)">
      ${s.label}
      <span style="font-size:10px;color:var(--text-3);margin-left:2px">built-in</span>
    </span>`).join('');

  // Custom statuses — deletable
  const customHtml = extra.length
    ? extra.map(v => `
    <span style="display:inline-flex;align-items:center;gap:6px;background:var(--warn-bg);border:1px solid color-mix(in srgb,var(--warn-text) 30%,transparent);border-radius:20px;padding:4px 12px;font-size:12px;color:var(--warn-text)">
      ${v}
      <button onclick="deleteStatusFromPanel('${v}')" style="background:none;border:none;cursor:pointer;padding:0;color:var(--danger-text);font-size:16px;line-height:1;display:flex;align-items:center" title="Delete this status">×</button>
    </span>`).join('')
    : '<span style="font-size:12px;color:var(--text-3)">No custom statuses yet.</span>';

  el.innerHTML = `
    <div style="width:100%">
      <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--text-3);margin-bottom:6px">Built-in</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">${builtInHtml}</div>
      <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--text-3);margin-bottom:6px">Custom (deletable)</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">${customHtml}</div>
    </div>`;
}

function deleteStatusFromPanel(v) {
  if (!confirm(`Remove "${v}" status? Members with this status will be cleared.`)) return;
  const extra = JSON.parse(localStorage.getItem('extra_statuses') || '[]').filter(s => s !== v);
  localStorage.setItem('extra_statuses', JSON.stringify(extra));
  members.forEach(m => { if (m.status === v) { m.status = ''; api('PUT', `/api/members/${m.id}`, { status: '' }); } });
  renderManageStatusList();
  render(); renderStats();
  toast(`"${v}" removed`);
}

function addNewStatusFromPanel() {
  const el = document.getElementById('newStatusInput');
  if (!el || !el.value.trim()) return;
  const upper = el.value.trim().toUpperCase();
  addStatus(upper);
  el.value = '';
  renderManageStatusList();
  render();
  toast(`"${upper}" added`);
}

function deleteStatus(v) {
  deleteStatusFromPanel(v);
}

let submittedBy = localStorage.getItem('submittedBy') || '';

function getSubmitters() {
  const extra = JSON.parse(localStorage.getItem('extra_submitters') || '[]');
  return [...new Set(['BLUE','RED','WHITE',...extra])];
}
function addSubmitter(v) {
  const e = JSON.parse(localStorage.getItem('extra_submitters')||'[]');
  if(!e.includes(v)){e.push(v);localStorage.setItem('extra_submitters',JSON.stringify(e));}
}
function handleSubmitterChange(v) {
  if (v === '__new__') {
    const c = prompt('Enter name or title:');
    if (!c || !c.trim()) return;
    const u = c.trim().toUpperCase();
    addSubmitter(u);
    submittedBy = u;
  } else {
    submittedBy = v;
  }
  localStorage.setItem('submittedBy', submittedBy);
  generateReport();
}
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
  // Custom status with ✕ — ask if they want to delete it
  if (!CORE_STATUS_VALS.includes(value) && value && value !== '__new_status__') {
    await setStatus(id, value);
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

let musterView = 'all'; // 'all' | 'pending' | 'done'

function setMusterView(v) {
  musterView = v;
  document.querySelectorAll('.muster-view-tab').forEach(b => {
    b.classList.toggle('active', b.dataset.view === v);
  });
  render();
}

function makeCard(m) {
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
      <div class="card-meta-row${showTeamDiv?'':' hidden'}">
        <span class="card-field-label">TEAM</span> ${makeSelect('team', m.sec, `saveField:${m.id}:sec`)}
        <span class="card-field-label" style="margin-left:6px">DIV</span> ${makeSelect('div', m.wc, `saveField:${m.id}:wc`)}
      </div>
      ${noteEl}
    </div>
    <div class="card-actions">
      <select class="status-select sm" onchange="handleStatusChange(${m.id},this.value,this)">
        <option value="" ${!m.status?'selected':''}>-- status --</option>
        ${getStatuses().map(s=>`<option value="${s.v}" ${m.status===s.v?'selected':''}>${s.label}${!CORE_STATUS_VALS.includes(s.v)?' ✕':''}</option>`).join('')}
        <option value="__new_status__">+ Add new...</option>
      </select>
      <button class="icon del sm" onclick="deleteMember(${m.id})" title="Remove"><i class="ti ti-trash"></i></button>
    </div>
  </div>`;
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

  // Base filter
  let list = members.filter(m => {
    if (q && !m.name.toLowerCase().includes(q) && !(m.rate||'').toLowerCase().includes(q)) return false;
    if (fs && m.sec !== fs) return false;
    if (ft && m.status !== ft) return false;
    return true;
  });

  // Split pending vs done — UA stays in pending
  const pending = list.filter(m => !m.status || m.status === 'UA');
  const done    = list.filter(m =>  m.status && m.status !== 'UA');

  // Which to show
  const showList = musterView === 'pending' ? pending
                 : musterView === 'done'    ? done
                 : list;  // 'all' — pending first, then done

  const rosterEl = document.getElementById('roster');

  const pendingCount = members.filter(m => !m.status || m.status === 'UA').length;
  const doneCount    = members.filter(m =>  m.status && m.status !== 'UA').length;

  const viewTabs = `
    <div style="display:flex;gap:4px;margin-bottom:10px;background:var(--surface-alt);border:1px solid var(--border);border-radius:var(--radius);padding:3px;width:fit-content">
      <button class="muster-view-tab tab ${musterView==='all'?'active':''}" data-view="all" onclick="setMusterView('all')">
        All <span style="font-size:11px;opacity:.7">${list.length}</span>
      </button>
      <button class="muster-view-tab tab ${musterView==='pending'?'active':''}" data-view="pending" onclick="setMusterView('pending')"
        style="${pendingCount>0?'color:var(--warn-text)':''}">
        Pending <span style="font-size:11px;opacity:.7">${pendingCount}</span>
      </button>
      <button class="muster-view-tab tab ${musterView==='done'?'active':''}" data-view="done" onclick="setMusterView('done')"
        style="${doneCount===members.length&&members.length>0?'color:var(--success-text)':''}">
        Checked In <span style="font-size:11px;opacity:.7">${doneCount}</span>
      </button>
    </div>`;

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

  if (!showList.length) {
    const msg = musterView === 'pending' ? 'All members are checked in.' :
                musterView === 'done'    ? 'No members have checked in yet.' :
                members.length ? 'No members match the filter.' : 'No members yet. Hit Add member to get started.';
    rosterEl.innerHTML = addPanel + viewTabs + sortBar + `<div class="empty"><i class="ti ti-${musterView==='pending'?'circle-check':'users-group'}"></i><p>${msg}</p></div>`;
    return;
  }

  // In 'all' view: pending first with divider, then done
  let html = '';
  if (musterView === 'all') {
    if (pending.length) {
      html += `<div class="sec-hdr">
        <span class="sec-hdr-label" style="color:var(--warn-text)">Pending</span>
        <span class="sec-hdr-count" style="background:var(--warn-bg);color:var(--warn-text)">${pending.length}</span>
        <hr></div>
        <div class="roster">${pending.map(makeCard).join('')}</div>`;
    }
    if (done.length) {
      html += `<div class="sec-hdr" style="margin-top:${pending.length?'16px':'0'}">
        <span class="sec-hdr-label" style="color:var(--success-text)">Checked In</span>
        <span class="sec-hdr-count" style="background:var(--success-bg);color:var(--success-text)">${done.length}</span>
        <hr></div>
        <div class="roster">${done.map(makeCard).join('')}</div>`;
    }
  } else {
    // Pending or Done view — group by team
    const bySec = {};
    showList.forEach(m => { const k = m.sec||'—'; (bySec[k]=bySec[k]||[]).push(m); });
    const keys = Object.keys(bySec).sort((a,b)=>a.localeCompare(b));
    html = keys.map(sk => `
      <div class="sec-hdr"><span class="sec-hdr-label">Team ${sk}</span><span class="sec-hdr-count">${bySec[sk].length}</span><hr></div>
      <div class="roster">${bySec[sk].map(makeCard).join('')}</div>`).join('');
  }

  rosterEl.innerHTML = addPanel + viewTabs + sortBar + html;
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
        <div class="card-meta-row${showTeamDiv?'':' hidden'}">
          <span class="card-field-label">TEAM</span> ${makeSelect('team', m.sec, `saveField:${m.id}:sec`)}
          <span class="card-field-label" style="margin-left:6px">DIV</span> ${makeSelect('div', m.wc, `saveField:${m.id}:wc`)}
        </div>
      </div>
      <div class="card-actions">
        <button class="sm" onclick="openEdit(${m.id})"><i class="ti ti-pencil"></i> Edit</button>
        <button class="icon del" onclick="deleteMember(${m.id})" title="Remove"><i class="ti ti-trash"></i></button>
      </div>
    </div>`).join('')}</div>`;
}

// ── Report ────────────────────────────────────────────────────────────────────
function getHidden() { return JSON.parse(localStorage.getItem('report_hidden') || '[]'); }
function toggleLine(key) {
  const h = getHidden();
  const i = h.indexOf(key);
  if (i >= 0) h.splice(i,1); else h.push(key);
  localStorage.setItem('report_hidden', JSON.stringify(h));
  generateReport();
}

let showTeamDiv = localStorage.getItem('showTeamDiv') !== 'false';

function toggleTeamDiv() {
  showTeamDiv = !showTeamDiv;
  localStorage.setItem('showTeamDiv', showTeamDiv);
  const btn = document.getElementById('teamDivToggleBtn');
  if (btn) btn.innerHTML = `<i class="ti ti-eye${showTeamDiv?'':'-off'}"></i> Team/Div`;
  render();
}

function generateReport() {
  const now    = new Date();
  const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const days   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const dt     = String(now.getDate()).padStart(2,'0') + months[now.getMonth()] + String(now.getFullYear()).slice(2);
  const hhmm   = String(now.getHours()).padStart(2,'0') + String(now.getMinutes()).padStart(2,'0');
  const dayStr = days[now.getDay()];

  const cnt     = (...vs) => members.filter(m => vs.includes(m.status)).length;
  const ua      = cnt('UA');
  const pending = members.filter(m => !m.status).length;
  const acct    = members.length - ua - pending;
  const statuses = getStatuses();
  const hidden   = getHidden();

  // Summary card definitions
  const summaryDefs = [
    { key:'ASSIGNED',  label:'Assigned',       val: members.length, accent: true },
    { key:'ACCOUNTED', label:'Accounted For',   val: acct },
    { key:'UNACCT',    label:'Unaccounted',     val: ua + pending, danger: (ua+pending) > 0 },
    { key:'PRESENT',   label:'Present',         val: cnt('PRESENT'), success: true },
    { key:'PHONETEXT', label:'Phone / Text',    val: cnt('PHONE','TEXT') },
    { key:'APPT',      label:'Appt / Sick',     val: cnt('APPT','SICK CALL') },
    { key:'SIQ',       label:'SIQ',             val: cnt('SIQ') },
    { key:'LEAVE',     label:'Leave',           val: cnt('LEAVE') },
    { key:'TAD',       label:'TAD',             val: cnt('TAD') },
    { key:'POSTWATCH', label:'Post-Watch',      val: cnt('POST-WATCH') },
    { key:'LIBERTY',   label:'Liberty',         val: cnt('LIBERTY') },
    { key:'RPTN85',    label:'RPT N85 Office',  val: cnt('RPT N85') },
    { key:'UA',        label:'UA',              val: ua, danger: ua > 0 },
    ...statuses.filter(s => !CORE_STATUS_VALS.includes(s.v))
      .map(s => ({ key:'CUSTOM_'+s.v, label:s.label, val: cnt(s.v) })),
  ];

  // Build plain text (only visible lines)
  const visLines = summaryDefs.filter(d => !hidden.includes(d.key))
    .map(d => `${d.label.toUpperCase().padEnd(18)} ${d.val}`);

  const maxRateLen = Math.max(...members.map(m=>(m.rate||'').length), 4);
  const maxNameLen = Math.max(...members.map(m=>m.name.length), 20);
  const rosterPlain = members.map(m => {
    const st    = statuses.find(s => s.v === m.status);
    const label = m.status ? (st ? st.label.toUpperCase() : m.status) : 'NO STATUS';
    const note  = m.note ? ` (${m.note})` : '';
    return `  ${(m.rate||'').padEnd(maxRateLen+1)}${m.name.padEnd(maxNameLen+2)} ${label}${note}`;
  });

  const submitterOpts = getSubmitters().map(s =>
    `<option value="${s}" ${submittedBy===s?'selected':''}>${s}</option>`).join('');

  const plainText = [
    `MUSTER REPORT — ${dayStr} ${dt} / ${hhmm}`,
    '',
    ...visLines,
    '',
    'FULL ROSTER:',
    ...rosterPlain,
    '',
    `SUBMITTED BY: ${submittedBy || '______________________'}`,
  ].join('\n');

  // ── Beautiful HTML report ──────────────────────────────────────
  const summaryHtml = summaryDefs.map(d => {
    const isHid = hidden.includes(d.key);
    const valColor = d.danger && d.val > 0 ? 'var(--danger-text)'
                   : d.success && d.val > 0 ? 'var(--success-text)'
                   : d.accent ? 'var(--accent)' : 'var(--text)';
    return `<div class="rpt-summary-card ${isHid?'rpt-hidden':''}" onclick="toggleLine('${d.key}')" title="${isHid?'Click to show':'Click to hide'}">
      <div class="rpt-eye">${isHid?'○':'●'}</div>
      <div class="rpt-line-label">${d.label}</div>
      <div class="rpt-line-val" style="color:${isHid?'var(--text-3)':valColor}">${d.val}</div>
    </div>`;
  }).join('');

  const rosterHtml = members.map(m => {
    const st    = statuses.find(s => s.v === m.status);
    const label = m.status ? (st ? st.label : m.status) : 'No status';
    const statusColor = !m.status ? 'var(--text-3)'
      : m.status === 'UA' ? 'var(--danger-text)'
      : m.status === 'PRESENT' ? 'var(--success-text)'
      : 'var(--text-2)';
    const note = m.note ? `<span style="font-size:10px;color:var(--text-3);margin-left:4px">(${m.note})</span>` : '';
    return `<div class="rpt-roster-row">
      <span class="rpt-roster-rate">${m.rate||''}</span>
      <span class="rpt-roster-name">${m.name}${note}</span>
      <span class="rpt-roster-team">${m.sec||''}</span>
      <span style="font-size:12px;font-weight:600;color:${statusColor}">${label}</span>
    </div>`;
  }).join('');

  const reportEl = document.getElementById('reportPre');
  if (reportEl) {
    reportEl.style.cssText = 'font-family:inherit;font-size:inherit;background:transparent;padding:0;border:none;border-radius:0;white-space:normal';
    reportEl.dataset.plain = plainText;
    reportEl.innerHTML = `
      <div class="rpt-header">
        <div>
          <div class="rpt-header-title">MUSTER REPORT</div>
          <div class="rpt-header-dt">${dayStr} ${dt} &nbsp;·&nbsp; ${hhmm}</div>
        </div>
        <i class="ti ti-clipboard-check" style="font-size:28px;opacity:.6"></i>
      </div>

      <div class="rpt-hint">Tap any card to hide/show it from the copied report</div>
      <div class="rpt-summary">${summaryHtml}</div>

      <div style="font-size:12px;font-weight:600;color:var(--text-2);text-transform:uppercase;letter-spacing:.05em;margin:12px 0 6px">
        Full roster
      </div>
      <div class="rpt-roster">
        <div class="rpt-roster-hdr">
          <span>Rate</span><span>Name</span><span>Team</span><span>Status</span>
        </div>
        ${rosterHtml}
      </div>`;
  }

  const subEl = document.getElementById('submittedByRow');
  if (subEl) {
    subEl.innerHTML = `
      <span style="font-size:13px;font-weight:500;color:var(--text-2)">Submitted by:</span>
      <select style="font-size:13px;padding:5px 10px;border:1px solid var(--border);border-radius:var(--radius);background:var(--surface);color:var(--text);width:auto" onchange="handleSubmitterChange(this.value)">
        <option value="">-- Select --</option>
        ${submitterOpts}
        <option value="__new__">+ Add new...</option>
      </select>
      ${submittedBy?`<span style="font-size:12px;color:var(--success-text);font-weight:500">✓ ${submittedBy}</span>`:''}`;
  }

  const warn = document.getElementById('reportWarn');
  if (warn) {
    if (pending > 0) { warn.innerHTML = `<i class="ti ti-alert-triangle"></i> ${pending} member(s) have no status yet.`; warn.style.display='flex'; }
    else warn.style.display = 'none';
  }

  if (document.getElementById('tab-report').style.display === 'none')
    switchTab('report', document.querySelectorAll('.tab')[2]);
}

function copyReport() {
  const el  = document.getElementById('reportPre');
  const txt = el.dataset.plain || el.textContent;
  navigator.clipboard.writeText(txt).then(() => toast('Copied to clipboard'));
}

// ── UI helpers ────────────────────────────────────────────────────────────────
function switchTab(name, el) {
  ['muster','roster','report'].forEach(t => document.getElementById('tab-'+t).style.display = t===name ? 'block' : 'none');
  document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
  if (el) el.classList.add('active');
  if (name === 'roster') renderRosterList();
  if (name === 'report') { generateReport(); if(typeof renderCustomStatuses==='function') renderCustomStatuses(); }
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
