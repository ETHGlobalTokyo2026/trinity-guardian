import { encodeFunctionResult, parseAbi, toFunctionSelector } from "viem";
import { describe, expect, it } from "vitest";
import {
  POLICY_TEXT_KEYS,
  decodeTextResult,
  dnsEncode,
  resolveCalldata,
  setTextCalldata,
  textCalldata,
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
