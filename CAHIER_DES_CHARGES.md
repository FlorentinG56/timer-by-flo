# Cahier des charges — TIMER by Flo

## 1. Objectif
Une web app perso, simple et rapide, pour savoir combien de temps je passe sur chaque activité
(ex. « Activité Tam ») et sur chaque sous-élément (clients : Pierre, Gaspard…), avec des filtres
par période (jour, semaine, mois, période personnalisée).

Usage : un seul utilisateur (moi). Pas de compte ni de connexion. Rien de surdéveloppé.

## 2. Plateforme
- **Web app (PWA) pour iPhone**, installée sur l'écran d'accueil (Safari → Partager →
  « Ajouter à l'écran d'accueil »). Usage principal : iPhone uniquement.
- HTML / CSS / JavaScript **vanilla**, aucune étape de build (pas de React, pas de npm obligatoire).
- Bibliothèque de graphiques : Chart.js via CDN (ou fichier local dans `/vendor`).
- Données stockées **en local** sur l'appareil (localStorage ou IndexedDB).
- Fonctionne hors ligne (service worker).
- **Hébergement : GitHub Pages** (comme mes autres apps, ex. finances) : dépôt GitHub dédié,
  publication depuis la branche `main`, URL en HTTPS.
- **Pas de synchronisation** : les données restent sur l'iPhone. C'est voulu.
- L'export (CSV pour facturer, JSON pour sauvegarder) est donc indispensable.

## 3. Structure des données
- **Activité** (titre principal) : ex. « Activité Tam », « Application Trail », « GTA 6 ».
  - nom, couleur, date de création, archivée (oui/non)
- **Sous-timer** (client / sous-catégorie), rattaché à une activité : ex. Pierre, Gaspard.
  - nom, couleur (héritée de l'activité par défaut), archivé (oui/non)
  - Optionnel : une activité peut n'avoir aucun sous-timer (ex. GTA 6).
- **Session** (une plage de temps) :
  - id, activityId, subId (peut être vide), début (timestamp), fin (timestamp ou vide si en cours),
    note (texte libre, optionnel), ajoutée manuellement (oui/non)

Le temps n'est jamais stocké sous forme de compteur : il est **toujours recalculé à partir des
sessions** (début/fin). Le timer continue donc de compter juste si l'app est fermée ou le téléphone
verrouillé.

## 4. Règles de fonctionnement
1. **Un seul timer actif à la fois.** Lancer un timer arrête automatiquement celui en cours.
2. **Total d'une activité = temps propre de l'activité + somme de ses sous-timers.** (ESSENTIEL)
   - Lancer « Pierre » fait aussi avancer le total « Activité Tam » (le total Tam s'affiche en direct).
   - **On doit pouvoir lancer « Activité Tam » seul**, sans client, par exemple quand je réfléchis
     ou fais du brainstorm sur l'entreprise. Ce temps compte dans le total Tam et s'affiche comme
     une ligne « Interne / brainstorm » (nom modifiable) dans l'écran Timers, les rapports et
     les exports.
3. Les sessions qui chevauchent minuit ou la limite d'une période sont **découpées au prorata**
   dans les filtres (une session 23 h → 1 h compte 1 h la veille et 1 h le lendemain).
4. Supprimer une activité ou un sous-timer demande une confirmation. Proposer « Archiver »
   plutôt que supprimer, pour garder l'historique.

## 5. Écrans

### 5.1 Écran principal — Timers
- Liste des activités sous forme de cartes. Chaque carte affiche :
  - le nom de l'activité et son **total pour la période sélectionnée** (par défaut : aujourd'hui)
  - un bouton ▶︎ / ⏸ pour lancer l'activité elle-même
  - en dessous, la liste des sous-timers avec leur temps et leur bouton ▶︎ / ⏸
  - un bouton « + sous-timer »
- Le timer en cours est mis en évidence (couleur, temps qui défile en direct au format hh:mm:ss).
- Un bandeau en haut (fixe) indique ce qui tourne en ce moment, avec un bouton Stop.
- Bouton « + Activité ».
- Au démarrage d'un timer, un champ facultatif permet d'ajouter une **note** (modifiable ensuite).
- Sélecteur de période rapide en haut : Aujourd'hui / Cette semaine / Ce mois.

### 5.2 Écran Historique / Rapports
- **Filtres** :
  - période : Aujourd'hui, Hier, Cette semaine, Semaine dernière, Ce mois, Mois dernier,
    Cette année, Personnalisée (date début → date fin)
  - activité (toutes ou une), sous-timer (tous ou un)
  - la semaine commence le lundi
- **Résumé** : total sur la période, puis tableau par activité → sous-timers (heures + %).
- **Graphiques** :
  - camembert (ou donut) : répartition du temps par activité, ou par client quand une activité est sélectionnée
  - barres : temps par jour (ou par semaine si la période dépasse ~2 mois)
- **Liste des sessions** de la période : date, heure début/fin, durée, activité, sous-timer, note.
  - Chaque session peut être **modifiée** (début, fin, activité, sous-timer, note) ou supprimée.
- Bouton **« Ajouter du temps manuellement »** : choisir l'activité, le sous-timer, la date,
  l'heure de début et de fin (ou une durée), et une note.

### 5.3 Export (sert à facturer)
- **Export CSV** des sessions filtrées (compatible Excel, séparateur « ; », encodage UTF-8 avec BOM) :
  Date ; Début ; Fin ; Durée (h décimales) ; Durée (hh:mm) ; Activité ; Sous-timer ; Note
- **Export CSV récapitulatif pour la facturation** : Activité ; Sous-timer ; Total heures
  (décimales) ; Total hh:mm, sur la période filtrée, avec le total général en dernière ligne.
  Exemple : « Mois dernier » + « Activité Tam » → une ligne par client + Interne / brainstorm.
- Sur iPhone, l'export ouvre la feuille de partage iOS (Fichiers, Mail, AirDrop…) via
  `navigator.share` avec un fichier, avec repli sur un téléchargement classique.
- **Sauvegarde JSON** (export + import) de toutes les données.

### 5.4 Réglages (simple)
- Gérer les activités et les sous-timers : renommer, changer la couleur, réordonner, archiver.
- Export / import JSON.

## 6. Design
- Épuré, mobile first, gros boutons faciles à toucher, lisible d'un coup d'œil.
- Mode sombre automatique selon le système.
- Navigation par onglets en bas : **Timers** | **Rapports** | **Réglages**.
- Langue : français. Durées affichées en hh:mm:ss, précédées des jours quand il y en a (« 1 j 02:35:12 »).

## 7. Hors périmètre V1
- Comptes, multi-utilisateurs, synchronisation cloud.
- Notifications, rappels, facturation, taux horaire (possible en V2).

## 8. Critères de validation
- Je crée « Activité Tam » avec Pierre et Gaspard, je lance Pierre 10 min puis Gaspard 5 min :
  le total Tam affiche 15 min et Pierre s'arrête automatiquement quand Gaspard démarre.
- Je lance « Activité Tam » seul 20 min : le total Tam augmente de 20 min et la ligne
  « Interne / brainstorm » apparaît, sans toucher aux clients.
- Je ferme l'app pendant qu'un timer tourne et je la rouvre 10 min plus tard : le temps est juste.
- Je filtre « Mois dernier » + « Pierre » : je vois le bon total, et l'export CSV s'ouvre
  correctement dans Excel.
- J'ajoute à la main 1 h hier sur Gaspard : elle apparaît dans les rapports d'hier.
- L'app, publiée sur GitHub Pages, s'installe sur l'écran d'accueil de l'iPhone et s'ouvre hors ligne.
- J'exporte le récapitulatif du mois depuis l'iPhone et je l'envoie par mail pour facturer.
