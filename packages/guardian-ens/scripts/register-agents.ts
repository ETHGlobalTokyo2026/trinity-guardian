import {
    createWalletClient,
    http,
    parseAbi,
    zeroAddress,
  } from "viem";
  import { privateKeyToAccount } from "viem/accounts";
  import { sepolia } from "viem/chains";
  import { createEnsClient } from "../src/client.ts";
  
  const USER_REGISTRY =
    "0x5d1bdd7650f9eC4bC01c7520E1Ea8640705b0DeD";
  
  const AGENTS_ROLES =
    0x110000100000000000000000000000001100001n;
  
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
  ]);
  
  const args = [
    "agents",
    account.address,
    zeroAddress,
    zeroAddress,
    AGENTS_ROLES,
    EXPIRY,
  ] as const;
  
  console.log("Registering: agents.trinityguardian.eth");
  console.log("Registry:", USER_REGISTRY);
  console.log("Owner:", account.address);
  console.log("Role bitmap:", `0x${AGENTS_ROLES.toString(16)}`);
  console.log("Expiry:", EXPIRY.toString());
  
  const simulation = await publicClient.simulateContract({
    account,
    address: USER_REGISTRY,
    abi,
    functionName: "register",
    args,
  });
  
  console.log("Simulation OK");
  console.log("Expected token ID:", simulation.result.toString());
  
  const hash = await walletClient.writeContract({
    address: USER_REGISTRY,
    abi,
    functionName: "register",
    args,
  });
  
  console.log("Transaction:", hash);
  
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  
  if (receipt.status !== "success") {
    throw new Error("agents registration failed");
  }
  
  console.log("agents.trinityguardian.eth registered successfully");