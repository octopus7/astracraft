import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const output = join(here, '..', 'assets', 'models');
await mkdir(output, { recursive: true });

const models = {
  'wall-module': [
    box([0, 1.7, 0], [4, 3.4, .55], 'charcoal'),
    box([-1.45, 3.65, 0], [.42, .5, .72], 'concrete'), box([0, 3.65, 0], [.42, .5, .72], 'concrete'), box([1.45, 3.65, 0], [.42, .5, .72], 'concrete'),
    box([0, 1.75, .34], [1.6, .13, .15], 'rust')
  ],
  'district-building': [
    box([0, 1.7, 0], [5.8, 3.4, 4.3], 'teal'), box([0, 3.65, 0], [6.2, .5, 4.7], 'charcoal'),
    box([-2.55, 1.3, 2.22], [.34, 2.1, .2], 'rust'), box([2.55, 1.3, 2.22], [.34, 2.1, .2], 'rust'),
    box([0, 1.75, 2.25], [2.2, 1.45, .16], 'charcoal'), box([0, 2.57, 2.3], [2.7, .12, .18], 'rust'),
    box([-1.45, 3.95, -.7], [1.2, .35, 1.2], 'charcoal'), box([1.55, 4.05, .65], [.8, .55, .8], 'charcoal')
  ],
  'cargo-crate': [
    box([0, .62, 0], [1.25, 1.25, 1.25], 'rust'), box([0, 1.31, 0], [1.38, .13, 1.38], 'charcoal'),
    box([0, -.01, 0], [1.38, .13, 1.38], 'charcoal'), box([0, .62, .66], [.72, .34, .08], 'teal')
  ],
  'relay-terminal': [
    box([0, .18, 0], [1.35, .36, 1.1], 'concrete'), box([0, 1.15, 0], [.9, 1.6, .72], 'teal'),
    box([0, 1.55, .39], [.68, .55, .06], 'charcoal'), box([0, 2.12, 0], [1.1, .16, .92], 'rust'),
    box([0, .72, .41], [.42, .12, .05], 'rust')
  ],
  'lamp-post': [
    box([0, .12, 0], [.7, .24, .7], 'concrete'), box([0, 1.8, 0], [.22, 3.4, .22], 'charcoal'),
    box([0, 3.48, 0], [.75, .22, .4], 'rust'), box([0, 3.25, .13], [.5, .3, .16], 'teal')
  ],
  'service-drone': [
    box([0, .48, 0], [1.05, .55, 1.35], 'teal'), box([0, .84, -.12], [.66, .22, .78], 'charcoal'),
    box([0, .5, .72], [.52, .28, .12], 'rust'), box([-.72, .38, 0], [.42, .2, .7], 'charcoal'), box([.72, .38, 0], [.42, .2, .7], 'charcoal'),
    box([-.78, .16, -.24], [.26, .34, .26], 'rust'), box([-.78, .16, .38], [.26, .34, .26], 'rust'),
    box([.78, .16, -.24], [.26, .34, .26], 'rust'), box([.78, .16, .38], [.26, .34, .26], 'rust'),
    box([0, .98, -.24], [.1, .42, .1], 'rust')
  ]
};

for (const [name, parts] of Object.entries(models)) await exportGltf(name, parts);
console.log(`Generated ${Object.keys(models).length} glTF 2.0 models in ${output}`);

function box(center, size, region) { return { center, size, region }; }

async function exportGltf(name, parts) {
  const pos = [], normal = [], uv = [], index = [];
  const regionFaces = Object.fromEntries(['charcoal','rust','concrete','teal'].map(key => [key, parts.filter(p => p.region === key).length * 6]));
  const cursor = { charcoal: 0, rust: 0, concrete: 0, teal: 0 };
  const faces = [
    { n:[1,0,0], c:[[1,-1,-1],[1,1,-1],[1,1,1],[1,-1,1]] }, { n:[-1,0,0], c:[[-1,-1,1],[-1,1,1],[-1,1,-1],[-1,-1,-1]] },
    { n:[0,1,0], c:[[-1,1,-1],[-1,1,1],[1,1,1],[1,1,-1]] }, { n:[0,-1,0], c:[[-1,-1,1],[-1,-1,-1],[1,-1,-1],[1,-1,1]] },
    { n:[0,0,1], c:[[1,-1,1],[1,1,1],[-1,1,1],[-1,-1,1]] }, { n:[0,0,-1], c:[[-1,-1,-1],[-1,1,-1],[1,1,-1],[1,-1,-1]] }
  ];
  for (const part of parts) for (const face of faces) {
    const base = pos.length / 3;
    for (const c of face.c) {
      pos.push(part.center[0] + c[0] * part.size[0] / 2, part.center[1] + c[1] * part.size[1] / 2, part.center[2] + c[2] * part.size[2] / 2);
      normal.push(...face.n);
    }
    const rect = uvRect(part.region, cursor[part.region]++, regionFaces[part.region]);
    uv.push(rect[0],rect[1], rect[0],rect[3], rect[2],rect[3], rect[2],rect[1]);
    index.push(base,base+1,base+2, base,base+2,base+3);
  }
  const chunks = [];
  const add = (typed) => { const pad = (4 - (typed.byteLength % 4)) % 4; const data = Buffer.concat([Buffer.from(typed.buffer), Buffer.alloc(pad)]); const offset = chunks.reduce((n,b)=>n+b.length,0); chunks.push(data); return { offset, length: typed.byteLength }; };
  const p = add(new Float32Array(pos)), n = add(new Float32Array(normal)), u = add(new Float32Array(uv)), i = add(new Uint16Array(index));
  const bounds = [0,1,2].map(axis => { const values=[]; for(let x=axis;x<pos.length;x+=3) values.push(pos[x]); return [Math.min(...values),Math.max(...values)]; });
  const gltf = {
    asset:{ version:'2.0', generator:'AstraCraft procedural modular asset generator' },
    extensionsUsed:['KHR_materials_specular'],
    scene:0, scenes:[{ nodes:[0] }], nodes:[{ name, mesh:0 }],
    meshes:[{ name, primitives:[{ attributes:{ POSITION:0, NORMAL:1, TEXCOORD_0:2 }, indices:3, material:0 }] }],
    materials:[{ name:'RainCourt_Atlas_PBR', pbrMetallicRoughness:{ baseColorTexture:{ index:0 }, metallicFactor:.45, roughnessFactor:.73 }, extensions:{ KHR_materials_specular:{ specularFactor:.55 } } }],
    textures:[{ sampler:0, source:0 }], images:[{ uri:'../textures/material-atlas.png', mimeType:'image/png' }], samplers:[{ magFilter:9729, minFilter:9987, wrapS:10497, wrapT:10497 }],
    buffers:[{ uri:`${name}.bin`, byteLength:chunks.reduce((n,b)=>n+b.length,0) }],
    bufferViews:[
      { buffer:0, byteOffset:p.offset, byteLength:p.length, target:34962 }, { buffer:0, byteOffset:n.offset, byteLength:n.length, target:34962 },
      { buffer:0, byteOffset:u.offset, byteLength:u.length, target:34962 }, { buffer:0, byteOffset:i.offset, byteLength:i.length, target:34963 }
    ],
    accessors:[
      { bufferView:0, componentType:5126, count:pos.length/3, type:'VEC3', min:bounds.map(v=>v[0]), max:bounds.map(v=>v[1]) },
      { bufferView:1, componentType:5126, count:normal.length/3, type:'VEC3' }, { bufferView:2, componentType:5126, count:uv.length/2, type:'VEC2', min:[0,0], max:[1,1] },
      { bufferView:3, componentType:5123, count:index.length, type:'SCALAR', min:[0], max:[Math.max(...index)] }
    ],
    extras:{ coordinateSystem:'Y-up, right-handed', units:'meters', uvLayout:'Non-overlapping face islands inside four atlas quadrants; 0-1 range', license:'Project original asset' }
  };
  await writeFile(join(output, `${name}.bin`), Buffer.concat(chunks));
  await writeFile(join(output, `${name}.gltf`), JSON.stringify(gltf, null, 2));
}

function uvRect(region, slot, total) {
  const quadrant = { charcoal:[0,.5,.5,1], rust:[.5,.5,1,1], concrete:[0,0,.5,.5], teal:[.5,0,1,.5] }[region];
  const grid = Math.ceil(Math.sqrt(total));
  const col = slot % grid, row = Math.floor(slot / grid), inset = .002;
  const w = .5 / grid, h = .5 / grid;
  return [quadrant[0]+col*w+inset, quadrant[1]+row*h+inset, quadrant[0]+(col+1)*w-inset, quadrant[1]+(row+1)*h-inset];
}
