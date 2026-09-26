import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import type { AddressInfo } from "node:net";
import express from "express";
import { DEFAULT_API_KEY, interceptaRouter, isScamAccount, quickScanBody } from "../src/index.js";

const A = "0x9Bb9fd0ab10f2c9231F2B0bb629ED446f0216c79";
const B = "0x1dc5647C5D3807BA5db48ED0af2Da951F6b171af";

describe("scam account", () => {
  before(() => {
    process.env.SELLER_ADDRESS_B = B;
  });

  it("flags only account B", () => {
    assert.equal(isScamAccount(B), true);
    assert.equal(isScamAccount(B.toLowerCase()), true);
    assert.equal(isScamAccount(A), false);
    assert.equal(quickScanBody(A).isScam, false);
    assert.equal(quickScanBody(B).isScam, true);
    assert.equal(quickScanBody(B).traits[0]?.name, "known_scammer");
  });
});

describe("mock api", () => {
  let base = "";
  let close: () => Promise<void> = async () => {};

  before(async () => {
    process.env.SELLER_ADDRESS_B = B;
    process.env.INTERCEPTA_API_KEY = DEFAULT_API_KEY;
    const app = express();
    app.use(interceptaRouter());
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    close = () =>
      new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  });

  after(async () => {
    await close();
  });

  it("rejects a missing api key", async () => {
    const res = await fetch(`${base}/api/public/v2/extension/account/${B}/quick-scan`);
    assert.equal(res.status, 401);
  });

  it("clears account A and flags account B", async () => {
    const headers = { "X-API-KEY": DEFAULT_API_KEY };
    const a = await fetch(`${base}/api/public/v2/extension/account/${A}/quick-scan`, { headers });
    const b = await fetch(`${base}/api/public/v2/extension/account/${B}/quick-scan`, { headers });
    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
    assert.equal((await a.json()).isScam, false);
    const flagged = (await b.json()) as { isScam: boolean; traits: { name: string }[] };
    assert.equal(flagged.isScam, true);
    assert.equal(flagged.traits[0]?.name, "known_scammer");
  });
});
