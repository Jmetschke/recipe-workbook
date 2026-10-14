// Shared by the browser and server so saved and printed jar quantities agree.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.ResinBlend = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const TYPE = "Resin Blend Calculator";
  const present = (value) => value !== null && value !== undefined && String(value).trim() !== "";
  const finite = (value) => present(value) && Number.isFinite(Number(value));
  const percentValid = (value) => finite(value) && Number(value) >= 0 && Number(value) <= 100;

  function calculate(recipe) {
    const input = recipe.resin_blend || {};
    const oils = Array.isArray(input.oils) ? input.oils : [];
    const terpenes = Array.isArray(input.terpenes) ? input.terpenes : [];
    const errors = [];
    const jars = Number(input.jar_count);
    if (!Number.isSafeInteger(jars) || jars < 1) errors.push("Enter a whole number of jars greater than zero.");
    if (!oils.length) errors.push("Add at least one oil.");
    oils.forEach((oil, index) => {
      if (!String(oil.name || "").trim()) errors.push(`Oil ${index + 1}: enter a name.`);
      if (!finite(oil.grams) || Number(oil.grams) <= 0) errors.push(`Oil ${index + 1}: enter an amount greater than zero grams.`);
      for (const [key, label] of [["potency_percent", "potency"], ["terpene_percent", "terpene"]]) {
        if (present(oil[key]) && !percentValid(oil[key])) errors.push(`Oil ${index + 1}: ${label} % must be between 0 and 100.`);
      }
    });
    const targetMode = input.terpene_mode === "target";
    const hasTarget = present(input.target_terpene_percent);
    const target = hasTarget ? Number(input.target_terpene_percent) : null;
    const oilTotal = oils.reduce((sum, oil) => sum + (finite(oil.grams) && Number(oil.grams) > 0 ? Number(oil.grams) : 0), 0);
    const potencyKnown = oils.length > 0 && oils.every((oil) => percentValid(oil.potency_percent));
    const terpenesKnown = oils.length > 0 && oils.every((oil) => percentValid(oil.terpene_percent));
    const weighted = (key) => oils.reduce((sum, oil) => sum + Number(oil.grams) * Number(oil[key]) / 100, 0);
    const existingTerpenes = terpenesKnown ? weighted("terpene_percent") : null;
    const startingTerpenePercent = terpenesKnown && oilTotal > 0 ? existingTerpenes / oilTotal * 100 : null;
    const linePercentTotal = terpenes.reduce((sum, row) => sum + (percentValid(row.percent) ? Number(row.percent) : 0), 0);
    let addedGrams = 0;
    if (targetMode) {
      if (hasTarget && (!percentValid(target) || target >= 100)) errors.push("Target total terpene % must be at least 0 and less than 100.");
      if (hasTarget && !terpenesKnown) errors.push("Enter terpene % for every distillate and resin to calculate the target. Enter 0 for a known zero; blank values are unknown.");
      if (!hasTarget && terpenes.length) errors.push("Enter a target total terpene % to calculate the added terpene lines.");
      if (hasTarget && percentValid(target) && target < 100 && terpenesKnown && oilTotal > 0) {
        if (target < startingTerpenePercent - 1e-10) errors.push("The oils already exceed the target terpene %. Adding terpenes cannot lower it. Change the oil blend or raise the target.");
        else addedGrams = Math.max(0, (target / 100 * oilTotal - existingTerpenes) / (1 - target / 100));
      }
    } else {
      if (linePercentTotal >= 100) errors.push("Added terpene percentages must total less than 100% of the final blend.");
      else addedGrams = oilTotal / (1 - linePercentTotal / 100) - oilTotal;
    }
    const finalTotal = oilTotal + addedGrams;
    if (!Number.isFinite(finalTotal)) errors.push("The total amount is too large to calculate.");
    // Expose the required total even while the user is still splitting it among terpene lines.
    const additionReady = errors.length === 0;
    terpenes.forEach((row, index) => {
      if (!String(row.name || "").trim()) errors.push(`Added terpene ${index + 1}: enter a name.`);
      if (!percentValid(row.percent) || Number(row.percent) <= 0) errors.push(`Added terpene ${index + 1}: enter a percentage greater than zero and ${targetMode ? "no more than 100" : "below 100"}.`);
    });
    if (targetMode && (terpenes.length || addedGrams > 0) && Math.abs(linePercentTotal - 100) > 1e-6) {
      errors.push("Split the required terpene addition among one or more terpene lines. Their shares must total 100% of the terpene blend.");
    }
    const valid = errors.length === 0;
    const addedPercent = finalTotal > 0 ? addedGrams / finalTotal * 100 : 0;
    const ingredients = valid ? [
      ...oils.map((oil) => ({ ingredient_name: oil.name.trim(), blend_kind: oil.kind === "distillate" ? "Distillate" : oil.kind === "resin" ? "Resin" : "Oil", batch_qty: Number(oil.grams),
        potency_percent: present(oil.potency_percent) ? Number(oil.potency_percent) : null,
        terpene_percent: present(oil.terpene_percent) ? Number(oil.terpene_percent) : null, metrc_number: String(oil.metrc_number || "") })),
      ...terpenes.map((row) => ({ ingredient_name: row.name.trim(), blend_kind: "Added terpene", batch_qty: (targetMode ? addedGrams : finalTotal) * Number(row.percent) / 100,
        potency_percent: 0, terpene_percent: 100, metrc_number: String(row.metrc_number || "") }))
    ].map((row, index) => ({ ...row, sort_order: index + 1, unit: "grams", formula_qty: row.batch_qty,
      formula_percent: row.batch_qty / finalTotal, per_jar_grams: row.batch_qty / jars })) : [];
    return {
      valid, errors, warnings: [], ingredients, active_additives: [],
      jar_count: valid ? jars : null,
      terpene_mode: targetMode ? "target" : "addition",
      target_terpene_percent: targetMode && hasTarget && percentValid(target) ? target : null,
      starting_terpene_percent: startingTerpenePercent,
      existing_terpene_grams: existingTerpenes,
      required_terpene_grams: additionReady ? addedGrams : null,
      required_terpene_per_jar_grams: additionReady ? addedGrams / jars : null,
      terpene_share_total: linePercentTotal,
      oil_total_grams: Number.isFinite(oilTotal) ? oilTotal : 0,
      added_terpene_percent: addedPercent,
      added_terpene_grams: valid ? finalTotal - oilTotal : null,
      total_batch_grams: valid ? finalTotal : 0,
      final_batch_grams: valid ? finalTotal : 0,
      per_jar_grams: valid ? finalTotal / jars : null,
      oil_per_jar_grams: valid ? oilTotal / jars : null,
      estimated_potency_percent: valid && potencyKnown ? weighted("potency_percent") / finalTotal * 100 : null,
      estimated_terpene_percent: valid && terpenesKnown ? (weighted("terpene_percent") + finalTotal - oilTotal) / finalTotal * 100 : null,
      formula_total: valid ? finalTotal : 0, batch_total: valid ? finalTotal : 0, percent_total: valid ? 1 : 0,
      theoretical_yield: valid ? jars : 0, real_yield: valid ? jars : 0, yield_unit: "jars", yield_loss_percent: 0,
      theoretical_batch_grams: valid ? finalTotal : 0, real_batch_grams: valid ? finalTotal : 0
    };
  }
  return { TYPE, calculate };
});
