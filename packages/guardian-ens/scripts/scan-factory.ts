import {
    getAddress,
    parseAbi,
  } from "viem";
  import { createEnsClient } from "../src/client.ts";
  
  const rpcUrl = process.env.SEPOLIA_RPC_URL;
  if (!rpcUrl) throw new Error("SEPOLIA_RPC_URL is required");
  
  const FACTORY =
    "0x9e726eb570beb6bceb495ab8cda7df517d4e841c" as const;
  
  const factoryAbi = parseAbi([
    "event ProxyDeployed(address indexed sender,address indexed proxyAddress,uint256 salt,address implementation)",
    "function verifyContract(address proxy) view returns (address)",
  ]);
  
  const client = createEnsClient(rpcUrl);
  
  const latest = await client.getBlockNumber();
  
  console.log("Network: Ethereum Sepolia");
  console.log("Factory:", FACTORY);
  console.log("Latest block:", latest.toString());
  console.log("Scanning ProxyDeployed events...\n");
  
  // RPC providers often limit eth_getLogs range.
  // Scan backwards in chunks.
  const CHUNK = 50_000n;
  
  const implementations = new Map<
    string,
    {
      implementation: `0x${string}`;
      proxies: Set<string>;
    }
  >();
  
  let toBlock = latest;
  
  while (toBlock >= 0n) {
    const fromBlock =
      toBlock >= CHUNK ? toBlock - CHUNK + 1n : 0n;
  
    try {
      const logs = await client.getContractEvents({
        address: FACTORY,
        abi: factoryAbi,
        eventName: "ProxyDeployed",
        fromBlock,
        toBlock,
      });
  
      for (const log of logs) {
        const implementation = getAddress(
          log.args.implementation!,
        );
  
        const proxy = getAddress(
          log.args.proxyAddress!,
        );
  
        const key = implementation.toLowerCase();
  
        let entry = implementations.get(key);
  
        if (!entry) {
          entry = {
            implementation,
            proxies: new Set(),
          };
          implementations.set(key, entry);
        }
  
        entry.proxies.add(proxy);
      }
  
      if (logs.length > 0) {
        console.log(
          `blocks ${fromBlock}-${toBlock}: ${logs.length} events`,
        );
      }
    } catch (error) {
      console.error(
        `Failed blocks ${fromBlock}-${toBlock}`,
      );
      throw error;
    }
  
    if (fromBlock === 0n) break;
  
    toBlock = fromBlock - 1n;
  }
  
  console.log("\n===== IMPLEMENTATIONS =====");
  
  for (const entry of implementations.values()) {
    console.log("\nImplementation:", entry.implementation);
    console.log("Proxy count:", entry.proxies.size);
  
    for (const proxy of entry.proxies) {
      const verified = await client.readContract({
        address: FACTORY,
        abi: factoryAbi,
        functionName: "verifyContract",
        args: [proxy as `0x${string}`],
      });
  
      console.log("  Proxy:", proxy);
      console.log("    verifyContract:", verified);
    }
  }