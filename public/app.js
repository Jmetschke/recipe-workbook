const state = {
  view: "dashboard",
  recipes: [],
  ingredientsMaster: [],
  currentRecipe: null,
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
  return `<datalist id="ingredientOptions">${state.ingredientsMaster.map((item) => `<option value="${escapeHtml(item.ingredient_name)}"></option>`).join("")}</datalist>`;
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
      <p>Version ${recipe.current_version || "unpublished"} • Batch ${qty(recipe.batch_size)} ${recipe.batch_unit || ""}</p>
      <div class="toolbar">
        <button data-open="${recipe.id}">Open</button>
        <button data-duplicate="${recipe.id}">Duplicate</button>
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
}

function blankRecipe() {
  return {
    name: "Untitled Recipe",
    product_type: "",
    flavor: "",
    status: "Draft",
    batch_size: 0,
    batch_unit: "grams",
    unit_weight: 0,
    unit_weight_unit: "grams",
    target_mg_per_unit: 0,
    potency_percent: 0,
    notes: [],
    ingredients: [],
    steps: []
  };
}

async function renderEditor(id, recipe = null) {
  state.view = "editor";
  await loadIngredientsMaster();
  state.currentRecipe = recipe || (id ? await api(`/api/recipes/${id}`) : blankRecipe());
  const r = state.currentRecipe;
  setPage(r.name, "Edit draft fields, recalculate batch quantities, and publish locked version records.");
  content.innerHTML = `
    <section class="section">
      <div class="section-header">
        <div>${statusBadge(r)}</div>
        <div class="toolbar">
          <button id="saveRecipe" class="primary">Save Draft</button>
          ${r.id ? '<button id="duplicateRecipe">Duplicate Recipe</button><button id="publishRecipe">Publish New Version</button><button id="archiveRecipe" class="danger">Archive Recipe</button>' : ""}
        </div>
      </div>
      <div class="grid">
        ${field("name", "Recipe name", r.name)}
        ${field("product_type", "Product type", r.product_type)}
        ${field("flavor", "Flavor", r.flavor)}
        ${field("batch_size", "Batch size", r.batch_size, "Total production batch size used for calculated ingredient quantities.", "number")}
        ${field("batch_unit", "Unit type", r.batch_unit)}
        ${field("unit_weight", "Weight per unit", r.unit_weight, "Used to estimate yield and active ingredient requirements.", "number")}
        ${field("unit_weight_unit", "Weight unit", r.unit_weight_unit)}
        ${field("target_mg_per_unit", "Target active mg per unit", r.target_mg_per_unit, "Desired active dose in each stick, gummy, or piece.", "number")}
        ${field("potency_percent", "Active concentration / potency %", r.potency_percent, "Enter 81.2 for 81.2%, or 0.812 if copied from a spreadsheet.", "number")}
      </div>
    </section>
    ${renderMetrics(r)}
    <section class="section">
      <div class="section-header">
        <h2>Ingredients</h2>
        <button id="addIngredient">Add Ingredient</button>
      </div>
      <div class="table-wrap">
        <table class="ingredient-table">
          <thead>
            <tr>
              <th>Name</th><th>Description / INCI</th><th>Formula qty</th><th>Formula %</th><th>Batch qty</th><th>Unit</th><th>Phase</th><th>Vendor</th><th>Lot #</th><th>Cost/unit</th><th>Calc cost</th><th>Notes</th><th></th>
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
        <button id="recalculate">Recalculate</button>
        ${r.current_version ? '<button id="previewCard">Preview Final Card</button>' : ""}
      </div>
    </section>
  `;
  renderIngredientRows();
  renderStepRows();
  bindEditor();
}

function field(name, label, value, help = "", type = "text") {
  return `<label>${label}${help ? `<span class="helper">${help}</span>` : ""}<input name="${name}" type="${type}" step="any" value="${escapeHtml(value ?? "")}"></label>`;
}

function renderMetrics(recipe) {
  const c = recipe.calculations || {};
  return `
    <section class="section">
      <div class="grid">
        <div class="metric"><strong>Formula total</strong><p>${qty(c.formula_total)} base units</p></div>
        <div class="metric"><strong>Percent total</strong><p>${pct(c.percent_total)}</p></div>
        <div class="metric"><strong>Batch total</strong><p>${qty(c.batch_total)} ${recipe.batch_unit || ""}</p></div>
        <div class="metric"><strong>Estimated yield</strong><p>${qty(c.estimated_yield)} units</p></div>
        <div class="metric"><strong>Cost total</strong><p>${money(c.cost_total)}</p></div>
        <div class="metric"><strong>Cost per unit</strong><p>${money(c.cost_per_unit)}</p></div>
      </div>
      ${(c.warnings || []).map((warning) => `<div class="warning">${warning}</div>`).join("")}
    </section>
  `;
}

function renderIngredientRows() {
  const tbody = content.querySelector("#ingredientRows");
  tbody.innerHTML = "";
  (state.currentRecipe.ingredients || []).forEach((item, index) => {
    const row = document.querySelector("#recipeRowTemplate").content.firstElementChild.cloneNode(true);
    row.dataset.index = index;
    if (item.match_status === "review") row.classList.add("match-review");
    row.querySelectorAll("input").forEach((input) => {
      input.value = item[input.dataset.field] ?? "";
      if (input.dataset.field === "ingredient_name") {
        input.setAttribute("list", "ingredientOptions");
        input.title = item.original_ingredient_name && item.original_ingredient_name !== item.ingredient_name
          ? `Imported as "${item.original_ingredient_name}". Review this best guess.`
          : "";
        if (item.match_status === "review") {
          input.insertAdjacentHTML("afterend", `<div class="match-alert">Review match. Imported as "${escapeHtml(item.original_ingredient_name || "")}".</div>`);
        }
      }
      input.addEventListener("input", () => {
        state.currentRecipe.ingredients[index][input.dataset.field] = input.type === "number" ? Number(input.value) : input.value;
        if (input.dataset.field === "ingredient_name") {
          state.currentRecipe.ingredients[index].match_status = "matched";
          state.currentRecipe.ingredients[index].match_confidence = 1;
        }
      });
    });
    row.querySelector("[data-action='removeIngredient']").addEventListener("click", () => {
      state.currentRecipe.ingredients.splice(index, 1);
      renderIngredientRows();
    });
    tbody.appendChild(row);
  });
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
  state.currentRecipe.notes = content.querySelector("#notesField").value.split("\n").map((line) => line.trim()).filter(Boolean);
  state.currentRecipe.ingredients = (state.currentRecipe.ingredients || []).map((item, index) => ({ ...item, sort_order: index + 1 }));
  state.currentRecipe.steps = (state.currentRecipe.steps || []).map((step, index) => ({ ...step, sort_order: index + 1 }));
  return state.currentRecipe;
}

function bindEditor() {
  content.querySelector("#addIngredient").addEventListener("click", () => {
    state.currentRecipe.ingredients.push({ ingredient_name: "", unit: "grams", formula_qty: 0, formula_percent: 0, batch_qty: 0 });
    renderIngredientRows();
  });
  content.querySelector("#addStep").addEventListener("click", () => {
    state.currentRecipe.steps.push({ instruction_text: "" });
    renderStepRows();
  });
  content.querySelector("#saveRecipe").addEventListener("click", async () => {
    const payload = collectRecipe();
    const saved = payload.id
      ? await api(`/api/recipes/${payload.id}`, { method: "PUT", body: payload })
      : await api("/api/recipes", { method: "POST", body: payload });
    showToast("Draft saved.");
    renderEditor(saved.id);
  });
  content.querySelector("#recalculate").addEventListener("click", async () => {
    const payload = collectRecipe();
    if (!payload.id) return renderEditor(null, payload);
    const saved = await api(`/api/recipes/${payload.id}`, { method: "PUT", body: payload });
    renderEditor(saved.id);
  });
  content.querySelector("#duplicateRecipe")?.addEventListener("click", async () => {
    const copy = await api(`/api/recipes/${state.currentRecipe.id}/duplicate`, { method: "POST", body: {} });
    showToast("Recipe duplicated.");
    renderEditor(copy.id);
  });
  content.querySelector("#publishRecipe")?.addEventListener("click", async () => {
    const payload = collectRecipe();
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
            ${importField(index, "batch_size", "Batch size", recipe.batch_size, "number")}
            ${importField(index, "unit_weight", "Weight per unit", recipe.unit_weight, "number")}
            ${importField(index, "target_mg_per_unit", "Target mg/unit", recipe.target_mg_per_unit, "number")}
            ${importField(index, "potency_percent", "Potency %", recipe.potency_percent, "number")}
          </div>
          <details>
            <summary>${recipe.ingredients.length} ingredients, ${recipe.steps.length} SOP steps</summary>
            <div class="table-wrap">
              <table>
                <thead><tr><th>Name</th><th>Formula %</th><th>Batch qty</th><th>Unit</th><th>Phase</th><th>Vendor</th></tr></thead>
                <tbody>
                  ${recipe.ingredients.map((item, ingredientIndex) => `
                    <tr class="${item.match_status === "review" ? "match-review" : ""}">
                      <td>
                        <input list="ingredientOptions" data-import-ingredient="${index}" data-ingredient-index="${ingredientIndex}" data-ingredient-field="ingredient_name" value="${escapeHtml(item.ingredient_name || "")}">
                        ${item.match_status === "review" ? `<div class="match-alert">Review match. Imported as "${escapeHtml(item.original_ingredient_name || "")}".</div>` : ""}
                      </td>
                      <td><input type="number" step="any" data-import-ingredient="${index}" data-ingredient-index="${ingredientIndex}" data-ingredient-field="formula_percent" value="${item.formula_percent || 0}"></td>
                      <td><input type="number" step="any" data-import-ingredient="${index}" data-ingredient-index="${ingredientIndex}" data-ingredient-field="batch_qty" value="${item.batch_qty || 0}"></td>
                      <td><input data-import-ingredient="${index}" data-ingredient-index="${ingredientIndex}" data-ingredient-field="unit" value="${escapeHtml(item.unit || "")}"></td>
                      <td><input data-import-ingredient="${index}" data-ingredient-index="${ingredientIndex}" data-ingredient-field="phase" value="${escapeHtml(item.phase || "")}"></td>
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
  area.querySelectorAll("[data-import-notes]").forEach((textarea) => textarea.addEventListener("input", () => {
    preview.recipes[Number(textarea.dataset.importNotes)].notes = textarea.value.split("\n").filter(Boolean);
  }));
  area.querySelectorAll("[data-import-ingredient]").forEach((input) => input.addEventListener("input", () => {
    const recipe = preview.recipes[Number(input.dataset.importIngredient)];
    const ingredient = recipe.ingredients[Number(input.dataset.ingredientIndex)];
    ingredient[input.dataset.ingredientField] = input.type === "number" ? Number(input.value) : input.value;
    if (input.dataset.ingredientField === "ingredient_name") {
      ingredient.match_status = "matched";
      ingredient.match_confidence = 1;
      input.closest("tr")?.classList.remove("match-review");
      input.parentElement.querySelector(".match-alert")?.remove();
    }
  }));
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

async function renderCards(recipeId = null) {
  state.view = "cards";
  setPage("Published Cards", "Locked published recipe cards ready for browser viewing and printing.");
  if (recipeId) {
    const versions = await api(`/api/recipes/${recipeId}/versions`);
    if (!versions.length) {
      content.innerHTML = '<section class="section"><p>No published versions yet.</p></section>';
      return;
    }
    return renderVersionCard(versions[0].id);
  }
  await loadRecipes({ status: "Published" });
  content.innerHTML = `<section class="section">${recipeCards(state.recipes)}</section>`;
  bindRecipeListButtons();
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
        <div><strong>Batch size</strong><p>${qty(recipe.batch_size)} ${recipe.batch_unit || ""}</p></div>
        <div><strong>Yield</strong><p>${qty(calculations.estimated_yield)} units</p></div>
        <div><strong>Published by</strong><p>${version.published_by || ""}</p></div>
      </section>
      <h2>Ingredients</h2>
      <table>
        <thead><tr><th>Ingredient</th><th>Percent</th><th>Batch Qty</th><th>Unit</th><th>Vendor / Lot</th></tr></thead>
        <tbody>${version.ingredients.map((item) => `<tr><td>${item.ingredient_name}</td><td>${pct(item.formula_percent)}</td><td>${qty(item.batch_qty)}</td><td>${item.unit || ""}</td><td>${item.vendor || ""} ${item.lot_number || ""}</td></tr>`).join("")}</tbody>
      </table>
      <h2>Calculation Summary</h2>
      <p>Formula total: ${qty(calculations.formula_total)} • Percent total: ${pct(calculations.percent_total)} • Batch total: ${qty(calculations.batch_total)} • Cost/unit: ${money(calculations.cost_per_unit)}</p>
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
  setPage("Ingredients", "Master ingredient list populated by recipes and editable for defaults.");
  const ingredients = await api("/api/ingredients");
  content.innerHTML = `
    <section class="section">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Description</th><th>Default unit</th><th>Vendor</th><th>Default cost</th><th>Source</th><th>Notes</th></tr></thead>
          <tbody>${ingredients.map((item) => `<tr><td>${item.ingredient_name}</td><td>${item.description || ""}</td><td>${item.default_unit || ""}</td><td>${item.default_vendor || ""}</td><td>${money(item.default_cost)}</td><td>${item.source || ""}</td><td>${item.notes || ""}</td></tr>`).join("")}</tbody>
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
