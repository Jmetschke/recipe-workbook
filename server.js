const fs = require("fs");
const path = require("path");
const express = require("express");
const multer = require("multer");
const { parseWorkbook } = require("./src/parser");
const {
  usingTurso,
  migrate,
  seed,
  getRecipe,
  listRecipes,
  createRecipe,
  updateRecipe,
  publishRecipe,
  unpublishRecipe,
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
  upsertProductionItems,
  listProductionItems,
  getProductionItem,
  getSettings,
  saveSettings
} = require("./src/db");

fs.mkdirSync(path.join(__dirname, "data"), { recursive: true });
fs.mkdirSync(path.join(__dirname, "uploads"), { recursive: true });

const app = express();
const upload = multer({ storage: multer.memoryStorage() });
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "15mb" }));
app.use(express.static(path.join(__dirname, "public")));

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function safeTemplateFilename(recipe) {
  const base = `${recipe.name || "recipe-template"}-${recipe.current_version || "template"}`
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return `${base || "recipe-template"}.recipe-template.json`;
}

function templateExportPayload(recipe) {
  return {
    file_type: "recipe_manager_template",
    file_version: 1,
    exported_at: new Date().toISOString(),
    template: {
      name: recipe.name,
      product_type: recipe.product_type,
      flavor: recipe.flavor,
      recipe_card_type: recipe.recipe_card_type,
      current_version: recipe.current_version,
      batch_size: recipe.batch_size,
      batch_size_mode: recipe.batch_size_mode,
      batch_unit: recipe.batch_unit,
      unit_weight: recipe.unit_weight,
      unit_weight_unit: recipe.unit_weight_unit,
      vape_unit_size: recipe.vape_unit_size,
      target_mg_per_unit: recipe.target_mg_per_unit,
      potency_percent: recipe.potency_percent,
      expected_production_date: recipe.expected_production_date,
      active_additives: recipe.active_additives || [],
      ingredients: recipe.ingredients || [],
      steps: recipe.steps || [],
      notes: recipe.notes || []
    }
  };
}

function templateImportPayload(payload) {
  const template = payload.template || payload.recipe || payload;
  if (!template || !template.name || !Array.isArray(template.ingredients)) {
    const error = new Error("Upload a valid recipe template export file.");
    error.statusCode = 400;
    throw error;
  }
  return {
    ...template,
    id: undefined,
    status: "Template",
    has_unpublished_changes: false,
    copied_from_recipe_id: null,
    copy_lock_formula: true,
    is_new_recipe_duplicate: false,
    expected_production_date: template.expected_production_date || ""
  };
}

app.get("/api/recipes", asyncRoute(async (req, res) => {
  res.json(await listRecipes({ status: req.query.status, q: req.query.q }));
}));

app.post("/api/recipes", asyncRoute(async (req, res) => {
  res.status(201).json(await createRecipe(req.body));
}));

app.get("/api/recipes/:id", asyncRoute(async (req, res) => {
  const recipe = await getRecipe(req.params.id);
  if (!recipe) return res.status(404).json({ error: "Recipe not found" });
  return res.json(recipe);
}));

app.put("/api/recipes/:id", asyncRoute(async (req, res) => {
  const recipe = await updateRecipe(req.params.id, req.body);
  if (!recipe) return res.status(404).json({ error: "Recipe not found" });
  return res.json(recipe);
}));

app.patch("/api/recipes/:id/archive", asyncRoute(async (req, res) => {
  const recipe = await archiveRecipe(req.params.id);
  if (!recipe) return res.status(404).json({ error: "Recipe not found" });
  return res.json(recipe);
}));

app.delete("/api/recipes/:id", asyncRoute(async (req, res) => {
  const deleted = await deleteRecipe(req.params.id);
  if (!deleted) return res.status(404).json({ error: "Recipe not found" });
  return res.json({ ok: true });
}));

app.post("/api/recipes/:id/duplicate", asyncRoute(async (req, res) => {
  const copy = await duplicateRecipe(req.params.id, { startNewRecipe: false });
  if (!copy) return res.status(404).json({ error: "Recipe not found" });
  return res.status(201).json(copy);
}));

app.post("/api/recipes/:id/duplicate-new", asyncRoute(async (req, res) => {
  const copy = await duplicateRecipe(req.params.id, { startNewRecipe: true });
  if (!copy) return res.status(404).json({ error: "Recipe not found" });
  return res.status(201).json(copy);
}));

app.post("/api/recipes/:id/publish", asyncRoute(async (req, res) => {
  const recipe = await publishRecipe(req.params.id, req.body.published_by || "Production");
  if (!recipe) return res.status(404).json({ error: "Recipe not found" });
  return res.json(recipe);
}));

app.post("/api/recipes/:id/unpublish", asyncRoute(async (req, res) => {
  const recipe = await unpublishRecipe(req.params.id);
  if (!recipe) return res.status(404).json({ error: "Recipe not found" });
  return res.json(recipe);
}));

app.get("/api/recipes/:id/versions", asyncRoute(async (req, res) => {
  res.json(await listVersions(req.params.id));
}));

app.get("/api/versions/:versionId", asyncRoute(async (req, res) => {
  const version = await getVersion(req.params.versionId);
  if (!version) return res.status(404).json({ error: "Version not found" });
  return res.json(version);
}));

app.post("/api/import/xlsx", upload.single("workbook"), asyncRoute(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Upload an .xlsx workbook." });
  const inventoryNames = (await listIngredients()).map((ingredient) => ingredient.ingredient_name);
  const preview = parseWorkbook(req.file.buffer, inventoryNames);
  const importJobId = await createImportJob(req.file.originalname, preview.detected_format, preview);
  return res.json({ import_job_id: importJobId, original_filename: req.file.originalname, ...preview });
}));

app.post("/api/import/confirm", asyncRoute(async (req, res) => {
  const recipes = req.body.recipes || (req.body.recipe ? [req.body.recipe] : []);
  if (!recipes.length) return res.status(400).json({ error: "No recipes selected for import." });
  const created = [];
  for (const recipe of recipes) {
    created.push(await createRecipe({ ...recipe, status: "Draft" }));
  }
  if (req.body.import_job_id) {
    await markImportJobCreated(req.body.import_job_id, created[0].id);
  }
  return res.status(201).json({ recipes: created });
}));

app.get("/api/recipes/:id/template-export", asyncRoute(async (req, res) => {
  const recipe = await getRecipe(req.params.id);
  if (!recipe) return res.status(404).json({ error: "Recipe not found" });
  if (recipe.status !== "Template") return res.status(400).json({ error: "Only template recipes can be exported as template files." });
  const filename = safeTemplateFilename(recipe);
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  return res.send(JSON.stringify(templateExportPayload(recipe), null, 2));
}));

app.post("/api/templates/import", upload.single("template"), asyncRoute(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Upload a recipe template export file." });
  if (/\.pdf$/i.test(req.file.originalname || "")) {
    return res.status(400).json({ error: "Printable PDFs cannot recreate editable template data. Use the exported .recipe-template.json file." });
  }
  let payload;
  try {
    payload = JSON.parse(req.file.buffer.toString("utf8"));
  } catch (err) {
    return res.status(400).json({ error: "Template import file must be valid JSON from Export Template." });
  }
  const recipe = await createRecipe(templateImportPayload(payload));
  return res.status(201).json(recipe);
}));

app.get("/api/ingredients", asyncRoute(async (req, res) => {
  res.json(await listIngredients());
}));

app.post("/api/ingredients", asyncRoute(async (req, res) => {
  if (!req.body.ingredient_name || !String(req.body.ingredient_name).trim()) {
    return res.status(400).json({ error: "Ingredient name is required." });
  }
  await upsertMasterIngredients([{
    ingredient_name: String(req.body.ingredient_name).trim(),
    ingredient_type: req.body.ingredient_type,
    description: req.body.description,
    default_unit: req.body.default_unit,
    default_vendor: req.body.default_vendor,
    default_cost: req.body.default_cost,
    unit_of_measure: req.body.unit_of_measure,
    grams_conversion: req.body.grams_conversion,
    default_grams_conversion: req.body.default_grams_conversion,
    source: req.body.source || "Manual Entry",
    notes: req.body.notes
  }]);
  return res.status(201).json(await getIngredient(String(req.body.ingredient_name).trim()));
}));

app.get("/api/production-items", asyncRoute(async (req, res) => {
  res.json(await listProductionItems());
}));

app.post("/api/production-items", asyncRoute(async (req, res) => {
  if (!req.body.item_name || !String(req.body.item_name).trim()) {
    return res.status(400).json({ error: "Production item name is required." });
  }
  await upsertProductionItems([{
    item_name: String(req.body.item_name).trim(),
    recipe_card_type: req.body.recipe_card_type,
    product_type: req.body.product_type,
    flavor: req.body.flavor,
    sku: req.body.sku,
    default_batch_size: req.body.default_batch_size,
    default_batch_unit: req.body.default_batch_unit,
    default_unit_weight: req.body.default_unit_weight,
    unit_weight_unit: req.body.unit_weight_unit,
    location: req.body.location,
    source: req.body.source || "Manual Entry",
    notes: req.body.notes
  }]);
  return res.status(201).json(await getProductionItem(String(req.body.item_name).trim()));
}));

app.get("/api/settings", asyncRoute(async (req, res) => {
  res.json(await getSettings());
}));

app.put("/api/settings", asyncRoute(async (req, res) => {
  res.json(await saveSettings(req.body));
}));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.statusCode || 500).json({ error: err.message || "Unexpected server error" });
});

async function start() {
  await migrate();
  await seed();
  app.listen(PORT, () => {
    const databaseLabel = usingTurso ? "Turso" : "local SQLite";
    console.log(`Recipe manager running at http://localhost:${PORT} using ${databaseLabel}`);
  });
}

start().catch((err) => {
  console.error("Failed to start recipe manager", err);
  process.exit(1);
});
