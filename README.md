# Juge MTG Commander

Aide aux règles de Magic: The Gathering en Commander, en français, sous forme de site web.
Rien à installer : ça marche sur ordinateur et sur téléphone, et hors ligne après une première visite.

- **Rechercher** : une question en français, les cartes reconnues par leur nom (anglais ou français), leurs interactions, la fiche qui correspond, les rulings officiels et les règles concernées.
- **Assistants guidés**, **vérification de deck**, **suivi de partie**, **cartes et rulings**, **règles complètes**, **FAQ Commander**.
- **IA optionnelle** : avec une clé gratuite Google Gemini ou Groq (dans Paramètres), une IA rédige une réponse et traduit les textes anglais. La clé reste dans le navigateur de chacun.

## Comment c'est fait

- `site/` : le site publié (page, scripts, base de données compressée dans `site/data/`).
- `build/` : le moteur de recherche (même code que l'application Windows) et le script de mise à jour de la base.
- `.github/workflows/site.yml` : publie le site sur GitHub Pages à chaque modification et chaque lundi, avec une base à jour (Scryfall et Wizards of the Coast).

Pour activer la publication : dans le dépôt, **Settings → Pages → Source : GitHub Actions**.

Aide non officielle. Magic: The Gathering est une marque de Wizards of the Coast. Données de cartes : Scryfall.
