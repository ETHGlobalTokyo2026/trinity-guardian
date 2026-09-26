/**
 * Owner CLI for the on-chain mandate (ENSv2 on Sepolia).
 *
 *   pnpm mandate setup            register <parent>.eth, deploy our registry + resolver,
 *                                 create the agent + seller subnames, write the policy records
 *   pnpm mandate status           read everything the Guardian reads
 *   pnpm mandate revoke           kill switch: revoke the agent's spend role
 *   pnpm mandate grant            restore it
 *   pnpm mandate renew [days]     extend the agent subname
 *   pnpm mandate set <key> <val>  write a com.payguard.* text record on the agent name
 *
 * Needs in .env.local: ENS_OWNER_PRIVATE_KEY (funded with Sepolia ETH), AGENT_PRIVATE_KEY,
 * SELLER_ADDRESS. `setup` prints ENS_USER_REGISTRY / ENS_RESOLVER to paste into .env.local.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { decodeEventLog, encodeFunctionData, getAddress, keccak256, labelhash, toHex, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ensPublic, ownerAccount, ownerWallet } from "../../lib/ens/client";
import {
  ALL_ROLES,
  ENS_SEPOLIA,
  MANDATE_KEYS,
  ROLE_RENEW,
  ROLE_SET_RESOLVER,
  ROLE_SPEND,
  erc20Abi,
  factoryAbi,
  registrarAbi,
  registryAbi,
  resolverAbi,
} from "../../lib/ens/constants";
import { ENS_AGENT_LABEL, ENS_AGENT_NAME, ENS_PARENT_LABEL, ENS_PARENT_NAME, ENS_SELLER_LABEL, ENS_SELLER_NAME } from "../../lib/ens/names";
import { encodeSetAddress, encodeSetText, grantSpendRole, renewAgentName, revokeSpendRole, setPolicyRecord } from "../../lib/ens/admin";
import { readOnChainMandate } from "../../lib/guardian/ens";

const DAY = 86400;
const ZERO = "0x0000000000000000000000000000000000000000" as const;
const ZERO32 = `0x${"00".repeat(32)}` as const;

function agentAddress(): `0x${string}` {
  const k = process.env.AGENT_PRIVATE_KEY?.trim();
  if (!k) throw new Error("AGENT_PRIVATE_KEY not set");
  return privateKeyToAccount(k as Hex).address;
}

async function tx(label: string, hash: Hex) {
  process.stdout.write(`  ${label} … ${hash} `);
  const r = await ensPublic.waitForTransactionReceipt({ hash });
  console.log(r.status === "success" ? "✓" : "✗ REVERTED");
  if (r.status !== "success") throw new Error(`${label} reverted`);
  return r;
}

async function deployProxy(implementation: `0x${string}`, initData: Hex, saltSeed: string) {
  const wallet = ownerWallet();
  const salt = BigInt(keccak256(toHex(`${saltSeed}:${Date.now()}`)));
  const hash = await wallet.writeContract({
    address: ENS_SEPOLIA.verifiableFactory,
    abi: factoryAbi,
    functionName: "deployProxy",
    args: [implementation, salt, initData],
  });
  const receipt = await tx(`deploy ${saltSeed} proxy`, hash);
  for (const log of receipt.logs) {
    try {
      const ev = decodeEventLog({ abi: factoryAbi, data: log.data, topics: log.topics });
      if (ev.eventName === "ProxyDeployed") return getAddress(ev.args.proxyAddress);
    } catch {
      /* not ours */
    }
  }
  throw new Error("ProxyDeployed event not found");
}

async function setup() {
  const owner = ownerAccount().address;
  const agent = agentAddress();
  const seller = getAddress(process.env.SELLER_ADDRESS ?? "");
  const wallet = ownerWallet();
  console.log(`owner ${owner}\nagent ${agent}\nseller ${seller}\nparent ${ENS_PARENT_NAME}`);

  // 1. our registry + resolver (UUPS proxies from the ENS VerifiableFactory), owner holds every role
  const grants = [{ account: owner, roleBitmap: ALL_ROLES }];
  const registry = await deployProxy(
    ENS_SEPOLIA.userRegistryImpl,
    encodeFunctionData({ abi: registryAbi, functionName: "initialize", args: [grants] }),
    "payguard-registry",
  );
  const resolver = await deployProxy(
    ENS_SEPOLIA.permissionedResolverImpl,
    encodeFunctionData({ abi: resolverAbi, functionName: "initialize", args: [grants, []] }),
    "payguard-resolver",
  );
  console.log(`registry ${registry}\nresolver ${resolver}`);

  // 2. <parent>.eth on the public ENSv2 ETHRegistrar, paid in the free MockUSDC, subregistry = our registry
  const available = await ensPublic.readContract({ address: ENS_SEPOLIA.ethRegistrar, abi: registrarAbi, functionName: "isAvailable", args: [ENS_PARENT_LABEL] });
  if (!available) {
    const current = await ensPublic.readContract({ address: ENS_SEPOLIA.ethRegistry, abi: registryAbi, functionName: "getOwner", args: [BigInt(labelhash(ENS_PARENT_LABEL))] });
    if (current.toLowerCase() !== owner.toLowerCase()) throw new Error(`${ENS_PARENT_NAME} is taken by ${current}; pick another ENS_PARENT_LABEL`);
    console.log(`${ENS_PARENT_NAME} already owned by you — pointing it at the new registry/resolver`);
    await tx("setSubregistry", await wallet.writeContract({ address: ENS_SEPOLIA.ethRegistry, abi: registryAbi, functionName: "setSubregistry", args: [BigInt(labelhash(ENS_PARENT_LABEL)), registry] }));
    await tx("setResolver", await wallet.writeContract({ address: ENS_SEPOLIA.ethRegistry, abi: registryAbi, functionName: "setResolver", args: [BigInt(labelhash(ENS_PARENT_LABEL)), resolver] }));
  } else {
    const duration = BigInt(28 * DAY);
    const [base, premium] = await ensPublic.readContract({ address: ENS_SEPOLIA.ethRegistrar, abi: registrarAbi, functionName: "getRegisterPrice", args: [ENS_PARENT_LABEL, duration, ENS_SEPOLIA.mockUsdc] });
    const price = (base + premium) * 2n;
    await tx("mint MockUSDC", await wallet.writeContract({ address: ENS_SEPOLIA.mockUsdc, abi: erc20Abi, functionName: "mint", args: [owner, price] }));
    await tx("approve registrar", await wallet.writeContract({ address: ENS_SEPOLIA.mockUsdc, abi: erc20Abi, functionName: "approve", args: [ENS_SEPOLIA.ethRegistrar, price] }));
    const secret = keccak256(toHex(`payguard-secret-${Date.now()}`));
    const commitment = await ensPublic.readContract({
      address: ENS_SEPOLIA.ethRegistrar,
      abi: registrarAbi,
      functionName: "makeCommitment",
      args: [ENS_PARENT_LABEL, owner, secret, registry, resolver, duration, ZERO32],
    });
    await tx("commit", await wallet.writeContract({ address: ENS_SEPOLIA.ethRegistrar, abi: registrarAbi, functionName: "commit", args: [commitment] }));
    console.log("  waiting 70s for the commitment to age (MIN_COMMITMENT_AGE = 60s)");
    await new Promise((r) => setTimeout(r, 70_000));
    await tx(
      `register ${ENS_PARENT_NAME}`,
      await wallet.writeContract({
        address: ENS_SEPOLIA.ethRegistrar,
        abi: registrarAbi,
        functionName: "register",
        args: [ENS_PARENT_LABEL, owner, secret, registry, resolver, duration, ENS_SEPOLIA.mockUsdc, ZERO32],
      }),
    );
  }

  // 3. subnames in OUR registry: the agent (expiring, non-transferable, spend role granted separately) and the seller
  const now = Math.floor(Date.now() / 1000);
  await tx(
    `register ${ENS_AGENT_NAME} (expires in 7 days)`,
    await wallet.writeContract({
      address: registry,
      abi: registryAbi,
      functionName: "register",
      args: [ENS_AGENT_LABEL, owner, ZERO, resolver, ROLE_SET_RESOLVER | ROLE_RENEW, BigInt(now + 7 * DAY)],
    }),
  );
  await tx(
    `grant spend role to agent`,
    await wallet.writeContract({ address: registry, abi: registryAbi, functionName: "grantRoles", args: [BigInt(labelhash(ENS_AGENT_LABEL)), ROLE_SPEND, agent] }),
  );
  await tx(
    `register ${ENS_SELLER_NAME}`,
    await wallet.writeContract({
      address: registry,
      abi: registryAbi,
      functionName: "register",
      args: [ENS_SELLER_LABEL, owner, ZERO, resolver, ROLE_SET_RESOLVER, BigInt(now + 365 * DAY)],
    }),
  );

  // 4. the mandate itself + ENSIP-26 agent records, one multicall
  const perTxMax = process.env.POLICY_PER_TX_MAX ?? "5";
  const dailyCap = process.env.POLICY_DAILY_CAP ?? "50";
  const asset = process.env.POLICY_ASSET ?? "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
  const network = process.env.X402_NETWORK ?? "eip155:84532";
  const appUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
  const calls: Hex[] = [
    encodeSetAddress(ENS_AGENT_NAME, agent),
    encodeSetText(ENS_AGENT_NAME, MANDATE_KEYS.perTxMax, perTxMax),
    encodeSetText(ENS_AGENT_NAME, MANDATE_KEYS.dailyCap, dailyCap),
    encodeSetText(ENS_AGENT_NAME, MANDATE_KEYS.asset, asset),
    encodeSetText(ENS_AGENT_NAME, MANDATE_KEYS.network, network),
    encodeSetText(ENS_AGENT_NAME, MANDATE_KEYS.allowlist, ENS_SELLER_NAME),
    encodeSetText(ENS_AGENT_NAME, MANDATE_KEYS.agentContext, `${ENS_AGENT_LABEL} is a purchasing agent guarded by Trinity Guardian. It pays for APIs with x402 in USDC on ${network}, at most ${perTxMax} USDC per call and ${dailyCap} USDC per day, only to counterparties named in com.payguard.allowlist. Its right to spend is the ENS 'spend' role on this name.`),
    encodeSetText(ENS_AGENT_NAME, MANDATE_KEYS.agentEndpointWeb, appUrl),
    encodeSetAddress(ENS_SELLER_NAME, seller),
    encodeSetText(ENS_SELLER_NAME, MANDATE_KEYS.agentContext, "Weather data API sold per call over x402. Accepts USDC on Base Sepolia."),
    encodeSetText(ENS_SELLER_NAME, MANDATE_KEYS.agentEndpointWeb, `${appUrl}/api/services/weather`),
  ];
  await tx("write mandate + agent records", await wallet.writeContract({ address: resolver, abi: resolverAbi, functionName: "multicall", args: [calls] }));

  console.log(`\nDone. Add to .env.local:\nENS_USER_REGISTRY=${registry}\nENS_RESOLVER=${resolver}\n`);
}

async function status() {
  const m = await readOnChainMandate(agentAddress());
  console.log(JSON.stringify(m, null, 2));
}

async function main() {
  const [cmd, a, b] = process.argv.slice(2);
  switch (cmd) {
    case "setup":
      return setup();
    case "status":
      return status();
    case "revoke":
      console.log("tx", await revokeSpendRole(agentAddress()));
      return status();
    case "grant":
      console.log("tx", await grantSpendRole(agentAddress()));
      return status();
    case "renew":
      console.log("tx", await renewAgentName(Math.floor(Date.now() / 1000) + Number(a ?? 7) * DAY));
      return status();
    case "set":
      if (!a || b === undefined) throw new Error("usage: pnpm mandate set <key> <value>");
      console.log("tx", await setPolicyRecord(a, b));
      return status();
    default:
      console.log("usage: pnpm mandate <setup|status|revoke|grant|renew [days]|set <key> <value>>");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
