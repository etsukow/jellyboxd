#!/usr/bin/env python3
"""Construit les paquets de l'extension Jellyboxd pour Chrome et Firefox.

- dist/chrome/   : copie du manifest.json, de icons/ et de src/ ;
- dist/firefox/  : même copie, mais manifest.json généré avec les surcharges
                   de plateformes/firefox/surcharges.json (background en
                   "scripts" + browser_specific_settings.gecko) ;
- dist/jellyboxd-chrome.zip  et dist/jellyboxd-firefox.xpi : archives zip
  avec manifest.json à la racine.

Le script vide dist/ avant toute reconstruction. Les chemins sont toujours
résolus relativement à la racine du dépôt, quel que soit le dossier courant.
"""

import json
import shutil
import sys
import zipfile
from pathlib import Path

# Racine du dépôt : dossier parent du dossier "scripts" contenant ce fichier.
RACINE = Path(__file__).resolve().parent.parent

CHEMIN_MANIFEST = RACINE / "manifest.json"
CHEMIN_SURCHARGES = RACINE / "plateformes" / "firefox" / "surcharges.json"
DOSSIER_DIST = RACINE / "dist"

# Éléments à copier tels quels dans chaque paquet.
A_COPIER = ["manifest.json", "icons", "src"]


def copier_paquet(dossier_cible: Path) -> None:
    """Copie manifest.json, icons/ et src/ vers dossier_cible."""
    dossier_cible.mkdir(parents=True, exist_ok=True)
    for element in A_COPIER:
        source = RACINE / element
        destination = dossier_cible / element
        if source.is_dir():
            shutil.copytree(source, destination)
        else:
            shutil.copy2(source, destination)


def generer_manifest_firefox() -> dict:
    """Retourne le manifest Chrome avec les surcharges Firefox appliquées."""
    with CHEMIN_MANIFEST.open(encoding="utf-8") as f:
        manifest = json.load(f)
    with CHEMIN_SURCHARGES.open(encoding="utf-8") as f:
        surcharges = json.load(f)
    # On ne reprend que les clés techniques (background, browser_specific_settings),
    # jamais le nom ni les autres champs de l'ancienne référence.
    manifest.update(surcharges)
    return manifest


def ecrire_archive(dossier_source: Path, chemin_archive: Path) -> None:
    """Zippe dossier_source dans chemin_archive, manifest.json à la racine."""
    with zipfile.ZipFile(chemin_archive, "w", zipfile.ZIP_DEFLATED) as archive:
        for chemin in sorted(dossier_source.rglob("*")):
            if chemin.is_file():
                archive.write(chemin, chemin.relative_to(dossier_source))


def main() -> int:
    # Vérification préalable des entrées indispensables.
    for chemin in (CHEMIN_MANIFEST, CHEMIN_SURCHARGES):
        if not chemin.is_file():
            print(f"Erreur : fichier manquant {chemin.relative_to(RACINE)}")
            return 1

    # Vidage complet de dist/ avant reconstruction.
    if DOSSIER_DIST.exists():
        shutil.rmtree(DOSSIER_DIST)
    DOSSIER_DIST.mkdir(parents=True)

    # Paquet Chrome : copie simple.
    dossier_chrome = DOSSIER_DIST / "chrome"
    copier_paquet(dossier_chrome)
    ecrire_archive(dossier_chrome, DOSSIER_DIST / "jellyboxd-chrome.zip")
    print("Paquet Chrome : dist/chrome/ + dist/jellyboxd-chrome.zip")

    # Paquet Firefox : copie + manifest généré avec surcharges.
    dossier_firefox = DOSSIER_DIST / "firefox"
    copier_paquet(dossier_firefox)
    manifest_firefox = generer_manifest_firefox()
    with (dossier_firefox / "manifest.json").open("w", encoding="utf-8") as f:
        json.dump(manifest_firefox, f, ensure_ascii=False, indent=2)
        f.write("\n")
    ecrire_archive(dossier_firefox, DOSSIER_DIST / "jellyboxd-firefox.xpi")
    print("Paquet Firefox : dist/firefox/ + dist/jellyboxd-firefox.xpi")

    return 0


if __name__ == "__main__":
    sys.exit(main())
