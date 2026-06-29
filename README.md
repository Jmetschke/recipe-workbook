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
