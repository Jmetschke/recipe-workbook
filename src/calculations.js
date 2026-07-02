function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizePercent(value) {
  const n = number(value);
  return n > 1 ? n / 100 : n;
}

function isActiveIngredient(item) {
  const name = `${item?.ingredient_name || ""}`.toLowerCase();
  return name.includes("concentrate") || name.includes("isolate") || name.includes("resin") || name.includes("additive") || name.includes("active");
}

function activeIngredientIndex(ingredients = []) {
  const index = ingredients.findIndex(isActiveIngredient);
  return index >= 0 ? index : "";
}

function additiveConcentrationType(row = {}) {
  return row.concentration_type === "mg_per_unit" || row.concentration_basis === "mg_per_unit" ? "mg_per_unit" : "percent";
}

function isVapeRecipe(recipe = {}) {
  return recipe.recipe_card_type === "Vape";
}

function vapeDistillateGrams(recipe = {}) {
  return number(recipe.batch_size) * 1000;
}

function vapeTerpenePercent(recipe = {}) {
  return normalizePercent(recipe.unit_weight);
}

function vapeUnitSize(recipe = {}) {
  const size = number(recipe.vape_unit_size || recipe.unit_size || recipe.vape_unit_grams, 1);
  return size > 0 ? size : 1;
}

function normalizeVapeTerpenes(recipe = {}, terpeneTotalGrams = 0, finalBatchGrams = 0) {
  const rows = Array.isArray(recipe.active_additives) ? recipe.active_additives : [];
  return rows.map((row, index) => {
    const sharePercent = normalizePercent(row.terpene_share_percent ?? row.recorded_percent ?? row.potency_percent);
    const calculatedGrams = terpeneTotalGrams > 0 && sharePercent > 0 ? terpeneTotalGrams * sharePercent : 0;
    return {
      ...row,
      id: row.id || `terpene-${index + 1}`,
      ingredient_name: row.ingredient_name || "",
      ingredient_index: row.ingredient_index ?? "",
      concentration_type: "terpene",
      terpene_share_percent: sharePercent,
      recorded_percent: row.recorded_percent ?? row.potency_percent ?? "",
      potency_percent: row.recorded_percent ?? row.potency_percent ?? "",
      formula_percent: finalBatchGrams > 0 ? calculatedGrams / finalBatchGrams : 0,
      calculated_grams: calculatedGrams,
      potency_fraction: 0,
      physical_mg_per_unit: 0,
      physical_grams_per_unit: 0,
      total_active_mg: 0
    };
  });
}

function normalizeActiveAdditives(recipe, ingredients = [], estimatedYield = 0, vapeContext = null) {
  const rows = Array.isArray(recipe.active_additives) ? recipe.active_additives : [];
  if (isVapeRecipe(recipe)) {
    return normalizeVapeTerpenes(recipe, vapeContext?.terpeneTotalGrams || 0, vapeContext?.finalBatchGrams || 0);
  }
  const fallbackTargetMg = number(recipe.target_mg_per_unit);
  const fallbackPotency = recipe.potency_percent;
  const sourceRows = rows.length
    ? rows
    : fallbackTargetMg || number(fallbackPotency)
      ? [{
        ingredient_name: ingredients[activeIngredientIndex(ingredients)]?.ingredient_name || "",
        ingredient_index: activeIngredientIndex(ingredients),
        target_mg_per_unit: fallbackTargetMg,
        potency_percent: fallbackPotency
      }]
      : [];

  const batchSizeInput = number(recipe.batch_size);
  const unitWeight = number(recipe.unit_weight);
  const batchSizeMode = recipe.batch_size_mode === "units" ? "units" : "grams";
  const totalBatchGrams = batchSizeMode === "units" ? batchSizeInput * unitWeight : batchSizeInput;

  return sourceRows.map((row, index) => {
    const concentrationType = additiveConcentrationType(row);
    if (concentrationType === "mg_per_unit") {
      const mgPerG = number(row.mg_per_g || row.mg_per_gram || row.concentration_mg_per_g);
      const mgPerUnit = row.mg_per_unit === undefined || row.mg_per_unit === null || row.mg_per_unit === ""
        ? number(row.target_mg_per_unit)
        : number(row.mg_per_unit);
      const gramsPerUnit = number(row.grams_per_unit || row.g_per_unit || unitWeight);
      const hasExplicitUnits = !(row.unit_count === undefined || row.unit_count === null || row.unit_count === "" || number(row.unit_count) <= 0);
      const explicitUnits = hasExplicitUnits ? number(row.unit_count) : 0;
      const unitCount = explicitUnits || (gramsPerUnit > 0 ? totalBatchGrams / gramsPerUnit : estimatedYield);
      const totalActiveMg = unitCount > 0 && mgPerUnit > 0 ? unitCount * mgPerUnit : 0;
      const totalGrams = mgPerG > 0 && totalActiveMg > 0 ? totalActiveMg / mgPerG : 0;
      const physicalGramsPerUnit = unitCount > 0 ? totalGrams / unitCount : 0;
      const physicalMgPerUnit = physicalGramsPerUnit * 1000;
      return {
        ...row,
        id: row.id || `additive-${index + 1}`,
        ingredient_name: row.ingredient_name || "",
        ingredient_index: row.ingredient_index ?? "",
        concentration_type: "mg_per_unit",
        mg_per_g: mgPerG || "",
        mg_per_unit: mgPerUnit || "",
        target_mg_per_unit: mgPerUnit || "",
        grams_per_unit: gramsPerUnit || "",
        unit_count: hasExplicitUnits ? unitCount : "",
        calculated_unit_count: unitCount || "",
        total_active_mg: totalActiveMg,
        potency_percent: row.potency_percent || "",
        potency_fraction: 0,
        physical_mg_per_unit: physicalMgPerUnit,
        physical_grams_per_unit: physicalGramsPerUnit,
        calculated_grams: totalGrams
      };
    }

    const oldPercentOfActive = row.percent_of_active === undefined || row.percent_of_active === null || row.percent_of_active === ""
      ? 100
      : number(row.percent_of_active, 100);
    const targetMg = row.target_mg_per_unit === undefined || row.target_mg_per_unit === null || row.target_mg_per_unit === ""
      ? fallbackTargetMg * (oldPercentOfActive / 100)
      : number(row.target_mg_per_unit);
    const potencyFraction = normalizePercent(row.potency_percent === undefined || row.potency_percent === null || row.potency_percent === ""
      ? fallbackPotency
      : row.potency_percent);
    const physicalMgPerUnit = potencyFraction > 0 && targetMg > 0 ? targetMg / potencyFraction : 0;
    const physicalGramsPerUnit = physicalMgPerUnit / 1000;
    const totalGrams = physicalGramsPerUnit > 0 && estimatedYield > 0 ? physicalGramsPerUnit * estimatedYield : 0;
    return {
      ...row,
      id: row.id || `additive-${index + 1}`,
      ingredient_name: row.ingredient_name || "",
      ingredient_index: row.ingredient_index ?? "",
      concentration_type: "percent",
      target_mg_per_unit: targetMg,
      potency_percent: row.potency_percent === undefined || row.potency_percent === null || row.potency_percent === "" ? fallbackPotency || "" : row.potency_percent,
      mg_per_unit: row.mg_per_unit || "",
      mg_per_g: row.mg_per_g || "",
      grams_per_unit: row.grams_per_unit || "",
      unit_count: row.unit_count || "",
      calculated_unit_count: row.unit_count || estimatedYield || "",
      total_active_mg: targetMg > 0 && estimatedYield > 0 ? targetMg * estimatedYield : 0,
      potency_fraction: potencyFraction,
      physical_mg_per_unit: physicalMgPerUnit,
      physical_grams_per_unit: physicalGramsPerUnit,
      calculated_grams: totalGrams
    };
  });
}

function calculateRecipe(recipe, ingredients = [], settings = {}) {
  const additiveLimit = number(settings.additive_percent_limit, 4);
  const formulaTotal = ingredients.reduce((sum, item) => sum + number(item.formula_qty), 0);
  const batchSizeInput = number(recipe.batch_size);
  const unitWeight = number(recipe.unit_weight);
  const batchSizeMode = isVapeRecipe(recipe) ? "liters" : recipe.batch_size_mode === "units" ? "units" : "grams";
  const distillateGrams = isVapeRecipe(recipe) ? vapeDistillateGrams(recipe) : 0;
  const terpenePercent = isVapeRecipe(recipe) ? vapeTerpenePercent(recipe) : 0;
  const terpeneTotalGrams = isVapeRecipe(recipe) && terpenePercent > 0 && terpenePercent < 1
    ? (distillateGrams * terpenePercent) / (1 - terpenePercent)
    : 0;
  const vapeFinalBatchGrams = distillateGrams + terpeneTotalGrams;
  const totalBatchGrams = isVapeRecipe(recipe) ? vapeFinalBatchGrams : batchSizeMode === "units" ? batchSizeInput * unitWeight : batchSizeInput;
  const estimatedYield = isVapeRecipe(recipe) ? totalBatchGrams / vapeUnitSize(recipe) : batchSizeMode === "units" ? batchSizeInput : unitWeight > 0 ? totalBatchGrams / unitWeight : 0;
  const vapeTerpenes = isVapeRecipe(recipe) ? normalizeVapeTerpenes(recipe, terpeneTotalGrams, vapeFinalBatchGrams) : [];
  const terpeneByIndex = new Map();
  vapeTerpenes.forEach((row) => {
    const index = Number(row.ingredient_index);
    if (Number.isFinite(index)) terpeneByIndex.set(index, number(terpeneByIndex.get(index)) + number(row.calculated_grams));
  });

  const normalizedIngredients = ingredients.map((item, index) => {
    if (isVapeRecipe(recipe)) {
      const matchedTerpeneGrams = terpeneByIndex.has(index) ? number(terpeneByIndex.get(index)) : null;
      const batchQty = index === 0
        ? distillateGrams
        : matchedTerpeneGrams !== null
          ? matchedTerpeneGrams
          : number(item.batch_qty);
      const formulaPercent = totalBatchGrams > 0 ? batchQty / totalBatchGrams : 0;
      return {
        ...item,
        formula_qty: batchQty,
        formula_percent: formulaPercent,
        batch_qty: batchQty,
        unit: "grams"
      };
    }
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
  const normalizedFormulaTotal = normalizedIngredients.reduce((sum, item) => sum + number(item.formula_qty), 0);
  const activeAdditives = isVapeRecipe(recipe)
    ? vapeTerpenes
    : normalizeActiveAdditives(recipe, normalizedIngredients, estimatedYield);
  const activeMassPerUnitMg = activeAdditives.reduce((sum, row) => sum + number(row.physical_mg_per_unit), 0);
  const activeMassPerUnitGrams = activeAdditives.reduce((sum, row) => sum + number(row.physical_grams_per_unit), 0);
  const activeIngredientGrams = activeAdditives.reduce((sum, row) => sum + number(row.calculated_grams), 0);
  const yieldLossPercent = 0.05;
  const theoreticalYield = estimatedYield || totalBatchGrams;
  const yieldUnit = isVapeRecipe(recipe) ? `${vapeUnitSize(recipe)}g units` : estimatedYield > 0 ? "units" : "grams";
  const realYield = theoreticalYield * (1 - yieldLossPercent);
  const theoreticalBatchGrams = totalBatchGrams;
  const realBatchGrams = totalBatchGrams * (1 - yieldLossPercent);
  const warnings = [];

  if (Math.abs(percentTotal - 1) > 0.005) {
    warnings.push(`Formula percentages total ${(percentTotal * 100).toFixed(2)}%, not 100%.`);
  }

  if (!isVapeRecipe(recipe)) {
    normalizedIngredients.forEach((item) => {
      const name = `${item.ingredient_name || ""}`.toLowerCase();
      if ((name.includes("additive") || name.includes("concentrate") || name.includes("active")) && item.formula_percent * 100 > additiveLimit) {
        warnings.push(`${item.ingredient_name || "Additive"} is ${(item.formula_percent * 100).toFixed(2)}%, above the ${additiveLimit}% additive limit.`);
      }
    });
  }

  return {
    formula_total: normalizedFormulaTotal,
    percent_total: percentTotal,
    total_batch_grams: totalBatchGrams,
    batch_size_mode: batchSizeMode,
    batch_total: batchTotal,
    estimated_yield: estimatedYield,
    theoretical_yield: theoreticalYield,
    real_yield: realYield,
    yield_unit: yieldUnit,
    yield_loss_percent: yieldLossPercent,
    theoretical_batch_grams: theoreticalBatchGrams,
    real_batch_grams: realBatchGrams,
    vape_unit_size: isVapeRecipe(recipe) ? vapeUnitSize(recipe) : 0,
    distillate_grams: distillateGrams,
    terpene_percent: terpenePercent,
    terpene_total_grams: terpeneTotalGrams,
    final_batch_grams: isVapeRecipe(recipe) ? vapeFinalBatchGrams : totalBatchGrams,
    active_ingredient_grams: activeIngredientGrams,
    total_active_additive_grams: activeIngredientGrams,
    active_mass_per_unit_mg: activeMassPerUnitMg,
    active_mass_per_unit_grams: activeMassPerUnitGrams,
    potency_fraction: activeAdditives[0]?.potency_fraction || 0,
    active_additives: activeAdditives,
    additive_limit_percent: additiveLimit,
    warnings,
    ingredients: normalizedIngredients
  };
}

module.exports = { calculateRecipe, normalizePercent, number };
