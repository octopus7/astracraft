import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { generateAll } from "../generate-models.mjs";
import { trianglesOverlapArea, validateAssets } from "../validate-models.mjs";

const TEST_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const ULTRA_ROOT = path.resolve(TEST_DIRECTORY, "..", "..");

async function collectHashes(root) {
  const result = {};
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else {
        const relative = path.relative(root, absolute).replaceAll("\\", "/");
        const bytes = await readFile(absolute);
        result[relative] = createHash("sha256").update(bytes).digest("hex");
      }
    }
  }
  await visit(root);
  return result;
}

test("committed ultra assets pass the complete glTF/PBR/UV verifier", async () => {
  const report = await validateAssets(ULTRA_ROOT, { writeReport: false });
  assert.equal(report.valid, true);
  assert.deepEqual(report.models.map((model) => model.file), [
    "repair-district.gltf",
    "salvage-drone.gltf",
    "service-rover.gltf",
  ]);
  assert.ok(report.models.every((model) => model.uv.overlapPairs === 0));
  assert.ok(report.models.reduce((sum, model) => sum + model.triangles, 0) >= 3000);
});

test("generator is byte-for-byte deterministic in isolated output roots", async () => {
  const firstRoot = await mkdtemp(path.join(tmpdir(), "astracraft-ultra-a-"));
  const secondRoot = await mkdtemp(path.join(tmpdir(), "astracraft-ultra-b-"));
  try {
    await generateAll({ outputRoot: firstRoot, textureSize: 256 });
    await generateAll({ outputRoot: secondRoot, textureSize: 256 });
    const [firstReport, secondReport] = await Promise.all([
      validateAssets(firstRoot, { writeReport: false }),
      validateAssets(secondRoot, { writeReport: false }),
    ]);
    assert.equal(firstReport.valid, true);
    assert.equal(secondReport.valid, true);
    assert.deepEqual(await collectHashes(firstRoot), await collectHashes(secondRoot));
  } finally {
    await Promise.all([
      rm(firstRoot, { recursive: true, force: true }),
      rm(secondRoot, { recursive: true, force: true }),
    ]);
  }
});

test("UV overlap predicate rejects positive-area intersections but accepts shared edges", () => {
  const first = [[0, 0], [1, 0], [0, 1]];
  const intersecting = [[0.2, 0.2], [0.8, 0.2], [0.2, 0.8]];
  const sharedEdgeOnly = [[1, 0], [1, 1], [0, 1]];
  assert.ok(trianglesOverlapArea(first, intersecting) > 0.1);
  assert.ok(trianglesOverlapArea(first, sharedEdgeOnly) < 1e-12);
});

