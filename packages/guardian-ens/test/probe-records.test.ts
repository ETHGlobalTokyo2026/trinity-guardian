import { namehash } from "viem";
import { describe, expect, it } from "vitest";
import {
  COIN_TYPE_ETH,
  NAME,
  RESOLVER,
  TEXT_KEY,
  dnsEncode,
  formatProbeReport,
  probeRecords,
  recordCandidates,
  safeError,
  type ContractReader,
} from "../scripts/probe-records.ts";

describe("dnsEncode", () => {
  it("encodes the demo name in DNS wire format", () => {
    expect(dnsEncode(NAME)).toBe(
      "0x046d6f6d6f066167656e74730c7472696e69747967756172640365746800",
    );
  });

  it("rejects an empty label", () => {
    expect(() => dnsEncode("momo..trinityguard.eth")).toThrow("Invalid DNS label");
  });

  it("rejects a label longer than 63 bytes", () => {
    expect(() => dnsEncode(`${"a".repeat(64)}.eth`)).toThrow("Invalid DNS label");
  });
});

describe("safeError", () => {
  it("strips an RPC URL from the first line", () => {
    const error = new Error("reverted\nRequest to https://rpc.example/v2/secret failed");
    expect(safeError(error)).toBe("reverted");
  });

  it("replaces a URL on the same line", () => {
    expect(safeError(new Error("call https://rpc.example/abc?key=secret reverted"))).toBe(
      "call [rpc] reverted",
    );
  });

  it("stringifies a non-Error value", () => {
    expect(safeError("plain revert")).toBe("plain revert");
  });
});

describe("recordCandidates", () => {
  it("tries the four getter shapes and no writers", () => {
    const candidates = recordCandidates();
    expect(candidates.map((candidate) => candidate.label)).toEqual([
      "text(bytes,string)",
      "text(bytes32,string)",
      "addr(bytes,uint256)",
      "addr(bytes32)",
    ]);
    expect(candidates.map((candidate) => candidate.functionName)).toEqual([
      "text",
      "text",
      "addr",
      "addr",
    ]);
    const dnsName = dnsEncode(NAME);
    const node = namehash(NAME);
    expect(candidates[0]?.args).toEqual([dnsName, TEXT_KEY]);
    expect(candidates[1]?.args).toEqual([node, TEXT_KEY]);
    expect(candidates[2]?.args).toEqual([dnsName, COIN_TYPE_ETH]);
    expect(candidates[3]?.args).toEqual([node]);
  });
});

describe("probeRecords", () => {
  it("reports a revert for every candidate and redacts the RPC URL", async () => {
    const calls: string[] = [];
    const reader: ContractReader = {
      async readContract(args) {
        calls.push(args.functionName);
        expect(args.address).toBe(RESOLVER);
        throw new Error('The contract function "text" reverted. https://rpc.example/secret');
      },
    };

    const outcomes = await probeRecords(reader);
    const report = formatProbeReport(outcomes);

    expect(calls).toEqual(["text", "text", "addr", "addr"]);
    expect(outcomes.every((outcome) => outcome.status === "revert")).toBe(true);
    expect(report).toContain("No candidate getter succeeded.");
    expect(report).not.toContain("https://");
    expect(report).toContain("[rpc]");
    expect(report).toContain("Read only. No transaction will be sent.");
  });

  it("counts only the getters that return", async () => {
    const reader: ContractReader = {
      async readContract(args) {
        if (args.functionName === "text" && args.args[0] === dnsEncode(NAME)) {
          return "5000000";
        }
        throw new Error("reverted");
      },
    };

    const report = formatProbeReport(await probeRecords(reader));

    expect(report).toContain("HIT  text(bytes,string)");
    expect(report).toContain("result: 5000000");
    expect(report).toContain("REVERT  text(bytes32,string)");
    expect(report).toContain("Succeeded: 1");
  });
});
