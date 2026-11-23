#!/usr/bin/env python3
"""Builds the Jellyboxd extension packages for Chrome and Firefox.

- dist/chrome/   : copy of manifest.json, icons/ and src/ ;
- dist/safari/   : same copy, background page from platforms/safari/overrides.json;
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
SAFARI_OVERRIDES_PATH = REPO_ROOT / "platforms" / "safari" / "overrides.json"
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


def generate_manifest(overrides_path: Path) -> dict:
    """Returns the Chrome manifest with a platform's overrides applied."""
    with MANIFEST_PATH.open(encoding="utf-8") as f:
        manifest = json.load(f)
    with overrides_path.open(encoding="utf-8") as f:
        overrides = json.load(f)
    # Only technical keys (background, browser_specific_settings) are replaced.
    manifest.update(overrides)
    return manifest


def build_platform(name: str, overrides_path: Path) -> Path:
    """Copies the extension into dist/<name>/ with the platform's manifest."""
    target = DIST_DIR / name
    copy_package(target)
    with (target / "manifest.json").open("w", encoding="utf-8") as f:
        json.dump(generate_manifest(overrides_path), f, ensure_ascii=False, indent=2)
        f.write("\n")
    return target


def write_archive(source_dir: Path, archive_path: Path) -> None:
    """Zips source_dir into archive_path, manifest.json at the root."""
    with zipfile.ZipFile(archive_path, "w", zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(source_dir.rglob("*")):
            if path.is_file():
                archive.write(path, path.relative_to(source_dir))


def main() -> int:
    # Upfront check of the essential inputs.
    for path in (MANIFEST_PATH, OVERRIDES_PATH, SAFARI_OVERRIDES_PATH):
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
    firefox_dir = build_platform("firefox", OVERRIDES_PATH)
    write_archive(firefox_dir, DIST_DIR / "jellyboxd-firefox.xpi")
    print("Firefox package: dist/firefox/ + dist/jellyboxd-firefox.xpi")

    # Safari: a background page instead of a service worker; Safari applies the session
    # network rule to an extension page's requests.
    build_platform("safari", SAFARI_OVERRIDES_PATH)
    print("Safari folder: dist/safari/ (load it in Safari or convert it with Xcode)")

    return 0


if __name__ == "__main__":
    sys.exit(main())
