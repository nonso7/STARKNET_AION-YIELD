/**
 * Redeploy all AION Yield contracts using MockWBTC as the asset.
 * Run: cd contract && npx tsx src/scripts/redeploy-with-mock.ts
 */

import { deployContract, deployer, provider, exportDeployments } from "./utils";
import * as dotenv from "dotenv";

dotenv.config();

// ─── Addresses ────────────────────────────────────────────────────────────────

const MOCK_WBTC    = "0x5328d9159888277fd71c4512db7c0b92469ada0a777394ee84e7f3a59cac967";
const AVNU_SEPOLIA = "0x02c56e8b00dbe2a71e57472685378fc8988bba947e9a99b26a00fade2b4fe7c2";
const EKUBO_CORE   = "0x00000005dd3d2f4429af886cd1a3b08289dbcea99a294197e9eb43b0e0325b4";
const ETH_SEPOLIA  = "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7";
const GARDEN_BRIDGE = "0x0000000000000000000000000000000000000000000000000000000000000001";

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const owner = deployer.address;
  console.log("\n🚀 Redeploying AION Yield with MockWBTC...\n");
  console.log(`   Owner     : ${owner}`);
  console.log(`   MockWBTC  : ${MOCK_WBTC}\n`);

  // 1. VesuAdapter
  console.log("1/6 Deploying VesuAdapter...");
  const vesuAdapter = await deployContract({
    contract: "VesuAdapter",
    constructorArgs: { owner, vault: "0x0", asset: MOCK_WBTC },
  });
  console.log(`   ✅ VesuAdapter: ${vesuAdapter.address}\n`);

  // 2. EkuboAdapter
  console.log("2/6 Deploying EkuboAdapter...");
  const ekuboAdapter = await deployContract({
    contract: "EkuboAdapter",
    constructorArgs: { owner, vault: "0x0", asset: MOCK_WBTC, paired_token: ETH_SEPOLIA, ekubo_core: EKUBO_CORE },
  });
  console.log(`   ✅ EkuboAdapter: ${ekuboAdapter.address}\n`);

  // 3. PrivacyLayer
  console.log("3/6 Deploying PrivacyLayer...");
  const privacyLayer = await deployContract({
    contract: "PrivacyLayer",
    constructorArgs: { owner, vault: "0x0", initial_root: "0x0" },
  });
  console.log(`   ✅ PrivacyLayer: ${privacyLayer.address}\n`);

  // 4. StrategyRouter
  console.log("4/6 Deploying StrategyRouter...");
  const strategyRouter = await deployContract({
    contract: "StrategyRouter",
    constructorArgs: {
      owner,
      vault: "0x0",
      vesu_adapter: vesuAdapter.address,
      ekubo_adapter: ekuboAdapter.address,
      asset: MOCK_WBTC,
      avnu_exchange: AVNU_SEPOLIA,
    },
  });
  console.log(`   ✅ StrategyRouter: ${strategyRouter.address}\n`);

  // 5. AionVault
  console.log("5/6 Deploying AionVault...");
  const aionVault = await deployContract({
    contract: "AionVault",
    constructorArgs: {
      owner,
      asset: MOCK_WBTC,
      privacy_layer: privacyLayer.address,
      strategy_router: strategyRouter.address,
      vesu_adapter: vesuAdapter.address,
      ekubo_adapter: ekuboAdapter.address,
      fee_recipient: owner,
    },
  });
  console.log(`   ✅ AionVault: ${aionVault.address}\n`);

  // 6. BridgeReceiver
  console.log("6/6 Deploying BridgeReceiver...");
  const bridgeReceiver = await deployContract({
    contract: "BridgeReceiver",
    constructorArgs: {
      owner,
      vault: aionVault.address,
      wbtc_token: MOCK_WBTC,
      bridge_gateway: GARDEN_BRIDGE,
    },
  });
  console.log(`   ✅ BridgeReceiver: ${bridgeReceiver.address}\n`);

  // Save
  const deployments = {
    AionVault: aionVault.address,
    PrivacyLayer: privacyLayer.address,
    StrategyRouter: strategyRouter.address,
    VesuAdapter: vesuAdapter.address,
    EkuboAdapter: ekuboAdapter.address,
    BridgeReceiver: bridgeReceiver.address,
    MockWBTC: MOCK_WBTC,
    AVNU: AVNU_SEPOLIA,
    EkuboCore: EKUBO_CORE,
  };

  await exportDeployments(deployments);

  console.log("═══════════════════════════════════════════════════════");
  console.log("  Update nextjs/lib/contracts.ts with these addresses:");
  console.log("═══════════════════════════════════════════════════════");
  Object.entries(deployments).forEach(([k, v]) => console.log(`  ${k.padEnd(16)}: "${v}"`));
  console.log("═══════════════════════════════════════════════════════\n");
}

main().catch(console.error);
