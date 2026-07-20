# Recipe Manufacturing Manager

A simple full-stack recipe management app for importing spreadsheet formulas, editing draft recipes, calculating batch quantities, publishing locked recipe versions, and printing final recipe cards.

Repository:

```text
https://github.com/Jmetschke/recipe-workbook.git
```

## Run Locally

```bash
npm install
npm start
```

Then open:

```text
http://localhost:3000
```

## What Is Included

- Express backend with SQLite local database.
- Plain HTML/CSS/JavaScript frontend.
- XLSX import preview using the `xlsx` package.
- Flexible import handlers for:
  - Stick/topical workbooks with `recipe`, `ingredient list`, `SOP instructions`, and `ingredient and cost` sheets.
  - Gummy / melt-to-make workbooks with multiple formula variant sheets.
- Draft recipe editing.
- Batch, yield, active ingredient, percentage, and cost calculations.
- Publish-only version history.
- Locked published version snapshots.
- Printable browser recipe card.
- Starter seed data for one topical stick rub and one gummy formula.

## Import Flow

1. Open Import.
2. Upload an `.xlsx` workbook.
3. Review detected format, sheets, and normalized recipe variants.
4. Correct recipe name, product type, flavor, batch size, potency, target mg, and notes.
5. Create draft recipes.

Imported recipes remain editable drafts until you click **Publish New Version**.

## Versioning Rules

- Saving a draft does not create a version record.
- Publishing creates the first version as `v1.0`.
- Later publishes increment as `v1.1`, `v1.2`, `v1.3`, and so on.
- Published version snapshots are read-only and stored in `recipe_versions`.
- Editing a previously published recipe marks it as draft work with unpublished changes.

## Database

Local development uses:

```text
data/recipes.db
```

The schema uses simple SQLite-compatible tables:

- `recipes`
- `recipe_ingredients`
- `recipe_steps`
- `recipe_versions`
- `import_jobs`
- `ingredients_master`
- `settings`

## Turso Notes

The app uses a libSQL-compatible database client. Local development writes to SQLite at `data/recipes.db`. On Render, it automatically writes to Turso when both Turso environment variables are present.

Render environment variables:

```text
TURSO_DATABASE_URL=
TURSO_DATABASE_TOKEN=
DATABASE_PATH=
PORT=
```

`DATABASE_PATH` is only needed for local SQLite overrides. Render should use `TURSO_DATABASE_URL` and `TURSO_DATABASE_TOKEN`.

For local SQLite override:

```bash
DATABASE_PATH=/path/to/recipes.db npm start
```

## Progressive Web App

The Express static frontend lives in `public/` and is installable as an internal PWA when served over HTTPS (as it is on Render). Its PWA pieces are:

- `public/manifest.json`: app identity, standalone display settings, colors, and install icons.
- `public/icons/icon-192.png` and `public/icons/icon-512.png`: Android and iOS Home Screen artwork.
- `public/service-worker.js`: a deliberately small online-first app-shell worker.
- `public/index.html`: manifest, theme, mobile-web-app, and Apple Home Screen metadata.
- `public/app.js`: service-worker registration after page load.

The service worker never intercepts `/api/` requests or cross-origin requests. Recipe data therefore continues to come directly from the live Express/Render routes backed by Turso and is not stored in the browser cache. Only same-origin frontend assets have an offline fallback.

### Test installation

Use the deployed Render HTTPS URL for device testing. Localhost can verify registration on a development computer, but a phone must use a secure reachable URL.

On iPhone or iPad Safari:

1. Open the Render URL in Safari and let the page load.
2. Tap **Share**.
3. Tap **Add to Home Screen**, confirm the name, and tap **Add**.
4. Launch the new Home Screen icon. Confirm it opens without Safari browser chrome.
5. Open a recipe and save a harmless test change to confirm live API/Turso access still works.

On Android Chrome:

1. Open the Render URL in Chrome and let the page load.
2. Open the Chrome menu and choose **Install app** or **Add to Home screen**.
3. Confirm installation, then launch the icon from the Home Screen or app drawer.
4. Confirm the app opens in standalone mode and a normal API-backed view loads and saves.

After deploying a service-worker change, existing installations may need one normal online reload before the newly activated worker and app-shell cache take control.
