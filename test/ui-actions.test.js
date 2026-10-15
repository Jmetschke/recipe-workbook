const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function fixture() {
  const messages=[];
  const context={showToast:message=>messages.push(message)};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(require.resolve('../public/ui-actions.js'),'utf8'),context);
  const button=()=>({disabled:false,dataset:{},attrs:{},setAttribute(k,v){this.attrs[k]=v},removeAttribute(k){delete this.attrs[k]}});
  const event={preventDefault(){this.prevented=true}};
  return {...context,button,event,messages};
}

test('async buttons run once while pending and restore their original state after failure', async()=>{
  const {bindAction,button,event,messages}=fixture();
  const control=button();let calls=0,reject;
  bindAction(control,()=>{calls++;return new Promise((resolve,r)=>reject=r)});
  const pending=control.onclick(event);control.onclick(event);
  assert.equal(calls,1);assert.equal(control.disabled,true);assert.equal(control.attrs['aria-busy'],'true');
  reject(new Error('Save failed'));await pending;
  assert.deepEqual(messages,['Save failed']);assert.equal(control.disabled,false);
  bindAction(control,()=>{calls++;return Promise.resolve()});await control.onclick(event);
  assert.equal(calls,2);assert.equal(control.disabled,false);
});

test('rebinding replaces the previous click handler rather than accumulating commands',()=>{
  const {bindAction,button,event}=fixture();const control=button();let calls=0;
  bindAction(control,()=>calls+=100);bindAction(control,()=>calls++);
  control.onclick(event);assert.equal(calls,1);
});

test('form submission prevents duplicate requests, including keyboard submission',async()=>{
  const {bindSubmit,button,event}=fixture();const form=button(),submitter=button();let calls=0,resolve;
  bindSubmit(form,e=>{e.preventDefault();calls++;return new Promise(r=>resolve=r)});
  const pending=form.onsubmit({...event,submitter});form.onsubmit(event);
  assert.equal(calls,1);assert.equal(submitter.disabled,true);
  resolve();await pending;assert.equal(submitter.disabled,false);
});

test('recipe write controls stay disabled together and preserve previously disabled controls',async()=>{
  const {bindAction,button,event}=fixture();const save=button(),publish=button(),locked=button();locked.disabled=true;
  const controls=[save,publish,locked];save.dataset.writeAction='';save.ownerDocument={querySelectorAll:()=>controls};
  let resolve;bindAction(save,()=>new Promise(r=>resolve=r));const pending=save.onclick(event);
  assert(controls.every(c=>c.disabled));resolve();await pending;
  assert.equal(save.disabled,false);assert.equal(publish.disabled,false);assert.equal(locked.disabled,true);
});

test('handlers that manage their own disabled state do not leave buttons stuck',async()=>{
  const {bindAction,button,event}=fixture();const control=button();
  bindAction(control,async()=>{control.disabled=true;await Promise.resolve();control.disabled=false});
  await control.onclick(event);assert.equal(control.disabled,false);
});
