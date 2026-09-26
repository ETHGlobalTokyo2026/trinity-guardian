import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DRY_RUN_TEXT_WRITES, setTextCalldata } from "../src/policy-text.ts";

describe("setText dry-run payloads", () => {
  it("encodes eight setText(bytes,string,string) calls and does not send a transaction", () => {
    expect(DRY_RUN_TEXT_WRITES).toHaveLength(8);
    for (const write of DRY_RUN_TEXT_WRITES) {
      expect(setTextCalldata(write.name, write.key, write.value).startsWith("0xc7279f88")).toBe(true);
    }
    const source = readFileSync(new URL("../scripts/dry-run-set-text.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/writeContract|sendTransaction|walletClient/);
    expect(source).toContain("simulateContract");
  });
});
