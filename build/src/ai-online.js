// IA en ligne optionnelle (offres gratuites : Google Gemini, Groq…) : elle rédige une réponse
// à partir de ce que la recherche locale a trouvé (fiches, interactions, cartes, règles).

const PRESETS = {
  gemini: { label: 'Google Gemini (clé gratuite)', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.5-flash', keyUrl: 'https://aistudio.google.com/apikey' },
  groq: { label: 'Groq (clé gratuite)', baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile', keyUrl: 'https://console.groq.com/keys' },
  custom: { label: 'Autre API compatible OpenAI', baseUrl: '', model: '' },
};

const SYSTEM = `Tu es un juge de règles Magic: The Gathering expert du format Commander (multijoueur, 40 points de vie, zone de commandement).
Tu réponds en français, clairement, à un joueur pendant une partie.
Règles de travail :
- Appuie-toi d'abord sur le CONTEXTE : fiches rédigées et vérifiées, interactions détectées, texte Oracle, rulings officiels et extraits des Comprehensive Rules. Le texte Oracle fait foi.
- Ne cite un numéro de règle que s'il apparaît dans le contexte. N'invente jamais de règle ni de ruling.
- Pour une interaction, déroule les étapes (pile, déclenchements, remplacements, actions basées sur un état, couches) seulement si c'est utile.
- Garde les noms de cartes en anglais. Si le contexte ne suffit pas pour trancher, dis-le.
Format (Markdown, court) :
## Réponse
(1 à 3 phrases : la conclusion)
## Pourquoi
(explication pas à pas, concise)
## Règles
(liste : numéro + ce qu'il dit, en français)`;

const clip = (s, n) => (s.length > n ? s.slice(0, n) + ' […]' : s);

// Contexte texte construit à partir du résultat de la recherche locale.
function buildContext(c) {
  const parts = [];
  const it = c.interactions;
  if (it && it.points.length) parts.push('INTERACTIONS DÉTECTÉES :\n' + it.points.map(p => `- ${p.title} : ${p.text} (règles ${p.rules.join(', ')})`).join('\n'));
  const faq = c.faq.slice(0, c.faqConfident ? 3 : 2);
  if (faq.length) parts.push('FICHES DE L\'APPLICATION (les plus proches de la question) :\n' + faq.map(f => `- ${f.q}\n  ${f.a} (règles ${f.rules.join(', ')})`).join('\n'));
  if (c.cards.length) parts.push('CARTES (texte Oracle et rulings officiels) :\n' + c.cards.slice(0, 5).map(k =>
    `### ${k.name}${k.mana ? ' ' + k.mana : ''} — ${k.type || ''}\n${k.text || ''}${k.rulings.length ? '\nRulings :\n' + k.rulings.slice(0, 12).map(r => '- ' + r.t).join('\n') : ''}`).join('\n\n'));
  const rules = (c.rules || []).filter(r => !r.glossary).slice(0, 10);
  if (rules.length) parts.push('EXTRAITS DES COMPREHENSIVE RULES :\n' + rules.map(r => `${r.id} ${clip(r.text, 600)}`).join('\n'));
  if (c.unknown && c.unknown.length) parts.push('Cartes citées mais introuvables dans la base : ' + c.unknown.join(', '));
  return clip(parts.join('\n\n'), 14000) || '(rien trouvé dans la base)';
}

function buildMessages(question, c) {
  return [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: `CONTEXTE\n========\n${buildContext(c)}\n\nQUESTION\n========\n${question}` },
  ];
}

// Texte à coller dans Claude (claude.ai) : consignes + contexte + question.
function claudePrompt(question, c) {
  return `${SYSTEM}\n\nCONTEXTE (trouvé dans ma base de règles hors ligne)\n========\n${buildContext(c)}\n\nQUESTION\n========\n${question}`;
}

function settingsOf(s) {
  const p = PRESETS[s.aiProvider] || PRESETS.custom;
  return { base: (s.aiBaseUrl || p.baseUrl || '').replace(/\/+$/, ''), model: s.aiModel || p.model, key: s.aiKey || '' };
}

// Si le modèle par défaut n'existe plus, on prend un modèle disponible de la même famille.
async function fallbackModel(base, key, current) {
  try {
    const res = await fetch(base + '/models', { headers: { Authorization: 'Bearer ' + key } });
    if (!res.ok) return null;
    const ids = ((await res.json()).data || []).map(m => String(m.id).replace(/^models\//, ''));
    const pref = [/gemini-[\d.]+-flash$/, /flash/, /llama.*70b/, /gpt-oss/, /llama/];
    for (const re of pref) { const m = ids.filter(id => re.test(id) && id !== current && !/image|tts|audio|embed|vision|lite/.test(id)).sort().reverse()[0]; if (m) return m; }
  } catch { /* hors ligne */ }
  return null;
}

async function ask(s, messages, onChunk, signal, onModel) {
  let { base, model, key } = settingsOf(s);
  if (!base) throw new Error("Renseigne l'adresse de l'API dans Paramètres.");
  if (!key) throw new Error('Renseigne ta clé gratuite dans Paramètres.');
  let res;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      res = await fetch(base + '/chat/completions', {
        method: 'POST', signal,
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
        body: JSON.stringify({ model, messages, stream: true, temperature: 0.2 }),
      });
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      throw new Error("Service d'IA injoignable (connexion internet ?).");
    }
    if (res.ok) break;
    const t = await res.text();
    if ((res.status === 404 || /model/i.test(t) && res.status === 400) && attempt === 0) {
      const m = await fallbackModel(base, key, model);
      if (m) { model = m; if (onModel) onModel(m); continue; }
    }
    if (res.status === 401 || res.status === 403 || /API key/i.test(t)) throw new Error('Clé refusée : vérifie-la dans Paramètres.');
    if (res.status === 429) throw new Error('Limite gratuite atteinte pour le moment : réessaie dans une minute.');
    throw new Error(`L'IA a répondu ${res.status} : ${t.slice(0, 200)}`);
  }
  let buf = '', full = '';
  const dec = new TextDecoder();
  // Lecture du flux morceau par morceau (compatible avec tous les navigateurs).
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') return full;
      try {
        const j = JSON.parse(data);
        const piece = j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content;
        if (piece) { full += piece; onChunk(piece); }
      } catch { /* ligne partielle */ }
    }
  }
  return full;
}

// Version « qui vérifie » : l'IA peut consulter elle-même la base du site (fiches, cartes, règles) avant de
// répondre, avec les outils au format OpenAI (Gemini et Groq les acceptent). Si le service refuse les outils,
// on revient à la réponse simple en flux.
const TOOLS_NOTE = `\nTu disposes d'outils pour consulter la base du site. Avant de citer le texte d'une carte ou un numéro de règle absent du CONTEXTE, vérifie-le avec un outil. Fais au plus 4 appels, puis réponds.`;

async function postJson(base, key, body, signal) {
  let res;
  try {
    res = await fetch(base + '/chat/completions', { method: 'POST', signal, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key }, body: JSON.stringify(body) });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new Error("Service d'IA injoignable (connexion internet ?).");
  }
  if (res.ok) return res.json();
  const t = await res.text();
  const err = new Error(`L'IA a répondu ${res.status} : ${t.slice(0, 200)}`);
  err.status = res.status; err.body = t;
  if (res.status === 401 || res.status === 403 || /API key/i.test(t)) err.message = 'Clé refusée : vérifie-la dans Paramètres.';
  if (res.status === 429) err.message = 'Limite gratuite atteinte pour le moment : réessaie dans une minute.';
  throw err;
}

async function askWithTools(s, messages, tools, { onChunk, onStatus = () => {}, signal, onModel } = {}) {
  const { base, model, key } = settingsOf(s);
  if (!base || !key || !tools || !tools.length) return ask(s, messages, onChunk, signal, onModel);
  const msgs = messages.map((m, i) => (i === 0 && m.role === 'system' ? { ...m, content: m.content + TOOLS_NOTE } : m));
  const spec = tools.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.inputSchema } }));
  const used = [];
  for (let round = 0; round < 5; round++) {
    let j;
    try {
      j = await postJson(base, key, { model, messages: msgs, tools: spec, tool_choice: round < 4 ? 'auto' : 'none', temperature: 0.2 }, signal);
    } catch (e) {
      // Outils refusés, modèle inconnu… : réponse simple (qui sait aussi changer de modèle).
      if (e.name === 'AbortError' || e.status === 401 || e.status === 403 || e.status === 429) throw e;
      return ask(s, messages, onChunk, signal, onModel);
    }
    const m = j.choices && j.choices[0] && j.choices[0].message;
    if (!m) break;
    const calls = m.tool_calls || [];
    if (!calls.length) {
      if (m.content) onChunk(m.content);
      return { text: m.content || '', used };
    }
    msgs.push({ role: 'assistant', content: m.content || null, tool_calls: calls });
    for (const c of calls) {
      const tool = tools.find(t => t.name === (c.function && c.function.name));
      let args = {};
      try { args = JSON.parse((c.function && c.function.arguments) || '{}'); } catch {}
      const label = tool ? `${tool.name.replace(/_/g, ' ')} : ${Object.values(args).join(', ')}` : String(c.function && c.function.name);
      used.push(label);
      onStatus(label);
      let out;
      try { out = tool ? await tool.execute(args) : { erreur: 'outil inconnu' }; } catch (e) { out = { erreur: e.message }; }
      msgs.push({ role: 'tool', tool_call_id: c.id, content: clip(JSON.stringify(out), 6000) });
    }
  }
  return ask(s, msgs.filter(m => m.role !== 'tool' && !m.tool_calls), onChunk, signal, onModel);
}

module.exports = { PRESETS, buildContext, buildMessages, claudePrompt, ask, askWithTools };
