#!/usr/bin/env python3
"""Checks the consistency of the Jellyboxd extension.

Checks performed:
- manifest.json and platforms/firefox/overrides.json are valid JSON ;
- every file cited in the manifest (service_worker, js/css of the
  content_scripts, action.default_popup, options_ui.page, icons) and in
  overrides.json (background.scripts) actually exists ;
- every .js file in src/ passes "node --check" if node is available
  (otherwise it says so and skips this check) ;
- every relative src= / href= reference in the HTML pages of src/ exists.

On any problem: list of problems on standard output and exit code 1.
Otherwise: prints "OK" and exit code 0.
"""

import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

# Repository root: parent folder of the "scripts" folder containing this file.
REPO_ROOT = Path(__file__).resolve().parent.parent

MANIFEST_PATH = REPO_ROOT / "manifest.json"
OVERRIDES_PATH = REPO_ROOT / "platforms" / "firefox" / "overrides.json"
SRC_DIR = REPO_ROOT / "src"

# src= / href= attributes in HTML pages (single or double quotes).
ATTR_REGEX = re.compile(r"""(?:src|href)\s*=\s*["']([^"']+)["']""", re.IGNORECASE)


def load_json(path: Path, problems: list) -> dict | None:
    """Loads a JSON file ; adds a problem if missing or invalid."""
    if not path.is_file():
        problems.append(f"missing file: {path.relative_to(REPO_ROOT)}")
        return None
    try:
        with path.open(encoding="utf-8") as f:
            return json.load(f)
    except json.JSONDecodeError as error:
        problems.append(
            f"invalid JSON in {path.relative_to(REPO_ROOT)}: {error}"
        )
        return None


def check_file(rel_path: str, origin: str, problems: list) -> None:
    """Checks that a relative path cited in a JSON exists in the repository."""
    if not (REPO_ROOT / rel_path).is_file():
        problems.append(
            f"file not found: {rel_path} (referenced by {origin})"
        )


def collect_manifest_refs(manifest: dict) -> list:
    """Returns the list of (path, origin) cited in the manifest."""
    refs = []
    bg = manifest.get("background", {})
    if "service_worker" in bg:
        refs.append((bg["service_worker"], "manifest.background.service_worker"))
    for script in bg.get("scripts", []):
        refs.append((script, "manifest.background.scripts"))
    for cs in manifest.get("content_scripts", []):
        for path in cs.get("js", []):
            refs.append((path, "manifest.content_scripts.js"))
        for path in cs.get("css", []):
            refs.append((path, "manifest.content_scripts.css"))
    action = manifest.get("action", {})
    if "default_popup" in action:
        refs.append((action["default_popup"], "manifest.action.default_popup"))
    for size, path in action.get("default_icon", {}).items():
        refs.append((path, f"manifest.action.default_icon[{size}]"))
    options = manifest.get("options_ui", {})
    if "page" in options:
        refs.append((options["page"], "manifest.options_ui.page"))
    for size, path in manifest.get("icons", {}).items():
        refs.append((path, f"manifest.icons[{size}]"))
    return refs


def check_js_syntax(problems: list) -> None:
    """Runs "node --check" on each .js in src/, if node is available."""
    node = shutil.which("node")
    if node is None:
        print("Note: node is unavailable, JS syntax check skipped.")
        return
    for js_path in sorted(SRC_DIR.rglob("*.js")):
        result = subprocess.run(
            [node, "--check", str(js_path)],
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            detail = (result.stderr or result.stdout).strip().splitlines()
            message = detail[0] if detail else "unknown error"
            problems.append(
                f"node --check fails for {js_path.relative_to(REPO_ROOT)}: {message}"
            )


def check_html_pages(problems: list) -> None:
    """Checks the relative src=/href= references of the HTML pages in src/."""
    for html_path in sorted(SRC_DIR.rglob("*.html")):
        text = html_path.read_text(encoding="utf-8")
        for ref in ATTR_REGEX.findall(text):
            # Absolute URLs, embedded data and anchors are ignored.
            if re.match(r"^[a-z]+:", ref, re.IGNORECASE) or ref.startswith(("//", "#", "/")):
                continue
            target = (html_path.parent / ref).resolve()
            if not target.is_file():
                problems.append(
                    f"reference not found: {ref} (page {html_path.relative_to(REPO_ROOT)})"
                )


def main() -> int:
    problems: list = []

    manifest = load_json(MANIFEST_PATH, problems)
    overrides = load_json(OVERRIDES_PATH, problems)

    if manifest is not None:
        for path, origin in collect_manifest_refs(manifest):
            check_file(path, origin, problems)

    if overrides is not None:
        for script in overrides.get("background", {}).get("scripts", []):
            check_file(script, "overrides.json background.scripts", problems)

    check_js_syntax(problems)
    check_html_pages(problems)

    if problems:
        print(f"{len(problems)} problem(s) found:")
        for problem in problems:
            print(f"  - {problem}")
        return 1

    print("OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
