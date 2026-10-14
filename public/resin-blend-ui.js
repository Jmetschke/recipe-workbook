function isResinBlendRecipe(recipe = state.currentRecipe) {
  return recipe?.recipe_card_type === ResinBlend.TYPE;
}

function blendAmount(value) {
  return value === null || value === undefined ? "—" : Number(value).toLocaleString(undefined, { maximumFractionDigits: 6 });
}

function blendPercent(value) {
  return value === null || value === undefined ? "Not recorded" : `${blendAmount(value)}%`;
}

function renderResinBlendResult(recipe, calculations = recipe.calculations) {
  const c = calculations || ResinBlend.calculate(recipe);
  const title = `<h2>Resin Blend Calculator — ${escapeHtml(recipe.name || "Untitled Blend")}</h2>`;
  if (!c.valid) return `<section class="section" id="resinBlendResult">${title}<p>Complete the following to generate the jar recipe. You can save an unfinished draft.</p>${(c.errors || []).map((error) => `<div class="warning">${escapeHtml(error)}</div>`).join("")}</section>`;
  return `<section class="section" id="resinBlendResult">
    ${title}
    <div class="grid">
      <div class="metric"><strong>Total oil</strong><p>${blendAmount(c.oil_total_grams)} g</p></div>
      <div class="metric"><strong>Added terpenes</strong><p>${blendAmount(c.added_terpene_grams)} g (${blendPercent(c.added_terpene_percent)} of final blend)</p></div>
      <div class="metric"><strong>Final blend total</strong><p>${blendAmount(c.total_batch_grams)} g</p></div>
      <div class="metric"><strong>Jars</strong><p>${c.jar_count}</p></div>
      <div class="metric"><strong>Total in each jar</strong><p>${blendAmount(c.per_jar_grams)} g</p></div>
      <div class="metric"><strong>Estimated final potency</strong><p>${blendPercent(c.estimated_potency_percent)}</p></div>
      <div class="metric"><strong>Estimated final terpene content</strong><p>${blendPercent(c.estimated_terpene_percent)}</p></div>
    </div>
    <h3>Recipe for each jar · repeat for jars 1–${c.jar_count}</h3>
    <p>Weigh the “Grams per jar” amount of every line into each jar. Each jar has the same proportions as the full blend.</p>
    <div class="table-wrap"><table class="resin-blend-output">
      <thead><tr><th>Oil / terpene</th><th>Metrc #</th><th>Input potency %</th><th>Input terpene %</th><th>Total grams (all jars)</th><th>Blend share</th><th>Grams per jar</th></tr></thead>
      <tbody>${c.ingredients.map((row) => `<tr><td data-mobile-label="Oil / terpene">${escapeHtml(row.ingredient_name)}<span class="helper">${escapeHtml(row.blend_kind)}</span></td><td data-mobile-label="Metrc #">${escapeHtml(row.metrc_number || "Not recorded")}</td><td data-mobile-label="Input potency %">${blendPercent(row.potency_percent)}</td><td data-mobile-label="Input terpene %">${blendPercent(row.terpene_percent)}</td><td data-mobile-label="Total grams (all jars)">${blendAmount(row.batch_qty)}</td><td data-mobile-label="Blend share">${blendPercent(row.formula_percent * 100)}</td><td data-mobile-label="Grams per jar" class="batch-qty-display">${blendAmount(row.per_jar_grams)}</td></tr>`).join("")}</tbody>
      <tfoot><tr><th colspan="4">Total</th><th>${blendAmount(c.total_batch_grams)} g</th><th>100%</th><th>${blendAmount(c.per_jar_grams)} g</th></tr></tfoot>
    </table></div>
    ${c.estimated_potency_percent === null ? '<p class="helper">Enter potency % for every oil to estimate the final potency. Blank values are unknown; enter 0 for a known zero.</p>' : ""}
    ${c.estimated_terpene_percent === null ? '<p class="helper">Enter terpene % for every oil to estimate total terpene content, including the terpenes already in the oils.</p>' : ""}
    <p class="helper">Added terpene lines are treated as pure terpenes with 0% potency. Their percentages are additions, not a target for total terpene content. Potency and terpene estimates are weighted by mass and are the same in every jar. No processing loss is assumed. Displayed grams are rounded to six decimal places; calculations retain full precision.</p>
  </section>`;
}

function updateResinBlendResult() {
  const recipe = state.currentRecipe;
  recipe.calculations = ResinBlend.calculate(recipe);
  recipe.ingredients = recipe.calculations.ingredients;
  recipe.batch_size = recipe.calculations.total_batch_grams;
  const result = content.querySelector("#resinBlendResult");
  if (result) result.outerHTML = renderResinBlendResult(recipe);
  const print = content.querySelector("#printBlendRecipe");
  if (print) print.disabled = !recipe.calculations.valid;
}

function collectResinBlendRecipe() {
  const recipe = state.currentRecipe;
  content.querySelectorAll("[name]").forEach((input) => {
    recipe[input.name] = input.type === "number" ? Number(input.value) : input.value;
  });
  recipe.notes = (content.querySelector("#notesField")?.value || "").split("\n").map((line) => line.trim()).filter(Boolean);
  recipe.steps = (recipe.steps || []).map((step, index) => ({ ...step, sort_order: index + 1 }));
  recipe.active_additives = [];
  recipe.batch_size_mode = "grams";
  recipe.batch_unit = "grams";
  updateResinBlendResult();
  return recipe;
}

function renderResinBlendEditor() {
  const r = state.currentRecipe;
  r.resin_blend ||= { jar_count: 1, oils: [], terpenes: [] };
  r.resin_blend.oils ||= [];
  r.resin_blend.terpenes ||= [];
  r.steps ||= [];
  r.calculations = ResinBlend.calculate(r);
  const readOnly = ["published-view", "template-view"].includes(state.editorMode);
  const locked = readOnly || Boolean(r.copy_lock_formula);
  const published = r.status === "Published";
  const template = r.status === "Template";
  setPage(r.name, "Divide each oil evenly among jars. Optional terpene additions are percentages of the final blend.");
  const input = (group, index, key, value, type = "text", optional = false) => `<input aria-label="${group === "oils" ? "Oil" : "Terpene"} ${index + 1} ${key.replaceAll("_", " ")}" data-blend-group="${group}" data-blend-index="${index}" data-blend-field="${key}" type="${type}" ${type === "number" ? `min="0" step="any" ${key.includes("percent") ? 'max="100"' : ""}` : ""} value="${escapeHtml(value ?? "")}" ${optional ? 'placeholder="Optional"' : ""} ${locked ? "readonly" : ""}>`;
  content.innerHTML = `<div class="resin-blend-editor">
    <section class="section no-print">
      <div class="section-header"><div>${statusBadge(r)}<p>Resin Blend Calculator</p></div><div class="toolbar">
        <button id="closeWithoutSaving">Close Without Saving</button>
        ${readOnly ? `<button id="${template ? "editTemplate" : "editPublished"}" class="primary">Edit</button>` : '<button id="saveRecipe" class="primary">Save Changes</button>'}
        <button id="toggleFormulaLock">${locked ? "Unlock Formula" : "Lock Formula"}</button>
        ${r.id ? '<button id="duplicateRecipe">Duplicate Recipe</button><button id="deleteRecipe" class="danger">Delete</button>' : ""}
        ${r.id && published ? '<button id="unpublishRecipe">Unpublish</button>' : ""}
        ${r.id && !readOnly && !template ? '<button id="publishRecipe">Publish New Version</button><button id="makeTemplate">Make Template</button>' : ""}
        ${r.id && template ? '<button id="exportTemplateRecipe">Export Template</button>' : ""}
      </div></div>
      <div class="grid">
        ${field("name", "Recipe name", r.name, "", "text", readOnly)}
        ${field("product_type", "Product type", r.product_type, "", "text", readOnly)}
        ${field("flavor", "Flavor", r.flavor, "", "text", readOnly)}
        ${field("current_version", "Version to publish", r.current_version, "", "text", readOnly)}
        ${field("expected_production_date", "Production date", r.expected_production_date, "Required to publish.", "date", readOnly)}
        <label>Number of jars<input id="blendJarCount" type="number" min="1" step="1" value="${escapeHtml(r.resin_blend.jar_count ?? "")}" ${locked ? "readonly" : ""}></label>
      </div>
      ${locked ? '<p class="warning">Formula locked. Select Unlock Formula to change oils, jars, or added terpenes.</p>' : ""}
    </section>
    <section class="section no-print">
      <div class="section-header"><h2>Oils to blend</h2>${locked ? "" : '<button id="addBlendOil">Add Oil</button>'}</div>
      <p>Enter the full amount available for each oil in grams. Optional percentages use 0–100: enter 0.5 for 0.5%.</p>
      <div class="table-wrap"><table class="resin-blend-input"><thead><tr><th>Oil name</th><th>Total grams</th><th>Potency % (optional)</th><th>Terpene % (optional)</th><th>Metrc # (optional)</th><th></th></tr></thead><tbody>
      ${r.resin_blend.oils.map((oil, i) => `<tr><td data-mobile-label="Oil name">${input("oils", i, "name", oil.name)}</td><td data-mobile-label="Total grams">${input("oils", i, "grams", oil.grams, "number")}</td><td data-mobile-label="Potency % (optional)">${input("oils", i, "potency_percent", oil.potency_percent, "number", true)}</td><td data-mobile-label="Terpene % (optional)">${input("oils", i, "terpene_percent", oil.terpene_percent, "number", true)}</td><td data-mobile-label="Metrc # (optional)">${input("oils", i, "metrc_number", oil.metrc_number, "text", true)}</td><td>${locked ? "" : `<button class="danger" data-blend-remove="oils" data-index="${i}">Remove</button>`}</td></tr>`).join("")}
      </tbody></table></div>
    </section>
    <section class="section no-print">
      <div class="section-header"><h2>Added terpenes (optional)</h2>${locked ? "" : '<button id="addBlendTerpene">Add Terpene</button>'}</div>
      <p>Each line is its percentage of the final blend weight. All added lines together must total less than 100%. For example, 950 g oil plus a 5% terpene line needs 50 g terpenes. Added lines assume pure terpenes with 0% potency.</p>
      <div class="table-wrap"><table class="resin-blend-input"><thead><tr><th>Terpene name</th><th>% of final blend</th><th>Metrc # (optional)</th><th></th></tr></thead><tbody>
      ${r.resin_blend.terpenes.map((row, i) => `<tr><td data-mobile-label="Terpene name">${input("terpenes", i, "name", row.name)}</td><td data-mobile-label="% of final blend">${input("terpenes", i, "percent", row.percent, "number")}</td><td data-mobile-label="Metrc # (optional)">${input("terpenes", i, "metrc_number", row.metrc_number, "text", true)}</td><td>${locked ? "" : `<button class="danger" data-blend-remove="terpenes" data-index="${i}">Remove</button>`}</td></tr>`).join("") || '<tr><td colspan="4">No added terpenes. Add lines when needed.</td></tr>'}
      </tbody></table></div>
    </section>
    <div class="toolbar no-print"><button id="printBlendRecipe" ${r.calculations.valid ? "" : "disabled"}>Print Jar Recipe</button><span class="helper">Quantities update as you type. Save Changes to keep your edits.</span></div>
    ${renderResinBlendResult(r)}
    <section class="section no-print"><div class="section-header"><h2>SOP Instructions</h2>${readOnly ? "" : '<button id="addStep">Add Step</button>'}</div><div id="stepRows"></div></section>
    <section class="section no-print"><h2>Notes</h2><textarea id="notesField" ${readOnly ? "readonly" : ""}>${escapeHtml((r.notes || []).join("\n"))}</textarea></section>
    <div id="blendPrintDetails" class="blend-print-only"></div>
  </div>`;
  renderStepRows();
  bindEditor();
  content.querySelectorAll("[name]").forEach((element) => element.addEventListener("input", updateResinBlendResult));
  content.querySelectorAll("[data-blend-field]").forEach((element) => element.addEventListener("input", () => {
    if (locked) return;
    r.resin_blend[element.dataset.blendGroup][Number(element.dataset.blendIndex)][element.dataset.blendField] = element.value;
    updateResinBlendResult();
  }));
  content.querySelector("#blendJarCount").addEventListener("input", (event) => {
    if (locked) return;
    r.resin_blend.jar_count = event.target.value;
    updateResinBlendResult();
  });
  const rerender = () => { collectResinBlendRecipe(); renderResinBlendEditor(); };
  content.querySelector("#addBlendOil")?.addEventListener("click", () => {
    r.resin_blend.oils.push({ name: "", grams: "", potency_percent: "", terpene_percent: "", metrc_number: "" });
    rerender();
  });
  content.querySelector("#addBlendTerpene")?.addEventListener("click", () => {
    r.resin_blend.terpenes.push({ name: "", percent: "", metrc_number: "" });
    rerender();
  });
  content.querySelectorAll("[data-blend-remove]").forEach((button) => button.addEventListener("click", () => {
    r.resin_blend[button.dataset.blendRemove].splice(Number(button.dataset.index), 1);
    rerender();
  }));
  content.querySelector("#printBlendRecipe").addEventListener("click", () => {
    collectResinBlendRecipe();
    if (!r.calculations.valid) return;
    content.querySelector("#blendPrintDetails").innerHTML = `<p>Version: ${escapeHtml(r.current_version || "Draft")} · Production date: ${escapeHtml(r.expected_production_date || "Not recorded")}</p><h2>SOP Instructions</h2><ol>${r.steps.map((step) => `<li>${escapeHtml(step.instruction_text)}</li>`).join("")}</ol><h2>Notes</h2><p>${r.notes.map(escapeHtml).join("<br>")}</p>`;
    window.print();
  });
}
