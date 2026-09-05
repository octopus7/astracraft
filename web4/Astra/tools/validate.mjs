import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url);
const counts=[];
for(const mode of ['low','detail']){
  const bytes=await readFile(new URL(`assets/models/cozy-village-${mode}.glb`,root));
  assert.equal(bytes.toString('utf8',0,4),'glTF');
  const doc=JSON.parse(bytes.toString('utf8',20,20+bytes.readUInt32LE(12)));
  const unique=doc.materials.findIndex(m=>m.name==='Cottage_Facade_Unique_One_To_One');assert.ok(unique>=0);
  const wall=doc.nodes.find(n=>n.name.startsWith('Cottage_Walls'));
  const primitive=doc.meshes[wall.mesh].primitives.find(p=>p.material===unique);assert.ok(primitive);
  assert.ok(primitive.attributes.TEXCOORD_0!==undefined);
  assert.ok(doc.materials[unique].pbrMetallicRoughness.baseColorTexture);
  assert.ok(doc.images.length>=10,'Embedded ImageGen and derived images missing');
  counts.push(doc.meshes.length);
  console.log(mode,doc.meshes.length,'meshes',doc.images.length,'embedded textures',bytes.length,'bytes; unique facade OK');
}
assert.ok(counts[1]>counts[0]*2,'Detail geometry must differ materially');
