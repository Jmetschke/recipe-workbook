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
  const costSheet = workbook.SheetNames.find((name) => key(name).includes("cost"));
  const rows = readSheet(workbook, recipeSheet);
  const headerIndex = findRow(rows, ["trade name", "formula", "batch"]);
  const header = rows[headerIndex] || [];
  const col = (contains) => header.findIndex((cell) => key(cell).includes(contains));
  const nameCol = col("trade name");
  const descCol = col("description");
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
      description: clean(row[descCol]),
      formula_qty: number(row[formulaCol]),
      formula_percent: normalizePercent(row[percentCol]),
      batch_qty: number(row[batchCol]),
      unit: "grams",
      phase: "",
      vendor: "",
      lot_number: clean(row[vendorCol]),
      cost_per_unit: 0,
      calculated_cost: 0,
      notes: actualCol >= 0 && clean(row[actualCol]) ? `Actual qty: ${clean(row[actualCol])}` : ""
    });
  }

  if (costSheet) {
    const costRows = readSheet(workbook, costSheet);
    const costHeaderIndex = findRow(costRows, ["ingredient name", "price"]);
    const costHeader = costRows[costHeaderIndex] || [];
    const costNameCol = costHeader.findIndex((cell) => key(cell).includes("ingredient"));
    const costPerCol = costHeader.findIndex((cell) => key(cell).includes("price"));
    const calcCostCol = costHeader.findIndex((cell) => key(cell) === "cost");
    const sourceCol = costHeader.findIndex((cell) => key(cell).includes("source"));
    const costs = new Map();
    for (let i = costHeaderIndex + 1; i < costRows.length; i += 1) {
      const row = costRows[i];
      if (clean(row[costNameCol])) {
        costs.set(key(row[costNameCol]), {
          cost_per_unit: number(row[costPerCol]),
          calculated_cost: number(row[calcCostCol]),
          vendor: clean(row[sourceCol])
        });
      }
    }
    ingredients.forEach((item) => Object.assign(item, costs.get(key(item.ingredient_name)) || {}));
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
    batch_unit: "grams",
    unit_weight: 30,
    unit_weight_unit: "grams",
    target_mg_per_unit: 50,
    potency_percent: "",
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
      description: "",
      formula_qty: number(row[amountCol]),
      formula_percent: normalizePercent(row[percentCol]),
      batch_qty: number(row[amountCol]),
      unit: "grams",
      phase: /additive/i.test(ingredientName) ? "Active/Additive" : "Base",
      vendor: "",
      lot_number: "",
      cost_per_unit: 0,
      calculated_cost: 0,
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
    batch_unit: "grams",
    unit_weight: unitWeight,
    unit_weight_unit: "grams",
    target_mg_per_unit: target,
    potency_percent: potency,
    ingredients,
    steps,
    notes: [`Imported variant from sheet: ${sheetName}`],
    calculations: {}
  };
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
