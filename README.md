# TIMER by Flo

Web app perso (PWA pour iPhone) pour suivre le temps passé par activité (ex. « Activité Tam »)
et par client (Pierre, Gaspard…), avec rapports, graphiques et export CSV pour facturer.

- HTML / CSS / JS vanilla, aucune étape de build.
- Données stockées **uniquement sur l'appareil** (localStorage, clé `timerflo:v1`). Pas de synchro.
- Fonctionne hors ligne (service worker). Chart.js est inclus dans `vendor/`.

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | Structure des 3 onglets (Timers, Rapports, Réglages) |
| `styles.css` | Styles, mode sombre automatique |
| `app.js` | Toute la logique (commentée en français) |
| `manifest.webmanifest`, `sw.js`, `icons/` | PWA : installation et hors ligne |
| `vendor/chart.umd.min.js` | Chart.js 4.4.1 (local) |

## Tester en local

Depuis le dossier du projet :

```bash
python3 -m http.server 8000
```

Puis ouvrir <http://localhost:8000>. (Sans Python : `ruby -run -e httpd . -p 8000`.)

Pour tester sur l'iPhone sur le même Wi-Fi : `http://<IP-du-Mac>:8000`
(le hors-ligne et l'installation ne marchent qu'en HTTPS, donc via GitHub Pages).

Astuce : dans Safari/Chrome sur ordinateur, activer la vue « mobile » des outils de développement.

## Publier une nouvelle version

1. Modifier les fichiers, puis **changer `CACHE` dans `sw.js`** (ex. `timerflo-v2`).
2. `git commit -am "…" && git push`.
3. Sur l'iPhone, ouvrir l'app deux fois : la 1re ouverture télécharge la nouvelle version,
   la 2e l'affiche.

## Installer sur l'iPhone

1. Ouvrir l'URL GitHub Pages dans **Safari**.
2. Bouton **Partager** → **Sur l'écran d'accueil** → **Ajouter**.
3. Lancer l'app depuis l'icône « TIMER ». Une fois ouverte une première fois, elle marche hors ligne.

## Sauvegarde

Les données ne quittent jamais l'iPhone. Penser à faire régulièrement
**Réglages → Exporter la sauvegarde (JSON)** (dans Fichiers / iCloud Drive).
Attention : supprimer l'app de l'écran d'accueil efface ses données.

## Règles de calcul

- Le temps est toujours recalculé à partir des sessions (début / fin) : le timer reste juste
  même app fermée ou téléphone verrouillé.
- Total d'une activité = son temps propre (« Interne / brainstorm ») + ses sous-timers.
- Un seul timer actif : en lancer un arrête le précédent.
- Les sessions à cheval sur minuit ou sur une limite de période sont découpées au prorata.
- Les sessions de moins de 3 secondes sans note (tap accidentel) sont ignorées.
- Export CSV : séparateur `;`, UTF-8 avec BOM, décimales à virgule (Excel FR).
