import { readFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=join(dirname(fileURLToPath(import.meta.url)),'..','assets');
const names=['wall-module','district-building','cargo-crate','relay-terminal','lamp-post','service-drone'];
for(const name of names){
  const gltf=JSON.parse(await readFile(join(root,'models',`${name}.gltf`),'utf8'));
  if(gltf.asset.version!=='2.0') throw new Error(`${name}: not glTF 2.0`);
  const uv=gltf.accessors[gltf.meshes[0].primitives[0].attributes.TEXCOORD_0];
  if(uv.min.some(v=>v<0)||uv.max.some(v=>v>1)) throw new Error(`${name}: UV outside 0-1`);
  const bytes=(await stat(join(root,'models',gltf.buffers[0].uri))).size;
  if(bytes!==gltf.buffers[0].byteLength) throw new Error(`${name}: buffer length mismatch`);
  if(gltf.images[0].uri!=='../textures/material-atlas.png') throw new Error(`${name}: atlas path mismatch`);
  console.log(`✓ ${name}: ${gltf.accessors[0].count} vertices, UV 0-1, ${bytes} bytes`);
}
