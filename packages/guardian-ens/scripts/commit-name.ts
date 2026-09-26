import { randomBytes } from "node:crypto";
import {
  createWalletClient,
  http,
  parseAbi,
  zeroAddress,
  zeroHash,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { createEnsClient } from "../src/client.ts";

const ETH_REGISTRAR =
  "0xabe76f6c8dfced81aa5a2bb8034202a7136b94ca" as const;

const rpcUrl = process.env.SEPOLIA_RPC_URL;
const privateKey = process.env.PRIVATE_KEY;

if (!rpcUrl) throw new Error("SEPOLIA_RPC_URL is required");
if (!privateKey) throw new Error("PRIVATE_KEY is required");

const account = privateKeyToAccount(privateKey as `0x${string}`);

const publicClient = createEnsClient(rpcUrl);

const walletClient = createWalletClient({
  account,
  chain: sepolia,
  transport: http(rpcUrl),
});

const abi = parseAbi([
  "function makeCommitment(string label,address owner,bytes32 secret,address subregistry,address resolver,uint64 duration,bytes32 referrer) view returns (bytes32)",
  "function commit(bytes32 commitment)",
]);

const label = process.argv[2];

if (!label) {
  throw new Error(
    "Label is required. Example: pnpm ens:commit trinityguard",
  );
}
const duration = 31_536_000n;

// Random 32-byte secret.
// IMPORTANT: the same secret is required for register().
const secret = `0x${randomBytes(32).toString("hex")}` as `0x${string}`;

const commitment = await publicClient.readContract({
  address: ETH_REGISTRAR,
  abi,
  functionName: "makeCommitment",
  args: [
    label,
    account.address,
    secret,
    zeroAddress, // attach UserRegistry later
    zeroAddress, // attach resolver later
    duration,
    zeroHash,
  ],
});

console.log("Label:", `${label}.eth`);
console.log("Owner:", account.address);
console.log("Commitment:", commitment);

const hash = await walletClient.writeContract({
  address: ETH_REGISTRAR,
  abi,
  functionName: "commit",
  args: [commitment],
});

console.log("Commit tx:", hash);

await publicClient.waitForTransactionReceipt({ hash });

console.log("Commit confirmed.");
console.log("");
import { readFileSync, writeFileSync } from "node:fs";

const envPath = ".env.local";
const envContent = readFileSync(envPath, "utf8");

const secretLine = `ENS_REGISTRATION_SECRET=${secret}`;

const updatedEnv = /^ENS_REGISTRATION_SECRET=.*$/m.test(envContent)
  ? envContent.replace(/^ENS_REGISTRATION_SECRET=.*$/m, secretLine)
  : `${envContent.trimEnd()}\n${secretLine}\n`;

writeFileSync(envPath, updatedEnv);
  
  console.log("Commit confirmed.");
  console.log("Registration secret saved to .env.local");
  console.log("Do not commit .env.local");