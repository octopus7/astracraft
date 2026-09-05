// Static deployment / embedded GLB validation. No npm installation required.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const origin = process.argv[2] || 'http://127.0.0.1:8313/xhigh/';
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const urls = [...new Set([...html.matchAll(/(?:href|src)="([^"]+)"/g)].map((m) => m[1]).filter((v) => !v.startsWith('#')))];
urls.push('./main.js','./vendor/three/build/three.core.min.js','./vendor/three/build/three.module.min.js','./docs/downloads.json');
for (const part of ['loaders/GLTFLoader.js','controls/OrbitControls.js','utils/BufferGeometryUtils.js','objects/Reflector.js','environments/RoomEnvironment.js']) urls.push(`./vendor/three/addons/${part}`);
const responses = [];
for (const url of new Set(urls)) {
  const result = await fetch(new URL(url, origin), { method: 'HEAD' });
  responses.push({ path: url, status: result.status, bytes: Number(result.headers.get('content-length')) });
}
assert(responses.every((r) => r.status === 200), 'Every static page, module and download must return HTTP 200');
const buffer = fs.readFileSync(path.join(root, 'assets/models/afterlight-rain-court.glb'));
assert.equal(buffer.readUInt32LE(0), 0x46546c67, 'GLB magic');
assert.equal(buffer.readUInt32LE(4), 2, 'glTF 2.0');
assert.equal(buffer.readUInt32LE(8), buffer.length, 'GLB declared byte length');
const jsonLength = buffer.readUInt32LE(12);
assert.equal(buffer.readUInt32LE(16), 0x4e4f534a);
const gltf = JSON.parse(buffer.subarray(20, 20 + jsonLength).toString('utf8'));
const binaryHeader = 20 + jsonLength;
const binaryLength = buffer.readUInt32LE(binaryHeader);
assert.equal(buffer.readUInt32LE(binaryHeader + 4), 0x004e4942);
const binary = buffer.subarray(binaryHeader + 8);
assert.equal(binary.length, binaryLength);
for (const view of gltf.bufferViews) assert((view.byteOffset || 0) + view.byteLength <= binary.length, 'Buffer view within binary chunk');
for (const image of gltf.images) assert(image.bufferView !== undefined && !image.uri, 'Texture image embedded in GLB');
for (const mesh of gltf.meshes) for (const primitive of mesh.primitives) {
  assert(primitive.attributes.POSITION !== undefined && primitive.attributes.NORMAL !== undefined && primitive.attributes.TEXCOORD_0 !== undefined, 'Every primitive has position/normal/UV');
  const count = gltf.accessors[primitive.attributes.POSITION].count;
  assert.equal(count, gltf.accessors[primitive.attributes.TEXCOORD_0].count);
  assert.equal(count, gltf.accessors[primitive.attributes.NORMAL].count);
}
const allFiles = [];
function walk(folder) { for (const entry of fs.readdirSync(folder, {withFileTypes:true})) { const p = path.join(folder,entry.name); if (entry.isDirectory()) walk(p); else if (!/\.(log|blend1|pyc)$/.test(p)) allFiles.push({path:path.relative(root,p).replaceAll('\\','/'),bytes:fs.statSync(p).size}); } }
walk(root);
assert(allFiles.every((f) => f.bytes < 25 * 1024 * 1024), 'Every deployable file must be below 25 MiB');
assert(!/https?:\/\//.test(html.replace(/<meta[^>]*>/g,'')), 'No external HTML resources');
const report = { testedUrl:origin, checks:{all_http_200:true,glb_header_valid:true,glb_buffers_in_bounds:true,all_glb_images_embedded:true,all_meshes_have_normals_and_uv:true,all_files_under_25_mib:true,no_html_cdn:true}, glb:{bytes:buffer.length,nodes:gltf.nodes.length,meshes:gltf.meshes.length,materials:gltf.materials.length,images:gltf.images.length},requests:responses,file_count:allFiles.length,largest_files:allFiles.sort((a,b)=>b.bytes-a.bytes).slice(0,8) };
fs.writeFileSync(path.join(root,'docs/static-validation.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
