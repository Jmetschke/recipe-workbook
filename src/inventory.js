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
  "Bittermod",
  "Concentrate - THC RSO",
  "Concentrate - THC Distillate",
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

const INGREDIENT_DESIGNATIONS = [
  { ingredient_name: "Marshmallow Fluff", ingredient_type: "Hijnx", default_unit: "1.36kg Pail", gram_conversion: 1360 },
  { ingredient_name: "Chocolate Chips", ingredient_type: "Hijnx", default_unit: "10kg Box", gram_conversion: 10000 },
  { ingredient_name: "Food Coloring - Purple", ingredient_type: "Hijnx", default_unit: "10oz Bottle", gram_conversion: 283 },
  { ingredient_name: "Meringue Powder", ingredient_type: "Hijnx", default_unit: "12oz Bag", gram_conversion: 340 },
  { ingredient_name: "Food Coloring - White", ingredient_type: "Hijnx", default_unit: "12oz Bottle", gram_conversion: 340 },
  { ingredient_name: "Baby Candy Bits", ingredient_type: "Hijnx", default_unit: "13.6kg Box", gram_conversion: 13600 },
  { ingredient_name: "Candy Bits", ingredient_type: "Hijnx", default_unit: "13.6kg Box", gram_conversion: 13600 },
  { ingredient_name: "Sanding Sugar Mixture (M2M)", ingredient_type: "Hijnx", default_unit: "1400g Bag", gram_conversion: 1400 },
  { ingredient_name: "Sodium Citrate", ingredient_type: "Hijnx", default_unit: "32oz Pouch", gram_conversion: 907 },
  { ingredient_name: "Citric Acid Solution (M2M)", ingredient_type: "Hijnx", default_unit: "1500g Bottle", gram_conversion: 1500 },
  { ingredient_name: "Sucralose Liquid", ingredient_type: "Hijnx", default_unit: "16oz Bottle", gram_conversion: 473 },
  { ingredient_name: "Monkfruit", ingredient_type: "Hijnx", default_unit: "20kg Bag", gram_conversion: 20000 },
  { ingredient_name: "Malic Acid", ingredient_type: "Hijnx", default_unit: "25lb Bucket", gram_conversion: 11300 },
  { ingredient_name: "Canola Oil", ingredient_type: "Hijnx", default_unit: "35lb Jug", gram_conversion: 15500 },
  { ingredient_name: "Chocolate Frosting", ingredient_type: "Hijnx", default_unit: "4.80kg Pail", gram_conversion: 4800 },
  { ingredient_name: "Sugar Free Candy Bits", ingredient_type: "Hijnx", default_unit: "400oz Package", gram_conversion: 11340 },
  { ingredient_name: "Powdered Sugar", ingredient_type: "Hijnx", default_unit: "50lb Bag", gram_conversion: 22680 },
  { ingredient_name: "Citric Acid", ingredient_type: "Hijnx", default_unit: "50lb Bucket", gram_conversion: 22680 },
  { ingredient_name: "Distilled Water", ingredient_type: "Hijnx", default_unit: "5Gal Jug", gram_conversion: 3520 },
  { ingredient_name: "Whoppie Cookie", ingredient_type: "Hijnx", default_unit: "810ct Box", gram_conversion: 8627 },
  { ingredient_name: "Sodium Benzoate", ingredient_type: "Hijnx", default_unit: "8oz Pouch", gram_conversion: 227 },
  { ingredient_name: "MCT Oil", ingredient_type: "Hijnx", default_unit: "MCT Gallon", gram_conversion: 3520 },
  { ingredient_name: "Abstrax Triple Citrus", ingredient_type: "Hijnx", default_unit: "Abstrax Gallon", gram_conversion: 3834 },
  { ingredient_name: "Abstrax Watermelon", ingredient_type: "Hijnx", default_unit: "Abstrax Gallon", gram_conversion: 3834 },
  { ingredient_name: "Abstrax Blue Razz", ingredient_type: "Hijnx", default_unit: "Abstrax Gallon", gram_conversion: 3834 },
  { ingredient_name: "Flavor - Peppermint", ingredient_type: "Hijnx", default_unit: "Gram", gram_conversion: 1 },
  { ingredient_name: "Flavor - Blue Raspberry", ingredient_type: "Hijnx", default_unit: "Gram", gram_conversion: 1 },
  { ingredient_name: "Green Apple Pucks", ingredient_type: "Hijnx", default_unit: "Kilogram", gram_conversion: 1000 },
  { ingredient_name: "Mango Pucks", ingredient_type: "Hijnx", default_unit: "Kilogram", gram_conversion: 1000 },
  { ingredient_name: "Blue Raspberry Pucks", ingredient_type: "Hijnx", default_unit: "Kilogram", gram_conversion: 1000 },
  { ingredient_name: "Watermelon Pucks", ingredient_type: "Hijnx", default_unit: "Kilogram", gram_conversion: 1000 },
  { ingredient_name: "Pineapple Pectin", ingredient_type: "Hijnx", default_unit: "Kilogram", gram_conversion: 1000 },
  { ingredient_name: "Strawberry Pectin", ingredient_type: "Hijnx", default_unit: "Kilogram", gram_conversion: 1000 },
  { ingredient_name: "Watermelon Sugar Free Pectin", ingredient_type: "Hijnx", default_unit: "Kilogram", gram_conversion: 1000 },
  { ingredient_name: "Bittermod", ingredient_type: "Hijnx", default_unit: "Kilogram", gram_conversion: 1000 },
  { ingredient_name: "Grape Abstrax Terps", ingredient_type: "SB", default_unit: "Gram", gram_conversion: 1 },
  { ingredient_name: "Mango Abstrax Terps", ingredient_type: "SB", default_unit: "Gram", gram_conversion: 1 },
  { ingredient_name: "Lemon Abstrax Terps", ingredient_type: "SB", default_unit: "Gram", gram_conversion: 1 },
  { ingredient_name: "Watermelon Abstrax Terps", ingredient_type: "SB", default_unit: "Gram", gram_conversion: 1 },
  { ingredient_name: "Lychee Abstrax Terps", ingredient_type: "SB", default_unit: "Gram", gram_conversion: 1 },
  { ingredient_name: "Strawberry Jam Abstrax Terps", ingredient_type: "SB", default_unit: "Gram", gram_conversion: 1 },
  { ingredient_name: "Dragon Fruit Abstrax Terps", ingredient_type: "SB", default_unit: "Gram", gram_conversion: 1 },
  { ingredient_name: "Peach Abstrax Terps", ingredient_type: "SB", default_unit: "Gram", gram_conversion: 1 },
  { ingredient_name: "Passionfruit Abstrax Terps", ingredient_type: "SB", default_unit: "Gram", gram_conversion: 1 },
  { ingredient_name: "Cherry Abstrax Terps", ingredient_type: "SB", default_unit: "Gram", gram_conversion: 1 },
  { ingredient_name: "Crimson Toro (Cranberry/Pomegrante) Abstrax Terps", ingredient_type: "SB", default_unit: "Gram", gram_conversion: 1 },
  { ingredient_name: "Concentrate - THC RSO", ingredient_type: "Hijnx/Topicals", default_unit: "Gram", gram_conversion: 1 },
  { ingredient_name: "Concentrate - THC Distillate", ingredient_type: "SB", default_unit: "Gram", gram_conversion: 1 },
  { ingredient_name: "Concentrate - CBD Isolate", ingredient_type: "Hijnx/Topicals", default_unit: "Gram", gram_conversion: 1 },
  { ingredient_name: "Concentrate - CBN Isolate", ingredient_type: "Hijnx", default_unit: "Gram", gram_conversion: 1 },
  { ingredient_name: "Concentrate - CBG Isolate", ingredient_type: "Hijnx", default_unit: "Gram", gram_conversion: 1 },
  { ingredient_name: "Concentrate - THC-V Resin", ingredient_type: "Hijnx", default_unit: "Gram", gram_conversion: 1 },
  { ingredient_name: "coco butter", ingredient_type: "Topicals", default_unit: "Gram", gram_conversion: 1 },
  { ingredient_name: "shea butter", ingredient_type: "Topicals", default_unit: "Gram", gram_conversion: 1 },
  { ingredient_name: "stearic acid", ingredient_type: "Topicals", default_unit: "Gram", gram_conversion: 1 },
  { ingredient_name: "e-wax", ingredient_type: "Topicals", default_unit: "Gram", gram_conversion: 1 },
  { ingredient_name: "bees wax", ingredient_type: "Topicals", default_unit: "Gram", gram_conversion: 1 },
  { ingredient_name: "sweet almond oil", ingredient_type: "Topicals", default_unit: "Gram", gram_conversion: 1 },
  { ingredient_name: "apricot seed oil", ingredient_type: "Topicals", default_unit: "Gram", gram_conversion: 1 },
  { ingredient_name: "coconut oil", ingredient_type: "Topicals", default_unit: "Gram", gram_conversion: 1 },
  { ingredient_name: "menthol", ingredient_type: "Topicals", default_unit: "Gram", gram_conversion: 1 },
  { ingredient_name: "vitamin e oil", ingredient_type: "Topicals", default_unit: "Gram", gram_conversion: 1 },
  { ingredient_name: "peppermint", ingredient_type: "Topicals", default_unit: "Gram", gram_conversion: 1 },
  { ingredient_name: "lavender", ingredient_type: "Topicals", default_unit: "Gram", gram_conversion: 1 },
  { ingredient_name: "eucalyptus", ingredient_type: "Topicals", default_unit: "Gram", gram_conversion: 1 },
  { ingredient_name: "clove", ingredient_type: "Topicals", default_unit: "Gram", gram_conversion: 1 },
  { ingredient_name: "black pepper", ingredient_type: "Topicals", default_unit: "Gram", gram_conversion: 1 },
  { ingredient_name: "camphor", ingredient_type: "Topicals", default_unit: "Gram", gram_conversion: 1 },
  { ingredient_name: "copaiba", ingredient_type: "Topicals", default_unit: "Gram", gram_conversion: 1 }
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

function designationForIngredient(name) {
  const normalized = normalizeIngredientName(name);
  return INGREDIENT_DESIGNATIONS.find((item) => normalizeIngredientName(item.ingredient_name) === normalized) || null;
}

function applyIngredientMatches(recipes, inventoryNames = INVENTORY_INGREDIENTS) {
  return recipes.map((recipe) => ({
    ...recipe,
    ingredients: (recipe.ingredients || []).map((ingredient) => {
      const original = ingredient.original_ingredient_name || ingredient.ingredient_name || "";
      const match = bestIngredientMatch(original, inventoryNames);
      const designation = designationForIngredient(match.name);
      return {
        ...ingredient,
        original_ingredient_name: original,
        ingredient_name: match.name || original,
        ingredient_type: ingredient.ingredient_type || designation?.ingredient_type || "",
        unit: ingredient.unit || "grams",
        match_confidence: Number(match.confidence.toFixed(4)),
        match_status: match.status
      };
    })
  }));
}

module.exports = {
  INVENTORY_INGREDIENTS,
  INGREDIENT_DESIGNATIONS,
  normalizeIngredientName,
  bestIngredientMatch,
  designationForIngredient,
  applyIngredientMatches
};
