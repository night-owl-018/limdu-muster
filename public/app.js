'use strict';

const STATUSES = [
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
  { v: 'UA',         label: 'UA' },
];

const STATUS_OPTS = STATUSES.map(s => `<option value="${s.v}">${s.label}</option>`).join('');

let members = [];
let editingNote = null;
let editingId = null;
let activeTab = 'muster';

// ── API ──────────────────────────────────────────────────────────────────────
async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(path, opts);
  return r.json();
}

async function load() {
  const data = await api('GET', '/api/members');
  members = data.members || [];
  render();
  renderRosterList();
}

// ── Actions ──────────────────────────────────────────────────────────────────
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

async function addMember() {
  const name = document.getElementById('nName').value.trim();
  const err = document.getElementById('addErr');
  if (!name) { err.textContent = 'Name is required.'; err.style.display = 'block'; return; }
  err.style.display = 'none';
  const m = await api('POST', '/api/members', {
    name,
    rate: document.getElementById('nRate').value.trim(),
    sec:  document.getElementById('nSec').value.trim(),
    wc:   document.getElementById('nWC').value.trim(),
  });
  members.push(m);
  ['nName','nRate','nSec','nWC'].forEach(id => document.getElementById(id).value = '');
  toggleAddPanel();
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
  const raw = document.getElementById('importText').value.trim();
  const result = document.getElementById('importResult');
  if (!raw) { result.className = 'import-result err'; result.textContent = 'Nothing to import.'; return; }

  const rows = raw.split('\n').map(l => l.trim()).filter(Boolean);
  const parsed = rows.map(line => {
    const cols = line.includes('\t') ? line.split('\t') : line.split(',');
    const clean = cols.map(c => c.trim());
    return { name: clean[0] || '', rate: clean[1] || '', sec: clean[2] || '', wc: clean[3] || '' };
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
  document.getElementById('eRate').value = m.rate;
  document.getElementById('eSec').value = m.sec;
  document.getElementById('eWC').value = m.wc;
  document.getElementById('editModal').style.display = 'flex';
  document.getElementById('eName').focus();
}

function closeEdit() { editingId = null; document.getElementById('editModal').style.display = 'none'; }

async function saveEdit() {
  if (!editingId) return;
  const name = document.getElementById('eName').value.trim();
  if (!name) return;
  await api('PUT', `/api/members/${editingId}`, {
    name, rate: document.getElementById('eRate').value.trim(),
    sec: document.getElementById('eSec').value.trim(), wc: document.getElementById('eWC').value.trim(),
  });
  const m = members.find(x => x.id === editingId);
  if (m) { m.name = name.toUpperCase(); m.rate = document.getElementById('eRate').value.trim().toUpperCase(); m.sec = document.getElementById('eSec').value.trim(); m.wc = document.getElementById('eWC').value.trim().toUpperCase(); }
  closeEdit(); render(); renderRosterList(); toast('Member updated');
}

// ── Render ───────────────────────────────────────────────────────────────────
function sections() {
  return [...new Set(members.map(m => m.sec).filter(Boolean))].sort((a,b) => a.localeCompare(b,undefined,{numeric:true}));
}

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
  const st = STATUSES.find(s => s.v === status);
  return `<span class="pill pill-${status}">${st ? st.label : status}</span>`;
}

let musterAddOpen = false;

function toggleMusterAdd() {
  musterAddOpen = !musterAddOpen;
  render();
  if (musterAddOpen) setTimeout(() => { const el = document.getElementById('mName'); if (el) el.focus(); }, 50);
}

async function addFromMuster() {
  const name = (document.getElementById('mName').value || '').trim();
  if (!name) { document.getElementById('mName').focus(); return; }
  const m = await api('POST', '/api/members', {
    name,
    rate: (document.getElementById('mRate').value || '').trim(),
    sec:  (document.getElementById('mSec').value || '').trim(),
    wc:   (document.getElementById('mWC').value || '').trim(),
  });
  members.push(m);
  musterAddOpen = false;
  render(); renderRosterList(); renderStats();
  toast('Member added');
}

function render() {
  renderStats();
  const q  = (document.getElementById('search')||{value:''}).value.toLowerCase();
  const fs = (document.getElementById('filterSec')||{value:''}).value;
  const ft = (document.getElementById('filterSt')||{value:''}).value;

  const secSel = document.getElementById('filterSec');
  if (secSel) {
    const cur = secSel.value;
    secSel.innerHTML = '<option value="">All sections</option>';
    sections().forEach(s => { const o = new Option('Section '+s,s); if(s===cur)o.selected=true; secSel.add(o); });
  }
  const stSel = document.getElementById('filterSt');
  if (stSel) {
    const cur = stSel.value;
    stSel.innerHTML = '<option value="">All statuses</option>';
    STATUSES.forEach(s => { const o = new Option(s.label,s.v); if(s.v===cur)o.selected=true; stSel.add(o); });
  }

  const list = members.filter(m => {
    if (q && !m.name.toLowerCase().includes(q) && !(m.rate||'').toLowerCase().includes(q)) return false;
    if (fs && m.sec !== fs) return false;
    if (ft && m.status !== ft) return false;
    return true;
  });

  const bySec = {};
  list.forEach(m => { const k = m.sec||'—'; (bySec[k]=bySec[k]||[]).push(m); });
  const keys = Object.keys(bySec).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));

  const rosterEl = document.getElementById('roster');

  // Quick-add panel at top of muster tab
  const addPanel = musterAddOpen ? `
    <div class="add-panel" style="margin-bottom:1rem">
      <div class="add-panel-title"><i class="ti ti-user-plus" aria-hidden="true"></i> Add member</div>
      <div class="add-grid">
        <div class="field"><label>Last, First MI</label><input type="text" id="mName" placeholder="SMITH, JOHN A"></div>
        <div class="field"><label>Rate</label><input type="text" id="mRate" placeholder="STG2" style="max-width:90px"></div>
        <div class="field"><label>Section</label><input type="text" id="mSec" placeholder="1" style="max-width:70px"></div>
        <div class="field"><label>Work center</label><input type="text" id="mWC" placeholder="SONAR"></div>
        <div class="field" style="display:flex;align-items:flex-end;gap:6px">
          <button class="primary" onclick="addFromMuster()"><i class="ti ti-check" aria-hidden="true"></i> Add</button>
          <button onclick="toggleMusterAdd()">Cancel</button>
        </div>
      </div>
    </div>` : '';

  if (!list.length) {
    rosterEl.innerHTML = addPanel + `<div class="empty"><i class="ti ti-users-group" aria-hidden="true"></i><p>${members.length ? 'No members match the filter.' : 'No members yet. Hit Add member to get started.'}</p></div>`;
    return;
  }

  const rows = keys.map(sk => {
    const cards = bySec[sk].map(m => {
      const noteEl = editingNote === m.id
        ? `<div class="note-input-row"><input type="text" placeholder="Return date, verifier, detail..." value="${(m.note||'').replace(/"/g,'&quot;')}"
            onchange="saveNote(${m.id},this.value)" onblur="saveNote(${m.id},this.value)">
            <button class="sm" onclick="editingNote=null;render()"><i class='ti ti-check' aria-hidden='true'></i> Done</button></div>`
        : m.note
          ? `<div class="card-note"><i class="ti ti-notes" style="font-size:12px" aria-hidden="true"></i>${m.note}
              <button class="icon sm" onclick="editingNote=${m.id};render()" style="margin-left:2px" title="Edit note"><i class="ti ti-pencil" style="font-size:12px" aria-hidden="true"></i></button></div>`
          : '';
      return `<div class="card${m.status==='UA'?' ua':''}${!m.status?' pending':''}">
        <div class="card-body">
          <div class="card-top">
            ${pill(m.status)}
            <span class="card-name">${m.name}</span>
            <span class="card-meta">${m.rate||''}${m.wc?' · '+m.wc:''}</span>
            <button class="icon sm" onclick="editingNote=${editingNote===m.id?null:m.id};render()" title="Add note" style="margin-left:auto"><i class="ti ti-pencil" aria-hidden="true"></i></button>
          </div>
          ${noteEl}
        </div>
        <div class="card-actions">
          <select class="status-select sm" onchange="setStatus(${m.id},this.value)">
            <option value="" ${!m.status?'selected':''}>-- status --</option>
            ${STATUSES.map(s=>`<option value="${s.v}" ${m.status===s.v?'selected':''}>${s.label}</option>`).join('')}
          </select>
          <button class="icon del sm" onclick="deleteMember(${m.id})" title="Remove member"><i class="ti ti-trash" aria-hidden="true"></i></button>
        </div>
      </div>`;
    }).join('');
    return `<div class="sec-hdr"><span class="sec-hdr-label">Section ${sk}</span><span class="sec-hdr-count">${bySec[sk].length}</span><hr></div><div class="roster">${cards}</div>`;
  }).join('');

  rosterEl.innerHTML = addPanel + rows;
}

// Inline field edit on roster tab
async function saveField(id, field, value) {
  const payload = {};
  payload[field] = value;
  await api('PUT', `/api/members/${id}`, payload);
  const m = members.find(x => x.id === id);
  if (m) m[field] = field === 'name' || field === 'rate' || field === 'wc' ? value.toUpperCase() : value;
  renderRosterList();
}

function renderRosterList() {
  const el = document.getElementById('rosterList');
  const cnt = document.getElementById('rosterCount');
  if (!el) return;
  if (cnt) cnt.textContent = `(${members.length})`;
  if (!members.length) { el.innerHTML = '<div class="empty"><i class="ti ti-users" aria-hidden="true"></i><p>No members yet.</p></div>'; return; }
  el.innerHTML = `<div class="roster" style="margin-bottom:1rem">${members.map(m => `
    <div class="card" style="flex-wrap:wrap;gap:8px">
      <div class="card-body">
        <div class="card-top" style="flex-wrap:wrap">
          <span class="card-name">${m.name}</span>
          <span class="card-meta">${m.rate||''}</span>
        </div>
        <div style="display:flex;gap:8px;margin-top:6px;flex-wrap:wrap">
          <label style="font-size:11px;color:var(--text-3);display:flex;flex-direction:column;gap:2px">
            SECTION
            <input type="text" value="${m.sec||''}" placeholder="—"
              style="width:60px;font-size:13px;padding:4px 8px"
              onblur="saveField(${m.id},'sec',this.value)"
              onkeydown="if(event.key==='Enter')this.blur()">
          </label>
          <label style="font-size:11px;color:var(--text-3);display:flex;flex-direction:column;gap:2px">
            WORK CENTER
            <input type="text" value="${m.wc||''}" placeholder="—"
              style="width:120px;font-size:13px;padding:4px 8px"
              onblur="saveField(${m.id},'wc',this.value)"
              onkeydown="if(event.key==='Enter')this.blur()">
          </label>
        </div>
      </div>
      <div class="card-actions">
        <button class="sm" onclick="openEdit(${m.id})"><i class="ti ti-pencil" aria-hidden="true"></i> Edit</button>
        <button class="icon del" onclick="deleteMember(${m.id})" title="Remove"><i class="ti ti-trash" aria-hidden="true"></i></button>
      </div>
    </div>`).join('')}</div>`;
}

// ── Report ───────────────────────────────────────────────────────────────────
function generateReport() {
  const now = new Date();
  const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const dt = String(now.getDate()).padStart(2,'0') + months[now.getMonth()] + String(now.getFullYear()).slice(2);
  const hhmm = String(now.getHours()).padStart(2,'0') + String(now.getMinutes()).padStart(2,'0');

  const cnt = (...vs) => members.filter(m => vs.includes(m.status)).length;
  const ua      = cnt('UA');
  const pending = members.filter(m => !m.status).length;
  const acct    = members.length - ua - pending;

  const exceptions = members.filter(m => m.status && m.status !== 'PRESENT');
  const byLines = exceptions.length
    ? exceptions.map(m => { const st = STATUSES.find(s=>s.v===m.status); return `  ${(st?st.label.toUpperCase():'???').padEnd(13)} - ${m.name}${m.note?' ('+m.note+')':''}`; }).join('\n')
    : '  (all present)';

  const report = [
    `MUSTER REPORT - ${dt} / ${hhmm}`,
    '',
    `ASSIGNED:        ${members.length}`,
    `ACCOUNTED FOR:   ${acct}`,
    `UNACCOUNTED:     ${ua + pending}`,
    '',
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
    `UA:               ${ua}`,
    '',
    'BY NAME:',
    byLines,
    '',
    'SUBMITTED BY: ______________________',
  ].join('\n');

  document.getElementById('reportPre').textContent = report;
  const warn = document.getElementById('reportWarn');
  if (pending > 0) { warn.innerHTML = `<i class="ti ti-alert-triangle" aria-hidden="true"></i> ${pending} member(s) have no status entered.`; warn.style.display='flex'; }
  else warn.style.display='none';

  switchTab('report', document.querySelectorAll('.tab')[2]);
}

function copyReport() {
  const txt = document.getElementById('reportPre').textContent;
  navigator.clipboard.writeText(txt).then(() => toast('Copied to clipboard'));
}

// ── UI helpers ───────────────────────────────────────────────────────────────
function switchTab(name, el) {
  activeTab = name;
  ['muster','roster','report'].forEach(t => {
    document.getElementById('tab-'+t).style.display = t===name ? 'block' : 'none';
  });
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
  const now = new Date();
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  document.getElementById('topDate').textContent = `${days[now.getDay()]} ${String(now.getDate()).padStart(2,'0')} ${months[now.getMonth()]} ${now.getFullYear()}`;
}

// Enter key on add form
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeEdit();
  if (e.key === 'Enter' && document.getElementById('editModal').style.display !== 'none') saveEdit();
});

setDate();
load();
