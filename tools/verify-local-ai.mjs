// Node CPU verification with the exact bundled weights and labels. Not an iPhone benchmark.
import vm from "node:vm";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";

globalThis.require = createRequire(import.meta.url);
const modelJson = JSON.parse(
  await readFile("public/vendor/food-model/model.json", "utf8"),
);
const weights = await readFile("public/vendor/food-model/weights.bin");
assert.equal(
  createHash("sha256").update(weights).digest("hex"),
  "eb49857447f6089e7e392f7991f3f4fdce1936efaf83d535f5eb8aaba9538e0b",
  "Bundled model weights changed unexpectedly",
);
const specs = modelJson.weightsManifest.flatMap((group) => group.weights);
assert.deepEqual(
  modelJson.weightsManifest.flatMap((group) => group.paths),
  ["weights.bin"],
);
assert.equal(
  specs.reduce(
    (total, spec) => total + spec.shape.reduce((a, b) => a * b, 1) * 4,
    0,
  ),
  weights.byteLength,
);
const labelContext = { self: {} };
vm.runInNewContext(
  await readFile("public/vendor/imagenet-labels.js", "utf8"),
  labelContext,
);
const labels = labelContext.self.IMAGENET_LABELS;
assert.equal(Object.keys(labels).length, 1000);
vm.runInThisContext(await readFile("public/vendor/tf.min.js", "utf8"), {
  filename: "tf.min.js",
});
let model, result;
try {
  await tf.setBackend("cpu");
  await tf.ready();
  model = await tf.loadLayersModel(
    tf.io.fromMemory({
      modelTopology: modelJson.modelTopology,
      weightSpecs: specs,
      weightData: weights.buffer.slice(
        weights.byteOffset,
        weights.byteOffset + weights.byteLength,
      ),
    }),
  );
  const start = performance.now();
  result = tf.tidy(() => model.predict(tf.zeros([1, 224, 224, 3])));
  const values = Array.from(await result.data());
  assert.equal(values.length, Object.keys(labels).length);
  assert(
    values.every((value) => Number.isFinite(value) && value >= 0 && value <= 1),
  );
  assert(Math.abs(values.reduce((sum, value) => sum + value, 0) - 1) < 0.001);
  assert(values.every((_, index) => typeof labels[index] === "string"));
  console.log(
    JSON.stringify({
      platform: "Node CPU, not iOS",
      model: "MobileNet v1 0.25",
      classes: values.length,
      weightsBytes: weights.byteLength,
      milliseconds: Math.round(performance.now() - start),
      tensorBytes: tf.memory().numBytes,
      network: "none",
    }),
  );
} finally {
  result?.dispose();
  model?.dispose();
}
