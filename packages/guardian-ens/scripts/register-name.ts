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
  
  const MOCK_USDC =
    "0x16f95d91dba7da3aca778ec053df0ff6c6a8aa8e" as const;
  
  const rpcUrl = process.env.SEPOLIA_RPC_URL;
  const privateKey = process.env.PRIVATE_KEY;
  const secret = process.env.ENS_REGISTRATION_SECRET;
  
  if (!rpcUrl) throw new Error("SEPOLIA_RPC_URL is required");
  if (!privateKey) throw new Error("PRIVATE_KEY is required");
  if (!secret) throw new Error("ENS_REGISTRATION_SECRET is required");
  
  const account = privateKeyToAccount(privateKey as `0x${string}`);
  
  const publicClient = createEnsClient(rpcUrl);
  
  const walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport: http(rpcUrl),
  });
  
  const registrarAbi = parseAbi([
    "function isAvailable(string label) view returns (bool)",
    "function getRegisterPrice(string label,uint64 duration,address paymentToken) view returns (uint256 base,uint256 premium)",
    "function register(string label,address owner,bytes32 secret,address subregistry,address resolver,uint64 duration,address paymentToken,bytes32 referrer)",
  ]);
  
  const erc20Abi = parseAbi([
    "function allowance(address owner,address spender) view returns (uint256)",
    "function approve(address spender,uint256 amount) returns (bool)",
  ]);
  
  const label = process.argv[2];

  if (!label) {
    throw new Error(
      "Label is required. Example: pnpm ens:register trinityguard",
    );
  }
  const duration = 31_536_000n;
  
  const available = await publicClient.readContract({
    address: ETH_REGISTRAR,
    abi: registrarAbi,
    functionName: "isAvailable",
    args: [label],
  });
  
  if (!available) {
    throw new Error(`${label}.eth is no longer available`);
  }
  
  const [base, premium] = await publicClient.readContract({
    address: ETH_REGISTRAR,
    abi: registrarAbi,
    functionName: "getRegisterPrice",
    args: [label, duration, MOCK_USDC],
  });
  
  const price = base + premium;
  
  console.log("Registering:", `${label}.eth`);
  console.log("Owner:", account.address);
  console.log("Price:", price.toString(), "MockUSDC units");
  
  let allowance = await publicClient.readContract({
    address: MOCK_USDC,
    abi: erc20Abi,
    functionName: "allowance",
    args: [account.address, ETH_REGISTRAR],
  });
  
  console.log("Allowance:", allowance.toString());
  
  if (allowance < price) {
    console.log("Updating MockUSDC allowance...");
  
    const approveHash = await walletClient.writeContract({
      address: MOCK_USDC,
      abi: erc20Abi,
      functionName: "approve",
      args: [ETH_REGISTRAR, price],
    });
  
    await publicClient.waitForTransactionReceipt({
      hash: approveHash,
    });
  
    console.log("Approve tx:", approveHash);
  }
  
  console.log("Submitting registration...");
  
  const hash = await walletClient.writeContract({
    address: ETH_REGISTRAR,
    abi: registrarAbi,
    functionName: "register",
    args: [
      label,
      account.address,
      secret as `0x${string}`,
      zeroAddress,
      zeroAddress,
      duration,
      MOCK_USDC,
      zeroHash,
    ],
  });
  
  console.log("Register tx:", hash);
  
  const receipt = await publicClient.waitForTransactionReceipt({
    hash,
  });
  
  if (receipt.status !== "success") {
    throw new Error("Registration transaction reverted");
  }
  
  console.log("Registration confirmed.");
  console.log(`${label}.eth registered successfully`);