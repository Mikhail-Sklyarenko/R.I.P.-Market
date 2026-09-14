import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseSavedItems, savedItemsKey } from './saved-items.ts';
test('saved items tolerate invalid storage, deduplicate and drop stale prices', () => {
  assert.deepEqual(parseSavedItems('{'), []);
  assert.deepEqual(parseSavedItems('{}'), []);
  assert.deepEqual(parseSavedItems(JSON.stringify([null, {id:'a',ref:'slug',name:'Case',price:1}, {id:'a',ref:'other',name:'Duplicate'}])), [{id:'a',ref:'slug',name:'Case'}]);
});
test('saved lists have a limit and separate account namespaces', () => {
  assert.equal(parseSavedItems(JSON.stringify(Array.from({length:110},(_,i)=>({id:String(i),ref:String(i),name:'Case'})))).length,100);
  assert.notEqual(savedItemsKey('buyer'),savedItemsKey('seller'));
  assert.notEqual(savedItemsKey(),savedItemsKey('buyer'));
});
