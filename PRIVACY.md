# Privacy policy

Jellyboxd has no server of its own. It does not collect, sell or share any data, and its author receives nothing from it.

## What the extension stores

Everything is kept in your browser's extension storage, on your device:

- your Seerr address, your sign-in method and, if you use one, your Seerr API key;
- your Jellyfin address and, if you add one, your Jellyfin API key;
- your request preferences: default server, quality profile and root folder, the last ones you used, and the widget style;
- a short-lived cache of the servers and quality profiles your Seerr returns.

## What it reads on Letterboxd

Only on film pages, and only to find the film on your servers: the TMDB id, title, original title and year shown on the page. It does not read your Letterboxd account, ratings, diary or lists.

When Jellyboxd is not set up yet, the film page asks for your Seerr address only. You sign in in a Jellyboxd window, never on the Letterboxd page, so scripts running on Letterboxd cannot see what you type.

## Where data is sent

Only to the Seerr and Jellyfin servers you set up, never anywhere else:

- the film's TMDB id, title and year, to look it up;
- your request choices (server, profile, root folder, tags, seasons) when you request a film or cancel a request;
- with a Jellyfin API key: the film's identifier on your Jellyfin, to read its quality and the date it was added.

There is no analytics, tracking, advertising or third-party service.

## Your Seerr session

If you sign in with your Seerr account, you sign in on your Seerr's own website, as usual. Jellyboxd never sees your password.

Jellyboxd then reads your Seerr session cookie and adds it to its own requests to your Seerr, and to nothing else. Some browsers, Safari among them, do not send that cookie with an extension's requests; this is how Jellyboxd still reaches your Seerr there. The cookie stays in your browser: Jellyboxd does not copy it to its storage or send it anywhere other than your Seerr. When you sign out of Seerr, Jellyboxd stops using it.

## Permissions

- **Storage**: to keep your settings.
- **letterboxd.com**: to show the widget on film pages.
- **Cookies**: to read the session cookie of your Seerr address, and of no other site.
- **Network rules**: to add that cookie to Jellyboxd's own requests to your Seerr.
- **Access to your server addresses**: optional, requested when you connect your Seerr or check your Jellyfin. Because every server has its own address, the extension can ask for any site, but it only asks for the ones you enter. For your Seerr, it asks for both its `https://` and `http://` address, because Seerr may file its session cookie under either.

## Deleting your data

Click **Reset all settings** in the extension settings, or remove the extension: the browser then deletes everything it stored.

## Contact

Questions about this policy: open an issue on the project's GitHub repository.

Last updated: November 23, 2026.
