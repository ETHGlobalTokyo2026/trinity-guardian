import { parseAbi } from "viem";

/**
 * ENSv2 beta on Sepolia — official deployment tagged `sepolia-deployment-2026-09-15`
 * (ensdomains/contracts-v2, contracts/deployments/sepolia/addresses.md).
 */
export const ENS_SEPOLIA = {
  chainId: 11155111,
  universalResolver: "0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe",
  rootRegistry: "0x9703dbd26dab89504490994138cf2c575251a9ce",
  ethRegistry: "0x657ea849311d3d5823348dded7c2aaafb3ede09e",
  ethRegistrar: "0xabe76f6c8dfced81aa5a2bb8034202a7136b94ca",
  mockUsdc: "0x16f95d91dba7da3aca778ec053df0ff6c6a8aa8e",
  verifiableFactory: "0x9e726eb570beb6bceb495ab8cda7df517d4e841c",
  userRegistryImpl: "0xa80338aaa8d23831cea25e858d1774534abb0263",
  permissionedResolverImpl: "0x14f09fd05d4585759e54844dc9b00147131cf243",
} as const;

/**
 * Enhanced Access Control bitmap: 32 regular nybbles in the low 128 bits, their
 * admin counterparts in the high 128 bits. RegistryRolesLib uses nybbles 0–9
 * and 30–31; nybbles 10–29 are free for application roles.
 *
 * `spend` is our application role: holding it on the agent's subname is what
 * lets the agent sign payments. Revoking it is the kill switch.
 */
export const ROLE_SPEND = 1n << 40n; // nybble 10
export const ROLE_SPEND_ADMIN = ROLE_SPEND << 128n;
export const ROLE_UNREGISTER = 1n << 12n;
export const ROLE_RENEW = 1n << 16n;
export const ROLE_SET_SUBREGISTRY = 1n << 20n;
export const ROLE_SET_RESOLVER = 1n << 24n;
/** Every regular + admin role (bit 0 of all 64 nybbles). */
export const ALL_ROLES = Array.from({ length: 64 }, (_, i) => 1n << BigInt(i * 4)).reduce((a, b) => a | b, 0n);

/** Resolver-side EAC uses its own numbering. */
export const RESOLVER_ROLE_SET_ADDRESS = 1n << 0n;
export const RESOLVER_ROLE_SET_TEXT = 1n << 4n;

export const NAME_STATUS = ["available", "reserved", "registered"] as const;

/** ENS text-record keys that hold the mandate. */
export const MANDATE_KEYS = {
  perTxMax: "com.payguard.perTxMax",
  dailyCap: "com.payguard.dailyCap",
  asset: "com.payguard.asset",
  network: "com.payguard.network",
  allowlist: "com.payguard.allowlist",
  /** ENSIP-26 agent records */
  agentContext: "agent-context",
  agentEndpointWeb: "agent-endpoint[web]",
} as const;

export const registryAbi = parseAbi([
  "function hasRoles(uint256 anyId, uint256 roleBitmap, address account) view returns (bool)",
  "function roles(uint256 anyId, address account) view returns (uint256)",
  "function getExpiry(uint256 anyId) view returns (uint64)",
  "function getStatus(uint256 anyId) view returns (uint8)",
  "function getOwner(uint256 anyId) view returns (address)",
  "function getResolver(string label) view returns (address)",
  "function getSubregistry(string label) view returns (address)",
  "function register(string label, address owner, address registry, address resolver, uint256 roleBitmap, uint64 expiry) returns (uint256)",
  "function grantRoles(uint256 anyId, uint256 roleBitmap, address account) returns (bool)",
  "function revokeRoles(uint256 anyId, uint256 roleBitmap, address account) returns (bool)",
  "function renew(uint256 anyId, uint64 newExpiry)",
  "function unregister(uint256 anyId)",
  "function setResolver(uint256 anyId, address resolver)",
  "function setSubregistry(uint256 anyId, address registry)",
  "function initialize((address account, uint256 roleBitmap)[] grants)",
]);

export const resolverAbi = parseAbi([
  "function initialize((address account, uint256 roleBitmap)[] grants, bytes[] calls)",
  "function setText(bytes name, string key, string value)",
  "function setAddress(bytes name, uint256 coinType, bytes addressBytes)",
  "function multicall(bytes[] calls) returns (bytes[])",
  "function resolve(bytes name, bytes data) view returns (bytes)",
  "function grantSetterRoles(bytes setter, address account) returns (bool)",
]);

export const factoryAbi = parseAbi([
  "function deployProxy(address implementation, uint256 salt, bytes data) returns (address proxy)",
  "event ProxyDeployed(address sender, address proxyAddress, uint256 salt, address implementation)",
]);

export const registrarAbi = parseAbi([
  "function isAvailable(string label) view returns (bool)",
  "function getRegisterPrice(string label, uint64 duration, address paymentToken) view returns (uint256 base, uint256 premium)",
  "function makeCommitment(string label, address owner, bytes32 secret, address subregistry, address resolver, uint64 duration, bytes32 referrer) pure returns (bytes32)",
  "function commit(bytes32 commitment)",
  "function register(string label, address owner, bytes32 secret, address subregistry, address resolver, uint64 duration, address paymentToken, bytes32 referrer) returns (uint256 tokenId)",
  "function MIN_COMMITMENT_AGE() view returns (uint64)",
]);

export const erc20Abi = parseAbi([
  "function mint(address to, uint256 amount)",
  "function approve(address spender, uint256 value) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
]);
