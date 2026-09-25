import {
    createWalletClient,
    http,
    keccak256,
    parseAbi,
    stringToHex,
  } from "viem";
  import { privateKeyToAccount } from "viem/accounts";
  import { sepolia } from "viem/chains";
  import { createEnsClient } from "../src/client.ts";
  
  const PARENT_REGISTRY =
    "0x5d1bdd7650f9eC4bC01c7520E1Ea8640705b0DeD";
  
  const AGENTS_REGISTRY =
    "0xacBFc574821fbE0865387Cb0A884D3ddBc91f166";
  
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
    "function setSubregistry(uint256 anyId,address registry)",
    "function getSubregistry(string label) view returns (address)",
  ]);
  
  const agentsId = BigInt(keccak256(stringToHex("agents")));
  
  console.log("Attaching agents UserRegistry...");
  console.log("Parent Registry:", PARENT_REGISTRY);
  console.log("Label: agents");
  console.log("Label ID:", `0x${agentsId.toString(16)}`);
  console.log("Subregistry:", AGENTS_REGISTRY);
  console.log("Account:", account.address);
  
  const { request } = await publicClient.simulateContract({
    account,
    address: PARENT_REGISTRY,
    abi,
    functionName: "setSubregistry",
    args: [agentsId, AGENTS_REGISTRY],
  });
  
  console.log("Simulation OK");
  
  const hash = await walletClient.writeContract(request);
  
  console.log("Transaction:", hash);
  
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  
  if (receipt.status !== "success") {
    throw new Error("Failed to attach agents UserRegistry");
  }
  
  const attached = await publicClient.readContract({
    address: PARENT_REGISTRY,
    abi,
    functionName: "getSubregistry",
    args: ["agents"],
  });
  
  console.log("Attached registry:", attached);
  
  if (attached.toLowerCase() !== AGENTS_REGISTRY.toLowerCase()) {
    throw new Error(
      `Subregistry verification failed: expected ${AGENTS_REGISTRY}, got ${attached}`,
    );
  }
  
  console.log("agents UserRegistry attached successfully");