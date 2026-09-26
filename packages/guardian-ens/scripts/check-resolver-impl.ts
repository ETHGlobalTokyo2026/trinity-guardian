import { getAddress, parseAbi } from "viem";
import { createEnsClient } from "../src/client.ts";

const rpcUrl = process.env.SEPOLIA_RPC_URL;
if (!rpcUrl) throw new Error("SEPOLIA_RPC_URL is required");

const FACTORY =
  "0x9e726eb570beb6bceb495ab8cda7df517d4e841c";

const IMPL =
  "0x14f09fd05d4585759e54844dc9b00147131cf243";

const client = createEnsClient(rpcUrl);

console.log("Factory:", FACTORY);
console.log("Candidate resolver implementation:", IMPL);

const code = await client.getCode({
  address: getAddress(IMPL),
});

console.log("Has code:", !!code && code !== "0x");
console.log(
  "Code bytes:",
  code ? (code.length - 2) / 2 : 0,
);

const factoryAbi = parseAbi([
  "function verifyContract(address proxy) view returns (address)",
]);

try {
  const result = await client.readContract({
    address: FACTORY,
    abi: factoryAbi,
    functionName: "verifyContract",
    args: [getAddress(IMPL)],
  });

  console.log("verifyContract(candidate):", result);
} catch (error) {
  console.log(
    "verifyContract(candidate): REVERTED / NOT VERIFIED",
  );
}
