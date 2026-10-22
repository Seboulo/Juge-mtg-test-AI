// Base de données locale : cartes (Scryfall), rulings (Scryfall), règles complètes (Wizards).
// Tout est téléchargé une fois puis stocké dans le dossier utilisateur de l'app : ensuite, plus besoin d'internet.
const fs = require('fs');
const path = require('path');
const { expandQuery, tokenize } = require('./glossary-fr');
const { CardDetector } = require('./detect');

const UA = 'JugeMTGCommander/1.0 (application de bureau)';
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const SCRYFALL_HEADERS = { 'User-Agent': UA, Accept: 'application/json' };

class Database {
  constructor(dir) {
    this.dir = dir;
    fs.mkdirSync(dir, { recursive: true });
    this.cards = [];
    this.cardsById = new Map();
    this.cardsByName = new Map();
    this.rulings = {};
    this.rules = [];
    this.rulesById = new Map();
    this.glossary = [];
    this.meta = {};
    this.frNames = {};
    this.frCards = {};
    this.frByName = new Map();
    this.tr = { rules: {}, glossary: {}, rulings: {} };
    this.rulesIndex = null;
  }

  // Traductions françaises livrées avec l'application (règles, glossaire, rulings).
  setTranslations(tr) {
    this.tr = { rules: tr.rules || {}, glossary: tr.glossary || {}, rulings: tr.rulings || {} };
    if (this.rules.length) this.setRules(this.rules, this.glossary);
  }

  setFrench(frCards) {
    this.frCards = frCards || {};
    for (const [id, f] of Object.entries(this.frCards)) if (f.n) this.frNames[id] = f.n;
    this.frByName = new Map();
    this.detector = null;
    for (const [id, n] of Object.entries(this.frNames)) {
      this.frByName.set(norm(n), id);
      if (!this.frByName.has(loose(norm(n)))) this.frByName.set(loose(norm(n)), id);
      if (n.includes(' // ')) for (const part of n.split(' // ')) if (!this.frByName.has(norm(part))) this.frByName.set(norm(part), id);
    }
    const common = new Set(['contresort', 'exil', 'choc', 'repousser', 'regeneration', 'sacrifice', 'pioche', 'meule', 'copie']);
    this.detectFr = [...this.frByName.keys()].filter(n => n.length >= 6 && !common.has(n)).sort((a, b) => b.length - a.length);
  }

  file(name) { return path.join(this.dir, name); }

  readJson(name, fallback) {
    try { return JSON.parse(fs.readFileSync(this.file(name), 'utf8')); } catch { return fallback; }
  }

  writeJson(name, data) {
    const tmp = this.file(name + '.tmp');
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, this.file(name));
  }

  load() {
    this.meta = this.readJson('meta.json', {});
    this.setCards(this.readJson('cards.json', []));
    this.rulings = this.readJson('rulings.json', {});
    const r = this.readJson('rules.json', { rules: [], glossary: [] });
    this.setRules(r.rules, r.glossary);
    this.frNames = this.readJson('noms-fr.json', {});
    this.setFrench(this.readJson('cartes-fr.json', {}));
    return this.status();
  }

  status() {
    return {
      cards: this.cards.length,
      rules: this.rules.length,
      glossary: this.glossary.length,
      rulingsCards: Object.keys(this.rulings).length,
      cardsUpdated: this.meta.cardsUpdated || null,
      rulesUpdated: this.meta.rulesUpdated || null,
      rulesVersion: this.meta.rulesVersion || null,
      frCards: Object.keys(this.frCards).length,
      frenchUpdated: this.meta.frenchUpdated || null,
      rulesFr: Object.keys(this.tr.rules).length,
      rulingsFr: Object.keys(this.tr.rulings).length,
      dir: this.dir,
    };
  }

  setCards(cards) {
    this.cards = cards;
    this.cardsById = new Map(cards.map(c => [c.id, c]));
    this.cardsByName = new Map();
    for (const c of cards) {
      this.cardsByName.set(norm(c.name), c);
      if (c.name.includes(' // ')) for (const part of c.name.split(' // ')) {
        if (!this.cardsByName.has(norm(part))) this.cardsByName.set(norm(part), c);
      }
    }
    // Noms candidats pour la détection automatique dans une question (assez longs pour éviter les faux positifs).
    this.detector = null;
    this.detectNames = [...this.cardsByName.keys()].filter(n => n.length >= 6).sort((a, b) => b.length - a.length);
  }

  setRules(rules, glossary) {
    this.rules = rules || [];
    this.glossary = glossary || [];
    for (const r of this.rules) r.textFr = this.tr.rules[r.id] || undefined;
    for (const g of this.glossary) { const t = this.tr.glossary[g.term]; g.termFr = t && t.term || undefined; g.textFr = t && t.text || undefined; }
    this.rulesById = new Map(this.rules.map(r => [r.id, r]));
    const docs = this.rules.map(r => ({ ref: r, tokens: tokenize(r.text + ' ' + (r.textFr || '')) }))
      .concat(this.glossary.map(g => ({ ref: g, glossary: true, tokens: tokenize(`${g.term} ${g.term} ${g.termFr || ''} ${g.termFr || ''} ${g.text} ${g.textFr || ''}`) })));
    this.rulesIndex = buildIndex(docs);
  }

  // ---------- Mise à jour depuis internet ----------

  // parts : { cards: true, rules: true } pour choisir ce qui est mis à jour.
  async update(progress = () => {}, parts = { cards: true, rules: true }) {
    const errors = [];
    if (parts.cards) try { await this.updateCards(progress); } catch (e) { errors.push('Cartes : ' + e.message); }
    if (parts.rules) try { await this.updateRules(progress); } catch (e) { errors.push('Règles : ' + e.message); }
    if (parts.cards || parts.french) try { await this.updateFrench(progress); } catch (e) { errors.push('Textes français : ' + e.message); }
    this.writeJson('meta.json', this.meta);
    progress(errors.length ? 'Terminé avec des erreurs.' : 'Base à jour ✓', 100);
    return { status: this.status(), errors };
  }

  // Compare la version installée avec la dernière version publiée (sans rien télécharger de lourd).
  async checkUpdates() {
    const out = { cards: false, rules: false, errors: [] };
    try {
      const { oracle } = await this.scryfallBulk();
      out.cardsDate = oracle.updated_at;
      out.cards = !this.meta.cardsSource || this.meta.cardsSource !== oracle.updated_at
        || (this.cards.length > 0 && !this.cards.some(c => c.er)); // base d'avant la v2.2 : sans popularité des cartes
      out.french = !out.cards && !this.meta.frenchUpdated;
    } catch (e) { out.errors.push('Cartes : ' + e.message); }
    try {
      const url = await this.latestRulesUrl();
      out.rulesName = decodeURIComponent(url.split('/').pop());
      out.rules = !this.meta.rulesUrl || this.meta.rulesUrl !== url;
    } catch (e) { out.errors.push('Règles : ' + e.message); }
    return out;
  }

  async scryfallBulk() {
    const res = await fetch('https://api.scryfall.com/bulk-data', { headers: SCRYFALL_HEADERS });
    if (!res.ok) throw new Error('Scryfall a répondu ' + res.status);
    const bulk = (await res.json()).data;
    const oracle = bulk.find(b => b.type === 'oracle_cards');
    const rulings = bulk.find(b => b.type === 'rulings');
    if (!oracle || !rulings) throw new Error('fichiers Scryfall introuvables (types : ' + bulk.map(b => b.type).join(', ') + ')');
    for (const b of [oracle, rulings]) {
      b.fileUrl = findDownloadUrl(b);
      // Si l'adresse du fichier n'est pas dans la liste, on demande le détail de l'entrée.
      if (!b.fileUrl && b.uri) {
        const r = await fetch(b.uri, { headers: SCRYFALL_HEADERS });
        if (r.ok) b.fileUrl = findDownloadUrl(await r.json());
      }
      if (!b.fileUrl) throw new Error(`adresse de téléchargement introuvable pour « ${b.type} » (champs reçus : ${Object.keys(b).join(', ')})`);
    }
    return { oracle, rulings };
  }

  async latestRulesUrl() {
    const page = await fetch('https://magic.wizards.com/en/rules', { headers: { 'User-Agent': BROWSER_UA } });
    if (!page.ok) throw new Error('le site de Wizards a répondu ' + page.status);
    const html = await page.text();
    const m = html.match(/https:\/\/media\.wizards\.com\/[^"'<>]+?\.txt/i);
    if (!m) throw new Error('lien vers le fichier texte des règles introuvable');
    return m[0].replace(/ /g, '%20');
  }

  async updateCards(progress) {
    progress('Récupération de la liste des données Scryfall…', 0);
    const { oracle, rulings } = await this.scryfallBulk();

    progress(`Téléchargement des cartes (${Math.round(oracle.size / 1e6)} Mo)…`, 0);
    const rawCards = await downloadJson(oracle.fileUrl, (p) => progress(`Téléchargement des cartes… ${p} %`, p * 0.7));
    progress('Préparation des cartes…', 70);
    const cards = [];
    for (const c of rawCards) {
      const t = trimCard(c);
      if (t) cards.push(t);
    }
    cards.sort((a, b) => a.name.localeCompare(b.name));
    this.writeJson('cards.json', cards);
    this.setCards(cards);

    progress(`Téléchargement des rulings (${Math.round(rulings.size / 1e6)} Mo)…`, 72);
    const rawRulings = await downloadJson(rulings.fileUrl, (p) => progress(`Téléchargement des rulings… ${p} %`, 72 + p * 0.2));
    const map = {};
    for (const r of rawRulings) {
      if (!this.cardsById.has(r.oracle_id)) continue;
      (map[r.oracle_id] ||= []).push({ d: r.published_at, s: r.source, t: r.comment });
    }
    for (const k in map) map[k].sort((a, b) => a.d.localeCompare(b.d));
    this.writeJson('rulings.json', map);
    this.rulings = map;
    this.meta.cardsUpdated = new Date().toISOString();
    this.meta.cardsSource = oracle.updated_at;
  }

  // Noms, types et textes imprimés en français (traduction officielle Wizards), via la recherche Scryfall paginée.
  async updateFrench(progress) {
    const fr = {};
    let url = 'https://api.scryfall.com/cards/search?q=' + encodeURIComponent('lang:fr') + '&unique=cards&order=released&dir=desc&include_multilingual=true';
    let page = 0, total = 0;
    while (url) {
      page++;
      let res;
      for (let attempt = 0; attempt < 4; attempt++) {
        res = await fetch(url, { headers: SCRYFALL_HEADERS });
        if (res.status !== 429) break;
        await sleep(1500 * (attempt + 1));
      }
      if (!res.ok) { if (page === 1) throw new Error('Scryfall a répondu ' + res.status); break; }
      const data = await res.json();
      total = data.total_cards || total;
      for (const c of data.data || []) {
        const id = c.oracle_id || (c.card_faces && c.card_faces[0] && c.card_faces[0].oracle_id);
        if (!id || fr[id]) continue;
        const faces = c.card_faces || [];
        const n = c.printed_name || faces.map(f => f.printed_name).filter(Boolean).join(' // ');
        if (!n) continue;
        const t = c.printed_text != null ? c.printed_text : faces.map(f => f.printed_text || '').filter(Boolean).join('\n—\n');
        const ty = c.printed_type_line || faces.map(f => f.printed_type_line).filter(Boolean).join(' // ');
        fr[id] = { n, ty: ty || undefined, t: t || undefined, set: c.set_name };
      }
      progress(`Textes français des cartes… ${Object.keys(fr).length}${total ? ' / ' + total : ''}`, 92 + Math.min(7, page / 30));
      url = data.has_more ? data.next_page : null;
      await sleep(110); // Scryfall demande au plus 10 requêtes par seconde.
    }
    if (Object.keys(fr).length < 100) throw new Error('trop peu de cartes françaises reçues');
    this.writeJson('cartes-fr.json', fr);
    this.setFrench(fr);
    this.writeJson('noms-fr.json', this.frNames);
    this.meta.frenchUpdated = new Date().toISOString();
  }

  async updateRules(progress) {
    progress('Recherche de la dernière version des règles complètes…', 92);
    const url = await this.latestRulesUrl();
    progress('Téléchargement des règles complètes…', 95);
    const res = await fetch(url, { headers: { 'User-Agent': BROWSER_UA } });
    if (!res.ok) throw new Error('téléchargement des règles : ' + res.status);
    this.installRules(Buffer.from(await res.arrayBuffer()), decodeURIComponent(url.split('/').pop()));
    this.meta.rulesUrl = url;
  }

  // Installe un fichier texte des Comprehensive Rules (téléchargé ou choisi par l'utilisateur).
  installRules(buf, label) {
    const parsed = parseRules(decodeText(buf));
    if (parsed.rules.length < 500) throw new Error("ce fichier ne ressemble pas aux Comprehensive Rules (format .txt attendu)");
    this.writeJson('rules.json', parsed);
    this.setRules(parsed.rules, parsed.glossary);
    this.meta.rulesUpdated = new Date().toISOString();
    this.meta.rulesVersion = parsed.effective || label;
    this.writeJson('meta.json', this.meta);
    return this.status();
  }

  // ---------- Recherche ----------

  getCard(id) {
    const c = this.cardsById.get(id);
    if (!c) return null;
    const rulings = (this.rulings[id] || []).map(r => ({ ...r, fr: this.tr.rulings[r.t] || null }));
    const f = this.frCards[id] || null;
    return { ...c, rulings, nameFr: this.frNames[id] || null, textFr: f && f.t || null, typeFr: f && f.ty || null };
  }

  findCardByName(name) {
    const n = norm(name);
    if (this.cardsByName.has(n)) return this.cardsByName.get(n);
    const id = this.frByName.get(n) || this.frByName.get(loose(n));
    return id ? this.cardsById.get(id) || null : null;
  }

  searchCards(query, limit = 40) {
    const q = norm(query);
    if (!q) return [];
    const starts = [], contains = [];
    for (const c of this.cards) {
      const n = norm(c.name);
      const fr = this.frNames[c.id] ? norm(this.frNames[c.id]) : '';
      if (n.startsWith(q) || fr.startsWith(q)) starts.push(c);
      else if (n.includes(q) || fr.includes(q)) contains.push(c);
      if (starts.length >= limit) break;
    }
    return starts.concat(contains).slice(0, limit).map(c => this.cardSummary(c));
  }

  cardSummary(c) {
    const f = this.frCards[c.id];
    return { id: c.id, name: c.name, nameFr: this.frNames[c.id] || null, mana: c.mana, type: c.type, typeFr: f && f.ty || null, cmdr: c.cmdr };
  }

  // Recherche une carte par son nom français via Scryfall (nécessite internet), puis la mémorise.
  async lookupFrench(name) {
    const q = encodeURIComponent(`${name} lang:fr`);
    const res = await fetch(`https://api.scryfall.com/cards/search?q=${q}&include_multilingual=true&unique=cards`, { headers: SCRYFALL_HEADERS });
    if (!res.ok) return [];
    const data = await res.json();
    const out = [];
    for (const c of (data.data || []).slice(0, 10)) {
      if (!c.oracle_id || !this.cardsById.has(c.oracle_id)) continue;
      const fr = c.printed_name || (c.card_faces || []).map(f => f.printed_name).filter(Boolean).join(' // ');
      if (fr) { this.frNames[c.oracle_id] = fr; this.frByName.set(norm(fr), c.oracle_id); }
      out.push(this.cardSummary(this.cardsById.get(c.oracle_id)));
    }
    this.writeJson('noms-fr.json', this.frNames);
    return out;
  }

  searchRules(query, limit = 30) {
    if (!this.rulesIndex) return [];
    const direct = query.trim().match(/^(\d{3}(?:\.\d+[a-z]?)?)\.?$/);
    if (direct) {
      const id = direct[1];
      return this.rules.filter(r => r.id === id || r.id.startsWith(id + (id.includes('.') ? '' : '.'))).slice(0, 200).map(r => ({ ...r }));
    }
    const terms = expandQuery(query);
    return searchIndex(this.rulesIndex, terms, limit).map(h => h.glossary ? { glossary: true, ...h.ref } : { ...h.ref });
  }

  getRule(id) {
    const r = this.rulesById.get(id);
    if (!r) return null;
    const children = this.rules.filter(x => x.id !== id && x.id.startsWith(id) && /^[a-z.]/.test(x.id.slice(id.length)));
    return { ...r, children: children.slice(0, 60) };
  }

  // Cartes mentionnées dans une question : [[Nom]] explicites + noms anglais/français reconnus dans le texte.
  detectCards(text) {
    if (!this.detector) this.detector = new CardDetector(this);
    return this.detector.detect(text);
  }


  // Contexte envoyé à l'IA : règles Commander de base + règles pertinentes + cartes avec rulings.
  buildContext(question, extraCards = []) {
    const { cards, unknown } = this.detectCards(question);
    for (const c of extraCards) if (c && !cards.find(x => x.id === c.id)) cards.push(c);
    const cardText = cards.map(c => this.cardForPrompt(c)).join('\n\n');

    const queryWithCards = question + ' ' + cards.map(c => c.text).join(' ');
    const hits = this.searchRules(queryWithCards, 28);
    const ruleIds = new Set();
    const ruleLines = [];
    const addRule = (r) => { if (r && !ruleIds.has(r.id)) { ruleIds.add(r.id); ruleLines.push(`${r.id} ${r.text}`); } };
    for (const r of this.rules) if (/^903\.(1|2|3|4|6|7|8|9|10|11)/.test(r.id) || r.id.startsWith('704.6')) addRule(r);
    const glossaryLines = [];
    for (const h of hits) {
      if (h.glossary) glossaryLines.push(`${h.term}: ${h.text}`);
      else { addRule(h); for (const r of this.rules) if (r.id.startsWith(h.id) && /^[a-z]$/.test(r.id.slice(h.id.length)) && ruleLines.length < 90) addRule(r); }
    }
    return { cards: cards.map(c => this.cardSummary(c)), unknown, cardText, rulesText: ruleLines.join('\n'), glossaryText: glossaryLines.slice(0, 8).join('\n') };
  }

  cardForPrompt(c) {
    const fr = this.frNames[c.id] ? ` (nom français : ${this.frNames[c.id]})` : '';
    const lines = [`### ${c.name}${fr}`, `${c.mana || ''} — ${c.type}`];
    if (c.text) lines.push(c.text);
    if (c.pt) lines.push(`Force/Endurance : ${c.pt}`);
    if (c.loyalty) lines.push(`Loyauté : ${c.loyalty}`);
    lines.push(`Identité couleur : ${c.ci.length ? c.ci.join('') : 'incolore'} · Commander : ${c.cmdr}${c.canCommand ? ' · peut être commandant' : ''}`);
    const rs = this.rulings[c.id] || [];
    if (rs.length) lines.push('Rulings officiels :\n' + rs.slice(-15).map(r => `- (${r.d}) ${r.t}`).join('\n'));
    return lines.join('\n');
  }
}

// ---------- Utilitaires ----------

// « Anneau d oubli », « Anneau doubli » → même clé que « Anneau d'oubli ».
const loose = (n) => n.replace(/'\s*/g, '').replace(/\b(d|l|j|qu|n|s) /g, '$1');

function norm(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’`]/g, "'").replace(/\s+/g, ' ').trim();
}

function trimCard(c) {
  if (c.layout === 'art_series' || c.layout === 'token' || c.layout === 'double_faced_token' || c.layout === 'emblem') return null;
  if (c.set_type === 'memorabilia' || c.set_type === 'token') return null;
  const faces = c.card_faces || [];
  const text = c.oracle_text != null ? c.oracle_text
    : faces.map(f => `${f.name}${f.mana_cost ? ' ' + f.mana_cost : ''}\n${f.type_line || ''}\n${f.oracle_text || ''}${f.power != null ? `\n${f.power}/${f.toughness}` : ''}`).join('\n—\n');
  const typeLine = c.type_line || faces.map(f => f.type_line).join(' // ');
  const mana = c.mana_cost != null && c.mana_cost !== '' ? c.mana_cost : faces.map(f => f.mana_cost).filter(Boolean).join(' // ');
  const front = typeLine.split('//')[0];
  const canCommand = (/legendary/i.test(front) && (/creature|vehicle/i.test(front) || (/spacecraft/i.test(front) && c.power != null)))
    || /can be your commander/i.test(text || '')
    || (/legendary/i.test(front) && /isn't on the battlefield, it's an? [^.]*creature/i.test(text || ''));
  return {
    id: c.oracle_id || (faces[0] && faces[0].oracle_id) || c.id,
    name: c.name,
    mana,
    type: typeLine,
    text: text || '',
    pt: c.power != null ? `${c.power}/${c.toughness}` : undefined,
    loyalty: c.loyalty || undefined,
    ci: c.color_identity || [],
    cmdr: (c.legalities && c.legalities.commander) || 'not_legal',
    canCommand: canCommand || undefined,
    keywords: c.keywords && c.keywords.length ? c.keywords : undefined,
    gc: c.game_changer || undefined,
    er: c.edhrec_rank || undefined,
  };
}

// Trouve l'adresse du fichier dans une entrée « bulk data » de Scryfall, quel que soit le nom du champ.
function findDownloadUrl(b) {
  if (!b) return null;
  for (const k of ['download_uri', 'jsonl_download_uri', 'download_url', 'jsonl_download_url', 'download', 'file_uri', 'url']) if (typeof b[k] === 'string' && /^https?:/.test(b[k])) return b[k];
  for (const v of Object.values(b)) if (typeof v === 'string' && /^https:\/\/\S+\.jsonl?(\.gz)?(\?\S*)?$/.test(v)) return v;
  for (const v of Object.values(b)) if (v && typeof v === 'object') { const u = findDownloadUrl(v); if (u) return u; }
  return null;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function downloadJson(url, onProgress) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error('téléchargement : ' + res.status);
  const total = Number(res.headers.get('content-length')) || 0;
  const chunks = [];
  let got = 0, last = -1;
  for await (const chunk of res.body) {
    chunks.push(chunk);
    got += chunk.length;
    if (total) {
      const p = Math.floor(got * 100 / total);
      if (p !== last && p % 5 === 0) { last = p; onProgress(p); }
    }
  }
  let buf = Buffer.concat(chunks);
  if (buf[0] === 0x1f && buf[1] === 0x8b) buf = require('zlib').gunzipSync(buf);
  const text = buf.toString('utf8').replace(/^\uFEFF/, '').trimStart();
  if (text.startsWith('[')) return JSON.parse(text);
  // Format JSON Lines (un objet par ligne), utilisé par Scryfall depuis 2026.
  const out = [];
  for (const line of text.split('\n')) {
    const l = line.trim();
    if (l) out.push(JSON.parse(l));
  }
  return out;
}

function decodeText(buf) {
  let s = new TextDecoder('utf-8').decode(buf);
  if ((s.match(/\uFFFD/g) || []).length > 20) s = new TextDecoder('windows-1252').decode(buf);
  return s.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
}

// Analyse le fichier texte officiel des Comprehensive Rules.
function parseRules(txt) {
  const lines = txt.split('\n');
  const effective = (txt.match(/These rules are effective as of ([^.\n]+)/) || [])[1] || null;
  // Le sommaire au début répète les titres : le corps commence à la 2e occurrence de « 1. Game Concepts ».
  const starts = lines.reduce((a, l, i) => (/^1\. Game Concepts\s*$/.test(l.trim()) ? a.concat(i) : a), []);
  let i = starts.length > 1 ? starts[1] : (starts[0] || 0);
  const rules = [];
  const sections = {};
  let cur = null, last = null;
  for (; i < lines.length; i++) {
    const l = lines[i].trim();
    if (/^Glossary$/.test(l)) break;
    if (!l) { cur = null; continue; }
    if (/^Example:/.test(l) && last) { last.text += '\n' + l; continue; }
    let m = l.match(/^(\d)\.\s+(.+)$/);
    if (m) { sections[m[1]] = m[2]; cur = last = null; continue; }
    m = l.match(/^(\d{3}(?:\.\d+[a-z]?)?)\.?\s+(.+)$/);
    if (m) {
      cur = { id: m[1], text: m[2] };
      if (/^\d{3}$/.test(m[1])) cur.title = true;
      rules.push(cur);
      last = cur;
      continue;
    }
    if (cur) cur.text += '\n' + l;
  }
  const glossary = [];
  for (i++; i < lines.length; i++) {
    const l = lines[i].trim();
    if (/^Credits$/.test(l)) break;
    if (!l) continue;
    const def = [];
    let j = i + 1;
    while (j < lines.length && lines[j].trim()) { def.push(lines[j].trim()); j++; }
    if (def.length) glossary.push({ term: l, text: def.join('\n') });
    i = j;
  }
  // Ajoute le titre de section (ex. « 903. Commander ») à chaque règle pour la lisibilité.
  const titles = {};
  for (const r of rules) if (r.title) titles[r.id] = r.text;
  for (const r of rules) { const t = titles[r.id.slice(0, 3)]; if (t && !r.title) r.section = t; }
  return { effective, rules, glossary };
}

// Index plein texte simple (BM25).
function buildIndex(docs) {
  const df = new Map();
  let totalLen = 0;
  for (const d of docs) {
    d.tf = new Map();
    for (const t of d.tokens) d.tf.set(t, (d.tf.get(t) || 0) + 1);
    for (const t of d.tf.keys()) df.set(t, (df.get(t) || 0) + 1);
    d.len = d.tokens.length;
    totalLen += d.len;
    delete d.tokens;
  }
  return { docs, df, avg: totalLen / Math.max(1, docs.length) };
}

// Tolérance aux fautes de frappe : un mot inconnu est rapproché des mots du vocabulaire à une lettre près.
function closeTerms(index, terms) {
  const out = terms.slice();
  for (const { t, w } of terms) {
    if (index.df.has(t) || t.length < 5) continue;
    for (const v of index.df.keys()) if (Math.abs(v.length - t.length) <= 1 && editDistance1(t, v)) out.push({ t: v, w: w * 0.7 });
  }
  return out;
}
function editDistance1(a, b) {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, diff = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++diff > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else if (a[i + 1] === b[j] && a[i] === b[j + 1]) { i += 2; j += 2; } // lettres inversées
    else { i++; j++; }
  }
  return diff + (a.length - i) + (b.length - j) <= 1;
}

function searchIndex(index, terms, limit) {
  terms = closeTerms(index, terms);
  const N = index.docs.length, k1 = 1.2, b = 0.75;
  const scored = [];
  for (const d of index.docs) {
    let s = 0;
    for (const { t, w } of terms) {
      const f = d.tf.get(t);
      if (!f) continue;
      const idf = Math.log(1 + (N - index.df.get(t) + 0.5) / (index.df.get(t) + 0.5));
      s += w * idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * d.len / index.avg));
    }
    if (s > 0) scored.push({ s, d });
  }
  scored.sort((a, b) => b.s - a.s);
  return scored.slice(0, limit).map(x => ({ ref: x.d.ref, glossary: x.d.glossary }));
}

module.exports = { Database, parseRules, trimCard, norm, editDistance1 };
