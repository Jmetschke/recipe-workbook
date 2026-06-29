function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizePercent(value) {
  const n = number(value);
  return n > 1 ? n / 100 : n;
}

function calculateRecipe(recipe, ingredients = [], settings = {}) {
  const additiveLimit = number(settings.additive_percent_limit, 4);
  const formulaTotal = ingredients.reduce((sum, item) => sum + number(item.formula_qty), 0);
  const batchSizeInput = number(recipe.batch_size);
  const unitWeight = number(recipe.unit_weight);
  const batchSizeMode = recipe.batch_size_mode === "units" ? "units" : "grams";
  const totalBatchGrams = batchSizeMode === "units" ? batchSizeInput * unitWeight : batchSizeInput;
  const targetMg = number(recipe.target_mg_per_unit);
  const potencyPercent = normalizePercent(recipe.potency_percent);
  const estimatedYield = batchSizeMode === "units" ? batchSizeInput : unitWeight > 0 ? totalBatchGrams / unitWeight : 0;

  const normalizedIngredients = ingredients.map((item) => {
    const formulaPercent = item.formula_percent !== undefined && item.formula_percent !== null && item.formula_percent !== ""
      ? normalizePercent(item.formula_percent)
      : formulaTotal > 0
        ? number(item.formula_qty) / formulaTotal
        : 0;
    const batchQty = item.batch_qty !== undefined && item.batch_qty !== null && item.batch_qty !== ""
      ? number(item.batch_qty)
      : formulaPercent * totalBatchGrams;
    return {
      ...item,
      formula_qty: number(item.formula_qty),
      formula_percent: formulaPercent,
      batch_qty: batchQty
    };
  });

  const percentTotal = normalizedIngredients.reduce((sum, item) => sum + number(item.formula_percent), 0);
  const batchTotal = normalizedIngredients.reduce((sum, item) => sum + number(item.batch_qty), 0);
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
    if ((name.includes("additive") || name.includes("concentrate") || name.includes("active")) && item.formula_percent * 100 > additiveLimit) {
      warnings.push(`${item.ingredient_name || "Additive"} is ${(item.formula_percent * 100).toFixed(2)}%, above the ${additiveLimit}% additive limit.`);
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
    additive_limit_percent: additiveLimit,
    warnings,
    ingredients: normalizedIngredients
  };
}

module.exports = { calculateRecipe, normalizePercent, number };
