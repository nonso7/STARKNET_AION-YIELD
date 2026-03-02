// ─── Contract Addresses (Starknet Sepolia Testnet) ────────────────────────────
// Source of truth: contract/src/deployments/sepolia.json

export const CONTRACTS = {
  AION_VAULT:      "0x018b03d2e97e5721eea24b52cbb7a1485cbd57238baef7f49a920360767392ce",
  PRIVACY_LAYER:   "0x006ca61df5e017c18a98d5210e486784095537aef49f8e887584a96dd4af3730",
  STRATEGY_ROUTER: "0x05ac8afa902f2ae98c91419ed59c8bcca89983664ec66d0222ceb5d995d12168",
  VESU_ADAPTER:    "0x0551f4168c0fc88f9578726b718f0f941e4d1faa7010179215c1e161bfb70f34",
  EKUBO_ADAPTER:   "0x052cbfc8f07792f269c3f593d63e9c2dfdc7d52f56a878e29f2f9edbc9adcd7a",
  BRIDGE_RECEIVER: "0x01be537ecb1c9cb3c6833ff04fda5e20784dd0ff2d2261a41bb403988508ffc2",

  // MockWBTC — redeployed 2026-02-28, all contracts use MockWBTC as asset
  WBTC_TOKEN:    "0x05328d9159888277fd71c4512db7c0b92469ada0a777394ee84e7f3a59cac967",
  AVNU_EXCHANGE: "0x02c56e8b00dbe2a71e57472685378fc8988bba947e9a99b26a00fade2b4fe7c2",
  EKUBO_CORE:    "0x00000005dd3d2f4429af886cd1a3b08289dbcea99a294197e9eb43b0e0325b4",
} as const;

// ─── ABI Fragments ────────────────────────────────────────────────────────────

export const AION_VAULT_ABI = [
  {
    type: "function",
    name: "deposit",
    inputs: [{ name: "assets", type: "core::integer::u256" }],
    outputs: [{ type: "core::integer::u256" }],
    state_mutability: "external",
  },
  {
    type: "function",
    name: "deposit_private",
    inputs: [
      { name: "commitment", type: "core::felt252" },
      { name: "assets", type: "core::integer::u256" },
    ],
    outputs: [],
    state_mutability: "external",
  },
  {
    type: "function",
    name: "withdraw",
    inputs: [{ name: "shares", type: "core::integer::u256" }],
    outputs: [{ type: "core::integer::u256" }],
    state_mutability: "external",
  },
  {
    type: "function",
    name: "withdraw_private",
    inputs: [
      { name: "merkle_proof", type: "core::array::Span::<core::felt252>" },
      { name: "secret", type: "core::felt252" },
      { name: "nullifier", type: "core::felt252" },
      { name: "recipient", type: "core::starknet::contract_address::ContractAddress" },
      { name: "amount", type: "core::integer::u256" },
    ],
    outputs: [],
    state_mutability: "external",
  },
  {
    type: "function",
    name: "total_assets",
    inputs: [],
    outputs: [{ type: "core::integer::u256" }],
    state_mutability: "view",
  },
  {
    type: "function",
    name: "get_apy_bps",
    inputs: [],
    outputs: [{ type: "core::integer::u32" }],
    state_mutability: "view",
  },
  {
    type: "function",
    name: "get_tvl",
    inputs: [],
    outputs: [{ type: "core::integer::u256" }],
    state_mutability: "view",
  },
  {
    type: "function",
    name: "get_share_balance",
    inputs: [{ name: "account", type: "core::starknet::contract_address::ContractAddress" }],
    outputs: [{ type: "core::integer::u256" }],
    state_mutability: "view",
  },
  {
    type: "function",
    name: "convert_to_shares",
    inputs: [{ name: "assets", type: "core::integer::u256" }],
    outputs: [{ type: "core::integer::u256" }],
    state_mutability: "view",
  },
  {
    type: "function",
    name: "convert_to_assets",
    inputs: [{ name: "shares", type: "core::integer::u256" }],
    outputs: [{ type: "core::integer::u256" }],
    state_mutability: "view",
  },
] as const;

export const ERC20_ABI = [
  {
    type: "function",
    name: "approve",
    inputs: [
      { name: "spender", type: "core::starknet::contract_address::ContractAddress" },
      { name: "amount", type: "core::integer::u256" },
    ],
    outputs: [{ type: "core::bool" }],
    state_mutability: "external",
  },
  {
    type: "function",
    name: "balance_of",
    inputs: [{ name: "account", type: "core::starknet::contract_address::ContractAddress" }],
    outputs: [{ type: "core::integer::u256" }],
    state_mutability: "view",
  },
  {
    type: "function",
    name: "allowance",
    inputs: [
      { name: "owner", type: "core::starknet::contract_address::ContractAddress" },
      { name: "spender", type: "core::starknet::contract_address::ContractAddress" },
    ],
    outputs: [{ type: "core::integer::u256" }],
    state_mutability: "view",
  },
  {
    type: "function",
    name: "mint",
    inputs: [
      { name: "recipient", type: "core::starknet::contract_address::ContractAddress" },
      { name: "amount", type: "core::integer::u256" },
    ],
    outputs: [],
    state_mutability: "external",
  },
] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

export const WBTC_DECIMALS = 8;

export function formatWBTC(satoshis: bigint): string {
  const btc = Number(satoshis) / 1e8;
  return btc.toFixed(8);
}

export function parseWBTC(btcString: string): bigint {
  return BigInt(Math.round(parseFloat(btcString) * 1e8));
}

export function formatBPS(bps: number): string {
  return (bps / 100).toFixed(2) + "%";
}

export function truncateAddress(address: string): string {
  if (!address) return "";
  return address.slice(0, 6) + "..." + address.slice(-4);
}
