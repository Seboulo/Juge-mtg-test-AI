'use strict';
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

const LEGAL = { legal: ['Légale en Commander', 'legal'], banned: ['Interdite en Commander', 'banned'], not_legal: ['Non légale en Commander', ''], restricted: ['Restreinte', 'banned'] };
const COLORS = { W: 'Blanc', U: 'Bleu', B: 'Noir', R: 'Rouge', G: 'Vert' };

// ---------- Onglets ----------
function showTab(name) {
  $$('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  $$('.panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + name));
  window.scrollTo({ top: 0 });
}
$$('.tab').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));
document.addEventListener('click', (e) => {
  const r = e.target.closest('.rule-ref, .rid');
  if (r) openRule(r.dataset.r);
  const c = e.target.closest('[data-card]');
  if (c) openCardModal(c.dataset.card);
  const cn = e.target.closest('.card-ref');
  if (cn) openCardByName(cn.dataset.name);
});


// ---------- Rendu ----------
function manaHtml(s) {
  return esc(s || '').replace(/\{([^}]+)\}/g, (_, sym) => {
    const cls = /^[WUBRG]$/.test(sym) ? sym : (sym.includes('/') ? 'hybrid' : '');
    const label = sym === 'T' ? '↷' : sym === 'Q' ? '↶' : sym;
    return `<span class="mana ${cls}" title="{${sym}}">${label}</span>`;
  });
}

function inline(s) {
  return s
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[\[([^\]]+)\]\]/g, (_, n) => `<span class="card-ref" data-name="${n}">${n}</span>`)
    .replace(/(^|[^\d.])(\d{3}\.\d{1,3}[a-z]?)(?![\d])/g, (_, p, id) => `${p}<span class="rule-ref" data-r="${id}">${id}</span>`);
}

function markdown(md) {
  md = md.replace(/<think>[\s\S]*?(<\/think>|$)/g, '').trim();
  const lines = esc(md).split('\n');
  let html = '', list = null;
  const close = () => { if (list) { html += `</${list}>`; list = null; } };
  for (const raw of lines) {
    const l = raw.trimEnd();
    let m;
    if ((m = l.match(/^(#{1,4})\s+(.*)$/))) { close(); const lv = Math.min(3, Math.max(2, m[1].length)); html += `<h${lv}>${inline(m[2])}</h${lv}>`; }
    else if ((m = l.match(/^\s*[-*•]\s+(.*)$/))) { if (list !== 'ul') { close(); html += '<ul>'; list = 'ul'; } html += `<li>${inline(m[1])}</li>`; }
    else if ((m = l.match(/^\s*\d+[.)]\s+(.*)$/))) { if (list !== 'ol') { close(); html += '<ol>'; list = 'ol'; } html += `<li>${inline(m[1])}</li>`; }
    else if (!l.trim()) close();
    else { close(); html += `<p>${inline(l)}</p>`; }
  }
  close();
  return html;
}

// Marque les numéros de règles cités qui n'existent pas dans la base (citation à vérifier).
async function verifyRuleRefs(root) {
  const refs = $$('.rule-ref', root);
  if (!refs.length) return; await ready;
  const ok = new Set(await juge.ruleExists([...new Set(refs.map(r => r.dataset.r))]));
  for (const r of refs) if (!ok.has(r.dataset.r)) { r.style.borderBottomStyle = 'dashed'; r.style.color = 'var(--warn)'; r.title = 'Numéro introuvable dans les règles officielles : à vérifier'; }
}
// ---------- Chargement de la base ----------
// Pas d'installation : la base est téléchargée à l'ouverture de la page, puis gardée en cache par le navigateur.
const state = { status: {}, settings: null, loaded: false };
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : 'inconnue';
async function refreshStatus() {
  const s = state.status = await juge.status();
  state.loaded = s.loaded;
  $('#dbStatus').innerHTML = s.loaded
    ? `<b>${s.cards.toLocaleString('fr-FR')}</b> cartes · <b>${s.rules.toLocaleString('fr-FR')}</b> règles<br>${s.rulingsLoaded ? `<b>${s.rulingsCards.toLocaleString('fr-FR')}</b> cartes avec rulings` : 'Rulings en cours de chargement…'}<br>Données du ${fmtDate(s.cardsUpdated)}`
    : (s.error ? `<span class="error">Chargement impossible</span>` : 'Chargement de la base…');
  $('#dbDetail').innerHTML = s.loaded
    ? `${s.cards.toLocaleString('fr-FR')} cartes légales ou bannies en Commander, ${s.rulingsLoaded ? s.rulingsCards.toLocaleString('fr-FR') + ' avec rulings officiels' : 'rulings en cours de chargement'}, ${s.rules.toLocaleString('fr-FR')} règles et ${s.glossary} entrées de glossaire, ${s.frCards.toLocaleString('fr-FR')} cartes avec leur texte français.<br>Cartes : ${fmtDate(s.cardsUpdated)} · Règles complètes : ${esc(s.rulesVersion || '')}`
    : 'Chargement…';
}
const ready = new Promise((resolve) => {
  juge.onProgress(({ msg, pct, rulings, error }) => {
    if (rulings) { refreshStatus(); return; }
    if (error) { $('#loadText').innerHTML = `<span class="error">⚠ ${esc(msg)}</span> <button class="btn sm" id="reload">Réessayer</button>`; $('#reload').onclick = () => location.reload(); refreshStatus(); return; }
    $('#loadText').textContent = msg;
    $('#progressFill').style.width = Math.min(100, pct || 0) + '%';
    if (pct >= 100) { $('#loadBar').hidden = true; refreshStatus().then(resolve); }
  });
});

// ---------- Recherche ----------
$$('.example').forEach(b => b.addEventListener('click', () => { $('#question').value = b.textContent; $('#askForm').requestSubmit(); }));
$('#question').addEventListener('keydown', (e) => {
  if (!$('#cardSuggest').classList.contains('hidden') && ['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(e.key)) return suggestKey(e);
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#askForm').requestSubmit(); }
});

const normTxt = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
function suggestAssistants(q) {
  const n = normTxt(q);
  return ASSISTANTS.filter(a => a.keywords.some(k => k.split('+').every(part => n.includes(part)))).slice(0, 3);
}

$('#askForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const question = $('#question').value.trim();
  if (!question) return;
  hideSuggest();
  if (!state.loaded) { $('#askBtn').disabled = true; $('#askBtn').textContent = 'Chargement…'; await ready; $('#askBtn').disabled = false; $('#askBtn').textContent = 'Rechercher'; }
  const c = await juge.consult(question);
  const conv = $('#conversation');
  const best = c.faq[0];
  let html = `<div class="qa" data-q="${esc(question)}" data-fiche="${esc(best && c.faqConfident ? best.q : '')}" data-sure="${best && c.faqConfident ? 1 : 0}"><div class="q-bubble">${esc(question)}</div><div class="a-block">`;
  html += `<div class="ai-bar"><button class="btn ai-go">✨ Réponse rédigée par l'IA</button><a class="btn ask-claude" href="https://claude.ai/new" target="_blank" rel="noopener">💬 Demander à Claude</a><span class="muted small ai-note"></span></div><div class="ai-answer" hidden></div>`;
  html += detectNote(c);
  html += interHtml(c.interactions, c.cards.length);
  if (best && c.faqConfident) {
    html += `<div class="best"><span class="tag">Fiche la plus proche</span><h2>${esc(best.q)}</h2><p>${inline(esc(best.a))}</p>${best.rules.length ? `<p class="small muted">Règles : ${best.rules.map(r => `<span class="rule-ref" data-r="${r}">${r}</span>`).join(', ')}</p>` : ''}</div>`;
  } else {
    html += `<p class="muted">Aucune fiche ne correspond exactement à ta question. Voici ce que la base contient de plus proche.</p>`;
  }
  const assists = suggestAssistants(question);
  if (assists.length) html += '<h4>Assistants guidés</h4><div class="pill-row">' + assists.map(a => `<button class="pill go-assist" data-a="${a.id}">${a.icon} ${esc(a.title)}</button>`).join('') + '</div>';
  const others = c.faq.slice(best && c.faqConfident ? 1 : 0);
  if (others.length) html += '<h4>Autres fiches</h4>' + others.map(f => `<details class="faq-hit"><summary><strong>${esc(f.q)}</strong></summary><p>${inline(esc(f.a))}</p>${f.rules.length ? `<p class="small muted">Règles : ${f.rules.map(r => `<span class="rule-ref" data-r="${r}">${r}</span>`).join(', ')}</p>` : ''}</details>`).join('');
  if (c.cards.length) html += '<h4>Cartes citées : texte Oracle et rulings officiels</h4>' + c.cards.map(k => `<details class="faq-hit" ${c.cards.length <= 2 ? 'open' : ''}><summary><strong>${esc(k.name)}</strong>${k.nameFr ? ' · ' + esc(k.nameFr) : ''} <span class="muted small">${k.rulings.length} ruling(s)</span></summary>${cardHtml(k, true)}</details>`).join('');
  if (c.unknown.length) html += `<p class="small muted">Introuvable dans la base : ${c.unknown.map(esc).join(', ')} (essaie le nom anglais, ou mets le nom entre [[ ]]).</p>`;
  const rules = c.rules.filter(r => !r.glossary).slice(0, 10);
  if (rules.length) html += '<h4>Règles concernées</h4><div class="pill-row">' + rules.map(r => `<button class="pill rule-ref" data-r="${esc(r.id)}" title="${esc(r.text.slice(0, 200))}">${esc(r.id)} ${esc((r.section || '').slice(0, 30))}</button>`).join('') + '</div>';
  html += `<div class="report"><button class="linkish report-open">👎 Pas la bonne réponse ?</button><div class="report-form" hidden><label>Le problème<select><option>La fiche ne correspond pas à ma question</option><option>La réponse est fausse</option><option>Une carte a été mal reconnue</option><option>Rien de trouvé alors que c'est une question courante</option><option>Autre</option></select></label><label>Précise si tu veux (la bonne réponse, la carte en cause…)<textarea rows="2"></textarea></label><button class="btn primary sm report-send">Envoyer</button></div></div>`;
  html += '</div></div>';
  $('.welcome')?.remove();
  conv.insertAdjacentHTML('afterbegin', html);
  conv.firstElementChild.scrollIntoView({ block: 'start', behavior: 'smooth' });
  verifyRuleRefs(conv.firstElementChild);
  $('#question').value = '';
  if (aiReady() && state.settings.aiAuto !== false) startAi(conv.firstElementChild);
});

const refs = (rules) => rules.map(r => `<span class="rule-ref" data-r="${r}">${r}</span>`).join(', ');

// Cartes reconnues : fautes corrigées, noms ambigus (avec les autres choix possibles).
function detectNote(c) {
  const parts = [];
  for (const t of c.typos || []) parts.push(`« ${esc(t.said)} » compris comme <b>${esc(t.name)}</b>.`);
  for (const a of c.ambiguous || []) parts.push(`« ${esc(a.said)} » : j'ai pris <b>${esc(a.chosen)}</b>. Autre choix : ${a.options.slice(0, 4).map(o => `<button class="pill re-ask" data-said="${esc(a.said)}" data-name="${esc(o)}">${esc(o)}</button>`).join(' ')}`);
  return parts.length ? `<div class="detect-note small">${parts.map(p => `<div>${p}</div>`).join('')}</div>` : '';
}

function interHtml(it, nCards) {
  if (!it) return '';
  let h = '';
  if (it.points.length) {
    h += `<div class="inter"><span class="tag">${nCards > 1 ? 'Interaction entre les cartes' : 'Ce que disent les règles'}</span>`
      + it.points.map(p => `<div class="ipoint"><h3>${esc(p.title)}</h3><p>${inline(esc(p.text))}</p><p class="small muted">Règles : ${refs(p.rules)}</p></div>`).join('');
  } else if (nCards > 1) {
    h += `<div class="inter"><span class="tag">Interaction entre les cartes</span><p class="muted">Aucune interaction particulière détectée automatiquement entre ces cartes : chacune fonctionne normalement selon son texte. Voici, ci-dessous, ce que fait chacune côté règles et leurs rulings officiels.</p>`;
  } else return '';
  const roles = it.perCard.filter(x => x.roles.length);
  if (roles.length) h += `<details class="roles" ${it.points.length ? '' : 'open'}><summary>Ce que fait chaque carte, côté règles</summary>` + roles.map(x => `<div class="role-card"><b>${esc(x.name)}</b><ul>${x.roles.map(r => `<li>${esc(r.label)} <span class="small muted">(${refs(r.rules)})</span></li>`).join('')}</ul></div>`).join('') + '</details>';
  if (it.rulings.length) h += `<details class="roles" open><summary>Rulings officiels liés à cette interaction</summary>` + it.rulings.map(x => `<div class="role-card"><b>${esc(x.name)}</b><ul>${x.list.map(r => `<li><span class="muted small">${esc(r.d)}</span> ${trBlock(esc(r.t))}</li>`).join('')}</ul></div>`).join('') + '</details>';
  return h + '</div>';
}

document.addEventListener('click', (e) => {
  const r = e.target.closest('.re-ask');
  if (!r) return;
  const lastQ = r.closest('.qa').dataset.q;
  const re = new RegExp(r.dataset.said.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  let q = lastQ.replace(/\[\[[^\]]*\]\]/g, (m) => m.toLowerCase().includes(r.dataset.said.toLowerCase()) ? `[[${r.dataset.name}]]` : m);
  if (q === lastQ) q = re.test(q) ? q.replace(re, `[[${r.dataset.name}]]`) : `${q} [[${r.dataset.name}]]`;
  $('#question').value = q;
  $('#askForm').requestSubmit();
});
document.addEventListener('click', (e) => {
  const b = e.target.closest('.go-assist');
  if (b) { showTab('assist'); openAssistant(b.dataset.a); }
});

// Autocomplétion des noms de cartes après « [[ ».
let suggestItems = [], suggestSel = 0;
$('#question').addEventListener('input', debounce(async () => {
  const ta = $('#question');
  const before = ta.value.slice(0, ta.selectionStart);
  const m = before.match(/\[\[([^\]\[]{2,})$/);
  if (!m || !state.loaded) return hideSuggest();
  suggestItems = await juge.searchCards(m[1]);
  if (!suggestItems.length) return hideSuggest();
  suggestSel = 0;
  drawSuggest();
}, 120));
function drawSuggest() {
  const box = $('#cardSuggest');
  box.innerHTML = suggestItems.slice(0, 10).map((c, i) => `<div data-i="${i}" class="${i === suggestSel ? 'sel' : ''}">${esc(c.name)}${c.nameFr ? ` <span class="muted">· ${esc(c.nameFr)}</span>` : ''}</div>`).join('');
  box.classList.remove('hidden');
  $$('div', box).forEach(d => d.addEventListener('mousedown', (e) => { e.preventDefault(); pickSuggest(+d.dataset.i); }));
}
function hideSuggest() { $('#cardSuggest').classList.add('hidden'); suggestItems = []; }
function suggestKey(e) {
  e.preventDefault();
  if (e.key === 'Escape') return hideSuggest();
  if (e.key === 'ArrowDown') suggestSel = Math.min(suggestSel + 1, Math.min(9, suggestItems.length - 1));
  else if (e.key === 'ArrowUp') suggestSel = Math.max(0, suggestSel - 1);
  else return pickSuggest(suggestSel);
  drawSuggest();
}
function pickSuggest(i) {
  const ta = $('#question'), c = suggestItems[i];
  const pos = ta.selectionStart;
  const before = ta.value.slice(0, pos).replace(/\[\[[^\]\[]*$/, `[[${c.name}]]`);
  let after = ta.value.slice(pos);
  if (after.startsWith(']]')) after = after.slice(2);
  ta.value = before + after;
  ta.selectionStart = ta.selectionEnd = before.length;
  hideSuggest();
  ta.focus();
}

// ---------- IA en ligne (clé gratuite de chacun) et « Demander à Claude » ----------
// La clé reste dans ce navigateur (localStorage) et n'est envoyée qu'au service d'IA choisi.
const CONFIG = window.JUGE_CONFIG || {};
const readSettings = () => { try { return JSON.parse(localStorage.getItem('juge-parametres')) || {}; } catch { return {}; } };
state.settings = readSettings();
const saveSettingsObj = (s) => { state.settings = s; try { localStorage.setItem('juge-parametres', JSON.stringify(s)); } catch {} };
const aiReady = () => !!(state.settings.aiProvider && state.settings.aiKey);

async function startAi(qa) {
  const box = $('.ai-answer', qa), go = $('.ai-go', qa);
  box.hidden = false;
  if (!aiReady()) {
    box.innerHTML = `<p class="muted small">Aucune IA configurée. Ajoute une clé gratuite (Google Gemini ou Groq) dans <a href="#" class="go-params">Paramètres</a> : deux minutes, une seule fois. Ou utilise « 💬 Demander à Claude ».</p>`;
    return;
  }
  if (go.ctrl) { go.ctrl.abort(); return; }
  const ctrl = go.ctrl = new AbortController();
  let text = '';
  const draw = (tail) => { box.innerHTML = '<span class="tag">Réponse rédigée par l\'IA</span>' + (text ? markdown(text) : '<p class="thinking">L\'IA lit les règles trouvées…</p>') + (tail || ''); };
  draw();
  go.textContent = '■ Arrêter';
  try {
    await juge.aiAsk(state.settings, qa.dataset.q, (piece) => { text += piece; draw('<p class="thinking"></p>'); }, ctrl.signal,
      (m) => saveSettingsObj({ ...state.settings, aiModel: m }));
    draw('<p class="muted small">Générée par une IA à partir des fiches et des règles ci-dessous : vérifie les numéros de règles en cliquant dessus.</p>');
    verifyRuleRefs(box);
  } catch (e) {
    draw(ctrl.signal.aborted ? '<p class="muted small">Réponse interrompue.</p>' : `<p class="error">⚠ ${esc(e.message)}</p>`);
  }
  go.ctrl = null;
  go.textContent = '↻ Relancer l\'IA';
}
document.addEventListener('click', async (e) => {
  const go = e.target.closest('.ai-go');
  if (go) { e.preventDefault(); startAi(go.closest('.qa')); return; }
  const cl = e.target.closest('.ask-claude');
  if (cl) {
    // Le lien s'ouvre de lui-même (target=_blank) ; on copie la question avec les règles trouvées.
    const qa = cl.closest('.qa');
    try { await navigator.clipboard.writeText(juge.claudeCopyPrompt(qa.dataset.q)); $('.ai-note', qa).textContent = 'Question et règles copiées : colle-les dans Claude qui vient de s\'ouvrir.'; }
    catch { $('.ai-note', qa).textContent = 'Copie impossible : pose ta question directement dans Claude.'; }
    return;
  }
  if (e.target.closest('.go-params')) { e.preventDefault(); showTab('apropos'); }
});

// ---------- « Pas la bonne réponse ? » ----------
// Le site n'a pas de serveur : le signalement est gardé sur l'appareil, et peut être envoyé
// sur GitHub (formulaire pré-rempli) ou copié pour l'envoyer par message.
const readReports = () => { try { return JSON.parse(localStorage.getItem('juge-signalements')) || []; } catch { return []; } };
const reportText = (r) => `Question : ${r.question}\nFiche affichée : ${r.fiche || '(aucune)'}${r.sure ? ' (présentée comme sûre)' : ''}\nProblème : ${r.probleme}${r.commentaire ? '\nPrécision : ' + r.commentaire : ''}`;
document.addEventListener('click', async (e) => {
  const open = e.target.closest('.report-open');
  if (open) { const f = $('.report-form', open.closest('.qa')); f.hidden = !f.hidden; if (!f.hidden) $('textarea', f).focus(); return; }
  const send = e.target.closest('.report-send');
  if (!send) return;
  const qa = send.closest('.qa'), form = $('.report-form', qa);
  const report = { question: qa.dataset.q, fiche: qa.dataset.fiche || '', sure: qa.dataset.sure === '1', probleme: $('select', form).value, commentaire: $('textarea', form).value.trim(), date: new Date().toISOString() };
  try { localStorage.setItem('juge-signalements', JSON.stringify([report, ...readReports()].slice(0, 200))); } catch {}
  const text = reportText(report);
  const gh = CONFIG.repo ? `https://github.com/${CONFIG.repo}/issues/new?title=${encodeURIComponent('Signalement : ' + report.question.slice(0, 80))}&body=${encodeURIComponent(text)}&labels=signalement` : '';
  form.innerHTML = `<p class="ok-t small">Merci, c'est noté.</p><div class="row">${gh ? `<a class="btn sm" href="${esc(gh)}" target="_blank" rel="noopener">Envoyer sur GitHub ↗</a>` : ''}<button class="btn sm report-copy">Copier pour l'envoyer par message</button></div>`;
  $('.report-copy', form).onclick = async (ev) => { try { await navigator.clipboard.writeText(text); ev.target.textContent = 'Copié ✓'; } catch { ev.target.textContent = 'Copie impossible'; } };
  renderReports();
});

// ---------- Traduction (IA configurée, sinon Google Traduction) ----------
function trBlock(inner, label = '') {
  return `<div class="trx">${label ? `<div class="tr-label">${esc(label)}</div>` : ''}<div class="tr-src">${inner}</div><button class="tr-btn" title="Traduire en français">🌐 Traduire</button><div class="tr-out"></div></div>`;
}
const trCache = (() => { try { return JSON.parse(localStorage.getItem('juge-traductions')) || {}; } catch { return {}; } })();
const saveTr = () => { try { localStorage.setItem('juge-traductions', JSON.stringify(trCache)); } catch {} };
async function translate(text) {
  if (trCache[text]) return { text: trCache[text] };
  if (!aiReady()) return { link: 'https://translate.google.com/?sl=en&tl=fr&op=translate&text=' + encodeURIComponent(text) };
  try {
    const t = (await juge.aiTranslate(state.settings, text)).trim();
    if (t) { trCache[text] = t; saveTr(); }
    return { text: t };
  } catch (e) { return { error: e.message, link: 'https://translate.google.com/?sl=en&tl=fr&op=translate&text=' + encodeURIComponent(text) }; }
}
document.addEventListener('click', async (e) => {
  const b = e.target.closest('.tr-btn');
  if (!b) return;
  const box = b.closest('.trx'), out = $('.tr-out', box);
  const text = $('.tr-src', box).innerText.trim();
  if (!text) return;
  if (out.innerHTML) { out.innerHTML = ''; b.textContent = '🌐 Traduire'; return; }
  b.disabled = true; b.textContent = '…';
  const r = await translate(text);
  b.disabled = false;
  if (r.text) {
    out.innerHTML = `<div class="tr-fr">${manaHtml(r.text)}</div><div class="muted small">Traduction automatique par l'IA : en cas de doute, le texte anglais fait foi.</div>`;
    b.textContent = '🌐 Masquer';
  } else {
    b.textContent = '🌐 Traduire';
    out.innerHTML = r.link ? `<a href="${esc(r.link)}" target="_blank" rel="noopener">Ouvrir dans Google Traduction ↗</a>` : `<div class="error small">${esc(r.error)}</div>`;
  }
});

// ---------- Cartes ----------
async function cardSearch() {
  const q = $('#cardSearch').value.trim();
  if (!q) { $('#cardResults').innerHTML = ''; return; }
  if (!state.loaded) { $('#cardResults').innerHTML = '<li class="muted">Base en cours de chargement…</li>'; return; }
  renderCardList(await juge.searchCards(q));
}
function renderCardList(list) {
  $('#cardResults').innerHTML = list.length ? list.map(c => `<li data-id="${esc(c.id)}">${esc(c.name)}${c.nameFr ? ` <span class="muted">· ${esc(c.nameFr)}</span>` : ''}<small>${manaHtml(c.mana)} ${esc(c.type)}</small></li>`).join('')
    : '<li class="muted">Aucun résultat. Pour un nom français, utilise « Chercher le nom français en ligne ».</li>';
  $$('#cardResults li[data-id]').forEach(li => li.addEventListener('click', async () => {
    $$('#cardResults li').forEach(x => x.classList.remove('sel'));
    li.classList.add('sel');
    $('#cardDetail').innerHTML = cardHtml(await juge.getCard(li.dataset.id));
  }));
}
$('#cardSearch').addEventListener('input', debounce(cardSearch, 150));
$('#cardFrBtn').addEventListener('click', async () => {
  const q = $('#cardSearch').value.trim();
  if (!q) return;
  $('#cardResults').innerHTML = '<li class="muted">Recherche sur Scryfall…</li>';
  let r = [];
  try { await ready; r = await juge.lookupFrench(q); } catch {}
  if (!r.length) $('#cardResults').innerHTML = '<li class="muted">Aucun résultat en ligne (connexion internet nécessaire).</li>';
  else renderCardList(r);
});

function cardHtml(c, compact = false) {
  if (!c) return '<p class="muted">Carte introuvable.</p>';
  const [label, cls] = LEGAL[c.cmdr] || [c.cmdr, ''];
  const ci = c.ci.length ? c.ci.map(x => `<span class="mana ${x}" title="${COLORS[x]}">${x}</span>`).join('') : 'Incolore';
  return `${compact ? `<div style="text-align:right">${manaHtml(c.mana)}</div>` : `<div class="card-title"><h2>${esc(c.name)}</h2><div>${manaHtml(c.mana)}</div></div>`}
    ${c.nameFr ? `<div class="fr-name">${esc(c.nameFr)}</div>` : ''}
    <div class="card-type">${c.typeFr ? esc(c.typeFr) + ' · ' : ''}<span class="muted">${esc(c.type)}</span></div>
    ${c.textFr ? `<div class="oracle fr">${manaHtml(c.textFr)}${c.pt ? `\n\n<strong>${esc(c.pt)}</strong>` : ''}</div><p class="muted small">Texte français imprimé (traduction officielle). Il peut être moins à jour que le texte Oracle anglais ci-dessous, qui fait foi.</p>` : ''}
    ${trBlock(`<div class="oracle">${manaHtml(c.text) || '<span class="muted">(pas de texte)</span>'}${c.pt && !c.textFr ? `\n\n<strong>${esc(c.pt)}</strong>` : ''}${c.loyalty ? `\n\nLoyauté : ${esc(c.loyalty)}` : ''}</div>`, c.text ? 'Texte Oracle (anglais, à jour)' : '')}
    <div class="badges"><span class="badge ${cls}">${label}</span><span class="badge">Identité couleur : ${ci}</span>${c.canCommand ? '<span class="badge legal">Peut être commandant</span>' : ''}${c.gc ? '<span class="badge gc">Game Changer</span>' : ''}</div>
    <div class="rulings"><h3>Rulings officiels (${c.rulings.length})${c.rulings.length ? ' <span class="muted small">en anglais</span>' : ''}</h3>
    ${c.rulings.length ? '<ul>' + c.rulings.map(r => `<li><span class="date">${esc(r.d)}</span>${trBlock(`<span>${manaHtml(r.t)}</span>`)}</li>`).join('') + '</ul>' : '<p class="muted">Aucun ruling publié pour cette carte.</p>'}</div>
    ${compact ? '' : `<p><button class="btn ask-about" data-name="${esc(c.name)}">Rechercher une question sur cette carte</button></p>`}`;
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('.ask-about');
  if (!b) return;
  closeModal(); showTab('juge');
  const ta = $('#question');
  ta.value = `[[${b.dataset.name}]] `; ta.focus();
});
async function openCardModal(id) { openModal(cardHtml(await juge.getCard(id))); }
async function openCardByName(name) {
  const r = await juge.searchCards(name);
  const exact = r.find(c => c.name.toLowerCase() === name.toLowerCase() || (c.nameFr || '').toLowerCase() === name.toLowerCase()) || r[0];
  if (exact) openCardModal(exact.id); else openModal(`<p class="muted">Carte « ${esc(name)} » introuvable dans la base.</p>`);
}

// ---------- Règles ----------
function ruleHtml(r, withSection = true) {
  return `<div class="rule ${r.title ? 'title' : ''}">${withSection && r.section ? `<span class="sec">${esc(r.id.slice(0, 3))}. ${esc(r.section)}</span>` : ''}<span class="rid" data-r="${esc(r.id)}">${esc(r.id)}</span>${r.title ? inline(esc(r.text)) : trBlock(`<span>${inline(esc(r.text))}</span>`)}</div>`;
}
async function ruleSearch(q) {
  q = (q ?? $('#ruleSearch').value).trim();
  if (!q) { $('#ruleResults').innerHTML = ''; return; }
  if (!state.loaded) { $('#ruleResults').innerHTML = '<p class="muted">Règles en cours de chargement…</p>'; return; }
  const res = await juge.searchRules(q);
  $('#ruleResults').innerHTML = res.length ? res.map(r => r.glossary
    ? `<div class="rule title"><span class="sec">Glossaire</span>${esc(r.term)}\n<span style="font-weight:400">${inline(esc(r.text))}</span></div>`
    : ruleHtml(r)).join('') : '<p class="muted">Aucune règle trouvée.</p>';
}
$('#ruleSearch').addEventListener('input', debounce(() => ruleSearch(), 200));
$$('#ruleChips button').forEach(b => b.addEventListener('click', () => { $('#ruleSearch').value = b.dataset.r; ruleSearch(b.dataset.r); }));
async function openRule(id) {
  if (!state.loaded) return openModal('<p class="muted">Les règles sont encore en cours de chargement, réessaie dans quelques secondes.</p>');
  const r = await juge.getRule(id);
  if (!r) return openModal(`<p class="error">La règle ${esc(id)} n'existe pas dans la version installée des Comprehensive Rules.</p><p class="muted">Si elle a été citée par l'IA, c'est probablement une erreur de numéro : cherche le sujet dans l'onglet Règles.</p>`);
  openModal(`<h2 style="color:var(--gold2);margin-top:0">Règle ${esc(r.id)}</h2>${r.section ? `<p class="muted">${esc(r.id.slice(0, 3))}. ${esc(r.section)}</p>` : ''}${ruleHtml(r, false)}${r.children.map(x => ruleHtml(x, false)).join('')}`);
}

// ---------- FAQ ----------
let faqData = [];
function renderFaq(filter = '') {
  const f = filter.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const n = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  let cat = '', html = '';
  for (const x of faqData) {
    if (f && !n(x.q + ' ' + x.a + ' ' + x.cat).includes(f)) continue;
    if (x.cat !== cat) { cat = x.cat; html += `<div class="faq-cat">${esc(cat)}</div>`; }
    html += `<details class="faq"><summary>${esc(x.q)}</summary><p>${inline(esc(x.a))}</p>${x.rules.length ? `<p class="small muted">Règles : ${x.rules.map(r => `<span class="rule-ref" data-r="${r}">${r}</span>`).join(', ')}</p>` : ''}</details>`;
  }
  $('#faqList').innerHTML = html || '<p class="muted">Aucune fiche ne correspond.</p>';
}
$('#faqSearch').addEventListener('input', debounce(() => renderFaq($('#faqSearch').value), 120));
// ---------- Paramètres de l'IA ----------
function loadSettings() {
  const s = state.settings;
  $('#aiProvider').value = s.aiProvider || '';
  $('#aiKey').value = s.aiKey || '';
  $('#aiModel').value = s.aiModel || '';
  $('#aiBaseUrl').value = s.aiBaseUrl || '';
  $('#aiAuto').checked = s.aiAuto !== false;
  aiFieldsUi();
}
function aiFieldsUi() {
  const p = $('#aiProvider').value;
  $('#aiFields').hidden = !p;
  $('#aiBaseRow').hidden = p !== 'custom';
  const pr = juge.aiPresets[p];
  $('#aiKeyHelp').innerHTML = pr && pr.keyUrl ? `Clé gratuite : connecte-toi sur <a href="${pr.keyUrl}" target="_blank" rel="noopener">${pr.keyUrl.replace('https://', '')}</a>, crée une clé et colle-la ici. Modèle par défaut : ${esc(pr.model)}.` : '';
}
const saveAi = () => saveSettingsObj({ ...state.settings, aiProvider: $('#aiProvider').value, aiKey: $('#aiKey').value.trim(), aiModel: $('#aiModel').value.trim(), aiBaseUrl: $('#aiBaseUrl').value.trim(), aiAuto: $('#aiAuto').checked });
$('#aiProvider').addEventListener('change', () => { aiFieldsUi(); saveAi(); });
$('#aiAuto').addEventListener('change', saveAi);
$('#aiSave').addEventListener('click', async () => {
  saveAi();
  if (!aiReady()) { $('#aiMsg').textContent = 'Choisis un service et colle ta clé.'; return; }
  $('#aiMsg').textContent = 'Test en cours…';
  try {
    const t = await juge.aiTranslate(state.settings, 'The commander tax increases each time you cast your commander from the command zone.');
    $('#aiMsg').textContent = t ? `✓ L'IA répond : « ${t.trim()} »` : 'Réponse vide : vérifie le modèle.';
    $('#aiModel').value = state.settings.aiModel || '';
  } catch (e) { $('#aiMsg').textContent = '⚠ ' + e.message; }
});
$('#aiForget').addEventListener('click', () => { saveSettingsObj({ ...state.settings, aiKey: '' }); $('#aiKey').value = ''; $('#aiMsg').textContent = 'Clé effacée de ce navigateur.'; });

// ---------- À propos et signalements ----------
function renderReports() {
  const list = readReports();
  $('#reportList').innerHTML = list.length
    ? '<ul>' + list.slice(0, 30).map(r => `<li><b>${esc(r.question)}</b><br><span class="muted small">${new Date(r.date).toLocaleString('fr-FR')} · ${esc(r.probleme)}${r.fiche ? ' · fiche « ' + esc(r.fiche) + ' »' : ''}</span>${r.commentaire ? `<br>${esc(r.commentaire)}` : ''}</li>`).join('') + '</ul>'
    : '<p class="muted small">Aucun signalement envoyé depuis cet appareil.</p>';
}

// ---------- Assistants guidés ----------
function renderAssistMenu() {
  $('#assistMenu').innerHTML = '<h1 class="page-title">Assistants guidés</h1><p class="muted">Réponds à quelques questions : l\'assistant te mène à la règle qui s\'applique, avec les numéros de règles officiels.</p><div class="assist-cards">'
    + ASSISTANTS.map(a => `<button class="assist-card" data-a="${a.id}"><span class="ai">${a.icon}</span><strong>${esc(a.title)}</strong><span class="muted small">${esc(a.desc)}</span></button>`).join('') + '</div>';
  $$('.assist-card').forEach(b => b.addEventListener('click', () => openAssistant(b.dataset.a)));
}
let assistPath = [];
function openAssistant(id) {
  const a = ASSISTANTS.find(x => x.id === id);
  if (!a) return;
  $('#assistMenu').classList.add('hidden');
  const v = $('#assistView');
  v.classList.remove('hidden');
  v.dataset.id = id;
  if (a.tool === 'apnap') return renderApnap(v, a);
  if (a.tool === 'layers') return renderLayers(v, a);
  assistPath = [a.start];
  renderTree();
}
function closeAssistant() { $('#assistView').classList.add('hidden'); $('#assistMenu').classList.remove('hidden'); }
function assistHead(a) { return `<div class="assist-head"><button class="btn back-assist">← Tous les assistants</button><h2>${a.icon} ${esc(a.title)}</h2></div>`; }
function renderTree() {
  const v = $('#assistView'), a = ASSISTANTS.find(x => x.id === v.dataset.id);
  let html = assistHead(a) + '<div class="steps">';
  assistPath.forEach((nodeId, i) => {
    const n = a.nodes[nodeId];
    const last = i === assistPath.length - 1;
    if (n.q) {
      const chosen = assistPath[i + 1];
      html += `<div class="step"><div class="step-q">${inline(esc(n.q))}</div><div class="opts">` + n.opts.map(([label, next]) =>
        `<button class="opt ${chosen === next ? 'chosen' : ''} ${!last && chosen !== next ? 'dim' : ''}" data-i="${i}" data-next="${next}">${esc(label)}</button>`).join('') + '</div></div>';
    } else {
      html += `<div class="step answer ${n.tone || ''}"><p>${inline(esc(n.answer))}</p>${n.rules ? `<p class="small muted">Règles : ${n.rules.map(r => `<span class="rule-ref" data-r="${r}">${r}</span>`).join(', ')}</p>` : ''}</div>`;
      if (n.next && last) { assistPath.push(n.next); return renderTree(); }
    }
  });
  html += '</div><div class="row"><button class="btn restart-assist">Recommencer</button></div>';
  v.innerHTML = html;
  $$('.opt', v).forEach(b => b.addEventListener('click', () => { assistPath = assistPath.slice(0, +b.dataset.i + 1).concat(b.dataset.next); renderTree(); }));
  $('.restart-assist', v).addEventListener('click', () => { assistPath = [a.start]; renderTree(); });
  $('.back-assist', v).addEventListener('click', closeAssistant);
  verifyRuleRefs(v);
  v.lastElementChild.previousElementSibling.lastElementChild?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

// Outil APNAP : ordre de mise sur la pile et de résolution.
function renderApnap(v, a) {
  const names = gameState.players.map(p => p.name);
  v.innerHTML = assistHead(a) + `<div class="card-box wide"><p class="muted small">Quand des capacités de plusieurs joueurs se déclenchent en même temps, le <b>joueur actif</b> met d'abord toutes les siennes sur la pile (dans l'ordre de son choix), puis chaque autre joueur dans l'ordre du tour (règle <span class="rule-ref" data-r="603.3b">603.3b</span>). La dernière mise sur la pile se résout la première.</p>
    <label class="inline">Joueur actif <select id="apActive">${names.map((n, i) => `<option value="${i}">${esc(n)}</option>`).join('')}</select></label>
    <div class="ap-grid">${names.map((n, i) => `<label>${esc(n)} : ses capacités déclenchées, une par ligne, dans l'ordre où il les met sur la pile<textarea class="ap-in" data-i="${i}" rows="3" placeholder="ex. Blood Artist"></textarea></label>`).join('')}</div>
    <button id="apGo" class="btn primary">Calculer l'ordre</button><div id="apOut"></div></div>`;
  $('.back-assist', v).addEventListener('click', closeAssistant);
  $('#apGo').addEventListener('click', () => {
    const act = +$('#apActive').value, n = names.length;
    const put = [];
    for (let k = 0; k < n; k++) {
      const i = (act + k) % n;
      const lines = $(`.ap-in[data-i="${i}"]`).value.split('\n').map(x => x.trim()).filter(Boolean);
      lines.forEach(l => put.push({ who: names[i], what: l }));
    }
    if (!put.length) { $('#apOut').innerHTML = '<p class="muted">Ajoute au moins une capacité.</p>'; return; }
    $('#apOut').innerHTML = `<div class="ap-res"><div><h4>Mise sur la pile</h4><ol>${put.map(x => `<li><b>${esc(x.who)}</b> : ${esc(x.what)}</li>`).join('')}</ol></div>
      <div><h4>Résolution (du haut de la pile vers le bas)</h4><ol>${put.slice().reverse().map(x => `<li><b>${esc(x.who)}</b> : ${esc(x.what)}</li>`).join('')}</ol></div></div>
      <p class="small muted">Chaque joueur reçoit la priorité entre deux résolutions et peut répondre. Une capacité qui se déclenche pendant une résolution sera mise sur la pile par-dessus les autres, avant la résolution suivante.</p>`;
  });
  verifyRuleRefs(v);
}

// Calculateur de couches.
function renderLayers(v, a) {
  v.innerHTML = assistHead(a) + `<div class="card-box wide"><p class="muted small">Ajoute chaque effet continu qui touche le permanent, <b>dans l'ordre où il a commencé</b> (horodatage : le plus ancien en premier). L'outil donne l'ordre d'application (règle <span class="rule-ref" data-r="613.1">613.1</span>).</p>
    <div id="lyRows"></div><div class="row"><button id="lyAdd" class="btn">+ Ajouter un effet</button><button id="lyEx" class="btn">Exemple : Blood Moon + Urborg</button><button id="lyGo" class="btn primary">Calculer l'ordre</button></div><div id="lyOut"></div></div>`;
  $('.back-assist', v).addEventListener('click', closeAssistant);
  const refreshDeps = () => {
    const rows = $$('.ly-row');
    rows.forEach((r, i) => {
      const sel = $('.ly-dep', r), cur = sel.value;
      sel.innerHTML = '<option value="">Ne dépend d\'aucun effet</option>' + rows.map((x, j) => j === i ? '' : `<option value="${j}">Dépend de l'effet ${j + 1}</option>`).join('');
      if ([...sel.options].some(o => o.value === cur)) sel.value = cur;
      $('.ly-n', r).textContent = i + 1;
    });
  };
  const addRow = (desc = '', layer = '7c', dep = '') => {
    $('#lyRows').insertAdjacentHTML('beforeend', `<div class="ly-row row"><b class="ly-n"></b><input type="text" class="ly-d" placeholder="Effet (ex. Giant Growth +3/+3)" value="${esc(desc)}"><select class="ly-l">${LAYERS.map(([k, l]) => `<option value="${k}" ${k === layer ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select><select class="ly-dep"></select><button class="btn ly-x">✕</button></div>`);
    $$('.ly-x').forEach(b => b.onclick = () => { b.parentElement.remove(); refreshDeps(); });
    refreshDeps();
    if (dep !== '') $('.ly-row:last-child .ly-dep').value = dep;
  };
  addRow(); addRow();
  $('#lyAdd').addEventListener('click', () => addRow());
  $('#lyEx').addEventListener('click', () => { $('#lyRows').innerHTML = ''; addRow('Urborg : chaque terrain est un Marais en plus de ses autres types', '4', '1'); addRow('Blood Moon : les terrains non-base sont des Montagnes', '4'); $('.ly-row .ly-dep').value = '1'; });
  $('#lyGo').addEventListener('click', () => {
    const effs = $$('.ly-row').map((r, i) => ({ d: $('.ly-d', r).value.trim() || `Effet ${i + 1}`, l: $('.ly-l', r).value, ts: i + 1, dep: $('.ly-dep', r).value === '' ? null : +$('.ly-dep', r).value + 1 }));
    const order = LAYERS.map(x => x[0]);
    // Dans chaque couche : horodatage, sauf qu'un effet attend que l'effet dont il dépend (même couche) soit appliqué.
    const sorted = [];
    for (const l of order) {
      const left = effs.filter(e => e.l === l).sort((x, y) => x.ts - y.ts);
      while (left.length) {
        const ready = left.find(e => !e.dep || !left.some(o => o.ts === e.dep)) || left[0];
        if (ready.dep && left.some(o => o.ts === ready.dep)) ready.loop = true;
        sorted.push(ready); left.splice(left.indexOf(ready), 1);
      }
    }
    const sameLayer = order.filter(l => effs.filter(e => e.l === l).length > 1);
    $('#lyOut').innerHTML = `<h4>Ordre d'application</h4><ol>${sorted.map(e => `<li><span class="badge">Couche ${e.l}</span> ${esc(e.d)} <span class="muted small">(effet ${e.ts}${e.dep ? `, dépend de l'effet ${e.dep}` : ''})</span>${e.loop ? ' <span class="error small">boucle de dépendances : on revient à l\'horodatage</span>' : ''}</li>`).join('')}</ol>`
      + (sameLayer.length ? `<div class="step answer warn"><p><b>As-tu vérifié les dépendances ?</b> (couche${sameLayer.length > 1 ? 's' : ''} ${sameLayer.join(', ')}) L'ordre par horodatage ne s'applique que si aucun effet ne <b>dépend</b> d'un autre. Un effet dépend d'un autre si appliquer l'autre change son existence, son texte, ou ce à quoi il s'applique (ex. Blood Moon retire la capacité d'Urborg : Blood Moon s'applique donc en premier, quel que soit l'horodatage). L'effet dont un autre dépend s'applique d'abord. Indique-le avec la liste « Dépend de ».</p><p class="small muted">Règles : <span class="rule-ref" data-r="613.8">613.8</span>, <span class="rule-ref" data-r="613.7">613.7</span></p></div>` : '')
      + '<p class="small muted">Les marqueurs +1/+1 et −1/−1 s\'appliquent en couche 7c, avec les autres modifications. Un effet qui change le type ET la force/endurance (« devient une créature 3/3 ») s\'applique dans chacune des couches concernées.</p>';
    verifyRuleRefs($('#lyOut'));
  });
  verifyRuleRefs(v);
}

// ---------- Vérificateur de deck ----------
$('#cmd1').addEventListener('input', debounce(cmdSuggest, 150));
$('#cmd2').addEventListener('input', debounce(cmdSuggest, 150));
async function cmdSuggest(e) {
  const q = e.target.value.trim();
  if (q.length < 2 || !state.loaded) return;
  const list = await juge.commanderCandidates(q);
  $('#cmdList').innerHTML = list.map(c => `<option value="${esc(c.name)}">`).join('');
}
try { $('#deckText').value = localStorage.getItem('deckText') || ''; $('#cmd1').value = localStorage.getItem('cmd1') || ''; $('#cmd2').value = localStorage.getItem('cmd2') || ''; } catch {}
$('#deckCheck').addEventListener('click', async () => {
  if (!state.loaded) { $('#deckResult').hidden = false; $('#deckResult').innerHTML = '<p class="muted">La base de cartes est encore en cours de chargement, réessaie dans quelques secondes.</p>'; return; }
  try { localStorage.setItem('deckText', $('#deckText').value); localStorage.setItem('cmd1', $('#cmd1').value); localStorage.setItem('cmd2', $('#cmd2').value); } catch {}
  const r = await juge.checkDeck($('#deckText').value, [$('#cmd1').value.trim(), $('#cmd2').value.trim()]);
  const box = $('#deckResult');
  box.classList.remove('hidden');
  box.innerHTML = `<h2>${r.ok ? '<span class="ok-t">✓ Deck légal</span>' : `<span class="bad-t">✗ ${r.errors.length} problème${r.errors.length > 1 ? 's' : ''}</span>`}</h2>
    <p>${r.commanders.length ? `Commandant${r.commanders.length > 1 ? 's' : ''} : <b>${r.commanders.map(esc).join(' + ')}</b> · ` : ''}Identité couleur : <b>${esc(r.identity)}</b> · ${r.total} cartes (${r.count} différentes)</p>
    ${r.errors.map(x => `<div class="step answer no"><p>${inline(esc(x))}</p></div>`).join('')}
    ${r.warnings.map(x => `<div class="step answer warn"><p>${inline(esc(x))}</p></div>`).join('')}
    ${r.infos.map(x => `<div class="step answer ok"><p>${inline(esc(x))}</p></div>`).join('')}
    <h4>Répartition</h4><div class="pill-row">${Object.entries(r.types).filter(([, n]) => n).map(([k, n]) => `<span class="badge">${k} : ${n}</span>`).join('')}</div>`;
  verifyRuleRefs(box);
});

// ---------- Suivi de partie ----------
const gameState = loadGame();
function newPlayers(n) { return Array.from({ length: n }, (_, i) => ({ name: `Joueur ${i + 1}`, life: 40, poison: 0, casts: [0, 0], partners: false, cmd: {}, out: false })); }
function loadGame() { try { const g = JSON.parse(localStorage.getItem('partie')); if (g && g.players) return g; } catch {} return { players: newPlayers(4) }; }
function saveGame() { try { localStorage.setItem('partie', JSON.stringify(gameState)); } catch {} }
$('#nbPlayers').value = String(gameState.players.length);
$('#newGame').addEventListener('click', () => { gameState.players = newPlayers(+$('#nbPlayers').value); saveGame(); renderGame(); });
$('#nbPlayers').addEventListener('change', () => { const n = +$('#nbPlayers').value; const p = gameState.players; while (p.length < n) p.push(newPlayers(p.length + 1).pop()); p.length = n; saveGame(); renderGame(); });
function cmdKey(j, k) { return `${j}-${k}`; }
function renderGame() {
  const P = gameState.players;
  $('#players').innerHTML = P.map((p, i) => {
    const maxCmd = Math.max(0, ...Object.values(p.cmd));
    const dead = p.life <= 0 || p.poison >= 10 || maxCmd >= 21;
    const why = p.life <= 0 ? 'points de vie à 0' : p.poison >= 10 ? '10 marqueurs poison' : maxCmd >= 21 ? '21 blessures d\'un même commandant' : '';
    const sources = [];
    P.forEach((q, j) => { if (j !== i) { sources.push({ j, k: 0, label: q.name + (q.partners ? ' (1)' : '') }); if (q.partners) sources.push({ j, k: 1, label: q.name + ' (2)' }); } });
    return `<div class="player ${dead ? 'dead' : ''}" data-i="${i}">
      <div class="p-name" contenteditable="true" spellcheck="false" data-i="${i}">${esc(p.name)}</div>
      ${dead ? `<div class="p-dead">Perd la partie : ${why}</div>` : ''}
      <div class="life"><button class="btn sm" data-act="life" data-d="-5">−5</button><button class="btn sm" data-act="life" data-d="-1">−1</button><span class="life-v">${p.life}</span><button class="btn sm" data-act="life" data-d="1">+1</button><button class="btn sm" data-act="life" data-d="5">+5</button></div>
      <div class="counters">
        <div><span class="muted small">Poison</span><button class="btn sm" data-act="poison" data-d="-1">−</button><b>${p.poison}</b><button class="btn sm" data-act="poison" data-d="1">+</button></div>
        ${[0, ...(p.partners ? [1] : [])].map(k => `<div><span class="muted small">Commandant${p.partners ? ' ' + (k + 1) : ''} lancé ${p.casts[k]}× · prochaine taxe <b>+{${p.casts[k] * 2}}</b></span><button class="btn sm" data-act="cast" data-k="${k}" data-d="-1">−</button><button class="btn sm" data-act="cast" data-k="${k}" data-d="1">Lancé depuis la zone</button></div>`).join('')}
        <label class="toggle small"><input type="checkbox" data-act="partners" ${p.partners ? 'checked' : ''}> Deux commandants (partenaires)</label>
      </div>
      <div class="cmd-dmg"><span class="muted small">Blessures de commandant subies</span>
        ${sources.map(s => { const v = p.cmd[cmdKey(s.j, s.k)] || 0; return `<div class="cd-row ${v >= 21 ? 'lethal' : v >= 15 ? 'near' : ''}"><span>${esc(s.label)}</span><button class="btn sm" data-act="cmd" data-key="${cmdKey(s.j, s.k)}" data-d="-1">−</button><b>${v}</b><button class="btn sm" data-act="cmd" data-key="${cmdKey(s.j, s.k)}" data-d="1">+1</button><button class="btn sm" data-act="cmd" data-key="${cmdKey(s.j, s.k)}" data-d="5">+5</button></div>`; }).join('')}
        <p class="small muted">Ajouter des blessures de commandant retire aussi les points de vie correspondants.</p>
      </div>
    </div>`;
  }).join('');
  $$('.player').forEach(el => {
    const p = P[+el.dataset.i];
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b || b.tagName === 'INPUT') return;
      const d = +b.dataset.d;
      if (b.dataset.act === 'life') p.life += d;
      if (b.dataset.act === 'poison') p.poison = Math.max(0, p.poison + d);
      if (b.dataset.act === 'cast') { const k = +b.dataset.k; p.casts[k] = Math.max(0, p.casts[k] + d); }
      if (b.dataset.act === 'cmd') { const cur = p.cmd[b.dataset.key] || 0; const nv = Math.max(0, cur + d); p.life -= (nv - cur); p.cmd[b.dataset.key] = nv; }
      saveGame(); renderGame();
    });
    $('[data-act="partners"]', el).addEventListener('change', (e) => { p.partners = e.target.checked; saveGame(); renderGame(); });
    $('.p-name', el).addEventListener('blur', (e) => { p.name = e.target.textContent.trim() || p.name; saveGame(); renderGame(); });
    $('.p-name', el).addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } });
  });
}

// ---------- Fenêtre modale ----------
function openModal(html) { $('#modalBody').innerHTML = html; $('#modal').classList.remove('hidden'); verifyRuleRefs($('#modalBody')); }
function closeModal() { $('#modal').classList.add('hidden'); }
$('#modalClose').addEventListener('click', closeModal);
$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

// ---------- Démarrage ----------
(async () => {
  faqData = await juge.faqAll();
  renderFaq();
  $('#faqCount').textContent = faqData.length;
  renderAssistMenu();
  renderGame();
  renderReports();
  loadSettings();
  refreshStatus();
  juge.load();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
  await ready;
})();
