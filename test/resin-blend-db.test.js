const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'resin-blend-test-'));
// Always isolate these tests from both the developer's database and Turso.
process.env.DATABASE_PATH = path.join(dir, 'recipes.sqlite');
process.env.TURSO_DATABASE_URL = '';
process.env.TURSO_DATABASE_TOKEN = '';
const db = require('../src/db');
test.after(() => { db.client.close(); fs.rmSync(dir, { recursive: true, force: true }); });

test('blend inputs survive saving, duplication, and publication without altering historical jar recipes', async () => {
  await db.migrate();
  await db.migrate(); // Migration must remain safe on an existing database.
  const resin_blend = { jar_count: 4, oils: [
    { kind: 'distillate', name: 'Oil A', grams: 600, potency_percent: 80, terpene_percent: 2, metrc_number: '000123' },
    { kind: 'resin', name: 'Oil B', grams: 350, potency_percent: 60, terpene_percent: '' }
  ], terpenes: [{ name: 'Terp A', percent: 3, metrc_number: '000456' }, { name: 'Terp B', percent: 2 }] };
  const saved = await db.createRecipe({ name: 'Blend', recipe_card_type: 'Resin Blend Calculator', resin_blend,
    expected_production_date: '2026-10-20', steps: [{ instruction_text: 'Blend each jar.' }] });
  assert.deepEqual(saved.resin_blend, resin_blend);
  assert.equal(saved.batch_size, 1000);
  assert.equal(saved.calculations.per_jar_grams, 250);
  assert.equal(saved.calculations.estimated_terpene_percent, null);
  assert.equal(saved.ingredients.length, 4);
  await db.publishRecipe(saved.id);
  const [published] = await db.listVersions(saved.id);
  const modified = await db.updateRecipe(saved.id, { resin_blend: { ...resin_blend, jar_count: 5 }, copy_lock_formula: true });
  assert.equal(modified.copy_lock_formula, true);
  assert.equal(modified.calculations.per_jar_grams, 200);
  const historical = await db.getVersion(published.id);
  assert.equal(historical.calculations.jar_count, 4);
  assert.equal(historical.calculations.per_jar_grams, 250);
  assert.equal(historical.ingredients[0].metrc_number, '000123');
  assert.equal(historical.ingredients[0].blend_kind, 'Distillate');
  assert.equal(historical.ingredients[1].blend_kind, 'Resin');
  assert.equal(historical.ingredients[2].metrc_number, '000456');
  const duplicate = await db.duplicateRecipe(saved.id);
  assert.deepEqual(duplicate.resin_blend, modified.resin_blend);
  assert.equal(duplicate.calculations.per_jar_grams, 200);
  assert.equal(duplicate.copy_lock_formula, true);
  const draft = await db.unpublishRecipe(saved.id);
  assert.equal(draft.status, 'Draft');
  assert.equal(draft.resin_blend.oils[1].terpene_percent, '');
  const incomplete = await db.createRecipe({ name: 'Incomplete', recipe_card_type: 'Resin Blend Calculator',
    expected_production_date: '2026-10-20', resin_blend: { ...resin_blend, jar_count: 0 } });
  await assert.rejects(db.publishRecipe(incomplete.id), { statusCode: 400 });
  const regular = await db.createRecipe({ name: 'Regular', recipe_card_type: 'Edible/Topical', batch_size: 100,
    ingredients: [{ ingredient_name: 'Base', formula_qty: 100, formula_percent: 1 }] });
  assert.equal(regular.calculations.total_batch_grams, 100);
  assert.equal(regular.recipe_card_type, 'Edible/Topical');
});
