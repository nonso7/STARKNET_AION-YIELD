/**
 * Setup mock pools so deposits can flow end-to-end on testnet.
 *
 * 1. Deploy MockVesuPool (no-op ERC4626, tracks balances internally)
 * 2. VesuAdapter.add_pool(pool_id=1, mock_vesu_pool)
 * 3. StrategyRouter.update_targets(vesu=10000, ekubo=0)
 *    → All deposits go to Vesu; Ekubo bypassed (needs real pool key on mainnet)
 *
 * Run: cd contract && npx tsx src/scripts/setup-pools.ts
 */

import { deployContract, deployer, provider } from "./utils";
import * as dotenv from "dotenv";
dotenv.config();

const VESU_ADAPTER    = "0x0551f4168c0fc88f9578726b718f0f941e4d1faa7010179215c1e161bfb70f34";
const STRATEGY_ROUTER = "0x05ac8afa902f2ae98c91419ed59c8bcca89983664ec66d0222ceb5d995d12168";

async function main() {
  console.log("\n🔧 Setting up mock pools for testnet...\n");

  // 1. Deploy MockVesuPool
  console.log("1/3 Deploying MockVesuPool...");
  const mockVesuPool = await deployContract({
    contract: "MockVesuPool",
    constructorArgs: {},
  });
  console.log(`   ✅ MockVesuPool: ${mockVesuPool.address}\n`);

  // 2. Add MockVesuPool to VesuAdapter (pool_id = 1)
  console.log("2/3 Registering MockVesuPool in VesuAdapter...");
  const addPoolTx = await deployer.execute([
    {
      contractAddress: VESU_ADAPTER,
      entrypoint: "add_pool",
      calldata: [
        "1",                    // pool_id (felt252)
        mockVesuPool.address,   // v_token address
      ],
    },
  ]);
  await provider.waitForTransaction(addPoolTx.transaction_hash);
  console.log(`   ✅ Pool added. Tx: ${addPoolTx.transaction_hash}\n`);

  // 3. Set StrategyRouter to 100% Vesu, 0% Ekubo (Ekubo needs real pool key)
  console.log("3/3 Setting StrategyRouter targets: 100% Vesu, 0% Ekubo...");
  const targetsTx = await deployer.execute([
    {
      contractAddress: STRATEGY_ROUTER,
      entrypoint: "update_targets",
      calldata: [
        "10000", // vesu_bps (100%)
        "0",     // ekubo_bps (0%)
      ],
    },
  ]);
  await provider.waitForTransaction(targetsTx.transaction_hash);
  console.log(`   ✅ Targets updated. Tx: ${targetsTx.transaction_hash}\n`);

  console.log("═══════════════════════════════════════════════");
  console.log("  ✅ Setup complete! Deposits should work now.");
  console.log("═══════════════════════════════════════════════");
  console.log(`\n  MockVesuPool: ${mockVesuPool.address}\n`);
}

main().catch(console.error);
