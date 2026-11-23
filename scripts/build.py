#!/usr/bin/env python3
"""Builds the Jellyboxd extension packages for Chrome and Firefox.

- dist/chrome/   : copy of manifest.json, icons/ and src/ ;
- dist/firefox/  : same copy, but manifest.json generated with the overrides
                   from platforms/firefox/overrides.json (background as
                   "scripts" + browser_specific_settings.gecko) ;
- dist/jellyboxd-chrome.zip  and dist/jellyboxd-firefox.xpi : zip archives
  with manifest.json at the root.

The script empties dist/ before any rebuild. Paths are always resolved
relative to the repository root, regardless of the current directory.
"""

import json
import shutil
import sys
import zipfile
from pathlib import Path

# Repository root: parent folder of the "scripts" folder containing this file.
REPO_ROOT = Path(__file__).resolve().parent.parent

MANIFEST_PATH = REPO_ROOT / "manifest.json"
OVERRIDES_PATH = REPO_ROOT / "platforms" / "firefox" / "overrides.json"
DIST_DIR = REPO_ROOT / "dist"

# Items to copy as-is into each package.
TO_COPY = ["manifest.json", "icons", "src"]


def copy_package(target_dir: Path) -> None:
    """Copies manifest.json, icons/ and src/ into target_dir."""
    target_dir.mkdir(parents=True, exist_ok=True)
    for item in TO_COPY:
        source = REPO_ROOT / item
        destination = target_dir / item
        if source.is_dir():
            shutil.copytree(source, destination)
        else:
            shutil.copy2(source, destination)


def generate_firefox_manifest() -> dict:
    """Returns the Chrome manifest with the Firefox overrides applied."""
    with MANIFEST_PATH.open(encoding="utf-8") as f:
        manifest = json.load(f)
    with OVERRIDES_PATH.open(encoding="utf-8") as f:
        overrides = json.load(f)
    # Only technical keys (background, browser_specific_settings) are taken over,
    # never the name nor the other fields of the old reference.
    manifest.update(overrides)
    return manifest


def write_archive(source_dir: Path, archive_path: Path) -> None:
    """Zips source_dir into archive_path, manifest.json at the root."""
    with zipfile.ZipFile(archive_path, "w", zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(source_dir.rglob("*")):
            if path.is_file():
                archive.write(path, path.relative_to(source_dir))


def main() -> int:
    # Upfront check of the essential inputs.
    for path in (MANIFEST_PATH, OVERRIDES_PATH):
        if not path.is_file():
            print(f"Error: missing file {path.relative_to(REPO_ROOT)}")
            return 1

    # Complete wipe of dist/ before rebuild.
    if DIST_DIR.exists():
        shutil.rmtree(DIST_DIR)
    DIST_DIR.mkdir(parents=True)

    # Chrome package: simple copy.
    chrome_dir = DIST_DIR / "chrome"
    copy_package(chrome_dir)
    write_archive(chrome_dir, DIST_DIR / "jellyboxd-chrome.zip")
    print("Chrome package: dist/chrome/ + dist/jellyboxd-chrome.zip")

    # Firefox package: copy + manifest generated with overrides.
    firefox_dir = DIST_DIR / "firefox"
    copy_package(firefox_dir)
    firefox_manifest = generate_firefox_manifest()
    with (firefox_dir / "manifest.json").open("w", encoding="utf-8") as f:
        json.dump(firefox_manifest, f, ensure_ascii=False, indent=2)
        f.write("\n")
    write_archive(firefox_dir, DIST_DIR / "jellyboxd-firefox.xpi")
    print("Firefox package: dist/firefox/ + dist/jellyboxd-firefox.xpi")

    return 0


if __name__ == "__main__":
    sys.exit(main())
