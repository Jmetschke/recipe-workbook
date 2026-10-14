const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const ResinBlend = require('../public/resin-blend');
const { calculateRecipe } = require('../src/calculations');
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
const recipe = () => ({ recipe_card_type: ResinBlend.TYPE, resin_blend: { jar_count: 4,
  oils: [
    { name: 'Oil A', grams: 600, potency_percent: 80, terpene_percent: 2, metrc_number: '0000123' },
    { name: 'Oil B', grams: 350, potency_percent: 60, terpene_percent: 4 }
  ], terpenes: [] } });

test('unequal oil amounts are divided evenly across jars, preserving the ratio and all mass', () => {
  const c = ResinBlend.calculate(recipe());
  assert.equal(c.valid, true);
  close(c.total_batch_grams, 950);
  close(c.per_jar_grams, 237.5);
  close(c.ingredients[0].per_jar_grams, 150);
  close(c.ingredients[1].per_jar_grams, 87.5);
  close(c.estimated_potency_percent, 690 / 950 * 100);
  close(c.estimated_terpene_percent, 26 / 950 * 100);
  assert.equal(c.ingredients[0].metrc_number, '0000123');
  for (const line of c.ingredients) close(line.per_jar_grams * c.jar_count, line.batch_qty);
});

test('multiple added terpene lines use final blend weight and dilute potency', () => {
  const r = recipe();
  r.resin_blend.terpenes = [{ name: 'Terp A', percent: 3 }, { name: 'Terp B', percent: 2 }];
  const c = ResinBlend.calculate(r);
  close(c.total_batch_grams, 1000);
  close(c.added_terpene_grams, 50);
  close(c.per_jar_grams, 250);
  close(c.ingredients[2].per_jar_grams, 7.5);
  close(c.ingredients[3].per_jar_grams, 5);
  close(c.estimated_potency_percent, 69);
  close(c.estimated_terpene_percent, 7.6);
  close(c.ingredients.reduce((sum, i) => sum + i.batch_qty, 0), c.total_batch_grams);
});

test('missing values remain unknown, zero is known, and sub-one percentages are literal', () => {
  const r = recipe();
  r.resin_blend.oils[0].potency_percent = '';
  r.resin_blend.oils[1].terpene_percent = null;
  let c = ResinBlend.calculate(r);
  assert.equal(c.valid, true);
  assert.equal(c.estimated_potency_percent, null);
  assert.equal(c.estimated_terpene_percent, null);
  r.resin_blend.oils[0].potency_percent = 0;
  r.resin_blend.oils[1].potency_percent = 0.5;
  r.resin_blend.oils[1].terpene_percent = 0;
  c = ResinBlend.calculate(r);
  close(c.estimated_potency_percent, 350 * 0.005 / 950 * 100);
  close(c.estimated_terpene_percent, 12 / 950 * 100);
});

test('invalid inputs do not produce a misleading jar recipe', () => {
  for (const jar_count of [0, -1, 1.5, '', 'bad', Infinity]) {
    const r = recipe(); r.resin_blend.jar_count = jar_count;
    const c = ResinBlend.calculate(r);
    assert.equal(c.valid, false); assert.equal(c.ingredients.length, 0);
  }
  for (const percent of [100, 101, -1, '', 'bad']) {
    const r = recipe(); r.resin_blend.terpenes = [{ name: 'Terp', percent }];
    assert.equal(ResinBlend.calculate(r).valid, false);
  }
  const r = recipe(); r.resin_blend.terpenes = [{ name: 'A', percent: 50 }, { name: 'B', percent: 50 }];
  assert.equal(ResinBlend.calculate(r).valid, false);
  r.resin_blend.terpenes = [];
  r.resin_blend.oils[0].grams = -1;
  assert.equal(ResinBlend.calculate(r).valid, false);
  r.resin_blend.oils[0].grams = 600;
  r.resin_blend.oils[0].potency_percent = 101;
  assert.equal(ResinBlend.calculate(r).valid, false);
});

test('browser and server use identical calculations without changing existing recipe types', () => {
  const context = {};
  vm.runInNewContext(fs.readFileSync(require.resolve('../public/resin-blend'), 'utf8'), context);
  const r = recipe();
  assert.deepEqual(JSON.parse(JSON.stringify(context.ResinBlend.calculate(r))), calculateRecipe(r));
  const existing = calculateRecipe({ recipe_card_type: 'Edible/Topical', batch_size: 100 }, [{ formula_qty: 10, formula_percent: 1 }]);
  assert.equal(existing.ingredients[0].batch_qty, 100);
  assert.equal(existing.yield_loss_percent, 0.05);
});
