const state = {
  view: "dashboard",
  recipes: [],
  ingredientsMaster: [],
  currentRecipe: null,
  editorMode: "draft",
  importPreview: null,
  selectedImportIndexes: new Set()
};

const content = document.querySelector("#content");
const title = document.querySelector("#pageTitle");
const subtitle = document.querySelector("#pageSubtitle");
const toast = document.querySelector("#toast");

function money(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function pct(value) {
  return `${(Number(value || 0) * 100).toFixed(2)}%`;
}

function qty(value) {
  return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

function monthKey(dateString = isoToday()) {
  return (dateString || isoToday()).slice(0, 7);
}

function monthLabel(key) {
  const [year, month] = key.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function batchInputLabel(recipe) {
  return recipe.batch_size_mode === "units"
    ? `${qty(recipe.batch_size)} units`
    : `${qty(recipe.batch_size)} grams`;
}

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizePercentInput(value) {
  const parsed = numeric(value);
  return parsed > 1 ? parsed / 100 : parsed;
}

function calculateClientRecipe(recipe) {
  const ingredients = recipe.ingredients || [];
  const batchSizeInput = numeric(recipe.batch_size);
  const unitWeight = numeric(recipe.unit_weight);
  const batchSizeMode = recipe.batch_size_mode === "units" ? "units" : "grams";
  const totalBatchGrams = batchSizeMode === "units" ? batchSizeInput * unitWeight : batchSizeInput;
  const targetMg = numeric(recipe.target_mg_per_unit);
  const potencyPercent = normalizePercentInput(recipe.potency_percent);
  const formulaTotal = ingredients.reduce((sum, item) => sum + numeric(item.formula_qty), 0);
  const estimatedYield = batchSizeMode === "units" ? batchSizeInput : unitWeight > 0 ? totalBatchGrams / unitWeight : 0;

  const normalizedIngredients = ingredients.map((item) => {
    const hasPercent = item.formula_percent !== undefined && item.formula_percent !== null && item.formula_percent !== "";
    const formulaPercent = hasPercent
      ? normalizePercentInput(item.formula_percent)
      : formulaTotal > 0
        ? numeric(item.formula_qty) / formulaTotal
        : 0;
    const batchQty = formulaPercent * totalBatchGrams;
    return {
      ...item,
      formula_qty: numeric(item.formula_qty),
      formula_percent: formulaPercent,
      batch_qty: batchQty
    };
  });

  const percentTotal = normalizedIngredients.reduce((sum, item) => sum + numeric(item.formula_percent), 0);
  const batchTotal = normalizedIngredients.reduce((sum, item) => sum + numeric(item.batch_qty), 0);
  const activeMassPerUnitMg = potencyPercent > 0 && targetMg > 0
    ? targetMg / potencyPercent
    : 0;
  const activeMassPerUnitGrams = activeMassPerUnitMg / 1000;
  const activeIngredientGrams = activeMassPerUnitGrams > 0 && estimatedYield > 0
    ? activeMassPerUnitGrams * estimatedYield
    : 0;
  const warnings = [];

  if (Math.abs(percentTotal - 1) > 0.005) {
    warnings.push(`Formula percentages total ${(percentTotal * 100).toFixed(2)}%, not 100%.`);
  }

  normalizedIngredients.forEach((item) => {
    const name = `${item.ingredient_name || ""}`.toLowerCase();
    if ((name.includes("additive") || name.includes("concentrate") || name.includes("active")) && item.formula_percent * 100 > 4) {
      warnings.push(`${item.ingredient_name || "Additive"} is ${(item.formula_percent * 100).toFixed(2)}%, above the 4% additive limit.`);
    }
  });

  return {
    formula_total: formulaTotal,
    percent_total: percentTotal,
    total_batch_grams: totalBatchGrams,
    batch_size_mode: batchSizeMode,
    batch_total: batchTotal,
    estimated_yield: estimatedYield,
    active_ingredient_grams: activeIngredientGrams,
    total_active_additive_grams: activeIngredientGrams,
    active_mass_per_unit_mg: activeMassPerUnitMg,
    active_mass_per_unit_grams: activeMassPerUnitGrams,
    potency_fraction: potencyPercent,
    additive_limit_percent: 4,
    warnings,
    ingredients: normalizedIngredients
  };
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.remove("hidden");
  window.setTimeout(() => toast.classList.add("hidden"), 2800);
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: options.body instanceof FormData ? undefined : { "Content-Type": "application/json" },
    ...options,
    body: options.body instanceof FormData ? options.body : options.body ? JSON.stringify(options.body) : undefined
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

function setPage(name, help) {
  title.textContent = name;
  subtitle.textContent = help;
  document.querySelectorAll(".nav").forEach((button) => button.classList.toggle("active", button.dataset.view === state.view));
}

async function loadRecipes(params = {}) {
  const query = new URLSearchParams(params).toString();
  state.recipes = await api(`/api/recipes${query ? `?${query}` : ""}`);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function loadIngredientsMaster() {
  if (!state.ingredientsMaster.length) {
    state.ingredientsMaster = await api("/api/ingredients");
  }
  return state.ingredientsMaster;
}

function ingredientOptionsMarkup() {
  return `<datalist id="ingredientOptions">${state.ingredientsMaster.map((item) => {
    const conversion = Number(item.grams_conversion || item.default_grams_conversion || 0);
    const labelParts = [
      item.ingredient_type,
      item.unit_of_measure,
      conversion > 0 ? `${qty(conversion)}g` : "",
      item.default_vendor,
      item.source
    ].filter(Boolean);
    const label = labelParts.length ? ` label="${escapeHtml(labelParts.join(" - "))}"` : "";
    return `<option value="${escapeHtml(item.ingredient_name)}"${label}></option>`;
  }).join("")}</datalist>`;
}

function masterIngredientByName(name) {
  const normalized = String(name || "").trim().toLowerCase();
  return state.ingredientsMaster.find((item) => item.ingredient_name.toLowerCase() === normalized);
}

function ingredientNameOptions(value = "") {
  const current = String(value || "").trim();
  const hasCurrent = !current || state.ingredientsMaster.some((item) => item.ingredient_name === current);
  const currentOption = hasCurrent ? "" : `<option value="${escapeHtml(current)}" selected>${escapeHtml(current)} (not in master list)</option>`;
  return `
    <option value="" ${current ? "" : "selected"}></option>
    ${currentOption}
    ${state.ingredientsMaster.map((item) => {
      const conversion = Number(item.grams_conversion || item.default_grams_conversion || 0);
      const details = [
        item.ingredient_type,
        item.unit_of_measure,
        conversion > 0 ? `${qty(conversion)}g` : ""
      ].filter(Boolean).join(" - ");
      const selected = item.ingredient_name === current ? " selected" : "";
      return `<option value="${escapeHtml(item.ingredient_name)}"${selected}>${escapeHtml(details ? `${item.ingredient_name} (${details})` : item.ingredient_name)}</option>`;
    }).join("")}
  `;
}

function typeOptions(value = "") {
  return ["", "SB", "Hijnx", "Hijnx/Topicals", "Topicals"].map((option) => (
    `<option value="${option}" ${option === value ? "selected" : ""}>${option}</option>`
  )).join("");
}

function applyMasterIngredientDefaults(ingredient, master) {
  if (!ingredient || !master) return;
  if (master.ingredient_type) ingredient.ingredient_type = master.ingredient_type;
  const recipeUnit = master.default_unit && !/\d|pail|bag|box|bottle|jug|bucket|package|gallon|pouch|ct/i.test(master.default_unit)
    ? master.default_unit
    : "grams";
  if (recipeUnit && (!ingredient.unit || ingredient.unit === "grams")) {
    ingredient.unit = recipeUnit;
  }
}

function statusBadge(recipe) {
  if (recipe.status === "Published" && recipe.has_unpublished_changes) return '<span class="badge Unpublished">Unpublished Changes</span>';
  return `<span class="badge ${recipe.status}">${recipe.status}</span>`;
}

function recipeCards(recipes) {
  if (!recipes.length) return "<p>No recipes found.</p>";
  return `<div class="cards">${recipes.map((recipe) => `
    <article class="recipe-card">
      <div class="card-header">
        <h3>${recipe.name}</h3>
        ${statusBadge(recipe)}
      </div>
      <p>${recipe.product_type || "No product type"} ${recipe.flavor ? `• ${recipe.flavor}` : ""}</p>
      <p>Version ${recipe.current_version || "unpublished"} • Batch ${batchInputLabel(recipe)}</p>
      ${recipe.expected_production_date ? `<p>Production ${recipe.expected_production_date}</p>` : ""}
      <div class="toolbar">
        <button data-open="${recipe.id}">Open</button>
        <button data-duplicate="${recipe.id}">Duplicate</button>
        <button data-duplicate-new="${recipe.id}">Duplicate and Start New Recipe</button>
      </div>
    </article>
  `).join("")}</div>`;
}

async function renderDashboard(filter = "All") {
  state.view = filter === "Draft" ? "drafts" : "dashboard";
  setPage(filter === "Draft" ? "Draft Recipes" : "Dashboard", "Search and manage recipe drafts, published formulas, and archived records.");
  await loadRecipes(filter === "All" ? {} : { status: filter });
  content.innerHTML = `
    <section class="section">
      <div class="toolbar">
        <div class="grid">
          <label>Search
            <input id="searchInput" placeholder="Name, product type, flavor, version, or date">
          </label>
          <label>Status
            <select id="statusFilter">
              ${["All", "Draft", "Published", "Archived"].map((item) => `<option ${item === filter ? "selected" : ""}>${item}</option>`).join("")}
            </select>
          </label>
        </div>
      </div>
      <div id="recipeList">${recipeCards(state.recipes)}</div>
    </section>
  `;
  content.querySelector("#searchInput").addEventListener("input", async (event) => {
    await loadRecipes({ q: event.target.value, status: content.querySelector("#statusFilter").value });
    content.querySelector("#recipeList").innerHTML = recipeCards(state.recipes);
    bindRecipeListButtons();
  });
  content.querySelector("#statusFilter").addEventListener("change", (event) => renderDashboard(event.target.value));
  bindRecipeListButtons();
}

function bindRecipeListButtons() {
  content.querySelectorAll("[data-open]").forEach((button) => button.addEventListener("click", () => renderEditor(button.dataset.open)));
  content.querySelectorAll("[data-duplicate]").forEach((button) => button.addEventListener("click", async () => {
    const copy = await api(`/api/recipes/${button.dataset.duplicate}/duplicate`, { method: "POST", body: {} });
    showToast("Recipe duplicated.");
    renderEditor(copy.id);
  }));
  content.querySelectorAll("[data-duplicate-new]").forEach((button) => button.addEventListener("click", async () => {
    const copy = await api(`/api/recipes/${button.dataset.duplicateNew}/duplicate-new`, { method: "POST", body: {} });
    showToast("Started a new recipe from the duplicate.");
    renderEditor(copy.id);
  }));
}

function blankRecipe() {
  return {
    name: "Untitled Recipe",
    product_type: "",
    flavor: "",
    status: "Draft",
    batch_size: 0,
    batch_size_mode: "grams",
    batch_unit: "grams",
    unit_weight: 0,
    unit_weight_unit: "grams",
    target_mg_per_unit: 0,
    potency_percent: 0,
    expected_production_date: "",
    copy_lock_formula: false,
    notes: [],
    ingredients: [],
    steps: []
  };
}

async function renderEditor(id, recipe = null, mode = null) {
  state.view = "editor";
  await loadIngredientsMaster();
  state.currentRecipe = recipe || (id ? await api(`/api/recipes/${id}`) : blankRecipe());
  state.editorMode = mode || (state.currentRecipe.status === "Published" ? "published-view" : "draft");
  state.currentRecipe.calculations = state.currentRecipe.calculations || calculateClientRecipe(state.currentRecipe);
  const r = state.currentRecipe;
  const publishedView = state.editorMode === "published-view";
  const publishedEdit = state.editorMode === "published-edit";
  const formulaLocked = publishedEdit || Boolean(r.copy_lock_formula);
  setPage(r.name, publishedView ? "Published recipe card is locked. Select Edit to change allowed production fields." : "Edit recipe fields and calculated batch quantities.");
  content.innerHTML = `
    <section class="section">
      <div class="section-header">
        <div>${statusBadge(r)}</div>
        <div class="toolbar">
          ${publishedView ? '<button id="editPublished" class="primary">Edit</button><button id="deleteRecipe" class="danger">Delete</button>' : '<button id="saveRecipe" class="primary">Save Draft</button>'}
          ${r.id ? '<button id="duplicateRecipe">Duplicate Recipe</button><button id="duplicateNewRecipe">Duplicate and Start New Recipe</button>' : ""}
          ${r.id && !publishedView ? '<button id="publishRecipe">Publish New Version</button><button id="archiveRecipe" class="danger">Archive Recipe</button>' : ""}
        </div>
      </div>
      <div class="grid">
        ${field("name", "Recipe name", r.name, "", "text", publishedView || publishedEdit)}
        ${field("product_type", "Product type", r.product_type, "", "text", publishedView || publishedEdit)}
        ${field("flavor", "Flavor", r.flavor, "", "text", publishedView || publishedEdit)}
        ${field("expected_production_date", "Expected production date", r.expected_production_date, "Required before publishing. Published cards appear on this calendar date.", "date", publishedView || publishedEdit)}
        ${selectField("batch_size_mode", "Batch size means", r.batch_size_mode || "grams", [["grams", "Total batch size in grams"], ["units", "Units to make"]], "Choose whether batch size is a total gram batch or a number of finished units.", publishedView || publishedEdit)}
        ${field("batch_size", r.batch_size_mode === "units" ? "Units to make" : "Total batch size", r.batch_size, r.batch_size_mode === "units" ? "The app multiplies this by weight per unit to calculate total grams." : "Total recipe batch size in grams.", "number", publishedView)}
        ${field("unit_weight", "Weight per unit", r.unit_weight, r.batch_size_mode === "units" ? "Required to convert units to total batch grams." : "Reference value only for estimating yield from total grams.", "number", publishedView)}
        ${field("unit_weight_unit", "Weight unit", r.unit_weight_unit, "", "text", publishedView || publishedEdit)}
        ${field("target_mg_per_unit", "Target active mg per unit", r.target_mg_per_unit, "Desired active dose in each stick, gummy, or piece.", "number", publishedView)}
        ${field("potency_percent", "Active concentration / potency %", r.potency_percent, "Enter 81.2 for 81.2%, or 0.812 if copied from a spreadsheet.", "number", publishedView)}
      </div>
      ${r.copy_lock_formula ? '<div class="warning">This is a locked formula copy. Formula quantity, formula percent, and batch quantity are locked and will publish with the copied version number.</div>' : ""}
    </section>
    ${renderMetrics(r)}
    ${renderActiveAdditiveTool(r, publishedView || publishedEdit || r.copy_lock_formula)}
    <section class="section">
      <div class="section-header">
        <h2>Ingredients</h2>
        ${publishedView || publishedEdit || r.copy_lock_formula ? "" : '<button id="addIngredient">Add Ingredient</button>'}
      </div>
      <div class="table-wrap">
        <table class="ingredient-table">
          <thead>
            <tr>
              <th>Type</th><th>Name</th><th>Formula qty</th><th>Formula %</th><th>Unit</th><th>Vendor</th><th>Notes</th><th class="batch-heading">Batch qty to use</th><th></th>
            </tr>
          </thead>
          <tbody id="ingredientRows"></tbody>
        </table>
      </div>
    </section>
    ${ingredientOptionsMarkup()}
    <section class="section">
      <div class="section-header">
        <h2>SOP Instructions</h2>
        <button id="addStep">Add Step</button>
      </div>
      <div id="stepRows"></div>
    </section>
    <section class="section">
      <h2>Internal Draft Notes</h2>
      <textarea id="notesField">${(r.notes || []).join("\n")}</textarea>
    </section>
    <section class="section no-print">
      <div class="toolbar">
        ${publishedView ? "" : '<button id="recalculate">Recalculate</button>'}
        ${r.current_version ? '<button id="previewCard">Preview Final Card</button>' : ""}
      </div>
    </section>
  `;
  renderIngredientRows();
  renderStepRows();
  bindEditor();
}

function field(name, label, value, help = "", type = "text", locked = false) {
  return `<label>${label}${help ? `<span class="helper">${help}</span>` : ""}<input name="${name}" type="${type}" step="any" value="${escapeHtml(value ?? "")}" ${locked ? "readonly" : ""}></label>`;
}

function selectField(name, label, value, options, help = "", locked = false) {
  return `<label>${label}${help ? `<span class="helper">${help}</span>` : ""}<select name="${name}" ${locked ? "disabled" : ""}>${options.map(([optionValue, text]) => `<option value="${optionValue}" ${optionValue === value ? "selected" : ""}>${text}</option>`).join("")}</select></label>`;
}

function renderMetrics(recipe) {
  const c = recipe.calculations || {};
  return `
    <section class="section" id="calcSummary">
      <div class="grid">
        <div class="metric"><strong>Formula total</strong><p>${qty(c.formula_total)} base units</p></div>
        <div class="metric"><strong>Percent total</strong><p>${pct(c.percent_total)}</p></div>
        <div class="metric"><strong>Total batch size</strong><p>${qty(c.total_batch_grams)} grams</p></div>
        <div class="metric"><strong>Batch total</strong><p>${qty(c.batch_total)} grams</p></div>
        <div class="metric"><strong>Estimated yield</strong><p>${qty(c.estimated_yield)} units</p></div>
      </div>
      <div class="helper">Active/additive math: ${qty(c.active_mass_per_unit_mg)} mg physical additive per unit (${qty(c.active_mass_per_unit_grams)} g) × ${qty(c.estimated_yield)} units = ${qty(c.active_ingredient_grams)} grams total additive.</div>
      ${(c.warnings || []).map((warning) => `<div class="warning">${warning}</div>`).join("")}
    </section>
  `;
}

function findActiveIngredientIndex(recipe) {
  const ingredients = recipe.ingredients || [];
  const index = ingredients.findIndex((item) => {
    const name = `${item.ingredient_name || ""}`.toLowerCase();
    return name.includes("concentrate") || name.includes("isolate") || name.includes("resin") || name.includes("additive") || name.includes("active");
  });
  return index >= 0 ? index : 0;
}

function renderActiveAdditiveTool(recipe, locked = false) {
  const c = recipe.calculations || {};
  const ingredients = recipe.ingredients || [];
  const selectedIndex = Math.min(findActiveIngredientIndex(recipe), Math.max(ingredients.length - 1, 0));
  const selectedName = ingredients[selectedIndex]?.ingredient_name || "";
  return `
    <section class="section" id="activeAdditiveTool">
      <div class="section-header">
        <div>
          <h2>Active / Additive Calculator</h2>
          <p class="helper">Uses target mg per unit and potency % to calculate physical additive mass, then applies that amount to a recipe ingredient.</p>
        </div>
      </div>
      <div class="grid">
        <div class="metric"><strong>Physical additive per unit</strong><p>${qty(c.active_mass_per_unit_mg)} mg</p></div>
        <div class="metric"><strong>Physical additive per unit</strong><p>${qty(c.active_mass_per_unit_grams)} grams</p></div>
        <div class="metric"><strong>Estimated units</strong><p>${qty(c.estimated_yield)}</p></div>
        <div class="metric"><strong>Total additive needed</strong><p>${qty(c.active_ingredient_grams)} grams</p></div>
      </div>
      <div class="grid active-tool-controls">
        <label>Match calculated amount to recipe ingredient
          <select id="activeIngredientSelect" ${locked || !ingredients.length ? "disabled" : ""}>
            ${ingredients.length ? ingredients.map((item, index) => `<option value="${index}" ${index === selectedIndex ? "selected" : ""}>${escapeHtml(item.ingredient_name || `Ingredient ${index + 1}`)}</option>`).join("") : '<option value="">No ingredients yet</option>'}
          </select>
        </label>
        <label>Add additive ingredient
          <select id="activeIngredientName" ${locked ? "disabled" : ""}>${ingredientNameOptions(selectedName)}</select>
        </label>
      </div>
      <div class="toolbar active-tool-actions">
        <button id="applyActiveQty" class="primary" ${locked || !ingredients.length ? "disabled" : ""}>Apply Calculated Qty</button>
        <button id="addActiveIngredient" ${locked ? "disabled" : ""}>Add Additive</button>
        <button id="deleteActiveIngredient" class="danger" ${locked || !ingredients.length ? "disabled" : ""}>Delete Selected Additive</button>
      </div>
      ${locked ? '<div class="helper">Formula ingredient quantities are locked for this recipe mode. Use Duplicate and Start New Recipe to create an editable formula.</div>' : ""}
    </section>
  `;
}

function refreshCalculationDisplay(updateRows = false) {
  if (!state.currentRecipe) return;
  state.currentRecipe.calculations = calculateClientRecipe(state.currentRecipe);
  state.currentRecipe.ingredients = state.currentRecipe.calculations.ingredients;
  const summary = content.querySelector("#calcSummary");
  if (summary) summary.outerHTML = renderMetrics(state.currentRecipe);
  const activeTool = content.querySelector("#activeAdditiveTool");
  if (activeTool) {
    const locked = state.editorMode === "published-view" || state.editorMode === "published-edit" || Boolean(state.currentRecipe.copy_lock_formula);
    activeTool.outerHTML = renderActiveAdditiveTool(state.currentRecipe, locked);
    bindActiveAdditiveTool();
  }

  if (!updateRows) return;
  content.querySelectorAll("#ingredientRows tr").forEach((row) => {
    const index = Number(row.dataset.index);
    const item = state.currentRecipe.ingredients[index];
    if (!item) return;
    const percent = row.querySelector('[data-field="formula_percent"]');
    const batch = row.querySelector('[data-field="batch_qty"]');
    if (percent && document.activeElement !== percent) percent.value = item.formula_percent;
    if (batch) batch.value = item.batch_qty;
  });
}

function formulaBasisTotal(excludeIndex = -1) {
  const total = (state.currentRecipe.ingredients || []).reduce((sum, item, index) => (
    index === excludeIndex ? sum : sum + numeric(item.formula_qty)
  ), 0);
  return total > 0 ? total : numeric(state.currentRecipe.calculations?.total_batch_grams || state.currentRecipe.batch_size);
}

function applyBatchQuantityToIngredient(index, batchQty) {
  const ingredient = state.currentRecipe.ingredients[index];
  if (!ingredient) return;
  const totalBatchGrams = numeric(state.currentRecipe.calculations?.total_batch_grams || state.currentRecipe.batch_size);
  const percent = totalBatchGrams > 0 ? batchQty / totalBatchGrams : 0;
  const otherQtyTotal = formulaBasisTotal(index);
  const formulaQty = percent >= 1
    ? otherQtyTotal
    : otherQtyTotal > 0
      ? (percent * otherQtyTotal) / Math.max(1 - percent, 0.000001)
      : batchQty;
  ingredient.formula_percent = percent;
  ingredient.formula_qty = formulaQty;
  ingredient.batch_qty = batchQty;
  ingredient.unit = ingredient.unit || "grams";
  ingredient.notes = ingredient.notes || "Active/additive calculated from target dose and potency.";
}

function bindActiveAdditiveTool() {
  const select = content.querySelector("#activeIngredientSelect");
  const nameInput = content.querySelector("#activeIngredientName");
  select?.addEventListener("change", () => {
    const item = state.currentRecipe.ingredients[Number(select.value)];
    if (nameInput && item) nameInput.value = item.ingredient_name || "";
  });
  content.querySelector("#applyActiveQty")?.addEventListener("click", () => {
    const index = Number(select?.value);
    const amount = numeric(state.currentRecipe.calculations?.active_ingredient_grams);
    if (!Number.isFinite(index) || !state.currentRecipe.ingredients[index]) {
      showToast("Select an ingredient before applying the additive amount.");
      return;
    }
    applyBatchQuantityToIngredient(index, amount);
    renderIngredientRows();
    refreshCalculationDisplay(true);
    showToast("Calculated additive quantity applied.");
  });
  content.querySelector("#addActiveIngredient")?.addEventListener("click", () => {
    const name = (nameInput?.value || "").trim();
    if (!name) {
      showToast("Enter an additive ingredient name first.");
      return;
    }
    const ingredient = {
      ingredient_name: name,
      ingredient_type: masterIngredientByName(name)?.ingredient_type || "",
      unit: "grams",
      formula_qty: 0,
      formula_percent: 0,
      batch_qty: 0,
      notes: "Active/additive calculated from target dose and potency."
    };
    applyMasterIngredientDefaults(ingredient, masterIngredientByName(name));
    const newIndex = state.currentRecipe.ingredients.push(ingredient) - 1;
    renderIngredientRows();
    refreshCalculationDisplay(true);
    const nextSelect = content.querySelector("#activeIngredientSelect");
    if (nextSelect) nextSelect.value = String(newIndex);
    showToast("Additive ingredient added.");
  });
  content.querySelector("#deleteActiveIngredient")?.addEventListener("click", () => {
    const index = Number(select?.value);
    if (!Number.isFinite(index) || !state.currentRecipe.ingredients[index]) return;
    state.currentRecipe.ingredients.splice(index, 1);
    renderIngredientRows();
    refreshCalculationDisplay(true);
    showToast("Selected additive removed.");
  });
}

function renderIngredientRows() {
  const tbody = content.querySelector("#ingredientRows");
  tbody.innerHTML = "";
  const readOnlyRecipe = state.editorMode === "published-view";
  const formulaLocked = state.editorMode === "published-edit" || Boolean(state.currentRecipe.copy_lock_formula);
  (state.currentRecipe.ingredients || []).forEach((item, index) => {
    const row = document.querySelector("#recipeRowTemplate").content.firstElementChild.cloneNode(true);
    row.dataset.index = index;
    if (item.match_status === "review") row.classList.add("match-review");
    row.querySelectorAll("input, select").forEach((input) => {
      if (input.dataset.field === "ingredient_name") {
        input.innerHTML = ingredientNameOptions(item.ingredient_name);
      }
      input.value = item[input.dataset.field] ?? "";
      if (input.dataset.field === "ingredient_name") {
        input.title = item.original_ingredient_name && item.original_ingredient_name !== item.ingredient_name
          ? `Imported as "${item.original_ingredient_name}". Review this best guess.`
          : "";
        if (item.match_status === "review") {
          input.insertAdjacentHTML("afterend", `<div class="match-alert">Review match. Imported as "${escapeHtml(item.original_ingredient_name || "")}".</div>`);
        }
      }
      if (readOnlyRecipe || ["batch_qty"].includes(input.dataset.field) || (formulaLocked && ["formula_qty", "formula_percent"].includes(input.dataset.field))) {
        if (input.tagName === "SELECT") input.disabled = true;
        else input.readOnly = true;
      }
      if (readOnlyRecipe && input.dataset.field !== "batch_qty") {
        if (input.tagName === "SELECT") input.disabled = true;
        else input.readOnly = true;
      }
      const updateIngredientField = () => {
        state.currentRecipe.ingredients[index][input.dataset.field] = input.type === "number" ? Number(input.value) : input.value;
        if (input.dataset.field === "ingredient_name") {
          const master = masterIngredientByName(input.value);
          if (master) {
            applyMasterIngredientDefaults(state.currentRecipe.ingredients[index], master);
            const typeSelect = row.querySelector('[data-field="ingredient_type"]');
            const unitInput = row.querySelector('[data-field="unit"]');
            if (typeSelect) typeSelect.value = state.currentRecipe.ingredients[index].ingredient_type || "";
            if (unitInput) unitInput.value = state.currentRecipe.ingredients[index].unit || "";
          }
          state.currentRecipe.ingredients[index].match_status = "matched";
          state.currentRecipe.ingredients[index].match_confidence = 1;
        }
        mirrorFormulaField(index, input.dataset.field);
        refreshCalculationDisplay(["formula_qty", "formula_percent"].includes(input.dataset.field));
      };
      input.addEventListener("input", updateIngredientField);
      input.addEventListener("change", updateIngredientField);
    });
    const removeButton = row.querySelector("[data-action='removeIngredient']");
    if (readOnlyRecipe || formulaLocked) {
      removeButton.remove();
    } else {
      removeButton.addEventListener("click", () => {
        state.currentRecipe.ingredients.splice(index, 1);
        renderIngredientRows();
        refreshCalculationDisplay(true);
      });
    }
    tbody.appendChild(row);
  });
}

function mirrorFormulaField(index, changedField) {
  if (!["formula_qty", "formula_percent"].includes(changedField)) return;
  const ingredient = state.currentRecipe.ingredients[index];
  if (!ingredient) return;
  const otherQtyTotal = state.currentRecipe.ingredients.reduce((sum, item, itemIndex) => (
    itemIndex === index ? sum : sum + numeric(item.formula_qty)
  ), 0);
  const currentTotal = otherQtyTotal + numeric(ingredient.formula_qty);

  if (changedField === "formula_qty") {
    ingredient.formula_percent = currentTotal > 0 ? numeric(ingredient.formula_qty) / currentTotal : 0;
    return;
  }

  const percent = normalizePercentInput(ingredient.formula_percent);
  ingredient.formula_percent = percent;
  if (percent >= 1) {
    ingredient.formula_qty = otherQtyTotal > 0 ? otherQtyTotal : numeric(state.currentRecipe.batch_size);
  } else if (otherQtyTotal > 0) {
    ingredient.formula_qty = (percent * otherQtyTotal) / (1 - percent);
  } else {
    ingredient.formula_qty = percent * numeric(state.currentRecipe.batch_size);
  }
}

function renderStepRows() {
  const wrapper = content.querySelector("#stepRows");
  wrapper.innerHTML = (state.currentRecipe.steps || []).map((step, index) => `
    <div class="toolbar step-row" data-index="${index}">
      <textarea>${step.instruction_text || ""}</textarea>
      <button data-up="${index}">↑</button>
      <button data-down="${index}">↓</button>
      <button data-remove-step="${index}" class="danger">Remove</button>
    </div>
  `).join("");
  wrapper.querySelectorAll("textarea").forEach((textarea) => textarea.addEventListener("input", () => {
    const index = Number(textarea.closest(".step-row").dataset.index);
    state.currentRecipe.steps[index].instruction_text = textarea.value;
  }));
  wrapper.querySelectorAll("[data-remove-step]").forEach((button) => button.addEventListener("click", () => {
    state.currentRecipe.steps.splice(Number(button.dataset.removeStep), 1);
    renderStepRows();
  }));
  wrapper.querySelectorAll("[data-up]").forEach((button) => button.addEventListener("click", () => moveStep(Number(button.dataset.up), -1)));
  wrapper.querySelectorAll("[data-down]").forEach((button) => button.addEventListener("click", () => moveStep(Number(button.dataset.down), 1)));
}

function moveStep(index, delta) {
  const next = index + delta;
  if (next < 0 || next >= state.currentRecipe.steps.length) return;
  const [step] = state.currentRecipe.steps.splice(index, 1);
  state.currentRecipe.steps.splice(next, 0, step);
  renderStepRows();
}

function collectRecipe() {
  content.querySelectorAll("[name]").forEach((input) => {
    state.currentRecipe[input.name] = input.type === "number" ? Number(input.value) : input.value;
  });
  state.currentRecipe.batch_unit = "grams";
  state.currentRecipe.notes = content.querySelector("#notesField").value.split("\n").map((line) => line.trim()).filter(Boolean);
  state.currentRecipe.ingredients = (state.currentRecipe.ingredients || []).map((item, index) => ({ ...item, sort_order: index + 1 }));
  state.currentRecipe.steps = (state.currentRecipe.steps || []).map((step, index) => ({ ...step, sort_order: index + 1 }));
  state.currentRecipe.calculations = calculateClientRecipe(state.currentRecipe);
  state.currentRecipe.ingredients = state.currentRecipe.calculations.ingredients;
  return state.currentRecipe;
}

function bindEditor() {
  bindActiveAdditiveTool();

  content.querySelectorAll("[name]").forEach((input) => {
    const updateHeader = () => {
      state.currentRecipe[input.name] = input.type === "number" ? Number(input.value) : input.value;
      state.currentRecipe.batch_unit = "grams";
      refreshCalculationDisplay(true);
    };
    input.addEventListener("input", updateHeader);
    input.addEventListener("change", updateHeader);
  });

  content.querySelector("#editPublished")?.addEventListener("click", () => {
    renderEditor(state.currentRecipe.id, state.currentRecipe, "published-edit");
  });
  content.querySelector("#deleteRecipe")?.addEventListener("click", async () => {
    if (!window.confirm("Delete this recipe and its published versions?")) return;
    await api(`/api/recipes/${state.currentRecipe.id}`, { method: "DELETE" });
    showToast("Recipe deleted.");
    renderDashboard();
  });
  content.querySelector("#addIngredient")?.addEventListener("click", () => {
    state.currentRecipe.ingredients.push({ ingredient_type: "", ingredient_name: "", unit: "grams", formula_qty: 0, formula_percent: 0, batch_qty: 0 });
    renderIngredientRows();
    refreshCalculationDisplay(true);
  });
  content.querySelector("#addStep").addEventListener("click", () => {
    state.currentRecipe.steps.push({ instruction_text: "" });
    renderStepRows();
  });
  content.querySelector("#saveRecipe")?.addEventListener("click", async () => {
    const payload = collectRecipe();
    const saved = payload.id
      ? await api(`/api/recipes/${payload.id}`, { method: "PUT", body: payload })
      : await api("/api/recipes", { method: "POST", body: payload });
    showToast("Draft saved.");
    renderEditor(saved.id);
  });
  content.querySelector("#recalculate")?.addEventListener("click", async () => {
    const payload = collectRecipe();
    if (!payload.id) {
      refreshCalculationDisplay(true);
      showToast("Recipe recalculated.");
      return;
    }
    const saved = await api(`/api/recipes/${payload.id}`, { method: "PUT", body: payload });
    showToast("Recipe recalculated.");
    renderEditor(saved.id);
  });
  content.querySelector("#duplicateRecipe")?.addEventListener("click", async () => {
    const copy = await api(`/api/recipes/${state.currentRecipe.id}/duplicate`, { method: "POST", body: {} });
    showToast("Recipe duplicated.");
    renderEditor(copy.id);
  });
  content.querySelector("#duplicateNewRecipe")?.addEventListener("click", async () => {
    const copy = await api(`/api/recipes/${state.currentRecipe.id}/duplicate-new`, { method: "POST", body: {} });
    showToast("Started a new recipe from duplicate.");
    renderEditor(copy.id);
  });
  content.querySelector("#publishRecipe")?.addEventListener("click", async () => {
    const payload = collectRecipe();
    if (!payload.expected_production_date) {
      showToast("Expected production date is required before publishing.");
      return;
    }
    const saved = await api(`/api/recipes/${payload.id}`, { method: "PUT", body: payload });
    const publishedBy = window.prompt("Published by", "Production") || "Production";
    const published = await api(`/api/recipes/${saved.id}/publish`, { method: "POST", body: { published_by: publishedBy } });
    showToast(`Published ${published.current_version}.`);
    renderEditor(published.id);
  });
  content.querySelector("#archiveRecipe")?.addEventListener("click", async () => {
    await api(`/api/recipes/${state.currentRecipe.id}/archive`, { method: "PATCH", body: {} });
    showToast("Recipe archived.");
    renderDashboard("Archived");
  });
  content.querySelector("#previewCard")?.addEventListener("click", () => renderCards(state.currentRecipe.id));
}

async function renderImport() {
  state.view = "import";
  await loadIngredientsMaster();
  setPage("Import Spreadsheet", "Upload XLSX files, review normalized recipe variants, correct fields, then create draft recipes.");
  content.innerHTML = `
    <section class="section">
      <form id="uploadForm" class="toolbar">
        <input type="file" name="workbook" accept=".xlsx" required>
        <button class="primary">Upload and Preview</button>
      </form>
    </section>
    ${ingredientOptionsMarkup()}
    <div id="previewArea"></div>
  `;
  content.querySelector("#uploadForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    state.importPreview = await api("/api/import/xlsx", { method: "POST", body: form });
    state.selectedImportIndexes = new Set(state.importPreview.recipes.map((_, index) => index));
    renderImportPreview();
  });
}

function renderImportPreview() {
  const preview = state.importPreview;
  const area = content.querySelector("#previewArea");
  area.innerHTML = `
    <section class="section">
      <div class="section-header">
        <div>
          <h2>${preview.original_filename}</h2>
          <p>Detected format: ${preview.detected_format}. Sheets: ${preview.sheet_names.join(", ")}</p>
        </div>
        <button id="confirmImport" class="primary">Create Draft Recipes</button>
      </div>
      ${preview.recipes.map((recipe, index) => `
        <article class="recipe-card import-card" data-index="${index}">
          <label><input type="checkbox" data-select-import="${index}" ${state.selectedImportIndexes.has(index) ? "checked" : ""}> Import this variant</label>
          <div class="grid">
            ${importField(index, "name", "Recipe name", recipe.name)}
            ${importField(index, "product_type", "Product type", recipe.product_type)}
            ${importField(index, "flavor", "Flavor", recipe.flavor)}
            ${importField(index, "expected_production_date", "Expected production date", recipe.expected_production_date || "", "date")}
            ${importSelectField(index, "batch_size_mode", "Batch size means", recipe.batch_size_mode || "grams", [["grams", "Total batch size in grams"], ["units", "Units to make"]])}
            ${importField(index, "batch_size", "Batch size", recipe.batch_size, "number")}
            ${importField(index, "unit_weight", "Weight per unit", recipe.unit_weight, "number")}
            ${importField(index, "target_mg_per_unit", "Target mg/unit", recipe.target_mg_per_unit, "number")}
            ${importField(index, "potency_percent", "Potency %", recipe.potency_percent, "number")}
          </div>
          <details>
            <summary>${recipe.ingredients.length} ingredients, ${recipe.steps.length} SOP steps</summary>
            <div class="table-wrap">
              <table>
                <thead><tr><th>Type</th><th>Name</th><th>Formula %</th><th>Batch qty</th><th>Unit</th><th>Vendor</th></tr></thead>
                <tbody>
                  ${recipe.ingredients.map((item, ingredientIndex) => `
                    <tr class="${item.match_status === "review" ? "match-review" : ""}">
                      <td><select data-import-ingredient="${index}" data-ingredient-index="${ingredientIndex}" data-ingredient-field="ingredient_type">${typeOptions(item.ingredient_type || "")}</select></td>
                      <td>
                        <select data-import-ingredient="${index}" data-ingredient-index="${ingredientIndex}" data-ingredient-field="ingredient_name">${ingredientNameOptions(item.ingredient_name || "")}</select>
                        ${item.match_status === "review" ? `<div class="match-alert">Review match. Imported as "${escapeHtml(item.original_ingredient_name || "")}".</div>` : ""}
                      </td>
                      <td><input type="number" step="any" data-import-ingredient="${index}" data-ingredient-index="${ingredientIndex}" data-ingredient-field="formula_percent" value="${item.formula_percent || 0}"></td>
                      <td><input type="number" step="any" data-import-ingredient="${index}" data-ingredient-index="${ingredientIndex}" data-ingredient-field="batch_qty" value="${item.batch_qty || 0}"></td>
                      <td><input data-import-ingredient="${index}" data-ingredient-index="${ingredientIndex}" data-ingredient-field="unit" value="${escapeHtml(item.unit || "")}"></td>
                      <td><input data-import-ingredient="${index}" data-ingredient-index="${ingredientIndex}" data-ingredient-field="vendor" value="${escapeHtml(item.vendor || "")}"></td>
                    </tr>
                  `).join("")}
                </tbody>
              </table>
            </div>
            <h3>SOP Steps</h3>
            ${(recipe.steps || []).map((step, stepIndex) => `
              <textarea data-import-step="${index}" data-step-index="${stepIndex}">${step.instruction_text || ""}</textarea>
            `).join("")}
            <textarea data-import-notes="${index}">${(recipe.notes || []).join("\n")}</textarea>
          </details>
        </article>
      `).join("")}
    </section>
  `;
  area.querySelectorAll("[data-select-import]").forEach((input) => input.addEventListener("change", () => {
    const index = Number(input.dataset.selectImport);
    if (input.checked) state.selectedImportIndexes.add(index);
    else state.selectedImportIndexes.delete(index);
  }));
  area.querySelectorAll("[data-import-field]").forEach((input) => input.addEventListener("input", () => {
    const recipe = preview.recipes[Number(input.dataset.index)];
    recipe[input.dataset.importField] = input.type === "number" ? Number(input.value) : input.value;
  }));
  area.querySelectorAll("[data-import-select]").forEach((select) => select.addEventListener("change", () => {
    const recipe = preview.recipes[Number(select.dataset.index)];
    recipe[select.dataset.importSelect] = select.value;
  }));
  area.querySelectorAll("[data-import-notes]").forEach((textarea) => textarea.addEventListener("input", () => {
    preview.recipes[Number(textarea.dataset.importNotes)].notes = textarea.value.split("\n").filter(Boolean);
  }));
  area.querySelectorAll("[data-import-ingredient]").forEach((input) => {
    const updateImportIngredient = () => {
    const recipe = preview.recipes[Number(input.dataset.importIngredient)];
    const ingredient = recipe.ingredients[Number(input.dataset.ingredientIndex)];
    ingredient[input.dataset.ingredientField] = input.type === "number" ? Number(input.value) : input.value;
    if (input.dataset.ingredientField === "ingredient_name") {
      const master = masterIngredientByName(input.value);
      if (master) {
        applyMasterIngredientDefaults(ingredient, master);
        const typeSelect = input.closest("tr")?.querySelector('[data-ingredient-field="ingredient_type"]');
        const unitInput = input.closest("tr")?.querySelector('[data-ingredient-field="unit"]');
        if (typeSelect) typeSelect.value = ingredient.ingredient_type || "";
        if (unitInput) unitInput.value = ingredient.unit || "";
      }
      ingredient.match_status = "matched";
      ingredient.match_confidence = 1;
      input.closest("tr")?.classList.remove("match-review");
      input.parentElement.querySelector(".match-alert")?.remove();
    }
    };
    input.addEventListener("input", updateImportIngredient);
    input.addEventListener("change", updateImportIngredient);
  });
  area.querySelectorAll("[data-import-step]").forEach((textarea) => textarea.addEventListener("input", () => {
    const recipe = preview.recipes[Number(textarea.dataset.importStep)];
    recipe.steps[Number(textarea.dataset.stepIndex)].instruction_text = textarea.value;
  }));
  area.querySelector("#confirmImport").addEventListener("click", async () => {
    const recipes = preview.recipes.filter((_, index) => state.selectedImportIndexes.has(index));
    const result = await api("/api/import/confirm", { method: "POST", body: { import_job_id: preview.import_job_id, recipes } });
    showToast(`${result.recipes.length} draft recipe(s) created.`);
    renderEditor(result.recipes[0].id);
  });
}

function importField(index, name, label, value, type = "text") {
  return `<label>${label}<input data-index="${index}" data-import-field="${name}" type="${type}" step="any" value="${escapeHtml(value ?? "")}"></label>`;
}

function importSelectField(index, name, label, value, options) {
  return `<label>${label}<select data-index="${index}" data-import-select="${name}">${options.map(([optionValue, text]) => `<option value="${optionValue}" ${optionValue === value ? "selected" : ""}>${text}</option>`).join("")}</select></label>`;
}

async function renderCards(recipeId = null) {
  state.view = "cards";
  setPage("Published Calendar", "Select a production date to open the published recipe focus card.");
  if (recipeId) {
    const versions = await api(`/api/recipes/${recipeId}/versions`);
    if (!versions.length) {
      content.innerHTML = '<section class="section"><p>No published versions yet.</p></section>';
      return;
    }
    return renderVersionCard(versions[0].id);
  }
  await loadRecipes({ status: "Published" });
  renderPublishedCalendar(monthKey(state.recipes[0]?.expected_production_date || isoToday()));
}

function renderPublishedCalendar(activeMonth) {
  const [year, month] = activeMonth.split("-").map(Number);
  const first = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const offset = first.getDay();
  const recipesByDate = new Map();
  state.recipes.forEach((recipe) => {
    const date = recipe.expected_production_date || recipe.updated_at?.slice(0, 10) || isoToday();
    if (monthKey(date) !== activeMonth) return;
    if (!recipesByDate.has(date)) recipesByDate.set(date, []);
    recipesByDate.get(date).push(recipe);
  });
  const prevMonth = month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, "0")}`;
  const nextMonth = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, "0")}`;
  const cells = [];
  for (let i = 0; i < offset; i += 1) cells.push('<div class="calendar-cell muted-cell"></div>');
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${activeMonth}-${String(day).padStart(2, "0")}`;
    const recipes = recipesByDate.get(date) || [];
    cells.push(`
      <div class="calendar-cell">
        <div class="calendar-day">${day}</div>
        ${recipes.map((recipe) => `
          <button class="calendar-recipe" data-card-recipe="${recipe.id}">
            <strong>${recipe.name}</strong>
            <span>${recipe.current_version || ""}</span>
          </button>
        `).join("")}
      </div>
    `);
  }
  content.innerHTML = `
    <section class="section">
      <div class="section-header">
        <button id="prevMonth">‹ ${monthLabel(prevMonth)}</button>
        <h2>${monthLabel(activeMonth)}</h2>
        <button id="nextMonth">${monthLabel(nextMonth)} ›</button>
      </div>
      <div class="calendar-weekdays">
        ${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => `<div>${day}</div>`).join("")}
      </div>
      <div class="calendar-grid">${cells.join("")}</div>
    </section>
  `;
  content.querySelector("#prevMonth").addEventListener("click", () => renderPublishedCalendar(prevMonth));
  content.querySelector("#nextMonth").addEventListener("click", () => renderPublishedCalendar(nextMonth));
  content.querySelectorAll("[data-card-recipe]").forEach((button) => {
    button.addEventListener("click", () => renderCards(button.dataset.cardRecipe));
  });
}

async function renderVersionCard(versionId) {
  const version = await api(`/api/versions/${versionId}`);
  const recipe = version.recipe;
  const calculations = version.calculations;
  content.innerHTML = `
    <div class="toolbar no-print"><button onclick="window.print()" class="primary">Print</button><button id="backCards">Back</button></div>
    <article class="card-page">
      <header class="section-header">
        <div>
          <h1>Company Recipe Card</h1>
          <p>${recipe.name}</p>
        </div>
        <div>
          <strong>${version.version_number}</strong>
          <p>${new Date(version.published_date).toLocaleString()}</p>
        </div>
      </header>
      <section class="grid">
        <div><strong>Product / Flavor</strong><p>${recipe.product_type || ""} ${recipe.flavor || ""}</p></div>
        <div><strong>Batch size input</strong><p>${batchInputLabel(recipe)}</p></div>
        <div><strong>Total batch grams</strong><p>${qty(calculations.total_batch_grams)} grams</p></div>
        <div><strong>Yield</strong><p>${qty(calculations.estimated_yield)} units</p></div>
        <div><strong>Production date</strong><p>${recipe.expected_production_date || ""}</p></div>
        <div><strong>Published by</strong><p>${version.published_by || ""}</p></div>
      </section>
      <h2>Ingredients</h2>
      <table>
        <thead><tr><th>Type</th><th>Ingredient</th><th>Formula Qty</th><th>Formula %</th><th>Unit</th><th>Batch Qty To Use</th></tr></thead>
        <tbody>${version.ingredients.map((item) => `<tr><td>${item.ingredient_type || ""}</td><td>${item.ingredient_name}</td><td>${qty(item.formula_qty)}</td><td>${pct(item.formula_percent)}</td><td>${item.unit || ""}</td><td class="batch-qty-display">${qty(item.batch_qty)}</td></tr>`).join("")}</tbody>
      </table>
      <h2>Calculation Summary</h2>
      <p>Formula total: ${qty(calculations.formula_total)} • Percent total: ${pct(calculations.percent_total)} • Batch total: ${qty(calculations.batch_total)}</p>
      <p>Active/additive: ${qty(calculations.active_mass_per_unit_mg)} mg physical additive per unit (${qty(calculations.active_mass_per_unit_grams)} g) × ${qty(calculations.estimated_yield)} units = ${qty(calculations.active_ingredient_grams)} grams total additive.</p>
      ${(calculations.warnings || []).map((warning) => `<div class="warning">${warning}</div>`).join("")}
      <h2>SOP / Process Instructions</h2>
      <ol>${version.steps.map((step) => `<li>${step.instruction_text}</li>`).join("")}</ol>
      <h2>Notes</h2>
      <p>${(recipe.notes || []).join("<br>")}</p>
      <div class="signature-grid">
        <div class="signature-line">Prepared by / Date</div>
        <div class="signature-line">Reviewed by / Date</div>
      </div>
    </article>
  `;
  content.querySelector("#backCards").addEventListener("click", () => renderCards());
}

async function renderIngredients() {
  state.view = "ingredients";
  setPage("Ingredients", "Master ingredient list populated from the ingredient designation spreadsheet and recipes.");
  const ingredients = await api("/api/ingredients");
  content.innerHTML = `
    <section class="section">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Type</th><th>Inventory unit of measure</th><th>Grams conversion</th><th>Recipe unit</th><th>Source</th><th>Notes</th></tr></thead>
          <tbody>${ingredients.map((item) => `<tr><td>${escapeHtml(item.ingredient_name)}</td><td>${escapeHtml(item.ingredient_type || "")}</td><td>${escapeHtml(item.unit_of_measure || "")}</td><td>${qty(item.grams_conversion || item.default_grams_conversion || 1)}</td><td>${escapeHtml(item.default_unit || "grams")}</td><td>${escapeHtml(item.source || "")}</td><td>${escapeHtml(item.notes || "")}</td></tr>`).join("")}</tbody>
        </table>
      </div>
    </section>
  `;
}

async function renderSettings() {
  state.view = "settings";
  setPage("Settings", "Production calculation limits and future deployment settings.");
  const settings = await api("/api/settings");
  content.innerHTML = `
    <section class="section">
      <label>Additive percent warning limit
        <span class="helper">Default is 4%. Ingredients named additive, concentrate, or active warn above this value.</span>
        <input id="additiveLimit" type="number" step="any" value="${settings.additive_percent_limit || 4}">
      </label>
      <div class="toolbar"><button id="saveSettings" class="primary">Save Settings</button></div>
    </section>
    <section class="section">
      <h2>Turso Deployment Notes</h2>
      <p>Use TURSO_DATABASE_URL and TURSO_DATABASE_TOKEN on Render. Local development writes to SQLite unless those variables are present.</p>
    </section>
  `;
  content.querySelector("#saveSettings").addEventListener("click", async () => {
    await api("/api/settings", { method: "PUT", body: { additive_percent_limit: content.querySelector("#additiveLimit").value } });
    showToast("Settings saved.");
  });
}

document.querySelectorAll(".nav").forEach((button) => button.addEventListener("click", () => {
  if (button.dataset.view === "dashboard") renderDashboard();
  if (button.dataset.view === "import") renderImport();
  if (button.dataset.view === "drafts") renderDashboard("Draft");
  if (button.dataset.view === "cards") renderCards();
  if (button.dataset.view === "ingredients") renderIngredients();
  if (button.dataset.view === "settings") renderSettings();
}));

document.querySelector("#newRecipeBtn").addEventListener("click", () => renderEditor(null));
document.querySelector("#importShortcutBtn").addEventListener("click", () => renderImport());

renderDashboard().catch((err) => {
  content.innerHTML = `<section class="section"><div class="warning">${err.message}</div></section>`;
});
