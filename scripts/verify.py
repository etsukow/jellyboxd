#!/usr/bin/env python3
"""Vérifie la cohérence de l'extension Jellyboxd.

Contrôles effectués :
- manifest.json et plateformes/firefox/surcharges.json sont du JSON valide ;
- chaque fichier cité dans le manifest (service_worker, js/css des
  content_scripts, action.default_popup, options_ui.page, icônes) et dans
  surcharges.json (background.scripts) existe réellement ;
- chaque fichier .js de src/ passe « node --check » si node est disponible
  (sinon le fait savoir et saute ce contrôle) ;
- chaque référence relative src= / href= des pages HTML de src/ existe.

En cas de problème : liste des problèmes sur la sortie standard et code 1.
Sinon : affiche « OK » et code 0.
"""

import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

# Racine du dépôt : dossier parent du dossier "scripts" contenant ce fichier.
RACINE = Path(__file__).resolve().parent.parent

CHEMIN_MANIFEST = RACINE / "manifest.json"
CHEMIN_SURCHARGES = RACINE / "plateformes" / "firefox" / "surcharges.json"
DOSSIER_SRC = RACINE / "src"

# Attributs src= / href= des pages HTML (guillemets simples ou doubles).
REGEX_ATTR = re.compile(r"""(?:src|href)\s*=\s*["']([^"']+)["']""", re.IGNORECASE)


def charger_json(chemin: Path, problemes: list) -> dict | None:
    """Charge un fichier JSON ; ajoute un problème si absent ou invalide."""
    if not chemin.is_file():
        problemes.append(f"fichier manquant : {chemin.relative_to(RACINE)}")
        return None
    try:
        with chemin.open(encoding="utf-8") as f:
            return json.load(f)
    except json.JSONDecodeError as erreur:
        problemes.append(
            f"JSON invalide dans {chemin.relative_to(RACINE)} : {erreur}"
        )
        return None


def verifier_fichier(chemin_rel: str, origine: str, problemes: list) -> None:
    """Vérifie qu'un chemin relatif cité dans un JSON existe dans le dépôt."""
    if not (RACINE / chemin_rel).is_file():
        problemes.append(
            f"fichier introuvable : {chemin_rel} (référencé par {origine})"
        )


def collecter_refs_manifest(manifest: dict) -> list:
    """Retourne la liste des (chemin, origine) cités dans le manifest."""
    refs = []
    bg = manifest.get("background", {})
    if "service_worker" in bg:
        refs.append((bg["service_worker"], "manifest.background.service_worker"))
    for script in bg.get("scripts", []):
        refs.append((script, "manifest.background.scripts"))
    for cs in manifest.get("content_scripts", []):
        for chemin in cs.get("js", []):
            refs.append((chemin, "manifest.content_scripts.js"))
        for chemin in cs.get("css", []):
            refs.append((chemin, "manifest.content_scripts.css"))
    action = manifest.get("action", {})
    if "default_popup" in action:
        refs.append((action["default_popup"], "manifest.action.default_popup"))
    for taille, chemin in action.get("default_icon", {}).items():
        refs.append((chemin, f"manifest.action.default_icon[{taille}]"))
    options = manifest.get("options_ui", {})
    if "page" in options:
        refs.append((options["page"], "manifest.options_ui.page"))
    for taille, chemin in manifest.get("icons", {}).items():
        refs.append((chemin, f"manifest.icons[{taille}]"))
    return refs


def verifier_syntaxe_js(problemes: list) -> None:
    """Passe « node --check » sur chaque .js de src/, si node est disponible."""
    node = shutil.which("node")
    if node is None:
        print("Note : node est indisponible, contrôle de syntaxe JS sauté.")
        return
    for chemin_js in sorted(DOSSIER_SRC.rglob("*.js")):
        resultat = subprocess.run(
            [node, "--check", str(chemin_js)],
            capture_output=True,
            text=True,
        )
        if resultat.returncode != 0:
            detail = (resultat.stderr or resultat.stdout).strip().splitlines()
            message = detail[0] if detail else "erreur inconnue"
            problemes.append(
                f"node --check échoue pour {chemin_js.relative_to(RACINE)} : {message}"
            )


def verifier_pages_html(problemes: list) -> None:
    """Vérifie les références relatives src=/href= des pages HTML de src/."""
    for chemin_html in sorted(DOSSIER_SRC.rglob("*.html")):
        texte = chemin_html.read_text(encoding="utf-8")
        for ref in REGEX_ATTR.findall(texte):
            # On ignore les URLs absolues, les données embarquées et les ancres.
            if re.match(r"^[a-z]+:", ref, re.IGNORECASE) or ref.startswith(("//", "#", "/")):
                continue
            cible = (chemin_html.parent / ref).resolve()
            if not cible.is_file():
                problemes.append(
                    f"référence introuvable : {ref} (page {chemin_html.relative_to(RACINE)})"
                )


def main() -> int:
    problemes: list = []

    manifest = charger_json(CHEMIN_MANIFEST, problemes)
    surcharges = charger_json(CHEMIN_SURCHARGES, problemes)

    if manifest is not None:
        for chemin, origine in collecter_refs_manifest(manifest):
            verifier_fichier(chemin, origine, problemes)

    if surcharges is not None:
        for script in surcharges.get("background", {}).get("scripts", []):
            verifier_fichier(script, "surcharges.json background.scripts", problemes)

    verifier_syntaxe_js(problemes)
    verifier_pages_html(problemes)

    if problemes:
        print(f"{len(problemes)} problème(s) détecté(s) :")
        for probleme in problemes:
            print(f"  - {probleme}")
        return 1

    print("OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
