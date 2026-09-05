import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const port = Number(process.env.PORT || process.argv.find(arg => /^\d+$/.test(arg)) || 4173);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.zip': 'application/zip', '.blend': 'application/octet-stream', '.fbx': 'application/octet-stream', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8' };

const server = createServer(async (req, res) => {
  try {
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return; }
    const url = new URL(req.url, 'http://localhost');
    const pathname = decodeURIComponent(url.pathname);
    let file = resolve(root, '.' + pathname);
    if (file !== root && !file.startsWith(root + sep)) { res.writeHead(403); res.end('Forbidden'); return; }
    let info = await stat(file);
    if (info.isDirectory()) {
      if (!pathname.endsWith('/')) { res.writeHead(301, { Location: pathname + '/' + url.search }); res.end(); return; }
      file = resolve(file, 'index.html'); info = await stat(file);
    }
    if (!info.isFile()) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': types[extname(file).toLowerCase()] || 'application/octet-stream', 'Content-Length': info.size, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    if (req.method === 'HEAD') res.end(); else createReadStream(file).pipe(res);
  } catch (error) { res.writeHead(error.code === 'ENOENT' ? 404 : 400); res.end(error.code === 'ENOENT' ? 'Not found' : 'Bad request'); }
});
server.on('error', error => { process.stderr.write(`Cannot start local viewer: ${error.message}\n`); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => process.stdout.write(`AFTERLIGHT local viewer: http://127.0.0.1:${server.address().port}/\n`));
