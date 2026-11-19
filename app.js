/* =========================================================================
   TIMER by Flo — logique de l'application (JS vanilla, aucune dépendance
   à part Chart.js chargé localement depuis vendor/).

   Principe clé : le temps n'est JAMAIS stocké comme un compteur.
   Tout est recalculé à partir des sessions (début / fin). Une session
   en cours a fin = null : sa durée = maintenant - début. Le timer reste
   donc juste même si l'app est fermée ou l'iPhone verrouillé.
   ========================================================================= */

'use strict';

// ---------- Constantes ----------
const STORE_KEY = 'timerflo:v1';
const INTERNAL = '__internal';               // valeur de filtre pour « temps propre de l'activité »
const DEFAULT_INTERNAL_NAME = 'Interne / brainstorm';
const MIN_SESSION_MS = 3000;                  // une session < 3 s (tap accidentel) est ignorée
const PALETTE = ['#0a84ff', '#30b158', '#ff9f0a', '#ff375f', '#bf5af2',
                 '#5e5ce6', '#32ade6', '#ac8e68', '#ff6b35', '#8e8e93'];

// ---------- Petits utilitaires ----------
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const pad = (n) => String(n).padStart(2, '0');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// =========================================================================
// 1. STOCKAGE (une seule clé localStorage versionnée)
// =========================================================================

function emptyState() {
  return { activities: [], subs: [], sessions: [], activeSessionId: null };
}

// Vérifie / complète la structure (utile au chargement et à l'import JSON)
function normalize(d) {
  const s = emptyState();
  if (!d || typeof d !== 'object') return s;
  s.activities = Array.isArray(d.activities) ? d.activities : [];
  s.subs = Array.isArray(d.subs) ? d.subs : [];
  s.sessions = Array.isArray(d.sessions) ? d.sessions : [];
  s.activities.forEach((a, i) => {
    a.order ??= i;
    a.archived = !!a.archived;
    a.internalName ||= DEFAULT_INTERNAL_NAME;
    a.color ||= PALETTE[i % PALETTE.length];
  });
  s.subs.forEach((x, i) => { x.order ??= i; x.archived = !!x.archived; x.color ??= null; });
  s.sessions.forEach((x) => { x.subId ||= null; x.note ||= ''; x.manual = !!x.manual; });
  // La session active doit exister et ne pas être terminée
  const act = s.sessions.find((x) => x.id === d.activeSessionId && x.end == null);
  s.activeSessionId = act ? act.id : null;
  // Toute autre session sans fin (données incohérentes) est fermée proprement
  s.sessions.forEach((x) => { if (x.end == null && x.id !== s.activeSessionId) x.end = x.start; });
  return s;
}

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch (e) { console.error('Lecture impossible', e); }
  return emptyState();
}

function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
  catch (e) { alert('Enregistrement impossible : ' + e.message); }
}

let state = load();

// État de l'interface (non persisté)
const ui = {
  tab: 'timers',
  timersPeriod: 'today',
  r: { period: 'month', from: '', to: '', activity: '', sub: '' },
};

// =========================================================================
// 2. ACCÈS AUX DONNÉES
// =========================================================================

const actById = (id) => state.activities.find((a) => a.id === id);
const subById = (id) => state.subs.find((s) => s.id === id);
const byOrder = (a, b) => a.order - b.order;

const visibleActivities = () => state.activities.filter((a) => !a.archived).sort(byOrder);
const subsOf = (actId, withArchived = false) =>
  state.subs.filter((s) => s.activityId === actId && (withArchived || !s.archived)).sort(byOrder);

const subColor = (sub) => sub.color || actById(sub.activityId)?.color || '#8e8e93';

function activeSession() {
  return state.sessions.find((s) => s.id === state.activeSessionId && s.end == null) || null;
}

// Libellé d'une session : « Activité › Sous-timer » (ou « › Interne / brainstorm »)
function subLabel(session) {
  const act = actById(session.activityId);
  if (!session.subId) return act ? act.internalName : DEFAULT_INTERNAL_NAME;
  return subById(session.subId)?.name ?? '(sous-timer supprimé)';
}
const actLabel = (session) => actById(session.activityId)?.name ?? '(activité supprimée)';

// Réattribue des ordres 0..n propres à une liste triée
const renumber = (list) => list.forEach((x, i) => { x.order = i; });

// =========================================================================
// 3. TEMPS ET PÉRIODES
// =========================================================================

function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
// La semaine commence le lundi
function startOfWeek(d) { const x = startOfDay(d); return addDays(x, -((x.getDay() + 6) % 7)); }
// "YYYY-MM-DD" -> Date locale à minuit
function parseDay(str) { const [y, m, d] = str.split('-').map(Number); return new Date(y, m - 1, d); }
const dayStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Renvoie [début, fin[ en millisecondes pour une clé de période
function periodRange(key, from, to) {
  const now = new Date();
  const today = startOfDay(now);
  const y = now.getFullYear(), m = now.getMonth();
  const w = startOfWeek(now);
  let a, b;
  switch (key) {
    case 'today':     a = today; b = addDays(today, 1); break;
    case 'yesterday': a = addDays(today, -1); b = today; break;
    case 'week':      a = w; b = addDays(w, 7); break;
    case 'lastweek':  a = addDays(w, -7); b = w; break;
    case 'month':     a = new Date(y, m, 1); b = new Date(y, m + 1, 1); break;
    case 'lastmonth': a = new Date(y, m - 1, 1); b = new Date(y, m, 1); break;
    case 'year':      a = new Date(y, 0, 1); b = new Date(y + 1, 0, 1); break;
    case 'custom': {
      a = from ? parseDay(from) : today;
      b = addDays(to ? parseDay(to) : a, 1);
      if (b <= a) b = addDays(a, 1);
      break;
    }
    default: a = today; b = addDays(today, 1);
  }
  return [a.getTime(), b.getTime()];
}

// Part d'une session comprise dans [a, b[ — c'est ce qui fait le découpage
// au prorata (une session 23 h → 1 h compte 1 h la veille et 1 h le lendemain).
function clip(s, a, b, now = Date.now()) {
  const end = s.end ?? now;
  return Math.max(0, Math.min(end, b) - Math.max(s.start, a));
}

// Totaux d'une période : par activité, par sous-timer, et temps « interne »
function computeTotals(a, b) {
  const now = Date.now();
  const t = { act: {}, sub: {}, int: {} };
  for (const s of state.sessions) {
    const ms = clip(s, a, b, now);
    if (!ms) continue;
    t.act[s.activityId] = (t.act[s.activityId] || 0) + ms;
    if (s.subId) t.sub[s.subId] = (t.sub[s.subId] || 0) + ms;
    else t.int[s.activityId] = (t.int[s.activityId] || 0) + ms;
  }
  return t;
}

// ---------- Formats d'affichage ----------
// hh:mm:ss (timer en direct)
function fmtHMS(ms) {
  const sec = Math.floor(ms / 1000);
  return `${pad(Math.floor(sec / 3600))}:${pad(Math.floor(sec / 60) % 60)}:${pad(sec % 60)}`;
}
// « 2 h 35 », « 2 h », « 35 min »
function fmtDur(ms) {
  const min = Math.floor(ms / 60000);
  const h = Math.floor(min / 60), m = min % 60;
  if (h === 0) return `${m} min`;
  return m ? `${h} h ${pad(m)}` : `${h} h`;
}
// hh:mm pour les exports (minutes arrondies)
function fmtHM(ms) {
  const min = Math.round(ms / 60000);
  return `${Math.floor(min / 60)}:${pad(min % 60)}`;
}
// Heures décimales avec virgule (Excel FR) : 1,50
const fmtDec = (ms) => (ms / 3600000).toFixed(2).replace('.', ',');
const fmtTime = (ms) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const fmtDate = (ms) => { const d = new Date(ms); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`; };
const fmtDayLong = (ms) => new Date(ms).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
// Valeur pour <input type="datetime-local">
const toLocalInput = (ms) => { const d = new Date(ms); return `${dayStr(d)}T${fmtTime(ms)}`; };
function fromLocalInput(str) {
  const [day, time] = str.split('T');
  const [h, mi] = time.split(':').map(Number);
  const d = parseDay(day); d.setHours(h, mi, 0, 0);
  return d.getTime();
}

// =========================================================================
// 4. LANCER / ARRÊTER (un seul timer actif à la fois)
// =========================================================================

function stopTimer() {
  const cur = activeSession();
  if (cur) {
    cur.end = Date.now();
    // On ignore les sessions trop courtes (tap accidentel)
    if (cur.end - cur.start < MIN_SESSION_MS && !cur.note) {
      state.sessions = state.sessions.filter((s) => s !== cur);
    }
  }
  state.activeSessionId = null;
  save();
}

// Lance l'activité (subId = null → temps « Interne / brainstorm ») ou un sous-timer.
// Si ce timer tourne déjà, le bouton sert de pause.
function toggleTimer(activityId, subId = null) {
  const cur = activeSession();
  const same = cur && cur.activityId === activityId && (cur.subId || null) === subId;
  stopTimer();                                 // arrête automatiquement celui en cours
  if (!same) {
    const s = { id: uid(), activityId, subId, start: Date.now(), end: null, note: '', manual: false };
    state.sessions.push(s);
    state.activeSessionId = s.id;
    save();
  }
  render();
}

// =========================================================================
// 5. ÉCRAN TIMERS
// =========================================================================

function renderTimers() {
  const acts = visibleActivities();
  const cur = activeSession();
  const [a, b] = periodRange(ui.timersPeriod);
  const t = computeTotals(a, b);

  $$('#timers-period button').forEach((el) => el.classList.toggle('on', el.dataset.p === ui.timersPeriod));

  if (!acts.length) {
    $('#cards').innerHTML = `<div class="empty">Aucune activité pour l'instant.<br>Commence par « + Activité ».</div>`;
    return;
  }

  $('#cards').innerHTML = acts.map((act) => {
    const subs = subsOf(act.id);
    const runInternal = cur && cur.activityId === act.id && !cur.subId;
    const intMs = t.int[act.id] || 0;

    const subRows = subs.map((sub) => {
      const run = cur && cur.subId === sub.id;
      return `
        <div class="row ${run ? 'running' : ''}" style="--c:${subColor(sub)}">
          <span class="dot"></span>
          <span class="row-name">${esc(sub.name)}</span>
          <span class="row-time mono" data-dur="sub:${sub.id}"></span>
          <button class="play sm ${run ? 'on' : ''}" data-play="${act.id}" data-sub="${sub.id}"
                  aria-label="${run ? 'Pause' : 'Lancer'} ${esc(sub.name)}">${run ? '⏸' : '▶︎'}</button>
        </div>`;
    }).join('');

    // Ligne « Interne / brainstorm » : visible dès qu'il y a du temps propre (ou qu'il tourne)
    const intRow = subs.length && (intMs > 0 || runInternal) ? `
        <div class="row ${runInternal ? 'running' : ''}">
          <span class="dot"></span>
          <span class="row-name internal">${esc(act.internalName)}</span>
          <span class="row-time mono" data-dur="int:${act.id}"></span>
          <button class="play sm ${runInternal ? 'on' : ''}" data-play="${act.id}" data-sub=""
                  aria-label="${runInternal ? 'Pause' : 'Lancer'} ${esc(act.internalName)}">${runInternal ? '⏸' : '▶︎'}</button>
        </div>` : '';

    return `
      <div class="card" style="--c:${act.color}">
        <div class="card-head ${runInternal ? 'running' : ''}">
          <button class="play ${runInternal ? 'on' : ''}" data-play="${act.id}" data-sub=""
                  aria-label="${runInternal ? 'Pause' : 'Lancer'} ${esc(act.name)} seul">${runInternal ? '⏸' : '▶︎'}</button>
          <div class="card-title">
            <div class="card-name">${esc(act.name)}</div>
            <div class="card-total">Total : <strong class="mono" data-dur="act:${act.id}"></strong></div>
          </div>
        </div>
        <div class="rows">${subRows}${intRow}</div>
        <button class="add-sub" data-addsub="${act.id}">+ sous-timer</button>
      </div>`;
  }).join('');

  updateLive();
}

// Bandeau fixe « ce qui tourne en ce moment »
function renderBanner() {
  const cur = activeSession();
  const banner = $('#banner');
  banner.hidden = !cur;
  if (!cur) { banner.dataset.sid = ''; return; }
  const act = actById(cur.activityId);
  const color = cur.subId ? subColor(subById(cur.subId)) : act?.color;
  banner.style.setProperty('--active', color);
  $('#banner-name').textContent = `${actLabel(cur)} › ${subLabel(cur)}`;
  // On ne réécrit la note que si la session a changé (sinon on gênerait la saisie)
  if (banner.dataset.sid !== cur.id) {
    $('#banner-note').value = cur.note || '';
    banner.dataset.sid = cur.id;
  }
  updateLive();
}

// Mise à jour chaque seconde des temps affichés (sans tout redessiner)
function updateLive() {
  const cur = activeSession();
  const now = Date.now();
  const bannerTime = $('[data-dur="banner"]');
  if (cur) bannerTime.textContent = fmtHMS(now - cur.start);

  if (ui.tab !== 'timers') return;
  const [a, b] = periodRange(ui.timersPeriod);
  const t = computeTotals(a, b);
  $$('#cards [data-dur]').forEach((el) => {
    const [kind, id] = el.dataset.dur.split(':');
    let ms = 0, live = false;
    if (kind === 'act') { ms = t.act[id] || 0; live = cur && cur.activityId === id; }
    if (kind === 'sub') { ms = t.sub[id] || 0; live = cur && cur.subId === id; }
    if (kind === 'int') { ms = t.int[id] || 0; live = cur && cur.activityId === id && !cur.subId; }
    // Le timer en cours (et le total de son activité) défile en hh:mm:ss
    el.textContent = live ? fmtHMS(ms) : fmtDur(ms);
  });
}

// =========================================================================
// 6. FENÊTRE MODALE GÉNÉRIQUE
// =========================================================================

const dlg = $('#modal');

// buttons : [{ label, cls, onClick }] — si onClick renvoie false, la modale reste ouverte
function openModal(title, bodyHtml, buttons, onOpen) {
  $('#modal-title').textContent = title;
  $('#modal-body').innerHTML = bodyHtml;
  const box = $('#modal-actions');
  box.innerHTML = '';
  buttons.forEach((b) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'btn ' + (b.cls || '');
    el.textContent = b.label;
    el.onclick = () => { if (b.onClick && b.onClick() === false) return; dlg.close(); };
    box.appendChild(el);
  });
  dlg.showModal();
  if (onOpen) onOpen();
}
// « Entrée » dans un champ = bouton principal
$('#modal-form').addEventListener('submit', (e) => {
  e.preventDefault();
  $('#modal-actions .primary')?.click();
});

// Choix de couleur (pastilles)
function colorPicker(name, current, allowInherit = false) {
  const opts = (allowInherit ? [''] : []).concat(PALETTE);
  return `<div class="colors" data-colors="${name}">` + opts.map((c) => `
    <button type="button" data-color="${c}" class="${c === (current || '') ? 'on' : ''}"
      style="--c:${c || 'var(--soft)'}" aria-label="${c || 'Couleur de l\'activité'}">${c ? '' : '↺'}</button>`).join('') + '</div>';
}
dlg.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-color]');
  if (!btn) return;
  btn.parentElement.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === btn));
});
const pickedColor = (name) => dlg.querySelector(`[data-colors="${name}"] .on`)?.dataset.color ?? '';

// ---------- Création d'activité / de sous-timer ----------
function newActivityModal() {
  const color = PALETTE[state.activities.length % PALETTE.length];
  openModal('Nouvelle activité', `
    <label>Nom <input type="text" id="m-name" placeholder="ex. Activité Tam" autocomplete="off"></label>
    <label>Couleur ${colorPicker('c', color)}</label>`, [
    { label: 'Annuler' },
    { label: 'Créer', cls: 'primary', onClick: () => {
      const name = $('#m-name').value.trim();
      if (!name) { $('#m-name').focus(); return false; }
      state.activities.push({
        id: uid(), name, color: pickedColor('c') || color, createdAt: Date.now(),
        archived: false, order: state.activities.length, internalName: DEFAULT_INTERNAL_NAME,
      });
      save(); render();
    } },
  ], () => $('#m-name').focus());
}

function newSubModal(actId) {
  const act = actById(actId);
  openModal(`Nouveau sous-timer · ${act.name}`, `
    <label>Nom <input type="text" id="m-name" placeholder="ex. Pierre" autocomplete="off"></label>
    <label>Couleur (↺ = celle de l'activité) ${colorPicker('c', '', true)}</label>`, [
    { label: 'Annuler' },
    { label: 'Créer', cls: 'primary', onClick: () => {
      const name = $('#m-name').value.trim();
      if (!name) { $('#m-name').focus(); return false; }
      state.subs.push({
        id: uid(), activityId: actId, name, color: pickedColor('c') || null,
        archived: false, order: subsOf(actId, true).length, createdAt: Date.now(),
      });
      save(); render();
    } },
  ], () => $('#m-name').focus());
}

// =========================================================================
// 7. ÉCRAN RAPPORTS
// =========================================================================

let donutChart = null, barChart = null;

const reportRange = () => periodRange(ui.r.period, ui.r.from, ui.r.to);

// La session correspond-elle aux filtres activité / sous-timer ?
function matchFilters(s) {
  if (ui.r.activity && s.activityId !== ui.r.activity) return false;
  if (ui.r.sub === INTERNAL) return !s.subId;
  if (ui.r.sub) return s.subId === ui.r.sub;
  return true;
}

// Sessions de la période (qui touchent la période) + filtres
function filteredSessions(a, b) {
  const now = Date.now();
  return state.sessions.filter((s) => matchFilters(s) && clip(s, a, b, now) > 0);
}

// Récapitulatif : [{ act, ms, items: [{ name, internal, color, ms }] }] + total général
function buildRecap(a, b) {
  const sessions = filteredSessions(a, b);
  const now = Date.now();
  const map = new Map();   // actId -> { ms, items: Map(subId|INTERNAL -> ms) }
  for (const s of sessions) {
    const ms = clip(s, a, b, now);
    if (!map.has(s.activityId)) map.set(s.activityId, { ms: 0, items: new Map() });
    const g = map.get(s.activityId);
    g.ms += ms;
    const k = s.subId || INTERNAL;
    g.items.set(k, (g.items.get(k) || 0) + ms);
  }
  const groups = [...map.entries()].map(([actId, g]) => {
    const act = actById(actId) || { id: actId, name: '(activité supprimée)', color: '#8e8e93', order: 1e9, internalName: DEFAULT_INTERNAL_NAME };
    const items = [...g.items.entries()].map(([k, ms]) => {
      if (k === INTERNAL) return { key: k, name: act.internalName, internal: true, color: act.color, ms, order: 1e9 };
      const sub = subById(k);
      return { key: k, name: sub?.name ?? '(sous-timer supprimé)', internal: false,
               color: sub ? subColor(sub) : '#8e8e93', ms, order: sub?.order ?? 1e8 };
    }).sort((x, y) => x.order - y.order);   // clients dans l'ordre, interne en dernier
    return { act, ms: g.ms, items };
  }).sort((x, y) => x.act.order - y.act.order);
  const total = groups.reduce((sum, g) => sum + g.ms, 0);
  return { groups, total, sessions };
}

// Remplit les listes déroulantes Activité / Sous-timer
function fillReportSelects() {
  const acts = [...state.activities].sort((x, y) => (x.archived - y.archived) || (x.order - y.order));
  $('#f-activity').innerHTML = `<option value="">Toutes</option>` + acts.map((a) =>
    `<option value="${a.id}">${esc(a.name)}${a.archived ? ' (archivée)' : ''}</option>`).join('');
  $('#f-activity').value = ui.r.activity;

  let opts = `<option value="">Tous</option>`;
  if (ui.r.activity) {
    const act = actById(ui.r.activity);
    opts += subsOf(ui.r.activity, true).map((s) =>
      `<option value="${s.id}">${esc(s.name)}${s.archived ? ' (archivé)' : ''}</option>`).join('');
    opts += `<option value="${INTERNAL}">${esc(act?.internalName || DEFAULT_INTERNAL_NAME)}</option>`;
  } else {
    // Sans activité choisie : tous les sous-timers, préfixés par leur activité
    opts += acts.map((a) => subsOf(a.id, true).map((s) =>
      `<option value="${s.id}">${esc(a.name)} › ${esc(s.name)}</option>`).join('')).join('');
  }
  $('#f-sub').innerHTML = opts;
  if (![...$('#f-sub').options].some((o) => o.value === ui.r.sub)) ui.r.sub = '';
  $('#f-sub').value = ui.r.sub;
}

function renderReports() {
  $('#f-period').value = ui.r.period;
  $('#f-custom').hidden = ui.r.period !== 'custom';
  fillReportSelects();

  const [a, b] = reportRange();
  $('#f-label').textContent = `Du ${fmtDayLong(a)} au ${fmtDayLong(b - 1)}`;
  const { groups, total, sessions } = buildRecap(a, b);

  // --- Résumé ---
  $('#r-total').textContent = fmtDur(total);
  const pct = (ms) => total ? Math.round((ms / total) * 100) + ' %' : '';
  $('#r-table').innerHTML = groups.length ? groups.map((g) => `
      <tr class="act"><td><span class="dot" style="--c:${g.act.color}"></span> ${esc(g.act.name)}</td>
        <td class="num">${fmtDur(g.ms)}</td><td class="pct">${pct(g.ms)}</td></tr>` +
      g.items.map((it) => `
      <tr class="sub"><td class="${it.internal ? 'internal' : ''}">${esc(it.name)}</td>
        <td class="num">${fmtDur(it.ms)}</td><td class="pct">${pct(it.ms)}</td></tr>`).join('')
    ).join('') : `<tr><td class="hint">Aucun temps sur cette période.</td></tr>`;

  renderCharts(a, b, groups, sessions);
  renderSessionList(a, b, sessions);
}

function renderCharts(a, b, groups, sessions) {
  if (typeof Chart === 'undefined') return;
  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  Chart.defaults.color = dark ? '#9a9aa4' : '#6e6e78';
  Chart.defaults.font.family = '-apple-system, BlinkMacSystemFont, sans-serif';
  const gridColor = dark ? '#2e2e33' : '#e4e4ea';

  // --- Donut : par activité, ou par client si une activité est choisie ---
  let slices;
  if (ui.r.activity) {
    slices = (groups[0]?.items || []).map((it) => ({ label: it.name, ms: it.ms, color: it.internal ? '#8e8e93' : it.color }));
    $('#r-donut-title').textContent = 'Répartition par sous-timer';
  } else {
    slices = groups.map((g) => ({ label: g.act.name, ms: g.ms, color: g.act.color }));
    $('#r-donut-title').textContent = 'Répartition par activité';
  }
  // Couleurs identiques (sous-timers qui héritent) → on éclaircit un peu pour les distinguer
  const seen = {};
  slices.forEach((s) => { const n = (seen[s.color] = (seen[s.color] || 0) + 1) - 1; if (n) s.color = shade(s.color, n); });

  const donutData = {
    labels: slices.map((s) => s.label),
    datasets: [{ data: slices.map((s) => +(s.ms / 3600000).toFixed(2)), backgroundColor: slices.map((s) => s.color), borderWidth: 0 }],
  };
  const tooltipH = { callbacks: { label: (ctx) => ` ${ctx.label || ctx.dataset.label} : ${fmtDur((ctx.raw || 0) * 3600000)}` } };
  if (!donutChart) {
    donutChart = new Chart($('#r-donut'), {
      type: 'doughnut', data: donutData,
      options: { maintainAspectRatio: false, cutout: '62%', animation: { duration: 250 },
                 plugins: { legend: { position: 'bottom', labels: { boxWidth: 12 } }, tooltip: tooltipH } },
    });
  } else { donutChart.data = donutData; donutChart.update(); }

  // --- Barres : temps par jour (ou par semaine si la période dépasse ~2 mois) ---
  const days = Math.round((b - a) / 86400000);
  const weekly = days > 62;
  $('#r-bars-title').textContent = weekly ? 'Temps par semaine' : 'Temps par jour';
  const buckets = [];
  let cursor = weekly ? startOfWeek(new Date(a)) : new Date(a);
  while (cursor.getTime() < b) {
    const next = addDays(cursor, weekly ? 7 : 1);
    buckets.push([Math.max(cursor.getTime(), a), Math.min(next.getTime(), b), cursor]);
    cursor = next;
  }
  const now = Date.now();
  const series = ui.r.activity
    ? (groups[0]?.items || []).map((it) => ({ label: it.name, color: it.internal ? '#8e8e93' : it.color,
        test: (s) => (s.subId || INTERNAL) === it.key }))
    : groups.map((g) => ({ label: g.act.name, color: g.act.color, test: (s) => s.activityId === g.act.id }));
  const seen2 = {};
  series.forEach((s) => { const n = (seen2[s.color] = (seen2[s.color] || 0) + 1) - 1; if (n) s.color = shade(s.color, n); });

  const barData = {
    labels: buckets.map(([, , d]) => weekly
      ? 'S. ' + d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
      : d.toLocaleDateString('fr-FR', days <= 7 ? { weekday: 'short', day: 'numeric' } : { day: 'numeric' })),
    datasets: series.map((se) => ({
      label: se.label, backgroundColor: se.color, borderRadius: 3,
      data: buckets.map(([x, y]) => +(sessions.filter(se.test)
        .reduce((sum, s) => sum + clip(s, x, y, now), 0) / 3600000).toFixed(2)),
    })),
  };
  const barOptions = {
    maintainAspectRatio: false, animation: { duration: 250 },
    plugins: { legend: { display: false }, tooltip: tooltipH },
    scales: { x: { stacked: true, grid: { display: false } },
              y: { stacked: true, beginAtZero: true, grid: { color: gridColor }, ticks: { callback: (v) => v + ' h' } } },
  };
  if (!barChart) barChart = new Chart($('#r-bars'), { type: 'bar', data: barData, options: barOptions });
  else { barChart.data = barData; barChart.options = barOptions; barChart.update(); }
}

// Éclaircit une couleur hex (pour distinguer des parts de même couleur)
function shade(hex, n) {
  const v = parseInt(hex.slice(1), 16);
  const mix = (c) => Math.round(c + (255 - c) * Math.min(0.75, 0.22 * n));
  const r = mix(v >> 16), g = mix((v >> 8) & 255), bl = mix(v & 255);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1);
}

// Liste des sessions, groupées par jour (la plus récente en haut)
function renderSessionList(a, b, sessions) {
  const now = Date.now();
  const list = [...sessions].sort((x, y) => y.start - x.start);
  if (!list.length) { $('#r-sessions').innerHTML = `<p class="hint">Aucune session.</p>`; return; }
  let lastDay = '';
  $('#r-sessions').innerHTML = list.map((s) => {
    const day = dayStr(new Date(s.start));
    const head = day !== lastDay ? `<div class="day-head">${fmtDayLong(s.start)}</div>` : '';
    lastDay = day;
    const full = (s.end ?? now) - s.start;
    const inPeriod = clip(s, a, b, now);
    const color = s.subId && subById(s.subId) ? subColor(subById(s.subId)) : actById(s.activityId)?.color;
    return head + `
      <button class="session" data-sid="${s.id}">
        <span class="dot" style="--c:${color || '#8e8e93'}"></span>
        <span class="s-main">
          <span class="s-title" style="display:block">${esc(actLabel(s))} › ${esc(subLabel(s))}</span>
          <span class="s-meta" style="display:block">${fmtTime(s.start)} → ${s.end == null ? 'en cours' : fmtTime(s.end)}${s.manual ? ' · ajout manuel' : ''}${inPeriod < full ? ` · ${fmtDur(full)} au total` : ''}</span>
          ${s.note ? `<span class="s-note" style="display:block">${esc(s.note)}</span>` : ''}
        </span>
        <span class="s-dur">${fmtDur(inPeriod)}</span>
      </button>`;
  }).join('');
}

// ---------- Sélecteurs activité / sous-timer dans les formulaires ----------
function actOptions(selected) {
  const acts = [...state.activities].sort((x, y) => (x.archived - y.archived) || (x.order - y.order));
  return acts.map((a) => `<option value="${a.id}" ${a.id === selected ? 'selected' : ''}>${esc(a.name)}${a.archived ? ' (archivée)' : ''}</option>`).join('');
}
function subOptions(actId, selected) {
  const act = actById(actId);
  return `<option value="">${esc(act?.internalName || DEFAULT_INTERNAL_NAME)}</option>` +
    subsOf(actId, true).map((s) => `<option value="${s.id}" ${s.id === selected ? 'selected' : ''}>${esc(s.name)}${s.archived ? ' (archivé)' : ''}</option>`).join('');
}
function linkActSub() {
  $('#m-act').addEventListener('change', () => { $('#m-sub').innerHTML = subOptions($('#m-act').value, ''); });
}

// ---------- Modifier / supprimer une session ----------
function editSessionModal(id) {
  const s = state.sessions.find((x) => x.id === id);
  if (!s) return;
  const running = s.end == null;
  openModal('Modifier la session', `
    <label>Début <input type="datetime-local" id="m-start" value="${toLocalInput(s.start)}"></label>
    <label>Fin ${running
      ? `<input type="text" value="En cours…" disabled>`
      : `<input type="datetime-local" id="m-end" value="${toLocalInput(s.end)}">`}</label>
    <label>Activité <select id="m-act">${actOptions(s.activityId)}</select></label>
    <label>Sous-timer <select id="m-sub">${subOptions(s.activityId, s.subId)}</select></label>
    <label>Note <input type="text" id="m-note" value="${esc(s.note)}" autocomplete="off"></label>`, [
    { label: 'Supprimer', cls: 'danger', onClick: () => {
      if (!confirm('Supprimer cette session ?')) return false;
      state.sessions = state.sessions.filter((x) => x !== s);
      if (state.activeSessionId === s.id) state.activeSessionId = null;
      save(); render();
    } },
    { label: 'Annuler' },
    { label: 'Enregistrer', cls: 'primary', onClick: () => {
      // On ne touche à l'heure que si elle a été modifiée (on garde ainsi les secondes)
      const vStart = $('#m-start').value;
      const start = vStart && vStart !== toLocalInput(s.start) ? fromLocalInput(vStart) : s.start;
      let end = s.end;
      if (!running) {
        const vEnd = $('#m-end').value;
        end = vEnd && vEnd !== toLocalInput(s.end) ? fromLocalInput(vEnd) : s.end;
      }
      if (!vStart || (!running && end <= start) || (running && start > Date.now())) {
        alert('La fin doit être après le début.'); return false;
      }
      Object.assign(s, { start, end, activityId: $('#m-act').value, subId: $('#m-sub').value || null, note: $('#m-note').value.trim() });
      save(); render();
    } },
  ], linkActSub);
}

// ---------- Ajouter du temps manuellement ----------
// Durée saisie : « 1:30 », « 1h30 », « 1 h », « 90 » (minutes)
function parseDuration(str) {
  const v = str.trim().toLowerCase().replace(/\s/g, '');
  if (!v) return 0;
  const m = v.match(/^(\d+)(?:[:h](\d{0,2}))?(?:min|m)?$/);
  if (!m) return NaN;
  if (v.includes(':') || v.includes('h')) return (Number(m[1]) * 60 + Number(m[2] || 0)) * 60000;
  return Number(m[1]) * 60000;
}

function manualModal() {
  if (!state.activities.length) { alert('Crée d’abord une activité.'); return; }
  const actId = ui.r.activity || visibleActivities()[0]?.id || state.activities[0].id;
  const subId = ui.r.activity && ui.r.sub && ui.r.sub !== INTERNAL ? ui.r.sub : '';
  const now = new Date();
  const h = now.getHours();
  openModal('Ajouter du temps', `
    <label>Activité <select id="m-act">${actOptions(actId)}</select></label>
    <label>Sous-timer <select id="m-sub">${subOptions(actId, subId)}</select></label>
    <label>Date <input type="date" id="m-date" value="${dayStr(now)}"></label>
    <div class="row2">
      <label>Début <input type="time" id="m-from" value="${pad(Math.max(0, h - 1))}:00"></label>
      <label>Fin <input type="time" id="m-to" value="${pad(h)}:00"></label>
    </div>
    <label>… ou durée (remplace la fin) <input type="text" id="m-dur" placeholder="ex. 1:30 ou 90" inputmode="numeric" autocomplete="off"></label>
    <label>Note <input type="text" id="m-note" autocomplete="off"></label>`, [
    { label: 'Annuler' },
    { label: 'Ajouter', cls: 'primary', onClick: () => {
      const date = $('#m-date').value, from = $('#m-from').value;
      if (!date || !from) { alert('Indique la date et l’heure de début.'); return false; }
      const start = fromLocalInput(`${date}T${from}`);
      let end;
      const dur = parseDuration($('#m-dur').value);
      if (Number.isNaN(dur)) { alert('Durée non comprise (ex. 1:30 ou 90).'); return false; }
      if (dur > 0) end = start + dur;
      else {
        const to = $('#m-to').value;
        if (!to) { alert('Indique l’heure de fin ou une durée.'); return false; }
        end = fromLocalInput(`${date}T${to}`);
        if (end <= start) end = addDays(new Date(end), 1).getTime();   // passe minuit
      }
      state.sessions.push({ id: uid(), activityId: $('#m-act').value, subId: $('#m-sub').value || null,
        start, end, note: $('#m-note').value.trim(), manual: true });
      save(); render();
    } },
  ], linkActSub);
}

// =========================================================================
// 8. EXPORTS (CSV pour facturer, JSON pour sauvegarder)
// =========================================================================

// Cellule CSV : guillemets si nécessaire
const cell = (v) => { const s = String(v ?? ''); return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
// CSV compatible Excel : séparateur « ; », UTF-8 avec BOM, fins de ligne CRLF
const toCSV = (rows) => '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n') + '\r\n';

// Nom de fichier lisible : recap_2026-10_Activite-Tam_Pierre.csv
function exportName(prefix) {
  const [a, b] = reportRange();
  const da = new Date(a), db = new Date(b - 1);
  let period = `${dayStr(da)}_${dayStr(db)}`;
  if (da.getDate() === 1 && new Date(b).getDate() === 1 && (new Date(b).getMonth() - da.getMonth() + 12) % 12 === 1)
    period = `${da.getFullYear()}-${pad(da.getMonth() + 1)}`;
  else if (dayStr(da) === dayStr(db)) period = dayStr(da);
  const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '');
  const parts = [prefix, period];
  if (ui.r.activity) parts.push(slug(actById(ui.r.activity)?.name || ''));
  if (ui.r.sub) parts.push(slug(ui.r.sub === INTERNAL ? 'interne' : subById(ui.r.sub)?.name || ''));
  return parts.filter(Boolean).join('_') + '.csv';
}

// Détail des sessions filtrées (découpées à la période pour que les totaux collent au récap)
function exportSessionsCSV() {
  const [a, b] = reportRange();
  const now = Date.now();
  const rows = [['Date', 'Début', 'Fin', 'Durée (h décimales)', 'Durée (hh:mm)', 'Activité', 'Sous-timer', 'Note']];
  filteredSessions(a, b).sort((x, y) => x.start - y.start).forEach((s) => {
    const start = Math.max(s.start, a), end = Math.min(s.end ?? now, b);
    const ms = end - start;
    rows.push([fmtDate(start), fmtTime(start), fmtTime(end), fmtDec(ms), fmtHM(ms), actLabel(s), subLabel(s),
               s.note + (s.end == null ? ' (en cours)' : '')]);
  });
  shareFile(exportName('sessions'), toCSV(rows), 'text/csv');
}

// Récapitulatif pour la facturation : une ligne par client (+ interne), total général en bas
function exportRecapCSV() {
  const [a, b] = reportRange();
  const { groups, total } = buildRecap(a, b);
  const rows = [['Activité', 'Sous-timer', 'Total heures (décimales)', 'Total hh:mm']];
  groups.forEach((g) => g.items.forEach((it) => rows.push([g.act.name, it.name, fmtDec(it.ms), fmtHM(it.ms)])));
  rows.push(['TOTAL', '', fmtDec(total), fmtHM(total)]);
  shareFile(exportName('recap'), toCSV(rows), 'text/csv');
}

// Partage iOS (Fichiers, Mail, AirDrop…) avec repli sur un téléchargement classique
async function shareFile(name, content, mime) {
  const blob = new Blob([content], { type: mime });
  try {
    const file = new File([blob], name, { type: mime });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: name });
      return;
    }
  } catch (e) {
    if (e.name === 'AbortError') return;      // l'utilisateur a fermé la feuille de partage
    console.warn('Partage impossible, téléchargement à la place', e);
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = name;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function exportJSON() {
  const data = { app: 'timerflo', version: 1, exportedAt: new Date().toISOString(), data: state };
  shareFile(`timerflo_sauvegarde_${dayStr(new Date())}.json`, JSON.stringify(data, null, 2), 'application/json');
}

function importJSON(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      const d = parsed && parsed.data ? parsed.data : parsed;
      if (!Array.isArray(d.activities) || !Array.isArray(d.sessions)) throw new Error('format inconnu');
      const next = normalize(d);
      if (!confirm(`Remplacer toutes les données actuelles par cette sauvegarde ?\n` +
                   `${next.activities.length} activités, ${next.subs.length} sous-timers, ${next.sessions.length} sessions.`)) return;
      state = next;
      save(); render();
      alert('Sauvegarde importée.');
    } catch (e) { alert('Fichier invalide : ' + e.message); }
  };
  reader.readAsText(file);
}

// =========================================================================
// 9. ÉCRAN RÉGLAGES
// =========================================================================

function renderSettings() {
  const acts = visibleActivities();
  $('#s-list').innerHTML = acts.length ? acts.map((a, i) => {
    const subs = subsOf(a.id);
    return `
      <div class="s-act">
        <div class="s-line">
          <input type="color" value="${a.color}" data-set="act-color" data-id="${a.id}" aria-label="Couleur">
          <input type="text" value="${esc(a.name)}" data-set="act-name" data-id="${a.id}" aria-label="Nom de l'activité">
          <button class="icon-btn" data-do="act-up" data-id="${a.id}" ${i === 0 ? 'disabled' : ''} aria-label="Monter">↑</button>
          <button class="icon-btn" data-do="act-down" data-id="${a.id}" ${i === acts.length - 1 ? 'disabled' : ''} aria-label="Descendre">↓</button>
          <button class="icon-btn" data-do="act-archive" data-id="${a.id}" aria-label="Archiver">🗄</button>
        </div>
        ${subs.map((s, j) => `
        <div class="s-line sub">
          <input type="color" value="${subColor(s)}" data-set="sub-color" data-id="${s.id}" aria-label="Couleur">
          <input type="text" value="${esc(s.name)}" data-set="sub-name" data-id="${s.id}" aria-label="Nom du sous-timer">
          <button class="icon-btn" data-do="sub-up" data-id="${s.id}" ${j === 0 ? 'disabled' : ''} aria-label="Monter">↑</button>
          <button class="icon-btn" data-do="sub-down" data-id="${s.id}" ${j === subs.length - 1 ? 'disabled' : ''} aria-label="Descendre">↓</button>
          <button class="icon-btn" data-do="sub-archive" data-id="${s.id}" aria-label="Archiver">🗄</button>
        </div>`).join('')}
        <div class="s-line sub internal">
          <span class="icon-btn" style="display:grid;place-items:center" title="Temps propre de l'activité">✎</span>
          <input type="text" value="${esc(a.internalName)}" data-set="act-internal" data-id="${a.id}" aria-label="Nom de la ligne interne">
        </div>
        <button class="s-sub-add" data-addsub="${a.id}">+ sous-timer</button>
      </div>`;
  }).join('') : `<p class="hint">Aucune activité.</p>`;

  // Archivés : activités archivées + sous-timers archivés d'activités actives
  const archActs = state.activities.filter((a) => a.archived).sort(byOrder);
  const archSubs = state.subs.filter((s) => s.archived && actById(s.activityId) && !actById(s.activityId).archived);
  const line = (kind, id, label, color) => `
    <div class="s-line" style="margin-top:8px">
      <span class="dot" style="--c:${color}"></span>
      <span class="row-name">${esc(label)}</span>
      <button class="btn small" data-do="${kind}-restore" data-id="${id}">Restaurer</button>
      <button class="icon-btn" data-do="${kind}-delete" data-id="${id}" aria-label="Supprimer définitivement">🗑</button>
    </div>`;
  $('#s-archived').innerHTML = (archActs.length || archSubs.length)
    ? archActs.map((a) => line('act', a.id, a.name, a.color)).join('') +
      archSubs.map((s) => line('sub', s.id, `${actById(s.activityId).name} › ${s.name}`, subColor(s))).join('')
    : `<p class="hint">Rien d'archivé. Archiver masque une activité ou un client sans perdre l'historique.</p>`;
}

// Échange l'ordre d'un élément avec son voisin
function move(list, id, dir) {
  const i = list.findIndex((x) => x.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  renumber(list);
}

// Si le timer en cours concerne l'élément archivé / supprimé, on l'arrête
function stopIfRunning(test) {
  const cur = activeSession();
  if (cur && test(cur)) stopTimer();
}

function settingsAction(action, id) {
  const act = actById(id), sub = subById(id);
  switch (action) {
    case 'act-up': case 'act-down':
      move(visibleActivities(), id, action === 'act-up' ? -1 : 1); break;
    case 'sub-up': case 'sub-down':
      move(subsOf(sub.activityId), id, action === 'sub-up' ? -1 : 1); break;
    case 'act-archive':
      if (!confirm(`Archiver « ${act.name} » ?\nElle disparaît des timers mais son historique est conservé.`)) return;
      stopIfRunning((s) => s.activityId === id);
      act.archived = true; break;
    case 'sub-archive':
      if (!confirm(`Archiver « ${sub.name} » ?\nIl disparaît des timers mais son historique est conservé.`)) return;
      stopIfRunning((s) => s.subId === id);
      sub.archived = true; break;
    case 'act-restore': act.archived = false; act.order = visibleActivities().length; break;
    case 'sub-restore': sub.archived = false; sub.order = subsOf(sub.activityId).length; break;
    case 'act-delete': {
      const n = state.sessions.filter((s) => s.activityId === id).length;
      if (!confirm(`Supprimer définitivement « ${act.name} », ses sous-timers et ses ${n} session(s) ?\nCette action est irréversible.`)) return;
      stopIfRunning((s) => s.activityId === id);
      state.activities = state.activities.filter((a) => a.id !== id);
      state.subs = state.subs.filter((s) => s.activityId !== id);
      state.sessions = state.sessions.filter((s) => s.activityId !== id);
      break;
    }
    case 'sub-delete': {
      const n = state.sessions.filter((s) => s.subId === id).length;
      if (!confirm(`Supprimer définitivement « ${sub.name} » et ses ${n} session(s) ?\nCette action est irréversible.`)) return;
      stopIfRunning((s) => s.subId === id);
      state.subs = state.subs.filter((s) => s.id !== id);
      state.sessions = state.sessions.filter((s) => s.subId !== id);
      break;
    }
  }
  save(); render();
}

// Renommage / couleur : enregistré à la validation du champ
function settingsChange(el) {
  const id = el.dataset.id, v = el.value;
  const act = actById(id), sub = subById(id);
  switch (el.dataset.set) {
    case 'act-name': if (v.trim()) act.name = v.trim(); else el.value = act.name; break;
    case 'act-internal': act.internalName = v.trim() || DEFAULT_INTERNAL_NAME; el.value = act.internalName; break;
    case 'act-color': act.color = v; break;
    case 'sub-name': if (v.trim()) sub.name = v.trim(); else el.value = sub.name; break;
    case 'sub-color': sub.color = v; break;
  }
  save();
  renderBanner();
  if (el.dataset.set.endsWith('color')) renderSettings();
}

// =========================================================================
// 10. NAVIGATION, ÉVÉNEMENTS, DÉMARRAGE
// =========================================================================

function render() {
  renderBanner();
  $$('.tabbar button').forEach((b) => b.classList.toggle('on', b.dataset.tab === ui.tab));
  $$('.tab').forEach((t) => { t.hidden = t.id !== 'tab-' + ui.tab; });
  if (ui.tab === 'timers') renderTimers();
  if (ui.tab === 'reports') renderReports();
  if (ui.tab === 'settings') renderSettings();
}

function setTab(tab) { ui.tab = tab; render(); window.scrollTo(0, 0); }

// Onglets
$('.tabbar').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab]');
  if (b) setTab(b.dataset.tab);
});

// Écran Timers
$('#timers-period').addEventListener('click', (e) => {
  const b = e.target.closest('[data-p]');
  if (b) { ui.timersPeriod = b.dataset.p; renderTimers(); }
});
$('#cards').addEventListener('click', (e) => {
  const play = e.target.closest('[data-play]');
  if (play) return toggleTimer(play.dataset.play, play.dataset.sub || null);
  const add = e.target.closest('[data-addsub]');
  if (add) newSubModal(add.dataset.addsub);
});
$('#add-activity').addEventListener('click', newActivityModal);

// Bandeau
$('#banner-stop').addEventListener('click', () => { stopTimer(); render(); });
$('#banner-note').addEventListener('input', (e) => {
  const cur = activeSession();
  if (cur) { cur.note = e.target.value; save(); }
});
$('#banner-note').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.blur(); });

// Écran Rapports
$('#f-period').addEventListener('change', (e) => {
  ui.r.period = e.target.value;
  if (ui.r.period === 'custom' && !ui.r.from) {
    const [a, b] = periodRange('month');
    ui.r.from = dayStr(new Date(a)); ui.r.to = dayStr(new Date(b - 1));
    $('#f-from').value = ui.r.from; $('#f-to').value = ui.r.to;
  }
  renderReports();
});
$('#f-from').addEventListener('change', (e) => { ui.r.from = e.target.value; renderReports(); });
$('#f-to').addEventListener('change', (e) => { ui.r.to = e.target.value; renderReports(); });
$('#f-activity').addEventListener('change', (e) => { ui.r.activity = e.target.value; ui.r.sub = ''; renderReports(); });
$('#f-sub').addEventListener('change', (e) => {
  ui.r.sub = e.target.value;
  // Choisir un client sans activité → on sélectionne aussi son activité
  if (ui.r.sub && ui.r.sub !== INTERNAL && !ui.r.activity) ui.r.activity = subById(ui.r.sub)?.activityId || '';
  renderReports();
});
$('#r-sessions').addEventListener('click', (e) => {
  const b = e.target.closest('[data-sid]');
  if (b) editSessionModal(b.dataset.sid);
});
$('#add-manual').addEventListener('click', manualModal);
$('#exp-recap').addEventListener('click', exportRecapCSV);
$('#exp-sessions').addEventListener('click', exportSessionsCSV);

// Écran Réglages
$('#tab-settings').addEventListener('click', (e) => {
  const b = e.target.closest('[data-do]');
  if (b) return settingsAction(b.dataset.do, b.dataset.id);
  const add = e.target.closest('[data-addsub]');
  if (add) newSubModal(add.dataset.addsub);
});
$('#tab-settings').addEventListener('change', (e) => { if (e.target.dataset.set) settingsChange(e.target); });
$('#s-add-activity').addEventListener('click', newActivityModal);
$('#s-export').addEventListener('click', exportJSON);
$('#s-import').addEventListener('click', () => $('#s-import-file').click());
$('#s-import-file').addEventListener('change', (e) => {
  if (e.target.files[0]) importJSON(e.target.files[0]);
  e.target.value = '';
});

// Rafraîchissement : chaque seconde pour les temps, et au retour dans l'app
setInterval(updateLive, 1000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') { state = load(); render(); }
});
// Si les données changent dans un autre onglet (navigateur), on recharge
window.addEventListener('storage', (e) => { if (e.key === STORE_KEY) { state = load(); render(); } });

render();

// Service worker (hors ligne) — uniquement en http(s)
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW non enregistré', e));
}
