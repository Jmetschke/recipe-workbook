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

app.get("/api/ingredients", asyncRoute(async (req, res) => {
  res.json(await listIngredients());
}));

app.post("/api/ingredients", asyncRoute(async (req, res) => {
  await upsertMasterIngredients([{
    ingredient_name: req.body.ingredient_name,
    description: req.body.description,
    unit: req.body.default_unit,
    vendor: req.body.default_vendor,
    cost_per_unit: req.body.default_cost,
    notes: req.body.notes
  }]);
  res.status(201).json(await getIngredient(req.body.ingredient_name));
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
