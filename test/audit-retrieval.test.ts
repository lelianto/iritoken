import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { optimizeAudited } from "../src/pipeline/audit.js";
import { optimizeRetrievable } from "../src/pipeline/retrievable.js";
import { ContextStore } from "../src/retrieval/store.js";

describe("audit evidence", () => {
  const input = "\x1b[31mERROR\x1b[0m\n\n\n\nDetails\n";

  it("applies candidates and emits content-addressed evidence", () => {
    const result = optimizeAudited(input);
    assert.equal(result.text, result.candidateText);
    assert.equal(result.evidence.mode, "apply");
    assert.equal(result.evidence.originalSha256.length, 64);
    assert.equal(result.evidence.candidateSha256.length, 64);
    assert.notEqual(result.evidence.originalSha256, result.evidence.candidateSha256);
  });

  it("shadow mode delivers the original while measuring the candidate", () => {
    const result = optimizeAudited(input, { mode: "shadow" });
    assert.equal(result.text, input);
    assert.notEqual(result.candidateText, input);
    assert.equal(result.evidence.deliveredSha256, result.evidence.originalSha256);
    assert.ok(result.evidence.reductionPercentage > 0);
  });
});

describe("bounded retrieval store", () => {
  it("retrieves changed originals by a stable SHA-256 reference", () => {
    const store = new ContextStore();
    const first = optimizeRetrievable("\x1b[31mERROR\x1b[0m\n", store);
    const second = optimizeRetrievable("\x1b[31mERROR\x1b[0m\n", store);
    assert.ok(first.originalReference);
    assert.equal(first.originalReference, second.originalReference);
    assert.equal(store.get(first.originalReference), "\x1b[31mERROR\x1b[0m\n");
  });

  it("does not store unchanged input", () => {
    const store = new ContextStore();
    const result = optimizeRetrievable("unique ordinary prose", store);
    assert.equal(result.originalReference, undefined);
    assert.equal(store.size, 0);
  });

  it("expires entries and accurately releases byte accounting", () => {
    let now = 100;
    const store = new ContextStore({ ttlMilliseconds: 10, now: () => now });
    const id = store.put("😀");
    assert.equal(store.bytes, 4);
    now = 110;
    assert.equal(store.get(id), undefined);
    assert.equal(store.bytes, 0);
  });

  it("evicts oldest entries under entry and byte bounds", () => {
    const store = new ContextStore({ maxEntries: 2, maxBytes: 6 });
    const a = store.put("aa");
    const b = store.put("bb");
    const c = store.put("cccc");
    assert.equal(store.get(a), undefined);
    assert.equal(store.get(b), "bb");
    assert.equal(store.get(c), "cccc");
    assert.equal(store.size, 2);
    assert.equal(store.bytes, 6);
  });

  it("rejects unsafe resource limits", () => {
    assert.throws(() => new ContextStore({ maxEntries: 0 }), RangeError);
    assert.throws(() => new ContextStore({ maxBytes: 0 }), RangeError);
    assert.throws(() => new ContextStore({ ttlMilliseconds: 0 }), RangeError);
    const store = new ContextStore({ maxBytes: 2 });
    assert.throws(() => store.put("😀"), RangeError);
  });
});

