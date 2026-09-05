import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
const root=join(import.meta.dirname,'..','assets','models');
for(const name of ['wall-module','district-building','cargo-crate','relay-terminal','lamp-post','service-drone']) test(`${name} is portable glTF`,async()=>{
  const model=JSON.parse(await readFile(join(root,`${name}.gltf`),'utf8'));
  assert.equal(model.asset.version,'2.0'); assert.equal(model.scenes.length,1); assert.ok(model.materials[0].pbrMetallicRoughness);
  const uv=model.accessors[2]; assert.deepEqual(uv.min,[0,0]); assert.deepEqual(uv.max,[1,1]);
});
