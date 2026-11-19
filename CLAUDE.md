# TIMER by Flo — instructions pour Claude Code

Le cahier des charges complet est dans `CAHIER_DES_CHARGES.md`. Lis-le en entier avant de coder.

## Contraintes techniques
- HTML/CSS/JS vanilla, aucune étape de build. Fichiers : `index.html`, `styles.css`, `app.js`,
  `manifest.webmanifest`, `sw.js`, `icons/` (icônes 192 et 512 px générées simplement).
- Chart.js en local dans `vendor/` (pour que le hors-ligne fonctionne).
- Stockage : localStorage, avec une seule clé versionnée (`timerflo:v1`) contenant
  `{ activities, subs, sessions, activeSessionId }`.
- Les durées sont toujours calculées à partir des sessions (début/fin), jamais avec un compteur.
- Le code reste simple et commenté en français. Pas de sur-ingénierie.

## Points essentiels
- Cible : iPhone uniquement (écran d'accueil), données locales, pas de synchro.
- Lancer un client (ex. Pierre) fait avancer le total de son activité (ex. Tam).
- Lancer l'activité seule (ex. Tam) doit être possible : temps « Interne / brainstorm ».
- L'export CSV sert à facturer : il doit être fiable et partageable depuis l'iPhone.

## Façon de travailler
1. Construis d'abord l'écran Timers (création d'activités et de sous-timers, lancer/arrêter,
   un seul timer actif, persistance), puis teste-le.
2. Ensuite : Rapports (filtres, tableau, graphiques, liste des sessions, édition, ajout manuel).
3. Ensuite : export CSV / JSON, import JSON, Réglages.
4. Enfin : PWA (manifest, service worker, icônes, balises `apple-mobile-web-app-*`) et un
   `README.md` qui explique comment tester en local (`python3 -m http.server`).
5. Publication sur **GitHub Pages**, comme mes autres apps : initialise le dépôt git, crée le dépôt
   GitHub (avec `gh` si disponible), pousse sur `main`, active Pages, puis donne-moi l'URL et
   les étapes pour l'ajouter à l'écran d'accueil de l'iPhone.
6. À la fin, vérifie chaque point de la section « Critères de validation » du cahier des charges.
