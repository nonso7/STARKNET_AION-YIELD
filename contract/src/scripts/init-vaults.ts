/**
 * Post-deployment initialization: call set_vault() on all adapter contracts.
 * Run: cd contract && npx tsx src/scripts/init-vaults.ts
 */

import { deployer, provider } from "./utils";
import * as dotenv from "dotenv";
dotenv.config();

const AION_VAULT      = "0x026678549ab6611b092d99527ead085713f3bd36ebdcbf1755dee4289d0fdcd7";
const PRIVACY_LAYER   = "0x006ca61df5e017c18a98d5210e486784095537aef49f8e887584a96dd4af3730";
const STRATEGY_ROUTER = "0x05ac8afa902f2ae98c91419ed59c8bcca89983664ec66d0222ceb5d995d12168";
const VESU_ADAPTER    = "0x0551f4168c0fc88f9578726b718f0f941e4d1faa7010179215c1e161bfb70f34";
const EKUBO_ADAPTER   = "0x052cbfc8f07792f269c3f593d63e9c2dfdc7d52f56a878e29f2f9edbc9adcd7a";

async function main() {
  console.log("\n⚙️  Initializing AION Yield contracts...\n");
  console.log(`   AionVault: ${AION_VAULT}\n`);

  // Call chain: AionVault → StrategyRouter → VesuAdapter / EkuboAdapter
  // So:
  //   PrivacyLayer.set_vault(AionVault)    — AionVault calls register_commitment
  //   StrategyRouter.set_vault(AionVault)  — AionVault calls deposit_to_strategies
  //   VesuAdapter.set_vault(StrategyRouter) — StrategyRouter calls vesu.deposit
  //   EkuboAdapter.set_vault(StrategyRouter) — StrategyRouter calls ekubo.deposit

  const tx = await deployer.execute([
    {
      contractAddress: PRIVACY_LAYER,
      entrypoint: "set_vault",
      calldata: [AION_VAULT],
    },
    {
      contractAddress: STRATEGY_ROUTER,
      entrypoint: "set_vault",
      calldata: [AION_VAULT],
    },
    {
      contractAddress: VESU_ADAPTER,
      entrypoint: "set_vault",
      calldata: [STRATEGY_ROUTER],   // caller is StrategyRouter, not AionVault
    },
    {
      contractAddress: EKUBO_ADAPTER,
      entrypoint: "set_vault",
      calldata: [STRATEGY_ROUTER],   // caller is StrategyRouter, not AionVault
    },
  ]);

  console.log(`   Tx sent: ${tx.transaction_hash}`);
  console.log("   Waiting for confirmation...");
  await provider.waitForTransaction(tx.transaction_hash);
  console.log("\n✅ All vaults initialized!");
  console.log("   PrivacyLayer   → vault = AionVault");
  console.log("   StrategyRouter → vault = AionVault");
  console.log("   VesuAdapter    → vault = StrategyRouter");
  console.log("   EkuboAdapter   → vault = StrategyRouter");
  console.log("\n   Deposits should now work.\n");
}

main().catch(console.error);
