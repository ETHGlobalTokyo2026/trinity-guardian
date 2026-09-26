import {
  createPublicClient,
  encodeFunctionData,
  http,
  namehash,
  parseAbi,
  toHex,
} from "viem";
import { sepolia } from "viem/chains";

const rpcUrl = process.env.SEPOLIA_RPC_URL;

if (!rpcUrl) {
  throw new Error("SEPOLIA_RPC_URL is required");
}

const client = createPublicClient({
  chain: sepolia,
  transport: http(rpcUrl),
});

const UNIVERSAL_RESOLVER =
  "0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe";

const name = "ur.integration-tests.eth";

//
// DNS wire-format encoding:
//
// ur.integration-tests.eth
// ↓
// 02 "ur"
// 11 "integration-tests"
// 03 "eth"
// 00
//
function dnsEncode(name: string): `0x${string}` {
  const labels = name.split(".");

  let hex = "0x";

  for (const label of labels) {
    const labelHex = toHex(label).slice(2);
    const length = labelHex.length / 2;

    if (length > 63) {
      throw new Error(`DNS label too long: ${label}`);
    }

    hex += length.toString(16).padStart(2, "0");
    hex += labelHex;
  }

  hex += "00";

  return hex as `0x${string}`;
}

const universalResolverAbi = parseAbi([
  "function resolve(bytes name, bytes data) view returns (bytes result, address resolver)",
]);

const addrAbi = parseAbi([
  "function addr(bytes32 node) view returns (address)",
]);

const dnsName = dnsEncode(name);

const addrCall = encodeFunctionData({
  abi: addrAbi,
  functionName: "addr",
  args: [namehash(name)],
});

console.log("");
console.log("Universal Resolver Direct Test");
console.log("──────────────────────────────");
console.log("Network:", sepolia.name);
console.log("Chain ID:", sepolia.id);
console.log("Universal Resolver:", UNIVERSAL_RESOLVER);
console.log("Name:", name);
console.log("DNS encoded:", dnsName);
console.log("");

const viemAddress = await client.getEnsAddress({
  name,
});

console.log("viem getEnsAddress:");
console.log(" ", viemAddress);

console.log("");

try {
  const direct = await client.readContract({
    address: UNIVERSAL_RESOLVER,
    abi: universalResolverAbi,
    functionName: "resolve",
    args: [dnsName, addrCall],
  });

  console.log("Direct Universal Resolver:");
  console.log("  result:", direct[0]);
  console.log("  resolver:", direct[1]);
} catch (error) {
  console.error("Direct Universal Resolver call failed:");
  console.error(error);
  process.exit(1);
}