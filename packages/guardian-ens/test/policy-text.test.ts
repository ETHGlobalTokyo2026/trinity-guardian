import { encodeFunctionResult, parseAbi, toFunctionSelector } from "viem";
import { describe, expect, it } from "vitest";
import {
  POLICY_TEXT_KEYS,
  POLICY_WRITES,
  USDC_SEPOLIA,
  decodeTextResult,
  dnsEncode,
  policyFromRecords,
  resolveCalldata,
  setTextCalldata,
  textCalldata,
  type PolicyRecords,
} from "../src/policy-text.ts";

const NAME = "momo.agents.trinityguard.eth";

describe("policy text schema", () => {
  it("names the three limit keys and the authority flag", () => {
    expect([...POLICY_TEXT_KEYS]).toEqual([
      "com.trinityguard.perTxMax",
      "com.trinityguard.dailyCap",
      "com.trinityguard.asset",
      "com.trinityguard.authority",
    ]);
  });

  it("reads through resolve(bytes, text(bytes32) calldata)", () => {
    const calldata = resolveCalldata(NAME, "com.trinityguard.perTxMax");
    expect(calldata.startsWith(toFunctionSelector("resolve(bytes,bytes)"))).toBe(true);
    expect(calldata.includes(textCalldata(NAME, "com.trinityguard.perTxMax").slice(2))).toBe(true);
    expect(textCalldata(NAME, "com.trinityguard.perTxMax").startsWith(
      toFunctionSelector("text(bytes32,string)"),
    )).toBe(true);
  });

  it("encodes setText(bytes,string,string) and does not call the resolver", () => {
    const calldata = setTextCalldata(NAME, "com.trinityguard.authority", "revoked");
    expect(calldata.startsWith(toFunctionSelector("setText(bytes,string,string)"))).toBe(true);
    expect(calldata.startsWith("0xc7279f88")).toBe(true);
    expect(dnsEncode(NAME)).toBe(
      "0x046d6f6d6f066167656e74730c7472696e69747967756172640365746800",
    );
  });

  it("decodes an empty text result and a stored decimal", () => {
    const abi = parseAbi(["function text(bytes32 node, string key) view returns (string)"]);
    const empty = encodeFunctionResult({ abi, functionName: "text", result: "" });
    const stored = encodeFunctionResult({ abi, functionName: "text", result: "5000000" });
    expect(decodeTextResult(empty)).toBe("");
    expect(decodeTextResult(stored)).toBe("5000000");
  });
});

const mandate = (authority: string, perTxMax = "5000000", dailyCap = "50000000", asset: string = USDC_SEPOLIA): PolicyRecords => ({
  "com.trinityguard.perTxMax": perTxMax,
  "com.trinityguard.dailyCap": dailyCap,
  "com.trinityguard.asset": asset,
  "com.trinityguard.authority": authority,
});

describe("policyFromRecords", () => {
  it("stores the Sepolia USDC address on both names", () => {
    expect(POLICY_WRITES).toHaveLength(8);
    expect(POLICY_WRITES.filter((write) => write.key === "com.trinityguard.asset").map((write) => write.value)).toEqual([
      USDC_SEPOLIA,
      USDC_SEPOLIA,
    ]);
    expect(POLICY_WRITES.find((write) => write.name.startsWith("momo") && write.key.endsWith("authority"))?.value).toBe("active");
    expect(POLICY_WRITES.find((write) => write.name.startsWith("rogue") && write.key.endsWith("authority"))?.value).toBe("revoked");
  });

  it("maps active and revoked", () => {
    expect(policyFromRecords(mandate("active"))).toEqual({
      roleActive: true,
      perTxMax: 5_000_000n,
      dailyCap: 50_000_000n,
      allowedAsset: USDC_SEPOLIA,
    });
    expect(policyFromRecords(mandate("revoked"))?.roleActive).toBe(false);
  });

  it("returns null when authority is empty or unknown", () => {
    expect(policyFromRecords(mandate(""))).toBeNull();
    expect(policyFromRecords(mandate("yes"))).toBeNull();
  });

  it("throws when a limit is not an integer or the asset is empty", () => {
    expect(() => policyFromRecords(mandate("active", "5.0"))).toThrow("policy text is not a complete mandate");
    expect(() => policyFromRecords(mandate("active", "5000000", "50000000", ""))).toThrow("policy text is not a complete mandate");
  });
});
