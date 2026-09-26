import {
    createWalletClient,
    http,
    keccak256,
    parseAbi,
    stringToHex,
    type Address,
    type Hex,
  } from "viem";
  import { privateKeyToAccount } from "viem/accounts";
  import { sepolia } from "viem/chains";
  
  import { createEnsClient } from "../src/client.ts";
  
  /**
   * Trinity Guardian ENSv2 Sepolia
   */
  const AGENTS_REGISTRY =
    "0x5B115dAFCeEcBe5d77506b1Ec8B0A017B7357174" as Address;
  
  const PERMISSIONED_RESOLVER =
    "0xf23345070E24cb42E0A87323F75b84a34d9D33f6" as Address;
  
  const ZERO_ADDRESS =
    "0x0000000000000000000000000000000000000000" as Address;
  
  const COIN_TYPE_ETH = 60n;
  
  const AGENTS = ["shopping", "research", "travel"] as const;
  
  const registryAbi = parseAbi([
    "function getTokenId(uint256 labelId) view returns (uint256)",
    "function setResolver(uint256 anyId,address resolver)",
    "function getResolver(string label) view returns (address)",
  ]);
  
  /**
   * Canonical beta PermissionedResolver API observed on the deployed
   * Sepolia generation.
   */
  const resolverAbi = parseAbi([
    "function setAddress(bytes name,uint256 coinType,bytes value)",
  ]);
  
  const rpcUrl = process.env.SEPOLIA_RPC_URL;
  const privateKey = process.env.PRIVATE_KEY;
  
  if (!rpcUrl) {
    throw new Error("SEPOLIA_RPC_URL is required");
  }
  
  if (!privateKey) {
    throw new Error("PRIVATE_KEY is required");
  }
  
  const normalizedPrivateKey = (
    privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`
  ) as Hex;
  
  const account = privateKeyToAccount(normalizedPrivateKey);
  
  const publicClient = createEnsClient(rpcUrl);
  
  const walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport: http(rpcUrl),
  });
  
  const dryRun = process.env.DRY_RUN === "true";
  
  /**
   * LibLabel.id(label)
   *
   * ENSv2 registry label IDs are:
   *
   * uint256(keccak256(bytes(label)))
   */
  function labelId(label: string): bigint {
    return BigInt(keccak256(stringToHex(label)));
  }
  
  /**
   * ENS DNS wire encoding.
   *
   * Example:
   *
   * shopping.agents.trinityguard.eth
   *
   * becomes:
   *
   * 08 shopping
   * 06 agents
   * 0c trinityguard
   * 03 eth
   * 00
   */
  function dnsEncode(name: string): Hex {
    const labels = name.split(".");
  
    let encoded = "0x";
  
    for (const label of labels) {
      const labelBytes = new TextEncoder().encode(label);
  
      if (labelBytes.length === 0) {
        throw new Error(`Invalid empty DNS label in "${name}"`);
      }
  
      if (labelBytes.length > 63) {
        throw new Error(`DNS label too long: "${label}"`);
      }
  
      encoded += labelBytes.length.toString(16).padStart(2, "0");
  
      for (const byte of labelBytes) {
        encoded += byte.toString(16).padStart(2, "0");
      }
    }
  
    encoded += "00";
  
    return encoded as Hex;
  }
  
  /**
   * Resolver expects the address value as raw bytes, not ABI-encoded
   * address data.
   *
   * Ethereum address = exactly 20 bytes.
   */
  function addressToBytes(address: Address): Hex {
    return address.toLowerCase() as Hex;
  }
  
  console.log("Trinity Guardian — Agent Resolution Setup");
  console.log("─────────────────────────────────────────");
  console.log("Network:", sepolia.name);
  console.log("Chain ID:", sepolia.id);
  console.log("Account:", account.address);
  console.log("Agents Registry:", AGENTS_REGISTRY);
  console.log("Permissioned Resolver:", PERMISSIONED_RESOLVER);
  console.log("ETH coin type:", COIN_TYPE_ETH.toString());
  console.log("Mode:", dryRun ? "DRY RUN" : "WRITE");
  console.log();
  
  /**
   * Phase 1
   *
   * Attach PermissionedResolver to every agent name.
   */
  console.log("Phase 1 — Attach resolver");
  console.log("─────────────────────────");
  
  for (const agent of AGENTS) {
    const rawLabelId = labelId(agent);
  
    const tokenId = await publicClient.readContract({
      address: AGENTS_REGISTRY,
      abi: registryAbi,
      functionName: "getTokenId",
      args: [rawLabelId],
    });
  
    const currentResolver = await publicClient.readContract({
      address: AGENTS_REGISTRY,
      abi: registryAbi,
      functionName: "getResolver",
      args: [agent],
    });
  
    console.log();
    console.log(`${agent}.agents.trinityguard.eth`);
    console.log(
      "  Label ID:",
      `0x${rawLabelId.toString(16).padStart(64, "0")}`,
    );
    console.log("  Token ID:", tokenId.toString());
    console.log("  Current resolver:", currentResolver);
  
    if (
      currentResolver.toLowerCase() ===
      PERMISSIONED_RESOLVER.toLowerCase()
    ) {
      console.log("  Resolver already configured ✓");
      continue;
    }
  
    if (currentResolver.toLowerCase() !== ZERO_ADDRESS.toLowerCase()) {
      console.log(
        "  WARNING: replacing existing non-zero resolver:",
        currentResolver,
      );
    }
  
    const simulation = await publicClient.simulateContract({
      account,
      address: AGENTS_REGISTRY,
      abi: registryAbi,
      functionName: "setResolver",
      args: [tokenId, PERMISSIONED_RESOLVER],
    });
  
    console.log("  setResolver simulation OK");
  
    if (dryRun) {
      console.log("  DRY_RUN — transaction not sent");
      continue;
    }
  
    const hash = await walletClient.writeContract(simulation.request);
  
    console.log("  Transaction:", hash);
  
    const receipt = await publicClient.waitForTransactionReceipt({
      hash,
    });
  
    if (receipt.status !== "success") {
      throw new Error(`setResolver failed for ${agent}: ${hash}`);
    }
  
    const resolverAfter = await publicClient.readContract({
      address: AGENTS_REGISTRY,
      abi: registryAbi,
      functionName: "getResolver",
      args: [agent],
    });
  
    if (
      resolverAfter.toLowerCase() !==
      PERMISSIONED_RESOLVER.toLowerCase()
    ) {
      throw new Error(
        `Resolver verification failed for ${agent}: ${resolverAfter}`,
      );
    }
  
    console.log("  Resolver attached ✓");
  }
  
  /**
   * Important:
   *
   * In DRY_RUN mode Phase 1 has not changed chain state.
   *
   * setAddress() authorization/resolution may depend on the registry already
   * pointing to the resolver, so do not pretend the full end-to-end state
   * exists during this run.
   */
  if (dryRun) {
    console.log();
    console.log("DRY RUN complete.");
    console.log(
      "All setResolver calls simulated successfully. No transactions were sent.",
    );
    console.log();
    console.log(
      "Run without DRY_RUN to attach the resolver, then rerun this script",
    );
    console.log("to configure and verify address records.");
    process.exit(0);
  }
  
  /**
   * Phase 2
   *
   * Write Ethereum address records.
   *
   * For the hackathon demo all three agent identities currently point to
   * the same test wallet. Later each agent can have a different wallet.
   */
  console.log();
  console.log("Phase 2 — Configure address records");
  console.log("───────────────────────────────────");
  
  for (const agent of AGENTS) {
    const name = `${agent}.agents.trinityguard.eth`;
    const dnsName = dnsEncode(name);
    const value = addressToBytes(account.address);
  
    console.log();
    console.log(name);
    console.log("  DNS name:", dnsName);
    console.log("  coinType:", COIN_TYPE_ETH.toString());
    console.log("  Address:", account.address);
  
    const simulation = await publicClient.simulateContract({
      account,
      address: PERMISSIONED_RESOLVER,
      abi: resolverAbi,
      functionName: "setAddress",
      args: [dnsName, COIN_TYPE_ETH, value],
    });
  
    console.log("  setAddress simulation OK");
  
    const hash = await walletClient.writeContract(simulation.request);
  
    console.log("  Transaction:", hash);
  
    const receipt = await publicClient.waitForTransactionReceipt({
      hash,
    });
  
    if (receipt.status !== "success") {
      throw new Error(`setAddress failed for ${name}: ${hash}`);
    }
  
    console.log("  Address record written ✓");
  }
  
  /**
   * Phase 3
   *
   * Verify through the ENS Universal Resolver using viem.
   *
   * This is the important end-to-end test:
   *
   * name
   *   -> ENSv2 registry
   *   -> PermissionedResolver
   *   -> address record
   */
  console.log();
  console.log("Phase 3 — Universal Resolver verification");
  console.log("─────────────────────────────────────────");
  
  for (const agent of AGENTS) {
    const name = `${agent}.agents.trinityguard.eth}`;
  
    // Remove the accidental trailing brace from template construction.
    const normalizedName = name.slice(0, -1);
  
    const resolved = await publicClient.getEnsAddress({
      name: normalizedName,
    });
  
    console.log();
    console.log(normalizedName);
    console.log("  Resolved:", resolved ?? "null");
  
    if (!resolved) {
      throw new Error(`ENS resolution returned null for ${normalizedName}`);
    }
  
    if (resolved.toLowerCase() !== account.address.toLowerCase()) {
      throw new Error(
        [
          `Unexpected address for ${normalizedName}`,
          `Expected: ${account.address}`,
          `Actual:   ${resolved}`,
        ].join("\n"),
      );
    }
  
    console.log("  End-to-end resolution OK ✓");
  }
  
  console.log();
  console.log("Agent Resolution Setup complete.");