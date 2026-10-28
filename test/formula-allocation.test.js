const test = require('node:test');
const assert = require('node:assert/strict');
const { allocateFormula } = require('../public/formula-allocation');
test('percentage-only formulas retain ratios through repeated unit changes', () => {
 const ingredients = [.7,.2,.09,.01].map(formula_percent => ({formula_percent,formula_qty:0}));
 for (const total of [1000,2000,2000,500]) {
  allocateFormula(ingredients,[{ingredient_index:3,calculated_grams:total*.01}],total);
  ingredients.forEach((row,i)=>assert.ok(Math.abs(row.batch_qty-total*[.7,.2,.09,.01][i])<1e-8));
  assert.equal(ingredients.length,4);
 }
});
test('blank additive match never replaces the first ingredient', () => {
 const ingredients=[{formula_percent:.9},{formula_percent:.1}];
 const before=structuredClone(ingredients);
 assert.equal(allocateFormula(ingredients,[{ingredient_index:'',calculated_grams:5}],100),0);
 assert.deepEqual(ingredients,before);
});
test('unknown proportions and excessive additives fail without changing ingredients', () => {
 for (const grams of [10,110]) {
  const ingredients=[{formula_qty:0},{formula_qty:0}];
  const before=structuredClone(ingredients);
  assert.throws(()=>allocateFormula(ingredients,[{ingredient_index:1,calculated_grams:grams}],100));
  assert.deepEqual(ingredients,before);
 }
});
