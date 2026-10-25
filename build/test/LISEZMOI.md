# Bancs d'essai de la recherche

`npm run bench` (dans `build/`) passe toutes les questions des fichiers `bench-*.js` dans le moteur du site
et compte : cartes reconnues, interaction détectée, fiche affichée en tête **avec certitude**. `npm run bench -- -v` liste les échecs.

Chaque ligne : `[question, [cartes attendues en anglais], /motif du titre d'interaction/ ou null, numéro de fiche (ou liste) ou null]`.
Le numéro de fiche est sa position dans `build/faq/faq-fr.json` (en partant de 0).

- `bench-data*.js` : questions des versions précédentes (1 à 4) ; `5` : 50 reformulations « comme à table » ; `6` et `8` : bancs témoins écrits avant réglage ; `7` : noms français en minuscules.
- `bench-signalements.js` : les signalements des joueurs. Dans Paramètres → Tes signalements, « Copier pour les tests »
  donne les lignes prêtes à coller ; il reste à remplir la fiche attendue (en créer une si aucune ne convient).

Avant de changer la recherche, lancer le banc ; après, vérifier qu'aucun score ne baisse.
La recherche par le sens (modèle e5) n'est pas mesurée ici : ses seuils ont été réglés à part sur ces mêmes questions.
