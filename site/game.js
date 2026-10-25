'use strict';
// ---------- Suivi de partie ----------
// Table de jeu : chaque joueur à sa place autour de la table (ordre du tour = sens des aiguilles d'une montre),
// points de vie, blessures de commandant par adversaire, poison, taxe de commandant, monarque, initiative,
// jour/nuit, tours et minuteurs, dés, annulation. Tout est gardé sur l'appareil (localStorage « partie »).

const SEAT_COLORS = ['#c0563f', '#3f7fc0', '#3f9a5b', '#8a5cc0', '#c79a2e', '#2f9d98'];
const START_LIFE = [40, 30, 25, 20];
const EXTRA = { energy: ['Énergie', '⚡'], exp: ['Expérience', '✦'], rad: ['Radiation', '☢'] };

function newPlayer(i, start = 40, old = {}) {
  return {
    name: old.name || `Joueur ${i + 1}`, color: old.color || SEAT_COLORS[i % SEAT_COLORS.length],
    cmdr: old.cmdr || '', cmdr2: old.cmdr2 || '', partners: !!old.partners,
    life: start, poison: 0, energy: 0, exp: 0, rad: 0, casts: [0, 0], cmd: {}, conceded: false, hist: [{ t: 0, life: start }],
  };
}
function freshGame(n, start, keep = []) {
  return { v: 2, start, players: Array.from({ length: n }, (_, i) => newPlayer(i, start, keep[i])), turn: 0, active: 0, first: 0,
    gameStart: 0, turnStart: 0, monarch: -1, initiative: -1, day: '', table: false, extras: {}, sel: -1 };
}
function loadGame() {
  try {
    const g = JSON.parse(localStorage.getItem('partie'));
    if (g && g.players && g.players.length) {
      // Parties enregistrées par l'ancienne version : on complète les champs manquants.
      const start = g.start || 40;
      const out = { ...freshGame(g.players.length, start), ...g, v: 2, start };
      out.players = g.players.map((p, i) => ({ ...newPlayer(i, start), ...p, conceded: p.conceded ?? !!p.out, casts: p.casts || [0, 0], cmd: p.cmd || {}, hist: p.hist || [{ t: 0, life: start }] }));
      out.extras = g.extras || {};
      out.sel = -1;
      return out;
    }
  } catch {}
  return freshGame(4, 40);
}
let gameState = loadGame();
function saveGame() { try { localStorage.setItem('partie', JSON.stringify(gameState)); } catch {} }

// Annuler : on garde les 60 derniers états (pas enregistrés).
const undoStack = [];
function snap() { undoStack.push(JSON.stringify(gameState)); if (undoStack.length > 60) undoStack.shift(); }
function undo() { const s = undoStack.pop(); if (!s) return; gameState = { ...JSON.parse(s), table: gameState.table, sel: gameState.sel }; saveGame(); renderGame(); }

// ---------- Règles ----------
const cmdKey = (j, k) => `${j}-${k}`;
function lossReason(p, i) {
  if (p.conceded) return 'a concédé';
  if (p.life <= 0) return 'points de vie à 0 ou moins';
  if (p.poison >= 10) return '10 marqueurs poison';
  const n = gameState.players.length;
  for (const [key, v] of Object.entries(p.cmd)) if (v >= 21 && +key.split('-')[0] < n && +key.split('-')[0] !== i) return '21 blessures d\'un même commandant';
  return '';
}
const isOut = (i) => !!lossReason(gameState.players[i], i);
function nextAlive(i) {
  const n = gameState.players.length;
  for (let k = 1; k <= n; k++) { const j = (i + k) % n; if (!isOut(j)) return j; }
  return i;
}
// Monarque et initiative : si le joueur qui les a quitte la partie, ils passent au joueur actif
// (ou au suivant dans l'ordre du tour si c'était son tour) — règles 724.4 et 725.4.
function settleDesignations() {
  const g = gameState;
  for (const key of ['monarch', 'initiative']) {
    if (g[key] >= 0 && (g[key] >= g.players.length || isOut(g[key]))) {
      g[key] = g.turn ? (g.active === g[key] ? nextAlive(g.active) : g.active) : -1;
      if (g[key] >= 0 && isOut(g[key])) g[key] = -1;
    }
  }
}
function logLife(p) {
  const t = gameState.turn || 0;
  const last = p.hist[p.hist.length - 1];
  if (last && last.t === t && p.hist.length > 1) last.life = p.life; else p.hist.push({ t, life: p.life });
  if (p.hist.length > 60) p.hist.splice(1, 1);
}

// Variation récente affichée en bulle (−3, +5…), regroupée tant qu'on tape vite.
const deltas = new Map();
function bump(i, d) {
  const cur = deltas.get(i);
  const now = Date.now();
  deltas.set(i, { d: (cur && now - cur.t < 2500 ? cur.d : 0) + d, t: now });
  setTimeout(() => { const x = deltas.get(i); if (x && Date.now() - x.t >= 2400) { deltas.delete(i); renderGame(); } }, 2600);
}
function changeLife(i, d) {
  const p = gameState.players[i];
  p.life += d;
  logLife(p); bump(i, d);
}

// ---------- Disposition autour de la table ----------
// Rangée du fond de gauche à droite, puis rangée proche de droite à gauche : c'est le sens du tour.
function seatRows(n) {
  const top = Math.floor(n / 2);
  const far = Array.from({ length: top }, (_, i) => i);
  const near = Array.from({ length: n - top }, (_, i) => n - 1 - i);
  return [far, near];
}

const artUrl = (name) => `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name.split(' // ')[0])}&format=image&version=art_crop`;
function seatHtml(i, far) {
  const g = gameState, p = g.players[i], n = g.players.length;
  const why = lossReason(p, i);
  const cmdTaken = Object.entries(p.cmd).filter(([k, v]) => v > 0 && +k.split('-')[0] < n && +k.split('-')[0] !== i);
  const maxCmd = Math.max(0, ...cmdTaken.map(([, v]) => v));
  const dl = deltas.get(i);
  const badges = [];
  if (g.monarch === i) badges.push('<span class="bdg crown" title="Monarque">👑</span>');
  if (g.initiative === i) badges.push('<span class="bdg" title="Initiative">🏰</span>');
  if (p.poison) badges.push(`<span class="bdg ${p.poison >= 8 ? 'hot' : ''}" title="Poison">☠ ${p.poison}</span>`);
  if (maxCmd) badges.push(`<span class="bdg ${maxCmd >= 15 ? 'hot' : ''}" title="Blessures de commandant (max d'un même commandant)">⚔ ${maxCmd}</span>`);
  for (const [k, [label, ic]] of Object.entries(EXTRA)) if (p[k]) badges.push(`<span class="bdg" title="${label}">${ic} ${p[k]}</span>`);
  const tax = p.casts[0] * 2;
  if (tax) badges.push(`<span class="bdg" title="Taxe de commandant">taxe +${tax}${p.partners && p.casts[1] ? '/+' + p.casts[1] * 2 : ''}</span>`);
  const style = `--pc:${esc(p.color)}` + (p.cmdr ? `;--art:url(&quot;${esc(artUrl(p.cmdr))}&quot;)` : '');
  return `<div class="seat ${far && g.table ? 'far' : ''} ${why ? 'out' : ''} ${g.turn && g.active === i ? 'active' : ''} ${g.sel === i ? 'sel' : ''} ${p.cmdr ? 'has-art' : ''}" data-i="${i}" style="${style}">
    <button class="seat-head" data-open="${i}" title="Détails de ${esc(p.name)}"><span class="seat-name">${g.turn && g.active === i && !why ? '▶ ' : ''}${esc(p.name)}</span>${p.cmdr ? `<span class="seat-cmdr">${esc(p.cmdr.split(' // ')[0])}${p.partners && p.cmdr2 ? ' + ' + esc(p.cmdr2.split(' // ')[0]) : ''}</span>` : ''}</button>
    <div class="seat-life">
      <button class="tap minus" data-life="${i}" data-d="-1" aria-label="${esc(p.name)} : retirer 1 point de vie (maintenir : 10)">−</button>
      <span class="life-num">${p.life}</span>
      <button class="tap plus" data-life="${i}" data-d="1" aria-label="${esc(p.name)} : ajouter 1 point de vie (maintenir : 10)">+</button>
      ${dl ? `<span class="delta ${dl.d < 0 ? 'neg' : 'pos'}">${dl.d > 0 ? '+' : ''}${dl.d}</span>` : ''}
    </div>
    <div class="seat-badges">${badges.join('')}</div>
    ${why ? `<div class="seat-out">☠ ${esc(why)}</div>` : ''}
  </div>`;
}

function barHtml() {
  const g = gameState, P = g.players;
  const act = P[g.active] || P[0];
  const tips = [];
  if (g.turn && g.initiative === g.active) tips.push(`🏰 ${esc(act.name)} a l'initiative : au début de son entretien, il explore le Souterrain (Undercity).`);
  if (g.turn && g.monarch === g.active) tips.push(`👑 ${esc(act.name)} est le monarque : il pioche une carte au début de son étape de fin.`);
  if (g.day) tips.push(g.day === 'jour' ? '☀ Jour : si le joueur actif ne lance aucun sort pendant son tour, il fait nuit au tour suivant.' : '☾ Nuit : si le joueur actif lance deux sorts ou plus pendant son tour, il fait jour au tour suivant.');
  const alive = P.map((_, i) => i).filter(i => !isOut(i));
  if (g.turn && P.length > 1 && alive.length === 1) tips.unshift(`<b class="win">🏆 ${esc(P[alive[0]].name)} gagne la partie</b> au tour ${g.turn}, après ${fmtTime(Date.now() - g.gameStart)} de jeu. « Nouvelle partie » dans ⚙ pour rejouer.`);
  return `<div class="gb-main">
      ${g.turn ? `<span class="turn">Tour ${g.turn} · <b style="color:${esc(act.color)}">${esc(act.name)}</b></span>
        <span class="muted small">ce tour <span class="timer" id="tTurn">${fmtTime(Date.now() - g.turnStart)}</span> · partie <span class="timer" id="tGame">${fmtTime(Date.now() - g.gameStart)}</span></span>
        <button class="btn sm primary" data-bar="next">Joueur suivant ▸</button>`
      : `<button class="btn sm primary" data-bar="start">▶ Lancer la partie</button><span class="muted small">Le premier joueur est ${esc((P[g.active] || P[0]).name)}.</span>`}
      <button class="btn sm" data-bar="undo" ${undoStack.length ? '' : 'disabled'} title="Annuler la dernière action">↶ Annuler</button>
      <button class="btn sm" data-bar="day" title="Jour / nuit">${g.day === 'jour' ? '☀ Jour' : g.day === 'nuit' ? '☾ Nuit' : '☀/☾'}</button>
      <button class="btn sm" data-bar="table" title="Plein écran, téléphone posé au milieu de la table">${g.table ? '✕ Quitter le mode table' : '⛶ Mode table'}</button>
    </div>
    <div class="gb-tools"><button class="btn sm" data-bar="d6">d6</button><button class="btn sm" data-bar="d20">d20</button><button class="btn sm" data-bar="coin">Pile ou face</button><button class="btn sm" data-bar="first">Qui commence ?</button><span class="roll" aria-live="polite">${esc(lastRoll)}</span></div>
    ${tips.length ? `<div class="gb-tips small">${tips.join('<br>')}</div>` : ''}`;
}

const sparkline = (hist) => {
  if (!hist || hist.length < 2) return '';
  const vals = hist.map(h => h.life), max = Math.max(...vals, 1), min = Math.min(...vals, 0);
  const W = 260, H = 60, x = (i) => i / (vals.length - 1) * W, y = (v) => H - (v - min) / Math.max(1, max - min) * H;
  return `<svg class="spark" viewBox="-4 -4 ${W + 8} ${H + 8}" role="img" aria-label="Évolution des points de vie"><line x1="0" x2="${W}" y1="${y(0)}" y2="${y(0)}" class="zero"/><polyline points="${vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}"/></svg>
    <div class="hist">${hist.slice(-12).map((h, i, a) => { const prev = i ? a[i - 1].life : null; return `<span class="${prev == null ? '' : h.life < prev ? 'down' : h.life > prev ? 'up' : ''}">${h.t ? 'T' + h.t + ' ' : 'départ '}${h.life}</span>`; }).join('')}</div>`;
};

const stepper = (label, attr, val, steps = [-1, 1], extra = '') => `<div class="stp"><span class="stp-l">${label}</span>${steps.filter(s => s < 0).map(s => `<button class="btn sm" ${attr} data-d="${s}">${s}</button>`).join('')}<b>${val}</b>${steps.filter(s => s > 0).map(s => `<button class="btn sm" ${attr} data-d="${s}">+${s}</button>`).join('')}${extra}</div>`;

function sheetHtml(i) {
  const g = gameState, P = g.players, p = P[i], n = P.length;
  const sources = [];
  P.forEach((q, j) => { if (j !== i) { sources.push({ j, k: 0, label: `${q.name}${q.cmdr ? ' · ' + q.cmdr.split(' // ')[0] : ''}`, color: q.color }); if (q.partners) sources.push({ j, k: 1, label: `${q.name} · ${q.cmdr2 ? q.cmdr2.split(' // ')[0] : 'second commandant'}`, color: q.color }); } });
  const why = lossReason(p, i);
  return `<div class="sheet" data-i="${i}" style="--pc:${esc(p.color)}">
    <div class="sheet-head"><input class="sh-name" data-f="name" value="${esc(p.name)}" aria-label="Nom du joueur" maxlength="24"><span class="sh-colors">${SEAT_COLORS.map(c => `<button class="sw ${c === p.color ? 'on' : ''}" data-color="${c}" style="background:${c}" aria-label="Couleur"></button>`).join('')}</span><button class="btn sm" data-close>Fermer ✕</button></div>
    <div class="sh-grid">
      <div class="sh-col">
        <label class="small">Commandant <input data-f="cmdr" list="cmdList" class="sh-cmd" value="${esc(p.cmdr)}" placeholder="pour l'illustration (facultatif)"></label>
        <label class="toggle small"><input type="checkbox" data-f="partners" ${p.partners ? 'checked' : ''}> Deux commandants (partenaires, « Choose a Background »…)</label>
        ${p.partners ? `<label class="small">Second commandant <input data-f="cmdr2" list="cmdList" class="sh-cmd" value="${esc(p.cmdr2)}"></label>` : ''}
        ${stepper('Points de vie', `data-plife="${i}"`, p.life, [-10, -5, -1, 1, 5, 10])}
        ${stepper('☠ Poison', `data-cnt="poison"`, p.poison)}
        ${Object.entries(EXTRA).filter(([k]) => g.extras[k] || p[k]).map(([k, [label, ic]]) => stepper(`${ic} ${label}`, `data-cnt="${k}"`, p[k])).join('')}
        ${[0, ...(p.partners ? [1] : [])].map(k => stepper(`Commandant${p.partners ? ' ' + (k + 1) : ''} lancé depuis la zone de commandement`, `data-cast="${k}"`, `${p.casts[k]}×`, [-1, 1], `<span class="muted small">prochaine taxe <b>+{${p.casts[k] * 2}}</b></span>`)).join('')}
        <div class="row sh-flags">
          <button class="btn sm ${g.monarch === i ? 'on' : ''}" data-desig="monarch">👑 ${g.monarch === i ? 'Est le monarque' : 'Devient le monarque'}</button>
          <button class="btn sm ${g.initiative === i ? 'on' : ''}" data-desig="initiative">🏰 ${g.initiative === i ? 'A l\'initiative' : 'Prend l\'initiative'}</button>
          <button class="btn sm ${p.conceded ? 'on' : ''}" data-concede>${p.conceded ? 'Revient en jeu' : 'Concède'}</button>
        </div>
        ${why ? `<p class="bad-t small">Hors de la partie : ${esc(why)}.</p>` : ''}
      </div>
      <div class="sh-col">
        <div class="stp-l">Blessures de commandant subies <span class="muted small">(retirent aussi les points de vie ; 21 d'un même commandant = défaite, règle 903.10a)</span></div>
        ${sources.map(s => { const v = p.cmd[cmdKey(s.j, s.k)] || 0; return `<div class="cd-row ${v >= 21 ? 'lethal' : v >= 15 ? 'near' : ''}" style="--sc:${esc(s.color)}"><span class="cd-src">${esc(s.label)}</span><button class="btn sm" data-cmd="${cmdKey(s.j, s.k)}" data-d="-1">−1</button><b>${v}</b><button class="btn sm" data-cmd="${cmdKey(s.j, s.k)}" data-d="1">+1</button><button class="btn sm" data-cmd="${cmdKey(s.j, s.k)}" data-d="5">+5</button></div>`; }).join('') || '<p class="muted small">Aucun adversaire.</p>'}
        <div class="stp-l" style="margin-top:10px">Points de vie au fil des tours</div>
        ${sparkline(p.hist) || '<p class="muted small">Pas encore de changement.</p>'}
      </div>
    </div>
  </div>`;
}

function setupHtml() {
  const g = gameState;
  return `<details class="game-setup" ${setupOpen ? 'open' : ''}><summary>⚙ Joueurs et options</summary>
    <div class="row">
      <label class="inline">Joueurs <select id="nbPlayers">${[2, 3, 4, 5, 6].map(k => `<option ${k === g.players.length ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
      <label class="inline">Points de vie de départ <select id="startLife">${START_LIFE.map(k => `<option ${k === g.start ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
      <button id="newGame" class="btn">Nouvelle partie</button>
      <span class="muted small">« Nouvelle partie » garde les noms, couleurs et commandants.</span>
    </div>
    <div class="row small">Compteurs en plus : ${Object.entries(EXTRA).map(([k, [label, ic]]) => `<label class="toggle"><input type="checkbox" data-extra="${k}" ${g.extras[k] ? 'checked' : ''}> ${ic} ${label}</label>`).join('')}</div>
    <p class="muted small">Les joueurs sont placés dans le sens du tour (vers la gauche, comme les aiguilles d'une montre) : fond de table de gauche à droite, puis côté proche de droite à gauche. Touche − ou + pour 1 point de vie, maintiens pour 10. Touche un nom pour les détails (commandant, poison, blessures de commandant, taxe…).</p>
  </details>`;
}

let lastRoll = '';
let setupOpen = false;
const fmtTime = (ms) => { const t = Math.max(0, Math.floor(ms / 1000)); const h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, sec = t % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(sec).padStart(2, '0'); };

function renderGame() {
  const g = gameState, root = $('#tab-partie');
  const keepFocus = document.activeElement && document.activeElement.closest('.sheet') && document.activeElement.dataset.f;
  if (keepFocus) return; // ne pas effacer un champ en cours de saisie
  const [far, near] = seatRows(g.players.length);
  root.innerHTML = `${setupHtml()}
    <div class="table-wrap ${g.table ? 'fs' : ''}" style="--cols:${Math.max(far.length, near.length)}">
      <div class="seat-row far-row" style="--n:${far.length}">${far.map(i => seatHtml(i, true)).join('')}</div>
      <div class="game-bar">${barHtml()}</div>
      <div class="seat-row near-row" style="--n:${near.length}">${near.map(i => seatHtml(i, false)).join('')}</div>
      ${g.sel >= 0 && g.sel < g.players.length ? `<div class="sheet-wrap">${sheetHtml(g.sel)}</div>` : ''}
    </div>`;
}

// ---------- Interactions ----------
const rnd = (k) => 1 + Math.floor(crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32 * k);
function mutate(fn) { snap(); fn(); settleDesignations(); saveGame(); renderGame(); }

// Points de vie : toucher = ±1, maintenir ½ seconde = ±10.
let hold = null;
document.addEventListener('pointerdown', (e) => {
  const b = e.target.closest('[data-life]');
  if (!b || !b.closest('#tab-partie')) return;
  e.preventDefault();
  const i = +b.dataset.life, d = +b.dataset.d;
  hold = { i, d, done: false, timer: setTimeout(() => { hold.done = true; mutate(() => changeLife(i, d * 10)); if (navigator.vibrate) navigator.vibrate(15); }, 500) };
});
document.addEventListener('pointerup', () => {
  if (!hold) return;
  clearTimeout(hold.timer);
  if (!hold.done) { const { i, d } = hold; mutate(() => changeLife(i, d)); }
  hold = null;
});
document.addEventListener('pointercancel', () => { if (hold) clearTimeout(hold.timer); hold = null; });

$('#tab-partie').addEventListener('click', (e) => {
  const g = gameState;
  const t = e.target;
  // Clavier (Entrée/Espace) sur les zones − / + : pas de pointerdown.
  const lb = t.closest('[data-life]');
  if (lb) { if (e.detail === 0) mutate(() => changeLife(+lb.dataset.life, +lb.dataset.d)); return; }
  const open = t.closest('[data-open]');
  if (open) { g.sel = g.sel === +open.dataset.open ? -1 : +open.dataset.open; saveGame(); renderGame(); if (g.sel >= 0) setTimeout(() => $('.sheet')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 30); return; }
  if (t.closest('[data-close]')) { g.sel = -1; saveGame(); renderGame(); return; }
  const sheet = t.closest('.sheet');
  if (sheet) {
    const i = +sheet.dataset.i, p = g.players[i];
    const bt = t.closest('button');
    if (!bt) return;
    const d = +bt.dataset.d;
    if (bt.dataset.plife != null) mutate(() => changeLife(i, d));
    else if (bt.dataset.cnt) mutate(() => { p[bt.dataset.cnt] = Math.max(0, p[bt.dataset.cnt] + d); });
    else if (bt.dataset.cast != null) mutate(() => { const k = +bt.dataset.cast; p.casts[k] = Math.max(0, p.casts[k] + d); });
    else if (bt.dataset.cmd) mutate(() => { const cur = p.cmd[bt.dataset.cmd] || 0, nv = Math.max(0, cur + d); p.cmd[bt.dataset.cmd] = nv; if (nv !== cur) changeLife(i, -(nv - cur)); });
    else if (bt.dataset.color) mutate(() => { p.color = bt.dataset.color; });
    else if (bt.dataset.desig) mutate(() => { const k = bt.dataset.desig; g[k] = g[k] === i ? -1 : i; });
    else if (bt.dataset.concede != null) mutate(() => { p.conceded = !p.conceded; });
    return;
  }
  const bar = t.closest('[data-bar]');
  if (bar) {
    const n = g.players.length, act = bar.dataset.bar;
    if (act === 'undo') { undo(); return; }
    if (act === 'table') { g.table = !g.table; saveGame(); renderGame(); tableMode(g.table); return; }
    if (['d6', 'd20', 'coin'].includes(act)) { lastRoll = act === 'coin' ? (rnd(2) === 1 ? 'Pile' : 'Face') : `${act} : ${rnd(+act.slice(1))}`; renderGame(); return; }
    mutate(() => {
      if (act === 'start') Object.assign(g, { turn: 1, first: g.active, gameStart: Date.now(), turnStart: Date.now() });
      if (act === 'next') {
        let i = g.active;
        for (let k = 0; k < n; k++) { i = (i + 1) % n; if (i === g.first) g.turn++; if (!isOut(i)) break; }
        Object.assign(g, { active: i, turnStart: Date.now() });
      }
      if (act === 'first') { const i = rnd(n) - 1; lastRoll = g.players[i].name + ' commence'; if (!g.turn) { g.active = i; g.first = i; } }
      if (act === 'day') g.day = g.day === '' ? 'jour' : g.day === 'jour' ? 'nuit' : '';
    });
    return;
  }
  if (t.id === 'newGame') {
    mutate(() => { const keep = gameState.players; gameState = freshGame(+$('#nbPlayers').value, +$('#startLife').value, keep); gameState.extras = g.extras; gameState.table = g.table; lastRoll = ''; deltas.clear(); });
  }
});
$('#tab-partie').addEventListener('toggle', (e) => { if (e.target.classList.contains('game-setup')) setupOpen = e.target.open; }, true);
$('#tab-partie').addEventListener('change', (e) => {
  const g = gameState, t = e.target;
  if (t.id === 'nbPlayers') mutate(() => { const n = +t.value, P = g.players; while (P.length < n) P.push(newPlayer(P.length, g.start)); P.length = n; if (g.active >= n) g.active = 0; if (g.first >= n) g.first = 0; if (g.sel >= n) g.sel = -1; });
  if (t.id === 'startLife') mutate(() => { g.start = +t.value; if (!g.turn) for (const p of g.players) { p.life = g.start; p.hist = [{ t: 0, life: g.start }]; } });
  if (t.dataset.extra) mutate(() => { g.extras[t.dataset.extra] = t.checked; });
  const sheet = t.closest('.sheet');
  if (sheet && t.dataset.f) {
    const p = g.players[+sheet.dataset.i];
    t.blur();
    mutate(() => { if (t.type === 'checkbox') p[t.dataset.f] = t.checked; else p[t.dataset.f] = t.value.trim() || (t.dataset.f === 'name' ? p.name : ''); });
  }
});
$('#tab-partie').addEventListener('input', debounce(async (e) => {
  if (!e.target.classList.contains('sh-cmd') || !state.loaded) return;
  const q = e.target.value.trim();
  if (q.length < 2) return;
  const list = await juge.commanderCandidates(q);
  $('#cmdList').innerHTML = list.map(c => `<option value="${esc(c.name)}">`).join('');
}, 150));
$('#tab-partie').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('.sheet input:not([type=checkbox])')) e.target.blur(); });
$('#tab-partie').addEventListener('focusout', (e) => { if (e.target.matches('.sheet input[data-f]')) setTimeout(renderGame, 0); });

// Mode table : plein écran, écran maintenu allumé si le navigateur le permet.
let wakeLock = null;
async function tableMode(on) {
  try {
    if (on) { if (document.documentElement.requestFullscreen && !document.fullscreenElement) await document.documentElement.requestFullscreen(); if (navigator.wakeLock) wakeLock = await navigator.wakeLock.request('screen'); }
    else { if (document.fullscreenElement) await document.exitFullscreen(); if (wakeLock) { await wakeLock.release(); wakeLock = null; } }
  } catch {}
}
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && gameState.table) { gameState.table = false; saveGame(); renderGame(); tableMode(false); } });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && gameState.table && navigator.wakeLock) navigator.wakeLock.request('screen').then(w => { wakeLock = w; }).catch(() => {}); });

setInterval(() => {
  if (!gameState.turn || !$('#tTurn')) return;
  $('#tTurn').textContent = fmtTime(Date.now() - gameState.turnStart);
  $('#tGame').textContent = fmtTime(Date.now() - gameState.gameStart);
}, 1000);
renderGame();
