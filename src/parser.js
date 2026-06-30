const XLSX = require("xlsx");
const { calculateRecipe, normalizePercent, number } = require("./calculations");
const { applyIngredientMatches } = require("./inventory");

function clean(value) {
  return value === undefined || value === null ? "" : String(value).replace(/\s+/g, " ").trim();
}

function key(value) {
  return clean(value).toLowerCase();
}

function readSheet(workbook, sheetName) {
  const sheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
}

function findRow(rows, labels) {
  const wanted = labels.map(key);
  return rows.findIndex((row) => {
    const text = row.map(key).join(" | ");
    return wanted.every((label) => text.includes(label));
  });
}

function valueBesideLabel(rows, label) {
  const wanted = key(label);
  for (const row of rows) {
    for (let i = 0; i < row.length; i += 1) {
      if (key(row[i]).includes(wanted)) {
        for (let j = i + 1; j < row.length; j += 1) {
          if (clean(row[j])) return row[j];
        }
      }
    }
  }
  return "";
}

function splitTitle(title) {
  const cleaned = clean(title);
  const [left = cleaned] = cleaned.split(" - ");
  const flavorMatch = left.match(/\(([^)]+)\)/);
  const calmMatch = cleaned.match(/CALM\s*(?:\(([^)]+)\))?/i);
  return {
    name: cleaned || "Imported Recipe",
    product_type: /gummy/i.test(cleaned) ? "Gummy" : /stick|rub|topical/i.test(cleaned) ? "Topical Stick Rub" : "Manufacturing Formula",
    flavor: flavorMatch ? flavorMatch[1] : calmMatch ? (calmMatch[1] || "CALM") : ""
  };
}

function activeIngredientIndex(ingredients = []) {
  const index = ingredients.findIndex((item) => {
    const name = `${item.ingredient_name || ""}`.toLowerCase();
    return name.includes("concentrate") || name.includes("isolate") || name.includes("resin") || name.includes("additive") || name.includes("active");
  });
  return index >= 0 ? index : "";
}

function additiveIdFromLabel(label) {
  const value = key(label);
  const numbered = value.match(/additive\s*#?\s*(\d+)/);
  if (numbered) return `additive-${numbered[1]}`;
  if (value.includes("mushroom")) return "mushroom";
  if (value.includes("additive")) return "additive-1";
  return value.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "additive-1";
}

function additiveSortValue(id) {
  const match = String(id).match(/(\d+)/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function isGenericAdditivePlaceholder(name) {
  return /^(additive(?:\s*#?\s*\d+)?|mushroom additive)$/i.test(clean(name));
}

function nextValue(row, index) {
  for (let i = index + 1; i < row.length; i += 1) {
    if (clean(row[i]) !== "") return row[i];
  }
  return "";
}

function extractAdditiveInputs(rows = [], ingredients = []) {
  const entries = new Map();
  const ensure = (label) => {
    const id = additiveIdFromLabel(label);
    if (!entries.has(id)) entries.set(id, { id, label: clean(label) });
    return entries.get(id);
  };

  rows.forEach((row) => {
    row.forEach((cell, index) => {
      const label = clean(cell);
      if (!label) return;
      const potencyMatch = label.match(/% potency of (.+)$/i);
      if (potencyMatch) {
        ensure(potencyMatch[1]).potency_percent = nextValue(row, index);
      }
      const goalMatch = label.match(/(.+?)\s*goal\s*\(mg\)\s*per\s*(?:gummy|unit)/i);
      if (goalMatch) {
        ensure(goalMatch[1]).target_mg_per_unit = number(nextValue(row, index));
      }
    });
  });

  const ingredientById = new Map();
  ingredients.forEach((ingredient, index) => {
    const id = additiveIdFromLabel(ingredient.ingredient_name);
    if (!ingredientById.has(id)) ingredientById.set(id, index);
  });

  return Array.from(entries.values())
    .map((entry) => {
      const ingredientIndex = ingredientById.has(entry.id) ? ingredientById.get(entry.id) : "";
      const ingredient = ingredientIndex === "" ? null : ingredients[ingredientIndex];
      return {
        id: `imported-${entry.id}`,
        ingredient_name: ingredient?.ingredient_name || entry.label || "Additive",
        ingredient_index: ingredientIndex,
        target_mg_per_unit: number(entry.target_mg_per_unit),
        potency_percent: entry.potency_percent || ""
      };
    })
    .filter((entry) => number(entry.target_mg_per_unit) > 0 || number(ingredients[entry.ingredient_index]?.batch_qty) > 0)
    .sort((a, b) => additiveSortValue(a.id) - additiveSortValue(b.id));
}

function importedActiveAdditives(ingredients = [], targetMg = "", potencyPercent = "") {
  if (!number(targetMg) && !number(potencyPercent)) return [];
  const ingredientIndex = activeIngredientIndex(ingredients);
  return [{
    id: `imported-additive-${Date.now()}-${ingredientIndex || "unmatched"}`,
    ingredient_name: ingredientIndex === "" ? "" : ingredients[ingredientIndex]?.ingredient_name || "",
    ingredient_index: ingredientIndex,
    target_mg_per_unit: number(targetMg),
    potency_percent: potencyPercent || ""
  }];
}

function detectWorkbookFormat(workbook) {
  const sheetNames = workbook.SheetNames.map((name) => name.toLowerCase());
  const joined = sheetNames.join(" | ");
  if (sheetNames.includes("recipe") && joined.includes("sop") && joined.includes("ingredient")) {
    return "stick-rub";
  }
  if (sheetNames.some((name) => name.includes("single additive") || name.includes("multiple additives") || name.includes("gummy")) || joined.includes("melt")) {
    return "gummy";
  }

  for (const name of workbook.SheetNames) {
    const rows = readSheet(workbook, name).slice(0, 35);
    const text = rows.flat().map(key).join(" | ");
    if (text.includes("trade name") && text.includes("formula qty") && text.includes("batch qty")) return "stick-rub";
    if (text.includes("batch size") && text.includes("additive goal") && text.includes("weight of each gummy")) return "gummy";
  }
  return "unknown";
}

function parseStickRubWorkbook(workbook) {
  const recipeSheet = workbook.SheetNames.find((name) => key(name) === "recipe") || workbook.SheetNames[0];
  const ingredientSheet = workbook.SheetNames.find((name) => key(name).includes("ingredient list"));
  const sopSheet = workbook.SheetNames.find((name) => key(name).includes("sop"));
  const rows = readSheet(workbook, recipeSheet);
  const headerIndex = findRow(rows, ["trade name", "formula", "batch"]);
  const header = rows[headerIndex] || [];
  const col = (contains) => header.findIndex((cell) => key(cell).includes(contains));
  const nameCol = col("trade name");
  const formulaCol = col("formula");
  const percentCol = col("qty %");
  const batchCol = col("batch");
  const actualCol = col("actual");
  const vendorCol = col("vendor");
  const title = clean(rows[0] && rows[0][0]) || "Imported Stick Rub Formula";
  const targetQty = number(valueBesideLabel(rows, "Target QTY"));
  const ingredients = [];

  for (let i = headerIndex + 1; i < rows.length; i += 1) {
    const row = rows[i];
    const ingredientName = clean(row[nameCol]);
    if (!ingredientName) continue;
    if (/process instructions|^notes:?$|batch size calculation|only change|bright yellow|^cells$|total|signature|approved/i.test(ingredientName)) break;
    ingredients.push({
      sort_order: ingredients.length + 1,
      ingredient_name: ingredientName,
      formula_qty: number(row[formulaCol]),
      formula_percent: normalizePercent(row[percentCol]),
      batch_qty: number(row[batchCol]),
      unit: "grams",
      vendor: "",
      notes: actualCol >= 0 && clean(row[actualCol]) ? `Actual qty: ${clean(row[actualCol])}` : ""
    });
  }

  const stepRows = sopSheet ? readSheet(workbook, sopSheet) : [];
  const steps = stepRows.flatMap((row) => row.map(clean)).filter(Boolean).map((instruction_text, index) => ({
    sort_order: index + 1,
    instruction_text
  }));

  const recipe = {
    name: title.replace(/formulation record/i, "").trim() || "Stick Rub Formula",
    product_type: "Topical Stick Rub",
    flavor: "",
    batch_size: ingredients.reduce((sum, item) => sum + number(item.batch_qty), 0) || targetQty,
    batch_size_mode: "grams",
    batch_unit: "grams",
    unit_weight: 30,
    unit_weight_unit: "grams",
    target_mg_per_unit: 50,
    potency_percent: "",
    active_additives: importedActiveAdditives(ingredients, 50, ""),
    ingredients,
    steps,
    notes: ingredientSheet ? [`Imported ingredient list from sheet: ${ingredientSheet}`] : [],
    calculations: {}
  };
  recipe.calculations = calculateRecipe(recipe, ingredients);
  recipe.ingredients = recipe.calculations.ingredients;
  return [recipe];
}

function parseGummySheet(workbook, sheetName) {
  const rows = readSheet(workbook, sheetName);
  const titleRow = rows.find((row) => row.some((cell) => /formula/i.test(clean(cell)))) || [];
  const title = clean(titleRow.find((cell) => /formula/i.test(clean(cell)))) || sheetName;
  const titleParts = splitTitle(title);
  const batchSize = number(valueBesideLabel(rows, "Batch Size"));
  const unitWeight = number(valueBesideLabel(rows, "Weight of Each Gummy"));
  const potency = number(valueBesideLabel(rows, "% Potency"));
  const target = number(valueBesideLabel(rows, "Goal (mg) Per Gummy")) || number(valueBesideLabel(rows, "Additive Goal"));
  const tableIndex = findRow(rows, ["ingredient", "percent of formula", "amount"]);
  const header = rows[tableIndex] || [];
  const ingredientCol = header.findIndex((cell) => key(cell).includes("ingredient"));
  const percentCol = header.findIndex((cell) => key(cell).includes("percent"));
  const amountCol = header.findIndex((cell) => key(cell).includes("amount to add"));
  const amountAddedCol = header.findIndex((cell) => key(cell).includes("amount added"));
  const performedByCol = header.findIndex((cell) => key(cell).includes("performed"));
  const ingredients = [];

  for (let i = tableIndex + 1; i < rows.length; i += 1) {
    const row = rows[i];
    const ingredientName = clean(row[ingredientCol]);
    const rowText = row.map(clean).join(" ");
    if (!ingredientName) continue;
    if (/anticipated batch yield|work instructions|instructions|total/i.test(rowText)) break;
    ingredients.push({
      sort_order: ingredients.length + 1,
      ingredient_name: ingredientName,
      formula_qty: number(row[amountCol]),
      formula_percent: normalizePercent(row[percentCol]),
      batch_qty: number(row[amountCol]),
      unit: "grams",
      vendor: "",
      notes: [clean(row[amountAddedCol]) && `Amount added: ${clean(row[amountAddedCol])}`, clean(row[performedByCol]) && `Performed by: ${clean(row[performedByCol])}`].filter(Boolean).join("; ")
    });
  }

  const instructionStart = rows.findIndex((row) => row.map(key).join(" ").includes("work instructions"));
  const steps = [];
  if (instructionStart >= 0) {
    for (let i = instructionStart + 1; i < rows.length; i += 1) {
      const text = rows[i].map(clean).filter(Boolean).join(" ");
      if (text && !/^©|technical support|phone|email/i.test(text)) {
        steps.push({ sort_order: steps.length + 1, instruction_text: text });
      }
    }
  }

  const recipe = {
    name: titleParts.name,
    product_type: titleParts.product_type,
    flavor: titleParts.flavor,
    batch_size: batchSize,
    batch_size_mode: "grams",
    batch_unit: "grams",
    unit_weight: unitWeight,
    unit_weight_unit: "grams",
    target_mg_per_unit: target,
    potency_percent: potency,
    active_additives: extractAdditiveInputs(rows, ingredients),
    ingredients,
    steps,
    notes: [`Imported variant from sheet: ${sheetName}`],
    calculations: {}
  };
  if (!recipe.active_additives.length) {
    recipe.active_additives = importedActiveAdditives(ingredients, target, potency);
  }
  recipe.calculations = calculateRecipe(recipe, ingredients);
  recipe.ingredients = recipe.calculations.ingredients;
  return recipe;
}

function parseGummyWorkbook(workbook) {
  return workbook.SheetNames
    .filter((sheetName) => {
      const rows = readSheet(workbook, sheetName).slice(0, 40);
      const text = rows.flat().map(key).join(" | ");
      return text.includes("batch size") && text.includes("ingredient") && text.includes("amount to add");
    })
    .map((sheetName) => parseGummySheet(workbook, sheetName));
}

function parseWorkbook(buffer, inventoryNames = []) {
  const workbook = XLSX.read(buffer, { type: "buffer", cellFormula: true, cellDates: true });
  const detected_format = detectWorkbookFormat(workbook);
  const recipes = detected_format === "stick-rub"
    ? parseStickRubWorkbook(workbook)
    : detected_format === "gummy"
      ? parseGummyWorkbook(workbook)
      : [];
  const matchedRecipes = inventoryNames.length ? applyIngredientMatches(recipes, inventoryNames) : recipes;
  matchedRecipes.forEach((recipe) => {
    (recipe.ingredients || []).forEach((ingredient) => {
      if (!isGenericAdditivePlaceholder(ingredient.original_ingredient_name)) return;
      ingredient.ingredient_name = ingredient.original_ingredient_name;
      ingredient.match_status = "review";
      ingredient.match_confidence = 0;
    });
    (recipe.active_additives || []).forEach((additive) => {
      const ingredient = recipe.ingredients[Number(additive.ingredient_index)];
      if (ingredient) additive.ingredient_name = ingredient.ingredient_name || additive.ingredient_name || "";
    });
    recipe.calculations = calculateRecipe(recipe, recipe.ingredients);
    recipe.ingredients = recipe.calculations.ingredients;
  });
  return {
    detected_format,
    sheet_names: workbook.SheetNames,
    recipes: matchedRecipes
  };
}

module.exports = {
  parseWorkbook,
  parseStickRubWorkbook,
  parseGummyWorkbook,
  detectWorkbookFormat
};
