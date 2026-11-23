# Jellyboxd

A browser extension that brings your **Seerr** (Jellyseerr, Overseerr) and **Jellyfin** servers to **Letterboxd** film pages: see whether a film is on your server, play it, or request it in one click.

Works on Chrome, Edge, Brave, Firefox (128+) and Safari (macOS). Manifest V3, no build step, no third-party dependency.

## Features

- **Availability on the film page**: available, downloading, pending, partially available or missing, read from Seerr (and from Jellyfin directly when it is configured).
- **Watch on Jellyfin**: when the film is on your server, the widget shows a single "watch" link that opens it in Jellyfin's web player.
- **Request in one click**: pick the server and the quality profile, both loaded from your Radarr or Sonarr through Seerr. Advanced options cover the root folder, tags and seasons.
- **4K, only if you use it**: when a server is flagged as 4K in Seerr, the widget offers a separate 4K request. Other setups never see it.
- **Follow and cancel requests** from Letterboxd.
- **Seerr only**: without a Jellyfin URL, the widget uses the playback link Seerr provides, or links to the film in Seerr.
- **Two widget styles**, chosen in the settings:
  - **Native**: rows that extend Letterboxd's own actions panel.
  - **Ticket**: a cinema ticket whose tear-off stub is the main button.

## Widget styles

**Native** extends Letterboxd's actions panel.

![Native style: watch link, request form, and a request being downloaded](docs/images/native.png)

**Ticket** turns the widget into a cinema ticket whose stub is the main button.

![Ticket style: watch link, request form, and a request being downloaded](docs/images/ticket.png)

## Install

Download the package for your browser from the [latest release](../../releases/latest).

### Chrome, Edge, Brave

1. Unzip `jellyboxd-<version>-chrome.zip`.
2. Open `chrome://extensions` (or `edge://extensions`) and turn on **Developer mode**.
3. Click **Load unpacked** and select the unzipped folder.

### Firefox

The `.xpi` file is not signed by Mozilla yet.

- **Firefox Developer Edition or Nightly**: set `xpinstall.signatures.required` to `false` in `about:config`, then open the `.xpi` file.
- **Firefox (release)**: open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on…** and select the `.xpi`. The add-on stays until Firefox restarts.

### Safari (macOS)

The Safari app is built without an Apple signature.

1. Unzip `jellyboxd-<version>-safari-macos.zip` and move **Jellyboxd.app** to Applications.
2. In Safari, turn on **Settings → Advanced → Show features for web developers**, then **Develop → Allow Unsigned Extensions**.
3. Open Jellyboxd.app once, then enable the extension in **Safari → Settings → Extensions**.

Safari turns off unsigned extensions when it quits, so step 2 has to be repeated after each restart. You can also build and sign the app yourself from the Xcode project in `safari/`.

## Setup

1. Open the extension's settings (toolbar icon, then **Advanced settings**).
2. Enter your Seerr URL, for example `https://seerr.example.com` or `http://192.168.1.10:5055`.
3. Choose how to sign in:
   - **API key** (recommended): Seerr → Settings → General → API Key.
   - **Browser session**: sign in with your Jellyfin account from the settings page.
4. Click **Test & save** and accept the network permission prompt.
5. Optional: add your public Jellyfin URL (and an API key) if Seerr only knows a local address, or to look films up in Jellyfin directly.
6. Optional: pick the widget style under **Widget**.

## Troubleshooting

- **403 errors, or no quality profiles**: if Seerr's CSRF protection is on and you use a browser session from another domain or over plain HTTP, switch to an API key. With a browser session, the Seerr account needs the `REQUEST_ADVANCED` permission to list profiles; without it, requests still go through with Seerr's default profile.
- **Nothing shows on Letterboxd**: the widget only appears on film pages (`https://letterboxd.com/film/...`) that have a TMDB id.

## Development

```bash
python3 scripts/build.py    # dist/chrome, dist/firefox, dist/jellyboxd-chrome.zip, dist/jellyboxd-firefox.xpi
python3 scripts/verify.py   # referenced files, JSON, and JS syntax when Node.js is installed
```

Load the repository root as an unpacked extension in Chrome while working: `manifest.json` at the root is the Chrome manifest.

| Path | Content |
|---|---|
| `manifest.json`, `src/`, `icons/` | The extension. |
| `src/content/` | The widget injected into Letterboxd film pages. |
| `src/background/` | Seerr and Jellyfin API clients, settings and cache. |
| `src/options/`, `src/popup/` | Settings page and toolbar popup. |
| `platforms/firefox/overrides.json` | Keys replaced in the manifest for Firefox (`background.scripts`, `browser_specific_settings`). |
| `safari/` | Xcode project wrapping the extension for Safari. |
| `scripts/` | Build and checks (Python 3, standard library only). |

## Privacy

Jellyboxd only talks to the Seerr and Jellyfin servers you set up, and collects nothing. See the [privacy policy](PRIVACY.md).

## License

[MIT](LICENSE)
