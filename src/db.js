const path = require("path");
const fs = require("fs");
const { createClient } = require("@libsql/client");
const { calculateRecipe } = require("./calculations");
const { INVENTORY_INGREDIENTS, INGREDIENT_DESIGNATIONS } = require("./inventory");

const tursoUrl = process.env.TURSO_DATABASE_URL;
const tursoToken = process.env.TURSO_DATABASE_TOKEN;
const dbPath = process.env.DATABASE_PATH || path.join(__dirname, "..", "data", "recipes.db");
const usingTurso = Boolean(tursoUrl && tursoToken);

if (!usingTurso) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
}

const client = createClient({
  url: usingTurso ? tursoUrl : `file:${dbPath}`,
  authToken: usingTurso ? tursoToken : undefined
});

async function execute(sql, args = []) {
  return client.execute({ sql, args });
}

async function all(sql, args = []) {
  const result = await execute(sql, args);
  return result.rows.map((row) => ({ ...row }));
}

async function get(sql, args = []) {
  const rows = await all(sql, args);
  return rows[0] || null;
}

async function migrate() {
  const statements = [
    `CREATE TABLE IF NOT EXISTS recipes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      product_type TEXT DEFAULT '',
      flavor TEXT DEFAULT '',
      recipe_card_type TEXT DEFAULT 'Edible/Topical',
      status TEXT NOT NULL DEFAULT 'Draft',
      current_version TEXT DEFAULT '',
      has_unpublished_changes INTEGER DEFAULT 0,
      batch_size REAL DEFAULT 0,
      batch_size_mode TEXT DEFAULT 'grams',
      batch_unit TEXT DEFAULT 'grams',
      unit_weight REAL DEFAULT 0,
      unit_weight_unit TEXT DEFAULT 'grams',
      target_mg_per_unit REAL DEFAULT 0,
      potency_percent REAL DEFAULT 0,
      expected_production_date TEXT DEFAULT '',
      copied_from_recipe_id INTEGER,
      copy_lock_formula INTEGER DEFAULT 0,
      is_new_recipe_duplicate INTEGER DEFAULT 0,
      active_additives TEXT DEFAULT '[]',
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      archived_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS recipe_ingredients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
      sort_order INTEGER DEFAULT 0,
      ingredient_type TEXT DEFAULT '',
      ingredient_name TEXT NOT NULL,
      description TEXT DEFAULT '',
      formula_qty REAL DEFAULT 0,
      formula_percent REAL DEFAULT 0,
      batch_qty REAL DEFAULT 0,
      unit TEXT DEFAULT 'grams',
      phase TEXT DEFAULT '',
      vendor TEXT DEFAULT '',
      lot_number TEXT DEFAULT '',
      cost_per_unit REAL DEFAULT 0,
      calculated_cost REAL DEFAULT 0,
      notes TEXT DEFAULT ''
    )`,
    `CREATE TABLE IF NOT EXISTS recipe_steps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
      sort_order INTEGER DEFAULT 0,
      instruction_text TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS recipe_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
      version_number TEXT NOT NULL,
      published_date TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      published_by TEXT DEFAULT '',
      recipe_snapshot_json TEXT NOT NULL,
      ingredient_snapshot_json TEXT NOT NULL,
      step_snapshot_json TEXT NOT NULL,
      calculation_snapshot_json TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS import_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      original_filename TEXT NOT NULL,
      detected_format TEXT NOT NULL,
      imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      import_preview_json TEXT NOT NULL,
      created_recipe_id INTEGER REFERENCES recipes(id)
    )`,
    `CREATE TABLE IF NOT EXISTS ingredients_master (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ingredient_name TEXT NOT NULL UNIQUE,
      ingredient_type TEXT DEFAULT '',
      description TEXT DEFAULT '',
      default_unit TEXT DEFAULT 'grams',
      default_vendor TEXT DEFAULT '',
      default_cost REAL DEFAULT 0,
      unit_of_measure TEXT DEFAULT '',
      grams_conversion REAL DEFAULT 1,
      default_grams_conversion REAL DEFAULT 1,
      source TEXT DEFAULT '',
      notes TEXT DEFAULT ''
    )`,
    `CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`
  ];

  if (!usingTurso) {
    await execute("PRAGMA foreign_keys = ON");
    await execute("PRAGMA busy_timeout = 5000");
  }

  for (const statement of statements) {
    await execute(statement);
  }
  await addColumnIfMissing("recipe_ingredients", "original_ingredient_name", "TEXT DEFAULT ''");
  await addColumnIfMissing("recipe_ingredients", "match_confidence", "REAL DEFAULT 1");
  await addColumnIfMissing("recipe_ingredients", "match_status", "TEXT DEFAULT 'matched'");
  await addColumnIfMissing("recipe_ingredients", "ingredient_type", "TEXT DEFAULT ''");
  await addColumnIfMissing("ingredients_master", "ingredient_type", "TEXT DEFAULT ''");
  await addColumnIfMissing("ingredients_master", "unit_of_measure", "TEXT DEFAULT ''");
  await addColumnIfMissing("ingredients_master", "grams_conversion", "REAL DEFAULT 1");
  await addColumnIfMissing("ingredients_master", "default_grams_conversion", "REAL DEFAULT 1");
  await addColumnIfMissing("recipes", "expected_production_date", "TEXT DEFAULT ''");
  await addColumnIfMissing("recipes", "recipe_card_type", "TEXT DEFAULT 'Edible/Topical'");
  await addColumnIfMissing("recipes", "batch_size_mode", "TEXT DEFAULT 'grams'");
  await addColumnIfMissing("recipes", "copied_from_recipe_id", "INTEGER");
  await addColumnIfMissing("recipes", "copy_lock_formula", "INTEGER DEFAULT 0");
  await addColumnIfMissing("recipes", "is_new_recipe_duplicate", "INTEGER DEFAULT 0");
  await addColumnIfMissing("recipes", "active_additives", "TEXT DEFAULT '[]'");
  await execute("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", ["additive_percent_limit", "4"]);
  await seedInventoryIngredients();
}

async function addColumnIfMissing(table, column, definition) {
  const columns = await all(`PRAGMA table_info(${table})`);
  if (columns.some((item) => item.name === column)) return;
  await execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

async function allSettings() {
  return Object.fromEntries((await all("SELECT key, value FROM settings")).map((row) => [row.key, row.value]));
}

function recipeFromRow(row) {
  if (!row) return null;
  return {
    ...row,
    has_unpublished_changes: Boolean(row.has_unpublished_changes),
    copy_lock_formula: Boolean(row.copy_lock_formula),
    is_new_recipe_duplicate: Boolean(row.is_new_recipe_duplicate),
    active_additives: row.active_additives ? JSON.parse(row.active_additives) : [],
    notes: row.notes ? JSON.parse(row.notes) : []
  };
}

function ingredientFromRow(row) {
  if (!row) return null;
  const {
    phase,
    lot_number,
    cost_per_unit,
    calculated_cost,
    ...ingredient
  } = row;
  return ingredient;
}

function writableRecipeStatus(status) {
  return ["Draft", "Template", "Archived"].includes(status) ? status : "Draft";
}

async function getRecipe(id) {
  const recipe = recipeFromRow(await get("SELECT * FROM recipes WHERE id = ?", [id]));
  if (!recipe) return null;
  recipe.ingredients = (await all("SELECT * FROM recipe_ingredients WHERE recipe_id = ? ORDER BY sort_order, id", [id])).map(ingredientFromRow);
  recipe.steps = await all("SELECT * FROM recipe_steps WHERE recipe_id = ? ORDER BY sort_order, id", [id]);
  recipe.calculations = calculateRecipe(recipe, recipe.ingredients, await allSettings());
  return recipe;
}

async function listRecipes(filters = {}) {
  const where = [];
  const args = [];
  if (filters.status && filters.status !== "All") {
    where.push("status = ?");
    args.push(filters.status);
  }
  if (filters.q) {
    where.push(`(
      name LIKE ? OR product_type LIKE ? OR flavor LIKE ? OR current_version LIKE ? OR created_at LIKE ? OR updated_at LIKE ?
    )`);
    const q = `%${filters.q}%`;
    args.push(q, q, q, q, q, q);
  }
  const sql = `SELECT * FROM recipes ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY updated_at DESC`;
  return (await all(sql, args)).map(recipeFromRow);
}

async function replaceChildren(recipeId, ingredients = [], steps = []) {
  await execute("DELETE FROM recipe_ingredients WHERE recipe_id = ?", [recipeId]);
  await execute("DELETE FROM recipe_steps WHERE recipe_id = ?", [recipeId]);

  for (const [index, item] of ingredients.entries()) {
    await execute(
      `INSERT INTO recipe_ingredients (
        recipe_id, sort_order, ingredient_type, ingredient_name, description, formula_qty, formula_percent, batch_qty, unit,
        phase, vendor, lot_number, cost_per_unit, calculated_cost, notes, original_ingredient_name, match_confidence, match_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        recipeId,
        item.sort_order || index + 1,
        item.ingredient_type || "",
        item.ingredient_name || "Unnamed ingredient",
        item.description || "",
        item.formula_qty || 0,
        item.formula_percent || 0,
        item.batch_qty || 0,
        item.unit || "grams",
        "",
        item.vendor || "",
        "",
        0,
        0,
        item.notes || "",
        item.original_ingredient_name || item.ingredient_name || "",
        item.match_confidence ?? 1,
        item.match_status || "matched"
      ]
    );
  }

  for (const [index, step] of steps.entries()) {
    await execute(
      "INSERT INTO recipe_steps (recipe_id, sort_order, instruction_text) VALUES (?, ?, ?)",
      [recipeId, step.sort_order || index + 1, step.instruction_text || step.text || ""]
    );
  }
}

async function calculateWithActiveMatches(recipe, ingredients) {
  const settings = await allSettings();
  const firstPass = calculateRecipe(recipe, ingredients, settings);
  if (recipe.recipe_card_type === "Vape") return firstPass;
  const nextIngredients = firstPass.ingredients.map((item) => ({ ...item }));
  const totalBatchGrams = Number(firstPass.total_batch_grams || 0);
  if (totalBatchGrams <= 0) return firstPass;
  const fixedByIndex = new Map();
  for (const additive of firstPass.active_additives || []) {
    const index = Number(additive.ingredient_index);
    if (!Number.isFinite(index) || !nextIngredients[index]) continue;
    fixedByIndex.set(index, Number(fixedByIndex.get(index) || 0) + Number(additive.calculated_grams || 0));
  }
  if (!fixedByIndex.size) return firstPass;

  const fixedTotal = Array.from(fixedByIndex.values()).reduce((sum, value) => sum + Number(value || 0), 0);
  const remainingBatch = Math.max(totalBatchGrams - fixedTotal, 0);
  const adjustableIndexes = nextIngredients.map((_, index) => index).filter((index) => !fixedByIndex.has(index));
  const basisTotal = adjustableIndexes.reduce((sum, index) => sum + Number(nextIngredients[index].formula_qty || 0), 0);
  const equalShare = adjustableIndexes.length ? remainingBatch / adjustableIndexes.length : 0;

  nextIngredients.forEach((ingredient, index) => {
    const batchQty = fixedByIndex.has(index)
      ? Number(fixedByIndex.get(index) || 0)
      : basisTotal > 0
        ? remainingBatch * (Number(ingredient.formula_qty || 0) / basisTotal)
        : equalShare;
    ingredient.batch_qty = batchQty;
    ingredient.formula_qty = batchQty;
    ingredient.formula_percent = totalBatchGrams > 0 ? batchQty / totalBatchGrams : 0;
    ingredient.unit = ingredient.unit || "grams";
    if (fixedByIndex.has(index)) {
      ingredient.notes = ingredient.notes || "Active/additive calculated from target dose and potency.";
    }
  });
  return calculateRecipe({ ...recipe, active_additives: firstPass.active_additives }, nextIngredients, settings);
}

async function createRecipe(input) {
  const calculations = await calculateWithActiveMatches(input, input.ingredients || []);
  const info = await execute(
    `INSERT INTO recipes (
      name, product_type, flavor, recipe_card_type, status, current_version, has_unpublished_changes, batch_size, batch_size_mode, batch_unit,
      unit_weight, unit_weight_unit, target_mg_per_unit, potency_percent, expected_production_date,
      copied_from_recipe_id, copy_lock_formula, is_new_recipe_duplicate, active_additives, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.name || "Untitled Recipe",
      input.product_type || "",
      input.flavor || "",
      input.recipe_card_type === "Vape" ? "Vape" : "Edible/Topical",
      writableRecipeStatus(input.status),
      input.current_version || "",
      input.has_unpublished_changes ? 1 : 0,
      input.batch_size || 0,
      input.recipe_card_type === "Vape" ? "liters" : input.batch_size_mode === "units" ? "units" : "grams",
      input.recipe_card_type === "Vape" ? "L" : "grams",
      input.unit_weight || 0,
      input.unit_weight_unit || "grams",
      input.target_mg_per_unit || 0,
      input.potency_percent || 0,
      input.expected_production_date || "",
      input.copied_from_recipe_id || null,
      input.copy_lock_formula ? 1 : 0,
      input.is_new_recipe_duplicate ? 1 : 0,
      JSON.stringify(calculations.active_additives || input.active_additives || []),
      JSON.stringify(input.notes || [])
    ]
  );
  const recipeId = Number(info.lastInsertRowid);
  await replaceChildren(recipeId, calculations.ingredients, input.steps || []);
  await upsertMasterIngredients(calculations.ingredients);
  return getRecipe(recipeId);
}

async function updateRecipe(id, input) {
  const existing = await getRecipe(id);
  if (!existing) return null;
  const next = { ...existing, ...input };
  const incomingIngredients = input.ingredients || existing.ingredients;
  const ingredientsForCalculation = existing.status === "Published"
    ? incomingIngredients.map((item, index) => ({
      ...item,
      formula_qty: existing.ingredients[index]?.formula_qty ?? item.formula_qty,
      formula_percent: existing.ingredients[index]?.formula_percent ?? item.formula_percent,
      batch_qty: ""
    }))
    : incomingIngredients.map((item) => ({ ...item, batch_qty: "" }));
  const calculations = await calculateWithActiveMatches(next, ingredientsForCalculation);
  const publishedDirty = existing.status === "Published" || existing.current_version;
  await execute(
    `UPDATE recipes SET
      name = ?, product_type = ?, flavor = ?, recipe_card_type = ?, status = ?, current_version = ?, has_unpublished_changes = ?, batch_size = ?, batch_size_mode = ?, batch_unit = ?,
      unit_weight = ?, unit_weight_unit = ?, target_mg_per_unit = ?, potency_percent = ?, expected_production_date = ?,
      copied_from_recipe_id = ?, copy_lock_formula = ?, is_new_recipe_duplicate = ?, active_additives = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?`,
    [
      next.name || "Untitled Recipe",
      next.product_type || "",
      next.flavor || "",
      next.recipe_card_type === "Vape" ? "Vape" : "Edible/Topical",
      writableRecipeStatus(next.status),
      next.current_version || "",
      publishedDirty ? 1 : 0,
      next.batch_size || 0,
      next.recipe_card_type === "Vape" ? "liters" : next.batch_size_mode === "units" ? "units" : "grams",
      next.recipe_card_type === "Vape" ? "L" : "grams",
      next.unit_weight || 0,
      next.unit_weight_unit || "grams",
      next.target_mg_per_unit || 0,
      next.potency_percent || 0,
      next.expected_production_date || "",
      next.copied_from_recipe_id || null,
      next.copy_lock_formula ? 1 : 0,
      next.is_new_recipe_duplicate ? 1 : 0,
      JSON.stringify(calculations.active_additives || next.active_additives || []),
      JSON.stringify(next.notes || []),
      id
    ]
  );
  await replaceChildren(id, calculations.ingredients, input.steps || existing.steps);
  await upsertMasterIngredients(calculations.ingredients);
  return getRecipe(id);
}

async function nextVersion(recipeId) {
  const latest = await get("SELECT version_number FROM recipe_versions WHERE recipe_id = ? ORDER BY id DESC LIMIT 1", [recipeId]);
  if (!latest) return "v1.0";
  const whole = latest.version_number.match(/^v?(\d+)$/i);
  if (whole) return `v${Number(whole[1]) + 1}`;
  const match = latest.version_number.match(/^v(\d+)\.(\d+)$/);
  if (!match) return "v1.0";
  return `v${match[1]}.${Number(match[2]) + 1}`;
}

function suggestNextVersion(version) {
  const value = String(version || "").trim();
  const whole = value.match(/^v?(\d+)$/i);
  if (whole) return `v${Number(whole[1]) + 1}`;
  const dotted = value.match(/^v?(\d+)\.(\d+)$/i);
  if (dotted) return `v${dotted[1]}.${Number(dotted[2]) + 1}`;
  return value || "v1";
}

async function publishRecipe(id, publishedBy = "Production") {
  const recipe = await getRecipe(id);
  if (!recipe) return null;
  if (!recipe.expected_production_date) {
    const error = new Error("Expected production date is required before publishing.");
    error.statusCode = 400;
    throw error;
  }
  const version = recipe.current_version || await nextVersion(id);
  const calculations = calculateRecipe(recipe, recipe.ingredients, await allSettings());
  await execute(
    `INSERT INTO recipe_versions (
      recipe_id, version_number, published_by, recipe_snapshot_json, ingredient_snapshot_json, step_snapshot_json, calculation_snapshot_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      version,
      publishedBy,
      JSON.stringify({ ...recipe, ingredients: undefined, steps: undefined, calculations: undefined }),
      JSON.stringify(calculations.ingredients),
      JSON.stringify(recipe.steps),
      JSON.stringify(calculations)
    ]
  );
  await execute(
    "UPDATE recipes SET status = 'Published', current_version = ?, has_unpublished_changes = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    [version, id]
  );
  return getRecipe(id);
}

async function deleteRecipe(id) {
  const info = await execute("DELETE FROM recipes WHERE id = ?", [id]);
  return Boolean(info.rowsAffected);
}

async function duplicateRecipe(id, options = {}) {
  const recipe = await getRecipe(id);
  if (!recipe) return null;
  return createRecipe({
    ...recipe,
    name: recipe.name,
    status: "Draft",
    current_version: suggestNextVersion(recipe.current_version),
    has_unpublished_changes: false,
    copied_from_recipe_id: recipe.id,
    copy_lock_formula: options.startNewRecipe ? false : true,
    is_new_recipe_duplicate: Boolean(options.startNewRecipe)
  });
}

async function archiveRecipe(id) {
  const info = await execute(
    "UPDATE recipes SET status = 'Archived', archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    [id]
  );
  return info.rowsAffected ? getRecipe(id) : null;
}

async function listVersions(recipeId) {
  return all("SELECT * FROM recipe_versions WHERE recipe_id = ? ORDER BY id DESC", [recipeId]);
}

async function getVersion(versionId) {
  const version = await get("SELECT * FROM recipe_versions WHERE id = ?", [versionId]);
  if (!version) return null;
  return {
    ...version,
    recipe: JSON.parse(version.recipe_snapshot_json),
    ingredients: JSON.parse(version.ingredient_snapshot_json),
    steps: JSON.parse(version.step_snapshot_json),
    calculations: JSON.parse(version.calculation_snapshot_json)
  };
}

async function createImportJob(originalFilename, detectedFormat, preview) {
  const info = await execute(
    "INSERT INTO import_jobs (original_filename, detected_format, import_preview_json) VALUES (?, ?, ?)",
    [originalFilename, detectedFormat, JSON.stringify(preview)]
  );
  return Number(info.lastInsertRowid);
}

async function markImportJobCreated(importJobId, recipeId) {
  if (!importJobId) return;
  await execute("UPDATE import_jobs SET created_recipe_id = ? WHERE id = ?", [recipeId, importJobId]);
}

async function upsertMasterIngredients(ingredients = []) {
  for (const item of ingredients.filter((ingredient) => ingredient.ingredient_name)) {
    const gramsConversion = item.grams_conversion || item.gram_conversion || item.default_grams_conversion || 1;
    await execute(
      `INSERT INTO ingredients_master (
        ingredient_name, ingredient_type, description, default_unit, default_vendor, default_cost,
        unit_of_measure, grams_conversion, default_grams_conversion, source, notes
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(ingredient_name) DO UPDATE SET
        ingredient_type = COALESCE(NULLIF(excluded.ingredient_type, ''), ingredients_master.ingredient_type),
        default_unit = COALESCE(NULLIF(excluded.default_unit, ''), ingredients_master.default_unit),
        description = COALESCE(NULLIF(excluded.description, ''), ingredients_master.description),
        default_vendor = COALESCE(NULLIF(excluded.default_vendor, ''), ingredients_master.default_vendor),
        default_cost = CASE WHEN excluded.default_cost > 0 THEN excluded.default_cost ELSE ingredients_master.default_cost END,
        unit_of_measure = COALESCE(NULLIF(excluded.unit_of_measure, ''), ingredients_master.unit_of_measure),
        grams_conversion = CASE WHEN excluded.grams_conversion > 0 THEN excluded.grams_conversion ELSE ingredients_master.grams_conversion END,
        default_grams_conversion = CASE WHEN excluded.default_grams_conversion > 0 THEN excluded.default_grams_conversion ELSE ingredients_master.default_grams_conversion END,
        source = COALESCE(NULLIF(excluded.source, ''), ingredients_master.source),
        notes = COALESCE(NULLIF(excluded.notes, ''), ingredients_master.notes)`,
      [
        item.ingredient_name,
        item.ingredient_type || "",
        item.description || "",
        item.default_unit || item.unit || "grams",
        item.default_vendor || item.vendor || "",
        item.default_cost || item.cost_per_unit || 0,
        item.unit_of_measure || "",
        gramsConversion,
        gramsConversion,
        item.source || "Recipe",
        item.notes || ""
      ]
    );
  }
}

async function seedInventoryIngredients() {
  await upsertMasterIngredients(INGREDIENT_DESIGNATIONS.map((item) => ({
    ...item,
    unit_of_measure: item.default_unit,
    default_unit: "grams",
    source: "Designation Sheet",
    notes: "Seeded from recipe ingredients-2.xlsx"
  })));

  for (const ingredientName of INVENTORY_INGREDIENTS) {
    await execute(
      `INSERT INTO ingredients_master (ingredient_name, default_unit, source, notes)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(ingredient_name) DO UPDATE SET
        source = CASE
          WHEN ingredients_master.source = '' THEN excluded.source
          ELSE ingredients_master.source
        END`,
      [ingredientName, "grams", "Inventory", "Seeded inventory ingredient"]
    );
  }
}

async function listIngredients() {
  return all("SELECT * FROM ingredients_master ORDER BY ingredient_name");
}

async function getIngredient(name) {
  return get("SELECT * FROM ingredients_master WHERE ingredient_name = ?", [name]);
}

async function getSettings() {
  return allSettings();
}

async function saveSettings(settings) {
  for (const [key, value] of Object.entries(settings)) {
    await execute(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      [key, String(value)]
    );
  }
  return getSettings();
}

function seedIngredientsStick() {
  return [
    ["coco butter", 52.4168, 0.1747, 5.2417, "Bulk Nat. Oils", 0.56],
    ["shea butter", 24.19, 0.0806, 2.419, "Bulk Nat. Oils", 0.1792],
    ["stearic acid", 58.38, 0.1946, 5.838, "Bulk Nat. Oils", 0.0868],
    ["e-wax", 58.38, 0.1946, 5.838, "Bulk Nat. Oils", 0.2268],
    ["bees wax", 48.38, 0.1613, 4.838, "Bulk Nat. Oils", 0.322],
    ["sweet almond oil", 6.05, 0.0202, 0.605, "Bulk Apothecary", 0.197],
    ["apricot seed oil", 6.05, 0.0202, 0.605, "Bulk Nat. Oils", 0.259],
    ["coconut oil", 12.19, 0.0406, 1.219, "Bulk Nat. Oils", 0.1442],
    ["menthol", 18.14, 0.0605, 1.814, "Bulk Nat. Oils", 0.861],
    ["vitamin e oil", 2.42, 0.0081, 0.242, "Bulk Nat. Oils", 1.232],
    ["peppermint", 1.36, 0.0045, 0.136, "New Directions Aromatics", 0.9517],
    ["lavender", 1, 0.0033, 0.1, "Bulk Nat. Oils", 2.2667],
    ["eucalyptus", 1.51, 0.005, 0.151, "Bulk Nat. Oils", 0.8092],
    ["clove", 3.02, 0.0101, 0.302, "Bulk Nat. Oils", 1.1128],
    ["black pepper", 3.02, 0.0101, 0.302, "New Directions Aromatics", 3.348],
    ["camphor", 1.66, 0.0055, 0.166, "New Directions Aromatics", 0.7277],
    ["copaiba", 0.76, 0.0025, 0.076, "Bulk Nat. Oils", 1.904],
    ["Concentrate - CBD Isolate", 0.5051, 0.0017, 0.0505, "", 0],
    ["Concentrate - THC RSO", 0.5682, 0.0019, 0.0568, "", 0]
  ].map((row, index) => ({
    sort_order: index + 1,
    ingredient_name: row[0],
    formula_qty: row[1],
    formula_percent: row[2],
    batch_qty: row[3],
      unit: "grams",
      vendor: row[4],
      cost_per_unit: row[5],
    phase: index < 8 ? "Oil phase" : "Cool-down"
  }));
}

async function seed() {
  const count = await get("SELECT COUNT(*) AS count FROM recipes");
  if (Number(count.count) > 0) return;

  await createRecipe({
    name: "Cooling Menthol Stick Rub 1oz",
    product_type: "Topical Stick Rub",
    flavor: "Peppermint",
    batch_size: 30,
    batch_size_mode: "grams",
    batch_unit: "grams",
    expected_production_date: "",
    unit_weight: 30,
    unit_weight_unit: "grams",
    target_mg_per_unit: 50,
    potency_percent: 80,
    active_additives: [{
      ingredient_name: "Concentrate - CBD Isolate",
      ingredient_index: "17",
      target_mg_per_unit: 50,
      potency_percent: 80
    }],
    ingredients: seedIngredientsStick(),
    steps: [
      "Set up double boiler on medium heat.",
      "Weigh all ingredients.",
      "Combine phase 1 oil ingredients and mix until melted.",
      "Add menthol and continue mixing until incorporated.",
      "Cool to 120F, add essential oil, then fill sticks."
    ].map((instruction_text, index) => ({ sort_order: index + 1, instruction_text })),
    notes: ["Starter data based on stick/topical workbook format."]
  });

  await createRecipe({
    name: "70:30 Gummy Formula - Single Additive",
    product_type: "Gummy",
    flavor: "Hybrid",
    batch_size: 75000,
    batch_size_mode: "grams",
    batch_unit: "grams",
    expected_production_date: "",
    unit_weight: 10,
    unit_weight_unit: "grams",
    target_mg_per_unit: 47,
    potency_percent: 81.2,
    active_additives: [{
      ingredient_name: "Additive",
      ingredient_index: "3",
      target_mg_per_unit: 47,
      potency_percent: 81.2
    }],
    ingredients: [
      ["Melt-to-Make Gelatin Pucks", 0.7, 52500],
      ["Melt-to-Make Pectin Base Part A", 0.2542118227, 19065.8867],
      ["Water", 0.04, 3000],
      ["Additive", 0.0057881773, 434.1133]
    ].map((row, index) => ({
      sort_order: index + 1,
      ingredient_name: row[0],
      formula_percent: row[1],
      formula_qty: row[2],
      batch_qty: row[2],
      unit: "grams",
      phase: /additive/i.test(row[0]) ? "Active/Additive" : "Base"
    })),
    steps: [
      "Melt gummy base according to supplier work instructions.",
      "Add water and mix until uniform.",
      "Add weighed additive and blend thoroughly.",
      "Deposit into molds and record anticipated yield."
    ].map((instruction_text, index) => ({ sort_order: index + 1, instruction_text })),
    notes: ["Starter data based on gummy melt-to-make workbook format."]
  });
}

module.exports = {
  client,
  usingTurso,
  migrate,
  seed,
  getRecipe,
  listRecipes,
  createRecipe,
  updateRecipe,
  publishRecipe,
  duplicateRecipe,
  archiveRecipe,
  deleteRecipe,
  listVersions,
  getVersion,
  createImportJob,
  markImportJobCreated,
  upsertMasterIngredients,
  listIngredients,
  getIngredient,
  getSettings,
  saveSettings
};
