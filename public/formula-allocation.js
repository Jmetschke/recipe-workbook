(function (root) {
  function allocateFormula(ingredients, additives, total) {
    const fixed = new Map();
    for (const row of additives) {
      if (row.ingredient_index === '' || row.ingredient_index == null) continue;
      const index = Number(row.ingredient_index);
      if (!Number.isInteger(index) || !ingredients[index]) continue;
      fixed.set(index, (fixed.get(index) || 0) + Number(row.calculated_grams || 0));
    }
    if (!fixed.size || total <= 0) return 0;
    const remaining = total - [...fixed.values()].reduce((sum, qty) => sum + qty, 0);
    if (remaining < 0) throw new Error('Calculated additives exceed the total batch weight. Check the target dose and potency.');
    const adjustable = ingredients.map((_, i) => i).filter(i => !fixed.has(i));
    // Percentages are the formula's source of truth; quantities are a legacy fallback.
    const hasPercent = adjustable.some(i => Number(ingredients[i].formula_percent) > 0);
    const weights = ingredients.map(item => {
      const value = Number(hasPercent ? item.formula_percent : item.formula_qty) || 0;
      return hasPercent && value > 1 ? value / 100 : value;
    });
    const basis = adjustable.reduce((sum, i) => sum + weights[i], 0);
    if (remaining > 0 && basis <= 0) throw new Error('Enter formula percentages or quantities before recalculating. Ingredient proportions cannot be determined.');
    ingredients.forEach((item, i) => {
      const qty = fixed.has(i) ? fixed.get(i) : basis > 0 ? remaining * weights[i] / basis : 0;
      item.batch_qty = qty;
      item.formula_qty = qty;
      item.formula_percent = total > 0 ? qty / total : 0;
      item.unit = item.unit || 'grams';
      if (fixed.has(i)) item.notes = item.notes || 'Active/additive calculated from target dose and potency.';
    });
    return fixed.size;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { allocateFormula };
  else root.allocateFormula = allocateFormula;
})(typeof globalThis !== 'undefined' ? globalThis : this);
