// Moteur d'interactions entre cartes, sans IA : on lit le texte Oracle (anglais) de chaque carte,
// on en déduit ce qu'elle fait du point de vue des règles (déclencheur, remplacement, couche…),
// puis on applique des règles d'interaction connues, chacune avec ses numéros de règles.

const has = (re, s) => re.test(s);

function features(card) {
  const raw = card.text || '';
  // Le texte Oracle récent dit « this creature », l'ancien répète le nom de la carte : on unifie en « this ».
  const short = card.name.split(' // ')[0].split(',')[0];
  const t = raw.split(card.name).join('this permanent').split(short).join('this permanent');
  const kw = new Set((card.keywords || []).map(k => k.toLowerCase()));
  const type = card.type || '';
  const kwOrText = (k) => kw.has(k) || new RegExp('(^|\\n|, )' + k + '(\\b|$)', 'i').test(t);
  const grants = (k) => new RegExp('(have|has|gains?|gain) [^.]*\\b' + k + '\\b', 'i').test(t);
  const f = {
    type, t,
    creature: /Creature/.test(type), land: /\bLand\b/.test(type), basic: /\bBasic\b/.test(type),
    legendary: /Legendary/.test(type), instantSorcery: /Instant|Sorcery/.test(type),
    aura: /\bAura\b/.test(type), equipment: /\bEquipment\b/.test(type),
    canCommand: !!card.canCommand,
    // Déclencheurs
    selfDies: has(/When(ever)? this (creature|permanent) dies/i, t) || has(/When(ever)? this (creature|permanent) or another [^.]*dies/i, t),
    anyDies: has(/Whenever (a|an|another|one or more|this creature or another)[^.]*\b(dies|die)\b/i, t) || has(/put into a graveyard from the battlefield/i, t),
    ltb: has(/leaves the battlefield/i, t) && has(/When(ever)? [^.]*leaves the battlefield/i, t),
    etbSelf: has(/When(ever)? this (creature|permanent|enchantment|artifact|land|planeswalker) enters/i, t),
    etbOther: has(/Whenever (a|an|another|one or more)[^.]*\benters?\b/i, t),
    castTrig: has(/Whenever (you|a player|an opponent|each opponent) casts?/i, t),
    lifeGainTrig: has(/Whenever you gain life/i, t),
    lifeLossTrig: has(/Whenever (an opponent|a player|each opponent|another player) loses life/i, t),
    drawTrig: has(/Whenever (you|a player|an opponent) draws?/i, t),
    attackTrig: has(/Whenever [^.]*attacks/i, t),
    // Effets de remplacement
    gyToExile: has(/would (die|be put into [^.]*graveyard)[^.]*exile it instead/i, t),
    tokenDouble: has(/would create one or more tokens[^.]*instead/i, t),
    counterDouble: has(/would put one or more [^.]*counters[^.]*instead/i, t),
    damageDouble: has(/would deal damage[^.]*(double|twice)/i, t) || has(/deals? double that damage/i, t),
    preventDmg: has(/[Pp]revent (all|the next)[^.]*damage/i, t),
    drawRepl: has(/If you would draw a card[^.]*instead/i, t),
    lifeRepl: has(/If (you|a player|an opponent) would gain life/i, t),
    entersWith: has(/enters (tapped|with)|As this (creature|permanent|enchantment|artifact|land) enters/i, t),
    replacement: has(/\binstead\b/i, t),
    // Statiques qui empêchent
    noEtbTrig: has(/entering[^.]*don't cause abilities to trigger/i, t),
    noDiesTrig: has(/dying don't cause abilities to trigger/i, t),
    cantGainLife: has(/can't gain life/i, t),
    cantLoseLife: has(/life total can't change|can't lose life/i, t),
    cantLose: has(/can't lose the game/i, t),
    cantWin: has(/can't win the game/i, t),
    winsGame: has(/wins? the game/i, t),
    castBlockNotHand: has(/can't cast spells from anywhere other than (their|your) hands?/i, t),
    castBlockGyLib: has(/can't cast spells from graveyards or libraries/i, t),
    activatedBlock: has(/[Aa]ctivated abilities [^.]*can't be activated/i, t),
    activatedBlockMana: has(/can't be activated unless they're mana abilities/i, t),
    cantBeCountered: has(/can't be countered/i, t),
    // Couches
    copyEff: has(/enter as a copy|becomes? a copy|create a token that's a copy|copy of (target|any|another|a|that|enchanted)/i, t),
    controlChange: has(/gain control of|exchange control|You control enchanted (creature|permanent)/i, t),
    landTypeSet: has(/(Nonbasic lands|Each land|All lands|Lands)[^.]*(are|is) (an? )?(Plains|Islands?|Swamps?|Mountains?|Forests?)\.?/i, t) && !has(/in addition to/i, t.match(/(Nonbasic lands|Each land|All lands|Lands)[^.]*/i)?.[0] || ''),
    landTypeAdd: has(/is an? (Plains|Island|Swamp|Mountain|Forest) in addition|are (Plains|Islands|Swamps|Mountains|Forests) in addition/i, t),
    becomesCreature: has(/is a creature in addition|are creatures in addition|becomes? an? [^.]*creature/i, t),
    loseAbilities: has(/lose all abilities|loses all abilities/i, t),
    ptSet: has(/base power and (base )?toughness|have base power|power and toughness (are )?each equal/i, t) || has(/(is|are|becomes?) (an? )?\d+\/\d+\b/i, t),
    ptMod: has(/gets? [+-][\dX]+\/[+-][\dX]+/i, t) || has(/\+1\/\+1 counter/i, t),
    minus: has(/gets? -[\dX]+\/-[\dX]+/i, t) || has(/-1\/-1 counter/i, t),
    // Actions
    destroyT: has(/[Dd]estroy (target|up to)/, t), destroyAll: has(/[Dd]estroy (all|each)/, t),
    exileT: has(/[Ee]xile (target|another target|up to)/, t), exileAll: has(/[Ee]xile (all|each)/, t),
    exileUntil: has(/until this (permanent|creature|enchantment|artifact) leaves the battlefield/i, t) || (has(/[Ee]xile/, t) && has(/When this [^.]*leaves the battlefield, return the exiled/i, t)),
    flicker: has(/[Ee]xile [^.]*(, then return|\. Return (it|that card|those cards|the exiled card) to the battlefield)/, t) || has(/[Ee]xile [^.]*\. At the beginning of the next end step, return/i, t),
    bounce: has(/[Rr]eturn [^.]*to (its|their) owners?'? hands?/, t),
    tuck: has(/(on (the )?(bottom|top) of (its|their) owner's library|shuffles? (it|them) into (its|their) (owner's )?librar(y|ies)|owner of target permanent shuffles it)/i, t),
    sacEffect: has(/(each|target) (player|opponent)[^.]*sacrifices?/i, t) || has(/sacrifices? (a|an|two|X|all|each|that)/i, t),
    sacOutlet: has(/(^|\n)Sacrifice (a|another|an) [^:]*:/, t),
    counterSpell: has(/[Cc]ounter target (spell|noncreature spell|creature spell|instant|activated|triggered|ability|artifact|enchantment)/, t),
    copySpell: has(/[Cc]opy (target|that|it|each) (instant|sorcery|spell|activated|triggered|ability)?/, t) && !has(/enter as a copy/i, t),
    tokenMake: has(/[Cc]reates? [^.]*tokens?/, t) && !has(/would create one or more tokens/i, t),
    countersPut: has(/[Pp]ut (a|an|one|two|three|X|that many) [^.]*counters? on/, t) || has(/enters with [^.]*counters?/i, t) || has(/proliferate/i, t),
    gainsLife: has(/gains? (\d+|X|that much|life equal)/i, t) || kw.has('lifelink'),
    loseLife: has(/loses? (\d+|X|that much|life equal)/i, t),
    dealsDamage: has(/deals? (\d+|X|damage|that much)/i, t),
    fight: has(/\bfights?\b/i, t),
    draws: has(/draws? (a|an|two|three|X|that many|\d+) cards?/i, t),
    costIncrease: has(/costs? \{[\dX]\} more|cost \{[\dX]\} more/i, t),
    costReduce: has(/costs? \{[\dX]\} less|cost \{[\dX]\} less/i, t),
    freeCast: has(/without paying (its|their) mana costs?/i, t),
    hasX: /\{X\}/.test(card.mana || ''),
    phasing: has(/phases? out/i, t),
    targets: has(/\btarget\b/i, t),
    massEffect: has(/\b(all|each) (creatures?|permanents?|nonland|artifacts?|enchantments?|opponents?|players?)\b/i, t),
    activated: /(^|\n)[^"\n(]*\{[^}]+\}[^"\n:]*:/.test(raw) || has(/(^|\n)(Sacrifice|Exile|Discard|Pay|Tap|Remove)[^:\n]*:/, t) || kw.has('equip') || /Planeswalker/.test(type),
    manaAbility: has(/:\s*Add \{/, t),
    // Mots-clés (sur elle-même ou donnés à d'autres)
    deathtouch: kwOrText('deathtouch') || grants('deathtouch'), trample: kwOrText('trample') || grants('trample'),
    lifelink: kwOrText('lifelink') || grants('lifelink'), firstStrike: kwOrText('first strike') || grants('first strike'),
    doubleStrike: kwOrText('double strike') || grants('double strike'), infect: kwOrText('infect') || grants('infect'),
    indestructible: kwOrText('indestructible') || grants('indestructible'),
    hexproof: kwOrText('hexproof') || grants('hexproof'), shroud: kwOrText('shroud') || grants('shroud'),
    protection: has(/protection from/i, t), ward: kw.has('ward') || has(/(^|\n)Ward/, t),
    splitSecond: kw.has('split second'), flash: kw.has('flash'), haste: kwOrText('haste') || grants('haste'),
    cascade: kw.has('cascade'), storm: kw.has('storm'),
    regenerate: has(/[Rr]egenerate/, t),
    protEverything: has(/protection from everything/i, t),
    counterAbility: has(/[Cc]ounter target (activated or triggered |triggered or activated |triggered |activated )ability/, t) || has(/[Cc]ounter target [^.]*ability/, t),
    triggered: has(/(^|\n)(When|Whenever|At the beginning)/, t) || has(/— (When|Whenever|At)/, t),
    entersAttacking: has(/onto the battlefield (tapped and )?attacking|enters? (the battlefield )?(tapped and )?attacking/i, t),
    attackTax: has(/can't attack (you|you or planeswalkers you control) unless/i, t),
    eminence: has(/in the command zone or on the battlefield/i, t),
    // Doubleurs de déclenchements (Teysa Karlov, Panharmonicon, Elesh Norn…)
    trigDoubleDies: has(/(dying|dies)[^.]*causes? a triggered ability[^.]*triggers? an additional time/i, t),
    trigDoubleEtb: has(/entering[^.]*causes? a triggered ability[^.]*triggers? an additional time/i, t),
    trigDoubleAny: has(/triggered abilit(y|ies)[^.]*trigger[^.]*an additional time/i, t),
  };
  return f;
}

// Description « côté règles » de ce que fait une carte.
function roles(card, f) {
  const r = [];
  const add = (label, rules) => r.push({ label, rules });
  if (f.selfDies || f.anyDies) add('Capacité déclenchée « quand… meurt » : elle regarde en arrière (« look back ») et voit la situation juste avant que la créature quitte le champ de bataille. « Meurt » = mise au cimetière depuis le champ de bataille.', ['700.4', '603.10a']);
  if (f.ltb) add('Capacité déclenchée « quand… quitte le champ de bataille » (vers n\'importe quelle zone, y compris l\'exil ou la zone de commandement).', ['603.6c', '603.10a']);
  if (f.etbSelf || f.etbOther) add('Capacité déclenchée d\'arrivée sur le champ de bataille (ETB).', ['603.6a']);
  if (f.entersWith) add('« Arrive avec / arrive engagé / au moment où elle arrive » : c\'est un effet de remplacement, pas un déclenchement.', ['614.1c', '614.12']);
  if (f.castTrig) add('Capacité déclenchée quand un sort est lancé : les copies de sorts ne sont pas « lancées ».', ['707.10']);
  if (f.lifeGainTrig || f.lifeLossTrig) add('Capacité déclenchée sur un gain ou une perte de points de vie.', ['603.2']);
  if (f.gyToExile || f.tokenDouble || f.counterDouble || f.damageDouble || f.drawRepl || f.lifeRepl || (f.replacement && !f.entersWith && !r.length))
    add('Effet de remplacement (« au lieu de ») : l\'événement d\'origine n\'a jamais lieu, il est remplacé.', ['614.1a', '614.6']);
  if (f.preventDmg) add('Effet de prévention des blessures.', ['615.1']);
  if (f.noEtbTrig || f.noDiesTrig || f.cantGainLife || f.cantLose || f.castBlockNotHand || f.castBlockGyLib || f.activatedBlock || f.cantBeCountered || f.cantLoseLife)
    add('Effet « ne peut pas » : il l\'emporte sur tout effet qui permet ou demande la même chose.', ['101.2', '614.17']);
  if (f.copyEff) add('Effet de copie : couche 1. La copie ne prend que les valeurs copiables (texte, types, coût, force/endurance imprimées), pas les marqueurs, Auras ou effets.', ['613.1a', '707.2']);
  if (f.controlChange) add('Changement de contrôle : couche 2.', ['613.1b']);
  if (f.landTypeSet) add('Fixe le type de terrain : couche 4. Le terrain perd ses capacités et ses anciens types de terrain.', ['613.1d', '305.7']);
  if (f.landTypeAdd || f.becomesCreature) add('Ajoute un type : couche 4.', ['613.1d']);
  if (f.loseAbilities) add('Retire des capacités : couche 6.', ['613.1f']);
  if (f.ptSet) add('Fixe la force/endurance : couche 7b.', ['613.4b']);
  if (f.ptMod) add('Modifie la force/endurance (bonus, marqueurs) : couche 7c.', ['613.4c']);
  if (f.manaAbility) add('Capacité de mana : elle ne passe pas par la pile et ne peut pas être contrée.', ['605.1a', '605.3a']);
  if (f.sacOutlet) add('Sacrifice comme coût : impossible à répondre au sacrifice lui-même, et l\'indestructible n\'empêche pas le sacrifice.', ['701.21a', '601.2f']);
  if (f.exileUntil) add('Exil « jusqu\'à ce que cette carte quitte le champ de bataille ».', ['610.3']);
  if (f.eminence) add('Fonctionne aussi depuis la zone de commandement (Éminence) : active même si le commandant n\'a jamais été lancé.', ['113.6b']);
  if (f.protEverything) add('Protection contre tout : ne peut pas être ciblé, enchanté, équipé ni bloqué, et les blessures sont prévenues. Les effets de masse qui ne ciblent pas (destruction, sacrifice, -X/-X) fonctionnent.', ['702.16j']);
  if (f.freeCast) add('Lancer « sans payer son coût de mana » : c\'est un coût alternatif ; les coûts additionnels (dont la taxe de commandant) restent dus.', ['118.9', '601.2f']);
  return r;
}

const cmdName = (b) => /commandant/.test(b) ? b : `${b} (commandant)`;
const nm = (c, fr) => fr && fr[c.id] && fr[c.id].toLowerCase() !== c.name.toLowerCase() ? `${c.name} (${fr[c.id]})` : c.name;

// Règles d'interaction : (a agit sur b). Chaque règle renvoie { title, text, rules } ou null.
const PAIR = [
  (a, b, A, B) => A.trigDoubleDies && (B.selfDies || B.anyDies) && {
    title: `${a} fait se déclencher une fois de plus les capacités « meurt » de ${b}`,
    text: `Si la mort d'une créature déclenche une capacité d'un permanent que tu contrôles, cette capacité se déclenche une fois de plus. ${b} se déclenche donc deux fois pour chaque créature qui meurt, y compris si ${a} meurt en même temps. Ce n'est pas une copie : chaque déclenchement choisit ses propres cibles. Deux effets de ce type donnent 3 déclenchements, pas 4. Une capacité « quand vous sacrifiez » ne se déclenche qu'une fois.`,
    rules: ['603.2d', '603.10a', '700.4'],
  },
  (a, b, A, B) => A.trigDoubleEtb && (B.etbSelf || B.etbOther) && {
    title: `${a} fait se déclencher une fois de plus les capacités d'arrivée de ${b}`,
    text: `Si l'arrivée d'un permanent (selon le texte de ${a}) déclenche une capacité d'un permanent que tu contrôles, elle se déclenche une fois de plus, même si tu ne contrôles pas le permanent qui arrive. Ça vaut aussi pour la propre capacité d'arrivée de ${b}. Les effets « arrive avec… » ou « au moment où il arrive » sont des remplacements : ils ne sont pas doublés. Deux effets de ce type donnent 3 déclenchements, pas 4.`,
    rules: ['603.2d', '603.6a', '614.1c'],
  },
  (a, b, A, B) => A.controlChange && B.creature && !A.haste && {
    title: `${b} volé par ${a} : mal d'invocation`,
    text: `Une créature qui change de contrôleur ne peut pas attaquer ni utiliser une capacité avec {T} ce tour-ci pour son nouveau contrôleur (sauf si elle a la célérité) : il faut la contrôler depuis le début de son tour. Au tour suivant, si le vol dure encore, elle peut attaquer normalement.`,
    rules: ['302.6'],
  },
  (a, b, A, B) => A.costReduce && (B.creature || B.instantSorcery || B.canCommand) && {
    title: `Réduction de coût de ${a}`,
    text: `La réduction ne s'applique qu'à la partie générique du coût (les chiffres) : elle ne retire jamais un symbole de couleur ni le symbole {C}. Elle s'applique après les augmentations et la taxe de commandant.`,
    rules: ['118.7a', '601.2f'],
  },
  (a, b, A, B) => B.protEverything && (A.targets && !A.massEffect) && {
    title: `${a} ne peut pas cibler ce qui a la protection contre tout (${b})`,
    text: `La protection contre tout empêche d'être ciblé par n'importe quel sort ou capacité, et prévient toutes les blessures. Seuls les effets qui ne ciblent pas fonctionnent : destruction de masse, sacrifice imposé, -X/-X global, perte de points de vie.`,
    rules: ['702.16j'],
  },
  (a, b, A, B) => B.protEverything && (A.destroyAll || A.exileAll || A.sacEffect || A.minus || A.massEffect) && {
    title: `${a} passe outre la protection contre tout de ${b}`,
    text: `${a} ne cible pas et n'inflige pas de blessures : la protection contre tout ne l'empêche pas. (Attention : un permanent hors phase, comme avec Teferi's Protection, n'est pas affecté du tout, car il est traité comme s'il n'existait pas.)`,
    rules: ['702.16j', '702.26b'],
  },
  (a, b, A, B) => A.counterAbility && (B.triggered || B.activated) && {
    title: `${a} peut contrecarrer une capacité de ${b}`,
    text: `Une capacité déclenchée ou activée sur la pile peut être contrecarrée : elle ne fait rien et les coûts payés ne sont pas remboursés. La source reste en jeu. Les capacités de mana ne vont pas sur la pile et ne peuvent pas être contrecarrées.`,
    rules: ['701.6a', '701.6b', '605.3a'],
  },
  (a, b, A, B) => A.sacOutlet && B.targets && (B.destroyT || B.exileT || B.bounce || B.controlChange) && {
    title: `Répondre à ${b} en sacrifiant avec ${a}`,
    text: `Le sacrifice de ${a} est un coût : personne ne peut y répondre. Si tu sacrifies la créature visée par ${b} en réponse, ${b} perd sa cible et ne fait rien à la résolution (et tes capacités « quand… meurt » se déclenchent).`,
    rules: ['601.2h', '608.2b', '700.4'],
  },
  (a, b, A, B) => A.entersAttacking && (B.attackTrig || B.attackTax) && {
    title: `Les créatures de ${a} arrivent en attaquant : ${b} ne voit pas d'attaque déclarée`,
    text: `Une créature mise sur le champ de bataille « attaquant » n'a pas été déclarée comme attaquant : elle ne déclenche pas « chaque fois que… attaque », et les taxes d'attaque (Ghostly Prison, Propaganda) ne s'appliquent pas à elle. Elle inflige pourtant des blessures de combat normalement.`,
    rules: ['508.3a', '508.4'],
  },
  (a, b, A, B) => A.tokenDouble && B.tokenDouble && a < b && {
    title: `Deux doubleurs de jetons : ${a} + ${b}`,
    text: `Chacun est un effet de remplacement qui s'applique une seule fois à chaque création de jetons. Avec les deux, tu les appliques l'un après l'autre : 1 jeton → 2 → 4. Avec trois doubleurs : 8. L'ordre ne change rien au total quand ce sont tous des doublements.`,
    rules: ['614.16', '616.1', '614.5'],
  },
  (a, b, A, B) => A.counterDouble && B.counterDouble && a < b && {
    title: `Deux doubleurs de marqueurs : ${a} + ${b}`,
    text: `Chaque effet s'applique une fois au même événement : 1 marqueur → 2 → 4. Si l'un des effets ajoute un marqueur (« un de plus ») au lieu de doubler, l'ordre compte : ajouter d'abord puis doubler donne plus.`,
    rules: ['614.16', '616.1', '614.5'],
  },
  (a, b, A, B) => A.gyToExile && (B.selfDies || B.anyDies) && {
    title: `${a} empêche les capacités « meurt » de ${b}`,
    text: `${a} est un effet de remplacement : une créature qui devrait aller au cimetière va en exil à la place. Elle ne « meurt » donc jamais, et les capacités « quand… meurt » de ${b} ne se déclenchent pas. Les capacités « quand… quitte le champ de bataille » se déclenchent, elles, normalement.`,
    rules: ['614.6', '700.4', '603.6c'],
  },
  (a, b, A, B) => A.noEtbTrig && (B.etbSelf || B.etbOther) && {
    title: `${a} bloque les capacités d'arrivée de ${b}`,
    text: `Avec ${a}, une créature qui arrive sur le champ de bataille ne déclenche aucune capacité (ni la sienne, ni celles des autres permanents qui « voient » l'arrivée d'une créature). Les effets « arrive avec… / arrive engagé » ne sont pas des déclenchements et s'appliquent quand même. Les capacités qui se déclenchent sur l'arrivée d'un permanent non-créature (terrain, artefact…) ne sont pas concernées.`,
    rules: ['603.6a', '614.1c', '101.2'],
  },
  (a, b, A, B) => A.noDiesTrig && (B.selfDies || B.anyDies) && {
    title: `${a} bloque les capacités « meurt » de ${b}`,
    text: `Quand une créature meurt, ${a} empêche les capacités de se déclencher de cette mort. ${b} ne déclenche donc pas.`,
    rules: ['101.2', '700.4'],
  },
  (a, b, A, B) => A.tokenDouble && B.tokenMake && {
    title: `${a} double les jetons créés par ${b}`,
    text: `${a} est un effet de remplacement : quand ${b} devrait créer des jetons sous ton contrôle, il en crée deux fois plus. Avec plusieurs effets de ce genre (ex. deux doubleurs), tu choisis l'ordre et chacun s'applique une fois : 1 → 2 → 4. Les jetons créés « en même temps » arrivent ensemble et déclenchent chacun les capacités « quand une créature arrive ».`,
    rules: ['614.1a', '614.16', '616.1', '614.5'],
  },
  (a, b, A, B) => A.counterDouble && B.countersPut && {
    title: `${a} double les marqueurs mis par ${b}`,
    text: `Quand ${b} met des marqueurs sur un permanent que tu contrôles (y compris « arrive avec N marqueurs »), ${a} remplace l'événement : deux fois plus de marqueurs. Plusieurs remplacements s'appliquent dans l'ordre que tu choisis, une fois chacun.`,
    rules: ['614.16', '122.6', '616.1', '614.5'],
  },
  (a, b, A, B) => A.landTypeSet && (B.landTypeAdd || (B.land && !B.basic)) && {
    title: B.landTypeAdd ? `${a} contre ${b} : dépendance dans la couche 4` : `${a} transforme ${b} en terrain de base`,
    text: B.landTypeAdd
      ? `Les deux effets s'appliquent dans la couche 4 (changement de type). L'effet de ${b} dépend de celui de ${a}, car ${a} lui retire sa capacité. On applique donc d'abord ${a}, quel que soit l'ordre d'arrivée : ${b} perd sa capacité et son effet disparaît. Avec Blood Moon et Urborg, aucun terrain ne devient un Marais, et Urborg n'est plus qu'une Montagne.`
      : `${a} fixe le type de terrain de ${b} : il perd ses anciens types et toutes les capacités de son texte. Il ne garde que la capacité de mana du type de base qu'il devient. Ses capacités « arrive engagé » ou d'arrivée ne fonctionnent plus non plus s'il arrive alors que ${a} est déjà en jeu.`,
    rules: B.landTypeAdd ? ['613.1d', '613.8', '613.8a', '305.7'] : ['305.7', '613.1d', '614.12'],
  },
  (a, b, A, B) => A.loseAbilities && (B.creature || B.becomesCreature) && {
    title: `${a} retire les capacités de ${b}`,
    text: `${a} retire les capacités dans la couche 6. Les effets de ${b} qui s'appliquent dans des couches précédentes (copie, contrôle, type, couleur) continuent pourtant de s'appliquer une fois commencés. Ceux des couches 6 et 7 s'appliquent dans l'ordre des horodatages, sauf s'il existe une dépendance. Si les deux cartes fixent la force et l'endurance (couche 7b), c'est la plus récente qui gagne.`,
    rules: ['613.1f', '613.6', '613.7', '613.8', '613.4b'],
  },
  (a, b, A, B) => A.ptSet && (B.ptMod) && {
    title: `Force/endurance : ${a} (fixe) et ${b} (modifie)`,
    text: `Les effets qui fixent la force/endurance (couche 7b) s'appliquent avant les bonus, malus et marqueurs (couche 7c), peu importe l'ordre d'arrivée. Une créature fixée à 1/1 avec un marqueur +1/+1 est donc 2/2.`,
    rules: ['613.4b', '613.4c'],
  },
  (a, b, A, B) => A.copyEff && B.legendary && {
    title: `Copier ${b} (légendaire) avec ${a}`,
    text: `La copie a le même nom et est légendaire. Si tu contrôles l'original et la copie, la règle de légende t'oblige à en garder un seul ; l'autre va au cimetière (ce n'est ni une destruction ni un sacrifice). La copie prend seulement les valeurs copiables : pas les marqueurs, ni les Auras, ni les effets en cours. Une copie d'un commandant n'est pas un commandant.`,
    rules: ['704.5j', '707.2', '903.3'],
  },
  (a, b, A, B) => A.copyEff && !B.legendary && (B.creature) && (B.etbSelf) && {
    title: `Copier ${b} avec ${a}`,
    text: `La copie arrive en tant que ${b} : ses capacités « quand cette créature arrive » se déclenchent pour la copie. Elle ne prend que les valeurs copiables : pas les marqueurs, ni les Auras, ni les bonus temporaires.`,
    rules: ['707.2', '614.1c', '603.6a'],
  },
  (a, b, A, B) => A.counterSpell && B.cantBeCountered && {
    title: `${a} ne peut pas contrecarrer ${b}`,
    text: `${b} « ne peut pas être contrecarré ». Le « ne peut pas » l'emporte : tu peux lancer ${a} en ciblant ${b}, mais à la résolution ${b} n'est pas contrecarré. Les autres effets de ${a} s'appliquent quand même.`,
    rules: ['101.2', '701.6a'],
  },
  (a, b, A, B) => B.splitSecond && (A.counterSpell || A.instantSorcery || A.activated) && {
    title: `${b} a le second partagé (split second)`,
    text: `Tant que ${b} est sur la pile, personne ne peut lancer de sorts ni activer de capacités, sauf les capacités de mana. ${a} ne peut donc pas y répondre. Les capacités déclenchées se déclenchent et se résolvent quand même, et on peut répondre une fois ${b} résolu.`,
    rules: ['702.61a', '603.2a'],
  },
  (a, b, A, B) => (A.destroyT || A.destroyAll) && B.indestructible && {
    title: `${a} contre l'indestructible de ${b}`,
    text: `Indestructible empêche d'être détruit, que ce soit par un effet « détruisez » ou par des blessures mortelles. ${a} ne détruit donc pas ce permanent. En revanche, l'exil, le sacrifice, le renvoi en main et une endurance de 0 ou moins (malus -X/-X) fonctionnent.`,
    rules: ['702.12b', '701.8', '704.5f'],
  },
  (a, b, A, B) => A.minus && B.indestructible && {
    title: `Malus -X/-X de ${a} contre l'indestructible de ${b}`,
    text: `Une créature dont l'endurance tombe à 0 ou moins va au cimetière par une action basée sur un état. Ce n'est pas une destruction : indestructible ne la sauve pas, et la régénération non plus.`,
    rules: ['704.5f', '702.12b'],
  },
  (a, b, A, B) => (A.destroyT || A.destroyAll) && B.regenerate && {
    title: `${a} et la régénération de ${b}`,
    text: `Un bouclier de régénération remplace la prochaine destruction : le permanent est engagé, retiré du combat et ses blessures sont retirées. Ça ne marche que si l'effet dit « détruire » et ne précise pas « ne peut pas être régénéré ».`,
    rules: ['701.19a', '701.19c'],
  },
  (a, b, A, B) => A.targets && !A.massEffect && (B.hexproof || B.shroud || B.protection || B.ward) && {
    title: `${a} peut-il cibler ce que protège ${b} ?`,
    text: [
      B.shroud && `Linceul : ne peut être la cible d'aucun sort ni capacité, même les tiens.`,
      B.hexproof && `Défense talismanique : ne peut pas être ciblé par les sorts et capacités de tes adversaires. Toi, tu peux le cibler.`,
      B.protection && `Protection : ne peut pas être ciblé par ce qui a la qualité indiquée. Elle empêche aussi les blessures, les Auras et Équipements de cette qualité, et le blocage par des créatures de cette qualité.`,
      B.ward && `Garde (ward) : le ciblage est possible, mais le sort ou la capacité est contrecarré à moins que l'adversaire paie le coût de garde.`,
      `Les effets qui ne ciblent pas (« tous », « chaque », « l'adversaire sacrifie ») passent outre.`,
    ].filter(Boolean).join(' '),
    rules: [B.shroud && '702.18a', B.hexproof && '702.11b', B.protection && '702.16b', B.protection && '702.16e', B.ward && '702.21a', '608.2b'].filter(Boolean),
  },
  (a, b, A, B) => A.massEffect && (A.destroyAll || A.exileAll || A.bounce || A.minus) && (B.hexproof || B.shroud || B.protection) && {
    title: `${a} passe outre la protection de ${b}`,
    text: `${a} ne cible pas (« tous » / « chaque ») : la défense talismanique, le linceul et la protection ne l'empêchent pas. Seul indestructible empêche une destruction.`,
    rules: ['702.11b', '702.18a', '702.16b', '702.12b'],
  },
  (a, b, A, B) => A.sacEffect && !A.sacOutlet && (B.indestructible || B.hexproof || B.protection) && {
    title: `Un sacrifice imposé par ${a} contre ${b}`,
    text: `Sacrifier n'est pas détruire, et l'effet ne cible pas la créature : ni indestructible, ni défense talismanique, ni protection n'empêchent le sacrifice. Le joueur choisit lui-même quoi sacrifier.`,
    rules: ['701.21a', '702.12b'],
  },
  (a, b, A, B) => A.deathtouch && B.trample && {
    title: `Contact mortel et piétinement (${a} + ${b})`,
    text: `Avec le contact mortel, 1 blessure suffit pour être une blessure mortelle au moment de l'assignation. Une créature avec contact mortel et piétinement peut donc assigner 1 blessure à chaque bloqueur et le reste au joueur défenseur.`,
    rules: ['702.2c', '702.19b'],
  },
  (a, b, A, B) => A.deathtouch && (B.dealsDamage || B.fight) && !B.trample && {
    title: `Contact mortel avec les blessures de ${b}`,
    text: `Le contact mortel compte pour toute source qui l'a, pas seulement en combat. Si la source avec contact mortel inflige des blessures (combat, combat entre créatures, capacité « inflige »), toute créature qui en reçoit au moins 1 est détruite. Si c'est ${b} qui inflige les blessures, c'est ${b} qui doit avoir le contact mortel.`,
    rules: ['702.2b', '704.5h'],
  },
  (a, b, A, B) => A.lifelink && B.lifeGainTrig && {
    title: `Lien de vie (${a}) et déclencheurs de gain de vie (${b})`,
    text: `Les blessures infligées par une source avec lien de vie font gagner autant de points de vie, en un seul événement par source. Ça déclenche une fois « chaque fois que vous gagnez des points de vie » par événement. En combat, toutes les blessures sont infligées en même temps : une créature avec lien de vie qui blesse deux cibles ne déclenche qu'une fois.`,
    rules: ['702.15b', '120.3', '510.2'],
  },
  (a, b, A, B) => A.lifeGainTrig && A.loseLife && B.lifeLossTrig && B.gainsLife && {
    title: `Boucle : ${a} + ${b}`,
    text: `Chaque gain de vie fait perdre des points de vie à un adversaire, et chaque perte de vie d'un adversaire te fait gagner des points de vie : la boucle se répète. Comme ces capacités sont obligatoires, elle ne s'arrête que quand un adversaire tombe à 0 point de vie et perd la partie (action basée sur un état), ou si quelqu'un y répond (en détruisant une des cartes, par exemple). En pratique, on raccourcit en annonçant le résultat (règle des raccourcis). Une boucle obligatoire qui ne peut vraiment jamais s'arrêter donne une partie nulle.`,
    rules: ['104.4b', '704.5a', '732.1b', '732.2a'],
  },
  (a, b, A, B) => A.cantGainLife && (B.gainsLife || B.lifeGainTrig) && {
    title: `${a} empêche le gain de vie de ${b}`,
    text: `Un joueur qui ne peut pas gagner de points de vie n'en gagne pas. Le gain n'a pas lieu, donc « chaque fois que vous gagnez des points de vie » ne se déclenche pas, et le lien de vie ne rapporte rien.`,
    rules: ['119.7', '119.10', '101.2'],
  },
  (a, b, A, B) => A.cantLose && (B.winsGame || B.loseLife || B.dealsDamage || B.infect) && {
    title: `${a} : « vous ne pouvez pas perdre la partie »`,
    text: `Tant que ${a} est sur le champ de bataille, son contrôleur ne perd pas la partie, même à 0 point de vie, avec 10 marqueurs poison, 21 blessures de commandant ou en piochant dans une bibliothèque vide. Et ses adversaires ne peuvent pas gagner. Dès que ${a} quitte le champ de bataille, les actions basées sur un état le font perdre s'il remplit encore une condition de défaite.`,
    rules: ['101.2', '704.5a', '704.5c', '903.10a'],
  },
  (a, b, A, B) => A.drawRepl && (B.draws || B.drawTrig) && {
    title: `${a} remplace la pioche`,
    text: `${a} est un effet de remplacement sur la pioche : il s'applique au moment où ${b} te fait piocher, s'il remplit sa condition (par exemple une bibliothèque vide). La pioche d'origine n'a pas lieu, donc tu ne perds pas pour avoir pioché dans une bibliothèque vide.`,
    rules: ['614.1a', '614.6', '704.5b'],
  },
  (a, b, A, B) => A.castBlockNotHand && B.canCommand && {
    title: `${a} empêche les adversaires de lancer leur commandant`,
    text: `${a} interdit à tes adversaires de lancer des sorts ailleurs que depuis leur main. La zone de commandement n'est pas la main : tant que ${a} est en jeu, tes adversaires ne peuvent pas lancer leur commandant (${b} s'il est le leur) depuis la zone de commandement. Toi, tu n'es pas concerné.`,
    rules: ['101.2', '903.8'],
  },
  (a, b, A, B) => A.castBlockGyLib && B.canCommand && {
    title: `${a} n'affecte pas la zone de commandement`,
    text: `${a} n'interdit que le cimetière et la bibliothèque. Lancer son commandant depuis la zone de commandement reste possible.`,
    rules: ['903.8'],
  },
  (a, b, A, B) => A.activatedBlock && B.activated && {
    title: `${a} bloque les capacités activées de ${b}`,
    text: `Les capacités activées (celles écrites « coût : effet », y compris équiper et les capacités de loyauté) de la carte visée ne peuvent plus être activées${A.activatedBlockMana ? ', sauf les capacités de mana' : ''}. Les capacités déclenchées et statiques fonctionnent toujours.`,
    rules: ['101.2', '603.2a', '605.1a'],
  },
  (a, b, A, B) => A.costIncrease && (B.canCommand || B.instantSorcery) && {
    title: `Coût augmenté par ${a}`,
    text: `Le coût total d'un sort = coût de mana (ou coût alternatif) + coûts additionnels (dont la taxe de commandant) + augmentations, puis on applique les réductions. Le coût de mana imprimé et la valeur de mana ne changent pas.`,
    rules: ['601.2f', '903.8'],
  },
  (a, b, A, B) => A.freeCast && (B.hasX || B.canCommand) && {
    title: `Lancer ${b} sans payer son coût de mana avec ${a}`,
    text: [B.hasX && `X vaut 0 quand on lance un sort sans payer son coût de mana.`, B.canCommand && `Pour un commandant lancé depuis la zone de commandement, la taxe (2 par lancement précédent) est un coût additionnel : elle reste à payer.`].filter(Boolean).join(' '),
    rules: [B.hasX && '107.3b', '118.9', '903.8'].filter(Boolean),
  },
  (a, b, A, B) => A.exileUntil && B.canCommand && {
    title: `${a} exile ${cmdName(b)}`,
    text: `Le propriétaire du commandant peut le mettre dans la zone de commandement à la prochaine vérification des actions basées sur un état. Mais s'il le fait, le commandant ne reviendra pas quand ${a} quittera le champ de bataille, puisqu'il n'est plus en exil. S'il le laisse en exil, il reviendra sur le champ de bataille à ce moment-là.`,
    rules: ['903.9a', '610.3', '400.7'],
  },
  (a, b, A, B) => A.flicker && (B.creature || B.canCommand) && {
    title: `${a} fait sortir et revenir ${b} (« clignotement »)`,
    text: `${b} revient comme un nouvel objet. Il perd ses marqueurs, ses Auras et Équipements, et les effets qui le visaient. Il ne peut pas attaquer ni utiliser {T} ce tour-ci (sauf célérité), et ses capacités d'arrivée se déclenchent de nouveau. Un commandant exilé puis renvoyé pendant la résolution revient directement : il n'y a pas de vérification des actions basées sur un état entre les deux.`,
    rules: ['400.7', '302.6', '603.6a', '903.9a'],
  },
  (a, b, A, B) => (A.bounce || A.tuck) && B.canCommand && {
    title: `${a} renvoie ${cmdName(b)} en main ou dans la bibliothèque`,
    text: `Si un commandant devait aller dans la main ou la bibliothèque de son propriétaire, celui-ci peut le mettre dans la zone de commandement à la place (effet de remplacement, choisi immédiatement).`,
    rules: ['903.9b'],
  },
  (a, b, A, B) => (A.exileT || A.exileAll || A.destroyT || A.destroyAll || A.sacEffect || A.minus) && B.canCommand && !A.exileUntil && !A.flicker && {
    title: `${a} retire ${cmdName(b)} du champ de bataille`,
    text: `S'il va au cimetière ou en exil, son propriétaire peut le mettre dans la zone de commandement à la prochaine vérification des actions basées sur un état. Les capacités « meurt » se déclenchent s'il est passé par le cimetière. Il pourra être relancé avec la taxe de commandant (+{2} par lancement précédent depuis la zone de commandement).`,
    rules: ['903.9a', '700.4', '903.8'],
  },
  (a, b, A, B) => A.controlChange && B.canCommand && {
    title: `${a} vole ${cmdName(b)}`,
    text: `Le nouveau contrôleur l'utilise normalement. Les blessures de combat qu'il inflige comptent toujours pour les 21 blessures « de ce commandant », même s'il attaque son propriétaire. S'il quitte le champ de bataille, c'est son propriétaire qui choisit de le mettre dans la zone de commandement.`,
    rules: ['613.1b', '903.10a', '903.9a'],
  },
  (a, b, A, B) => A.anyDies && B.canCommand && {
    title: `${a} se déclenche quand ${b} meurt`,
    text: `Un commandant détruit ou sacrifié va d'abord au cimetière : il « meurt », donc ${a} se déclenche (s'il correspond à sa condition). Ce n'est qu'ensuite, lors de la vérification des actions basées sur un état, que son propriétaire peut le mettre dans la zone de commandement. Le déclenchement a déjà eu lieu. En revanche, s'il est exilé (Swords to Plowshares…) ou renvoyé en main, il ne meurt pas et rien ne se déclenche.`,
    rules: ['700.4', '903.9a', '603.10a'],
  },
  (a, b, A, B) => A.anyDies && (B.destroyAll || B.sacOutlet || B.minus || B.sacEffect) && {
    title: `${a} se déclenche pour chaque créature tuée par ${b}`,
    text: `Si plusieurs créatures meurent en même temps (destruction massive, -X/-X), ${a} se déclenche une fois pour chacune. Ça inclut ${a} lui-même s'il meurt en même temps : les capacités « meurt » regardent en arrière. Avec un sacrifice comme coût, il se déclenche à chaque sacrifice.`,
    rules: ['603.10a', '700.4', '603.3b'],
  },
  (a, b, A, B) => A.etbOther && B.tokenMake && {
    title: `${a} se déclenche pour chaque jeton créé par ${b}`,
    text: `Chaque jeton qui arrive sur le champ de bataille est un permanent qui arrive : ${a} se déclenche une fois par jeton concerné, même s'ils arrivent tous en même temps.`,
    rules: ['603.6a', '111.1'],
  },
  (a, b, A, B) => A.castTrig && (B.copySpell || B.storm) && {
    title: `Les copies de ${b} ne déclenchent pas ${a}`,
    text: `Une copie de sort mise sur la pile n'est pas « lancée ». Les capacités « chaque fois que vous lancez un sort » ne se déclenchent donc pas pour les copies (tempête, « copiez le sort »).`,
    rules: ['707.10', '702.40a'],
  },
  (a, b, A, B) => A.castTrig && B.cascade && {
    title: `La cascade de ${b} déclenche ${a}`,
    text: `La cascade lance réellement la carte trouvée (sans payer son coût de mana) : c'est un sort lancé, qui déclenche « chaque fois que vous lancez un sort ».`,
    rules: ['702.85a'],
  },
  (a, b, A, B) => A.damageDouble && (B.dealsDamage || B.creature) && {
    title: `${a} augmente les blessures de ${b}`,
    text: `C'est un effet de remplacement sur les blessures. Si ${b} est un commandant, les blessures de combat augmentées comptent en entier pour les 21 blessures de commandant.`,
    rules: ['614.1a', '903.10a'],
  },
  (a, b, A, B) => A.preventDmg && (B.lifelink || B.deathtouch || B.infect) && {
    title: `${a} empêche les blessures, donc leurs effets`,
    text: `Des blessures prévenues ne sont pas infligées : pas de gain de vie par le lien de vie, pas de destruction par le contact mortel, pas de marqueurs poison par l'infection.`,
    rules: ['615.1', '702.15b', '702.2b', '702.90b'],
  },
  (a, b, A, B) => A.phasing && (B.creature || B.canCommand) && {
    title: `Mise hors phase (${a})`,
    text: `Un permanent hors phase est traité comme s'il n'existait pas, mais il ne change pas de zone. Ce n'est pas « quitter le champ de bataille » : pas de capacité « meurt » ou « quitte le champ de bataille », pas de passage en zone de commandement. Ses Auras et Équipements disparaissent avec lui, et il revient lors de l'étape de dégagement de son contrôleur.`,
    rules: ['702.26b', '702.26d', '702.26g'],
  },
  (a, b, A, B) => A.gyToExile && B.canCommand && {
    title: `${a} et un commandant qui meurt`,
    text: `Avec ${a}, le commandant ne va pas au cimetière mais directement en exil. Son propriétaire peut ensuite le mettre dans la zone de commandement depuis l'exil.`,
    rules: ['614.6', '903.9a'],
  },
];

// Classe les rulings d'une carte selon leur lien avec les autres cartes citées et la question.
function relatedRulings(db, card, others, qWords) {
  const list = db.rulings[card.id] || [];
  const names = others.flatMap(o => [o.name.toLowerCase(), o.name.split(',')[0].toLowerCase()]);
  const keys = new Set();
  for (const o of others) {
    const F = features(o);
    if (F.selfDies || F.anyDies) keys.add('dies');
    if (F.tokenMake) keys.add('token');
    if (F.copyEff || F.copySpell) keys.add('copy');
    if (F.exileT || F.exileAll || F.gyToExile || F.flicker) keys.add('exile');
    if (F.destroyT || F.destroyAll) keys.add('destroy');
    if (F.controlChange) keys.add('control');
    if (F.countersPut || F.counterDouble) keys.add('counter');
    if (F.sacOutlet || F.sacEffect) keys.add('sacrific');
    if (F.indestructible) keys.add('indestructible');
    if (F.loseAbilities) keys.add('abilities');
    if (F.landTypeSet || F.landTypeAdd) keys.add('land type');
    if (F.castTrig || F.cascade) keys.add('cast');
    if (F.canCommand) keys.add('commander');
  }
  return list.map(r => {
    const t = r.t.toLowerCase();
    let s = 0;
    if (names.some(n => n.length > 3 && t.includes(n))) s += 10;
    for (const k of keys) if (t.includes(k)) s += 2;
    for (const w of qWords) if (w.length > 4 && t.includes(w)) s += 1;
    return { r, s };
  }).filter(x => x.s >= 2).sort((a, b) => b.s - a.s).slice(0, 3).map(x => x.r);
}

function analyse(db, cards, question = '') {
  const fr = db.frNames || {};
  const F = new Map(cards.map(c => [c.id, features(c)]));
  const perCard = cards.map(c => ({ id: c.id, name: nm(c, fr), roles: roles(c, F.get(c.id)) }));
  const points = [];
  const seen = new Set();
  const saysCommander = /command|general|g[ée]n[ée]ral/i.test(question);
  for (const a of cards) for (const b of cards) {
    if (a === b) continue;
    // Deux commandants potentiels cités ensemble sans parler de commandant : on ne traite pas b comme un commandant visé.
    const FB = F.get(a.id).canCommand && F.get(b.id).canCommand && !saysCommander ? { ...F.get(b.id), canCommand: false } : F.get(b.id);
    for (const rule of PAIR) {
      const p = rule(nm(a, fr), nm(b, fr), F.get(a.id), FB);
      if (p && !seen.has(p.title)) { seen.add(p.title); points.push({ ...p, cards: [a.name, b.name] }); }
    }
  }
  // Même carte : contact mortel + piétinement sur une seule créature.
  for (const c of cards) {
    const f = F.get(c.id);
    if (f.deathtouch && f.trample && !points.some(p => /Contact mortel et piétinement/.test(p.title))) {
      points.push({ title: `Contact mortel et piétinement sur ${nm(c, fr)}`, text: 'Avec le contact mortel, 1 blessure par bloqueur suffit comme blessure mortelle : le reste peut être assigné au joueur défenseur.', rules: ['702.2c', '702.19b'], cards: [c.name] });
    }
  }
  // Commandant cité dans la question : on applique les règles « commandant » à la carte qui agit.
  const mentionsCommander = /command|general|g[ée]n[ée]ral/i.test(question);
  if (mentionsCommander) {
    const label = !/\bmon (commandant|g[ée]n[ée]ral)/i.test(question) && /adversaire|adverse|son commandant|leur commandant|\bopp?onent/i.test(question) ? 'le commandant adverse' : 'ton commandant';
    const fake = { id: '_cmd', name: label, type: 'Legendary Creature', text: '', canCommand: true };
    const Fc = features(fake);
    for (const a of cards) {
      if (F.get(a.id).canCommand && cards.length > 1) continue;
      for (const rule of PAIR) {
        const p = rule(nm(a, fr), label, F.get(a.id), Fc);
        if (p && !seen.has(p.title)) { seen.add(p.title); points.push({ ...p, cards: [a.name] }); }
      }
    }
  }
  // Une seule carte et « une créature » dans la question : on applique les règles à une créature quelconque.
  if (cards.length === 1 && /cr[ée]ature/i.test(question)) {
    const fake = { id: '_crea', name: 'la créature', type: 'Creature', text: '' };
    const Ff = features(fake);
    for (const rule of PAIR) {
      const p = rule(nm(cards[0], fr), 'la créature', F.get(cards[0].id), Ff);
      if (p && !seen.has(p.title)) { seen.add(p.title); points.push({ ...p, cards: [cards[0].name] }); }
    }
  }
  const qWords = (question.toLowerCase().match(/[a-z]{5,}/g) || []);
  const rulings = cards.length > 1 ? cards.map(c => ({ name: nm(c, fr), list: relatedRulings(db, c, cards.filter(o => o !== c), qWords) })).filter(x => x.list.length) : [];
  return { perCard, points, rulings };
}

module.exports = { analyse, features, roles };
