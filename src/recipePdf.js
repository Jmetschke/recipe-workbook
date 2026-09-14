const path = require("path");
const PDFDocument = require("pdfkit");

// Export stored publication data only. Never recalculate against a later draft.
function createRecipePdf(version) {
  return new Promise((resolve, reject) => {
    const recipe = version.recipe || {};
    const calculations = version.calculations || {};
    const doc = new PDFDocument({ size: "LETTER", margin: 48, info: {
      Title: `${recipe.name || "Recipe"} - ${version.version_number || "Published"}`,
      Subject: "Published recipe quantities and yield for nutrition analysis",
      Creator: "Recipe Workbook"
    } });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.font(path.join(__dirname, "../public/fonts/NotoSans-Regular.ttf"));

    function heading(title) {
      if (doc.y > 660) doc.addPage();
      doc.moveDown(0.6).fontSize(14).text(title).moveDown(0.3).fontSize(10);
    }
    function field(label, value) {
      const text = value === undefined || value === null || value === "" ? "Not recorded" : String(value);
      doc.text(`${label}: ${text}`, { lineGap: 2 });
    }
    function fields(value, prefix = "") {
      if (value && typeof value === "object") {
        const entries = Object.entries(value);
        if (!entries.length) field(prefix, "None recorded");
        for (const [key, item] of entries) fields(item, prefix ? `${prefix}.${key}` : key);
      } else field(prefix, value);
    }

    heading("Published Recipe Card");
    field("Recipe name", recipe.name);
    field("Publication ID", version.id);
    field("Version", version.version_number);
    field("Published date (as stored)", version.published_date);
    field("Published by", version.published_by);

    heading("Quantity and nutrition analysis guide");
    doc.text("Use each ingredient's batch_qty once, with its recorded unit, for the full batch. formula_qty and formula_percent describe the same formula; they are not additional ingredients. Stored numbers are exported without display rounding. Missing data is not zero.", { lineGap: 2 });
    doc.moveDown(0.5).text("Calculation fields ending in _grams are grams; _mg are milligrams. formula_percent, percent_total and yield_loss_percent are fractions (0.05 = 5%). Additive input potency_percent may use the entered percent format; use potency_fraction when present. Additive calculations describe ingredient contributions and must not automatically be added to the ingredient list again; ingredient_index is zero-based.", { lineGap: 2 });
    doc.moveDown(0.5).text("theoretical_yield and real_yield use yield_unit. Real yield is an estimate after the stored loss assumption, not measured output. Unit weight is not a confirmed nutrition serving size. Nutrient composition, supplier nutrition labels, actual finished yield, serving size and nutrient retention must be supplied separately when absent. Do not infer zero nutrients or uniform nutrient loss from manufacturing loss. This file contains recipe inputs, not calculated nutrition facts.", { lineGap: 2 });

    heading("Recipe details (published snapshot)");
    const { ingredients, steps, calculations: ignoredCalculations, active_additives, ...details } = recipe;
    fields(details);
    heading("Ingredients - full batch quantities");
    field("Ingredient count", (version.ingredients || []).length);
    (version.ingredients || []).forEach((item, index) => {
      heading(`Ingredient ${index + 1} (ingredient_index ${index})`);
      field("ingredient_name", item.ingredient_name);
      field("batch_qty", item.batch_qty);
      field("unit", item.unit);
      for (const [key, value] of Object.entries(item)) {
        if (!["ingredient_name", "batch_qty", "unit"].includes(key)) fields(value, key);
      }
    });
    heading("Calculation summary and additive details");
    const { ingredients: duplicateIngredients, ...summary } = calculations;
    fields(summary);
    heading("Recorded additive inputs (reference only, not extra ingredients)");
    fields(active_additives || [], "active_additives");
    heading("SOP / Process Instructions");
    fields(version.steps || [], "steps");
    doc.end();
  });
}

module.exports = { createRecipePdf };
