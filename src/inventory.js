const INVENTORY_INGREDIENTS = [
  "Marshmallow Fluff",
  "Chocolate Chips",
  "Food Coloring - Purple",
  "Meringue Powder",
  "Food Coloring - White",
  "Baby Candy Bits",
  "Candy Bits",
  "Sanding Sugar Mixture (M2M)",
  "Sodium Citrate",
  "Grape Abstrax Terps",
  "Mango Abstrax Terps",
  "Lemon Abstrax Terps",
  "Watermelon Abstrax Terps",
  "Lychee Abstrax Terps",
  "Strawberry Jam Abstrax Terps",
  "Dragon Fruit Abstrax Terps",
  "Peach Abstrax Terps",
  "Passionfruit Abstrax Terps",
  "Cherry Abstrax Terps",
  "Crimson Toro (Cranberry/Pomegrante) Abstrax Terps",
  "Citric Acid Solution (M2M)",
  "Sucralose Liquid",
  "Monkfruit",
  "Malic Acid",
  "Canola Oil",
  "Chocolate Frosting",
  "Sugar Free Candy Bits",
  "Powdered Sugar",
  "Citric Acid",
  "Distilled Water",
  "Whoppie Cookie",
  "Sodium Benzoate",
  "MCT Oil",
  "Abstrax Triple Citrus",
  "Abstrax Watermelon",
  "Abstrax Blue Razz",
  "Flavor - Peppermint",
  "Flavor - Blue Raspberry",
  "Green Apple Pucks",
  "Mango Pucks",
  "Blue Raspberry Pucks",
  "Watermelon Pucks",
  "Pineapple Pectin",
  "Strawberry Pectin",
  "Watermelon Sugar Free Pectin",
  "Concentrate - CBD Isolate",
  "Concentrate - CBN Isolate",
  "Concentrate - CBG Isolate",
  "Concentrate - THC-V Resin",
  "coco butter",
  "shea butter",
  "stearic acid",
  "e-wax",
  "bees wax",
  "sweet almond oil",
  "apricot seed oil",
  "coconut oil",
  "menthol",
  "vitamin e oil",
  "peppermint",
  "lavender",
  "eucalyptus",
  "clove",
  "black pepper",
  "camphor",
  "copaiba"
];

function normalizeIngredientName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/™|®/g, "")
    .replace(/melt-to-make/g, "m2m")
    .replace(/\band\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value) {
  return normalizeIngredientName(value).split(" ").filter(Boolean);
}

function levenshtein(a, b) {
  const left = normalizeIngredientName(a);
  const right = normalizeIngredientName(b);
  if (!left && !right) return 0;
  if (!left) return right.length;
  if (!right) return left.length;
  const prev = Array.from({ length: right.length + 1 }, (_, index) => index);
  const curr = Array.from({ length: right.length + 1 }, () => 0);
  for (let i = 1; i <= left.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      curr[j] = left[i - 1] === right[j - 1]
        ? prev[j - 1]
        : Math.min(prev[j - 1], prev[j], curr[j - 1]) + 1;
    }
    for (let j = 0; j <= right.length; j += 1) prev[j] = curr[j];
  }
  return prev[right.length];
}

function scoreIngredientMatch(importedName, inventoryName) {
  const imported = normalizeIngredientName(importedName);
  const inventory = normalizeIngredientName(inventoryName);
  if (!imported || !inventory) return 0;
  if (imported === inventory) return 1;
  if (imported.includes(inventory) || inventory.includes(imported)) {
    return Math.min(imported.length, inventory.length) / Math.max(imported.length, inventory.length);
  }
  const importedTokens = tokens(importedName);
  const inventoryTokens = tokens(inventoryName);
  const overlap = importedTokens.filter((token) => inventoryTokens.includes(token)).length;
  const tokenScore = overlap / Math.max(importedTokens.length, inventoryTokens.length, 1);
  const importedCoverage = overlap / Math.max(importedTokens.length, 1);
  const coverageScore = overlap ? importedCoverage * 0.74 : 0;
  const distance = levenshtein(imported, inventory);
  const editScore = 1 - distance / Math.max(imported.length, inventory.length, 1);
  const weightedEdit = imported.length <= 6 ? editScore * 0.55 : editScore * 0.9;
  return Math.max(tokenScore, coverageScore, weightedEdit);
}

function bestIngredientMatch(importedName, inventoryNames = INVENTORY_INGREDIENTS) {
  let best = { name: importedName || "", confidence: 0, status: "review" };
  for (const inventoryName of inventoryNames) {
    const confidence = scoreIngredientMatch(importedName, inventoryName);
    if (confidence > best.confidence) {
      best = {
        name: inventoryName,
        confidence,
        status: confidence >= 0.82 ? "matched" : "review"
      };
    }
  }
  return best;
}

function applyIngredientMatches(recipes, inventoryNames = INVENTORY_INGREDIENTS) {
  return recipes.map((recipe) => ({
    ...recipe,
    ingredients: (recipe.ingredients || []).map((ingredient) => {
      const original = ingredient.original_ingredient_name || ingredient.ingredient_name || "";
      const match = bestIngredientMatch(original, inventoryNames);
      return {
        ...ingredient,
        original_ingredient_name: original,
        ingredient_name: match.name || original,
        match_confidence: Number(match.confidence.toFixed(4)),
        match_status: match.status
      };
    })
  }));
}

module.exports = {
  INVENTORY_INGREDIENTS,
  normalizeIngredientName,
  bestIngredientMatch,
  applyIngredientMatches
};
