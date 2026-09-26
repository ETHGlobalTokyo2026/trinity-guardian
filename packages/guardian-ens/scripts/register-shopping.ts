import {
    createWalletClient,
    http,
    parseAbi,
    zeroAddress,
  } from "viem";
  import { privateKeyToAccount } from "viem/accounts";
  import { sepolia } from "viem/chains";
  import { createEnsClient } from "../src/client.ts";
  
  const AGENTS_REGISTRY =
    "0xacBFc574821fbE0865387Cb0A884D3ddBc91f166";
  
  const EXPIRY = 1821898044n;
  
  const rpcUrl = process.env.SEPOLIA_RPC_URL;
  const privateKey = process.env.PRIVATE_KEY;
  
  if (!rpcUrl) throw new Error("SEPOLIA_RPC_URL is required");
  if (!privateKey) throw new Error("PRIVATE_KEY is required");
  
  const account = privateKeyToAccount(
    (privateKey.startsWith("0x")
      ? privateKey
      : `0x${privateKey}`) as `0x${string}`,
  );
  
  const publicClient = createEnsClient(rpcUrl);
  
  const walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport: http(rpcUrl),
  });
  
  const abi = parseAbi([
    "function register(string label,address owner,address registry,address resolver,uint256 roleBitmap,uint64 expiry) returns (uint256)",
    "function getOwner(uint256 anyId) view returns (address)",
    "function getExpiry(uint256 anyId) view returns (uint64)",
  ]);
  
  const args = [
    "shopping",
    account.address,
    zeroAddress,
    zeroAddress,
    0n,
    EXPIRY,
  ] as const;
  
  console.log("Registering: shopping.agents.trinityguardian.eth");
  console.log("Registry:", AGENTS_REGISTRY);
  console.log("Owner:", account.address);
  console.log("Role bitmap: 0");
  console.log("Expiry:", EXPIRY.toString());
  
  const simulation = await publicClient.simulateContract({
    account,
    address: AGENTS_REGISTRY,
    abi,
    functionName: "register",
    args,
  });
  
  console.log("Simulation OK");
  console.log("Expected token ID:", simulation.result.toString());
  
  const hash = await walletClient.writeContract({
    address: AGENTS_REGISTRY,
    abi,
    functionName: "register",
    args,
  });
  
  console.log("Transaction:", hash);
  
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  
  if (receipt.status !== "success") {
    throw new Error("shopping registration failed");
  }
  
  console.log("shopping.agents.trinityguardian.eth registered successfully");