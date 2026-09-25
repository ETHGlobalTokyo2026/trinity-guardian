import {
    createWalletClient,
    http,
    parseAbi,
  } from "viem";
  import { privateKeyToAccount } from "viem/accounts";
  import { sepolia } from "viem/chains";
  import { createEnsClient } from "../src/client.ts";
  
  const ETH_REGISTRY =
    "0x657eA849311d3D5823348ddEd7C2AaAFb3EDE09E";
  
  const USER_REGISTRY =
    "0x5d1bdd7650f9eC4bC01c7520E1Ea8640705b0DeD";
  
  const LABEL_ID =
    0x6bb0bb7af752ac565e5129da0ca4526b318c89e71aa604ab526c9a487e118862n;
  
  const rpcUrl = process.env.SEPOLIA_RPC_URL;
  const privateKey = process.env.PRIVATE_KEY;
  
  if (!rpcUrl) throw new Error("SEPOLIA_RPC_URL is required");
  if (!privateKey) throw new Error("PRIVATE_KEY is required");
  
  const account = privateKeyToAccount(
    (privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`) as `0x${string}`,
  );
  
  const publicClient = createEnsClient(rpcUrl);
  
  const walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport: http(rpcUrl),
  });
  
  const abi = parseAbi([
    "function setSubregistry(uint256 anyId,address registry)",
  ]);
  
  console.log("Attaching UserRegistry...");
  console.log("ETHRegistry:", ETH_REGISTRY);
  console.log("UserRegistry:", USER_REGISTRY);
  console.log("Account:", account.address);
  
  await publicClient.simulateContract({
    account,
    address: ETH_REGISTRY,
    abi,
    functionName: "setSubregistry",
    args: [LABEL_ID, USER_REGISTRY],
  });
  
  console.log("Simulation OK");
  
  const hash = await walletClient.writeContract({
    address: ETH_REGISTRY,
    abi,
    functionName: "setSubregistry",
    args: [LABEL_ID, USER_REGISTRY],
  });
  
  console.log("Transaction:", hash);
  
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  
  if (receipt.status !== "success") {
    throw new Error("setSubregistry transaction failed");
  }
  
  console.log("Subregistry attached successfully");