# Jellyboxd — Letterboxd × Seerr / Jellyfin

Extension navigateur Manifest V3 (Chrome, Edge, Brave, Firefox et Safari) permettant de connecter votre instance **Seerr / Jellyseerr / Overseerr** et votre serveur **Jellyfin** directement aux pages de films **Letterboxd**.

## Fonctionnalités

- **Statut en direct sur Letterboxd** : affiche dans la colonne latérale d’un film s’il est *Disponible*, *En cours*, *En attente*, *Partiel*, *Bloqué* ou *Non disponible* (avec distinction **HD** et **4K** si vous avez un serveur 4K).
- **Lien direct « Regarder sur Jellyfin »** : ouvre immédiatement la fiche du film dans votre lecteur web Jellyfin (HD et 4K si disponibles).
- **Demande en un clic avec choix du profil de qualité** :
  - Sélection du serveur Radarr (HD ou 4K) ou Sonarr (pour les mini-séries référencées sur Letterboxd).
  - Sélection dynamique du **profil de qualité** (*HD-1080p*, *Ultra-HD*, etc.).
  - **Options avancées** dépliables : dossier racine (avec espace disque libre), tags Radarr/Sonarr et sélection des saisons pour les séries.
  - Suivi et annulation des demandes en cours directement depuis Letterboxd.
- **Mémorisation intelligente** : retient votre profil de qualité préféré ou applique vos valeurs par défaut.

## Installation

### Chrome / Edge / Brave (Chromium)

1. Ouvrez `chrome://extensions` (ou `edge://extensions`).
2. Activez le **Mode développeur** en haut à droite.
3. Cliquez sur **Charger l’extension non empaquetée**.
4. Sélectionnez le dossier du projet (ou le dossier généré `dist/chrome`).

### Firefox (128+)

1. Exécutez `python3 scripts/build.py` pour générer `dist/firefox`.
2. Ouvrez `about:debugging#/runtime/this-firefox`.
3. Cliquez sur **Charger un module complémentaire temporaire…**.
4. Sélectionnez `dist/firefox/manifest.json` (ou le paquet `dist/jellyboxd-firefox.xpi`).

### Safari (macOS)

1. Ouvrez `safari/Jellyboxd/Jellyboxd.xcodeproj` dans Xcode : le projet embarque directement `manifest.json`, `icons/` et `src/` de la racine du dépôt.
2. Lancez la cible **Jellyboxd**, puis activez l’extension dans Safari → Réglages → Extensions (cochez « Autoriser les extensions non signées » dans le menu Développement si besoin).

## Configuration

1. Cliquez sur l’icône de l’extension dans la barre du navigateur (ou ouvrez les **Paramètres avancés**).
2. Renseignez l’URL de votre serveur Seerr / Jellyseerr (ex. `https://seerr.mondomaine.fr` ou `http://192.168.1.10:5055`).
3. Choisissez le mode d’authentification :
   - **Clé API (recommandé)** : copiez la clé située dans Seerr sous **Paramètres → Général → Clé API**.
   - **Session navigateur (Cookie)** : utilisez la connexion Jellyfin intégrée dans les paramètres de l’extension.
4. Cliquez sur **Tester & Enregistrer** et acceptez la demande de permission réseau du navigateur.
5. *(Optionnel)* Renseignez l’**URL publique Jellyfin** si Seerr vous renvoie une URL locale/LAN inutilisable à distance.

## Dépannage rapide

- **Erreur 403 lors des requêtes ou profils invisibles** :
  - Vérifiez si la **Protection CSRF** est activée dans Seerr (*Paramètres → Général*) ; si vous utilisez le mode Cookie depuis un autre domaine ou sans HTTPS, privilégiez la **Clé API**.
  - En mode Cookie, le compte utilisé doit posséder la permission Seerr `REQUEST_ADVANCED` pour lister et choisir les profils de qualité Radarr/Sonarr. Sans cette permission, la demande reste possible avec le profil par défaut de Seerr.
- **Aucun film détecté sur Letterboxd** : l’extension s’active sur les fiches de films (`https://letterboxd.com/film/...`) possédant un identifiant TMDB.

## Build & vérification

```bash
python3 scripts/build.py    # dist/chrome, dist/firefox, dist/jellyboxd-chrome.zip, dist/jellyboxd-firefox.xpi
python3 scripts/verify.py   # fichiers référencés, JSON, syntaxe JS (si node est installé)
```

## Structure

- `manifest.json`, `src/`, `icons/` : l’extension (manifest Chrome, chargeable telle quelle).
- `plateformes/firefox/surcharges.json` : clés remplacées dans le manifest pour Firefox (`background.scripts`, `browser_specific_settings`).
- `safari/` : projet Xcode (app conteneur + extension Safari).
- `scripts/` : build et vérification (Python 3, sans dépendance).
