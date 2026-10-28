const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'recipe-save-test-'));
process.env.DATABASE_PATH=path.join(dir,'test.sqlite');
process.env.TURSO_DATABASE_URL='';process.env.TURSO_DATABASE_TOKEN='';
const db=require('../src/db');
test.after(()=>{db.client.close();fs.rmSync(dir,{recursive:true,force:true});});

test('batch saves retain every ingredient and step, and failed replacement leaves existing children intact',async()=>{
 await db.migrate();
 const ingredients=Array.from({length:40},(_,index)=>({ingredient_name:`Save check ${index}`,formula_qty:index+1,formula_percent:(index+1)/820,notes:`Note ${index}`}));
 const steps=Array.from({length:10},(_,index)=>({instruction_text:`Step ${index}`}));
 const saved=await db.createRecipe({name:'Large save',batch_size:820,ingredients,steps});
 const updated=await db.updateRecipe(saved.id,{ingredients:ingredients.slice(0,30),steps:steps.slice(0,8)});
 assert.equal(updated.ingredients.length,30);assert.equal(updated.steps.length,8);
 assert.deepEqual(updated.ingredients.map(i=>i.ingredient_name),ingredients.slice(0,30).map(i=>i.ingredient_name));
 assert.equal(updated.ingredients[29].notes,'Note 29');
 await assert.rejects(db.updateRecipe(saved.id,{ingredients:[{ingredient_name:'Invalid row',formula_qty:1,notes:{invalid:'binding'}}]}));
 const after=await db.getRecipe(saved.id);
 assert.deepEqual(after.ingredients,updated.ingredients);assert.deepEqual(after.steps,updated.steps);
 const master=(await db.listIngredients()).find(i=>i.ingredient_name==='Save check 0');
 await db.deleteMasterIngredient(master.id);
 await db.updateRecipe(saved.id,{ingredients:updated.ingredients,steps:updated.steps});
 assert(!(await db.listIngredients()).some(i=>i.ingredient_name==='Save check 0'));
 assert.equal((await db.getRecipe(saved.id)).ingredients[0].ingredient_name,'Save check 0');
});

test('repeated and overlapping recalculations keep one copy of each ingredient and preserve ratios',async()=>{
 await db.migrate();
 const ingredients=[.7,.2,.09,.01].map((formula_percent,i)=>({ingredient_name:`Ratio ${i}`,formula_qty:0,formula_percent}));
 const recipe=await db.createRecipe({name:'Percentage-only formula',batch_size:100,batch_size_mode:'units',unit_weight:10,ingredients,active_additives:[{ingredient_index:3,target_mg_per_unit:100,potency_percent:100}]});
 for(const units of [200,200,50]) {
  await Promise.all(Array.from({length:3},()=>db.updateRecipe(recipe.id,{batch_size:units})));
  const saved=await db.getRecipe(recipe.id);
  assert.equal(saved.ingredients.length,4);
  assert.deepEqual(saved.ingredients.map(i=>i.ingredient_name),ingredients.map(i=>i.ingredient_name));
  saved.ingredients.forEach((row,i)=>assert.ok(Math.abs(row.batch_qty-units*10*ingredients[i].formula_percent)<1e-6));
 }
});
