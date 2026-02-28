/**
 * AION Yield — Deployment Script
 * Run: cd packages/snfoundry && yarn deploy --network sepolia
 *
 * Deployment order:
 *  1. MockWBTC (testnet only) OR use real WBTC address
 *  2. VesuAdapter
 *  3. EkuboAdapter
 *  4. PrivacyLayer
 *  5. StrategyRouter
 *  6. AionVault
 *  7. BridgeReceiver
 */

import { deployContract, deployer, exportDeployments, loadDeployedAddresses } from "./utils";

// ─── Starknet Sepolia Addresses ───────────────────────────────────────────────
const WBTC_SEPOLIA = "0x03Fe2b97C1Fd336E750087D68B9b867997Fd64a2661fF3ca5A7C771641e8e7AC";
const AVNU_SEPOLIA = "0x02c56e8b00dbe2a71e57472685378fc8988bba947e9a99b26a00fade2b4fe7c2";
const EKUBO_CORE_SEPOLIA = "0x00000005dd3d2f4429af886cd1a3b08289dbcea99a294197e9eb43b0e0325b4";
const ETH_SEPOLIA = "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7";
const GARDEN_BRIDGE_SEPOLIA = "0x0000000000000000000000000000000000000000000000000000000000000001"; // Update when live

// ─── Main Deploy ───────────────────────────────────────────────────────────────

async function deployAionYield() {
  console.log("\n🚀 Deploying AION Yield Protocol...\n");
  const owner = deployer.address;
  console.log(`Owner: ${owner}\n`);

  // 1. VesuAdapter
  console.log("1/7 Deploying VesuAdapter...");
  const vesuAdapter = await deployContract({
    contract: "VesuAdapter",
    constructorArgs: {
      owner,
      vault: "0x0",  // Set after vault deploy
      asset: WBTC_SEPOLIA,
    },
  });
  console.log(`   VesuAdapter: ${vesuAdapter.address}\n`);

  // 2. EkuboAdapter
  console.log("2/7 Deploying EkuboAdapter...");
  const ekuboAdapter = await deployContract({
    contract: "EkuboAdapter",
    constructorArgs: {
      owner,
      vault: "0x0",  // Set after vault deploy
      asset: WBTC_SEPOLIA,
      paired_token: ETH_SEPOLIA,
      ekubo_core: EKUBO_CORE_SEPOLIA,
    },
  });
  console.log(`   EkuboAdapter: ${ekuboAdapter.address}\n`);

  // 3. PrivacyLayer
  console.log("3/7 Deploying PrivacyLayer...");
  const privacyLayer = await deployContract({
    contract: "PrivacyLayer",
    constructorArgs: {
      owner,
      vault: "0x0",  // Set after vault deploy
      initial_root: "0x0",
    },
  });
  console.log(`   PrivacyLayer: ${privacyLayer.address}\n`);

  // 4. StrategyRouter
  console.log("4/7 Deploying StrategyRouter...");
  const strategyRouter = await deployContract({
    contract: "StrategyRouter",
    constructorArgs: {
      owner,
      vault: "0x0",  // Set after vault deploy
      vesu_adapter: vesuAdapter.address,
      ekubo_adapter: ekuboAdapter.address,
      asset: WBTC_SEPOLIA,
      avnu_exchange: AVNU_SEPOLIA,
    },
  });
  console.log(`   StrategyRouter: ${strategyRouter.address}\n`);

  // 5. AionVault (main contract)
  console.log("5/7 Deploying AionVault...");
  const aionVault = await deployContract({
    contract: "AionVault",
    constructorArgs: {
      owner,
      asset: WBTC_SEPOLIA,
      privacy_layer: privacyLayer.address,
      strategy_router: strategyRouter.address,
      vesu_adapter: vesuAdapter.address,
      ekubo_adapter: ekuboAdapter.address,
      fee_recipient: owner,
    },
  });
  console.log(`   AionVault: ${aionVault.address}\n`);

  // 6. BridgeReceiver
  console.log("6/7 Deploying BridgeReceiver...");
  const bridgeReceiver = await deployContract({
    contract: "BridgeReceiver",
    constructorArgs: {
      owner,
      vault: aionVault.address,
      wbtc_token: WBTC_SEPOLIA,
      bridge_gateway: GARDEN_BRIDGE_SEPOLIA,
    },
  });
  console.log(`   BridgeReceiver: ${bridgeReceiver.address}\n`);

  // 7. Post-deploy: update vault references
  console.log("7/7 Updating cross-references...");
  // These would be called via starkli or account.execute in a real deploy script
  console.log("   → Set vault address in VesuAdapter, EkuboAdapter, PrivacyLayer, StrategyRouter");
  console.log("   → Add Vesu pool IDs to VesuAdapter");
  console.log("   → Configure Ekubo pool key in EkuboAdapter");

  // Export addresses
  const deployments = {
    AionVault: aionVault.address,
    PrivacyLayer: privacyLayer.address,
    StrategyRouter: strategyRouter.address,
    VesuAdapter: vesuAdapter.address,
    EkuboAdapter: ekuboAdapter.address,
    BridgeReceiver: bridgeReceiver.address,
    // External
    WBTC: WBTC_SEPOLIA,
    AVNU: AVNU_SEPOLIA,
    EkuboCore: EKUBO_CORE_SEPOLIA,
  };

  await exportDeployments(deployments);

  console.log("\n Deployment complete!");
  console.log("\n Contract Addresses:");
  Object.entries(deployments).forEach(([name, addr]) => {
    console.log(`   ${name.padEnd(16)}: ${addr}`);
  });

  console.log("\n Update frontend:");
  console.log("   packages/nextjs/lib/contracts.ts → CONTRACTS object");
}

deployAionYield().catch(console.error);
