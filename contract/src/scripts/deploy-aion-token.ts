/**
 * Deploy updated AionVault (with aionToken ERC20) and mint to a target wallet.
 * Run: cd contract && bash -i -c "npx tsx src/scripts/deploy-aion-token.ts"
 *
 * Reuses existing deployed infrastructure:
 *   MockWBTC, StrategyRouter, VesuAdapter, EkuboAdapter, PrivacyLayer
 * Then mints aionToken directly to the target wallet via vault.mint().
 */

import { deployContract, deployer, provider, exportDeployments } from "./utils";
import * as dotenv from "dotenv";
dotenv.config();

// ─── Existing deployed infrastructure ────────────────────────────────────────
const MOCK_WBTC      = "0x5328d9159888277fd71c4512db7c0b92469ada0a777394ee84e7f3a59cac967";
const PRIVACY_LAYER  = "0x6ca61df5e017c18a98d5210e486784095537aef49f8e887584a96dd4af3730";
const STRATEGY_ROUTER= "0x5ac8afa902f2ae98c91419ed59c8bcca89983664ec66d0222ceb5d995d12168";
const VESU_ADAPTER   = "0x551f4168c0fc88f9578726b718f0f941e4d1faa7010179215c1e161bfb70f34";
const EKUBO_ADAPTER  = "0x52cbfc8f07792f269c3f593d63e9c2dfdc7d52f56a878e29f2f9edbc9adcd7a";

// ─── Target wallet to receive aionToken ──────────────────────────────────────
const MINT_TARGET = "0x04d54420eEC871484097DA03F6aE5d1b213d377881136062bF5Ca406B286642c";

// Mint 1 WBTC worth of aionToken (100_000_000 satoshis = 8 decimals)
const MINT_AMOUNT_LOW  = "100000000";
const MINT_AMOUNT_HIGH = "0";

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const owner = deployer.address;
  console.log("\n🚀 Deploying aionToken (AionVault with ERC20)...\n");
  console.log(`   Owner       : ${owner}`);
  console.log(`   Mint target : ${MINT_TARGET}`);
  console.log(`   Mint amount : 1 WBTC (${MINT_AMOUNT_LOW} sats)\n`);

  // 1. Deploy new AionVault (now implements aionToken ERC20)
  console.log("1/3 Deploying AionVault (aionToken)...");
  const aionVault = await deployContract({
    contract: "AionVault",
    constructorArgs: {
      owner,
      asset: MOCK_WBTC,
      privacy_layer: PRIVACY_LAYER,
      strategy_router: STRATEGY_ROUTER,
      vesu_adapter: VESU_ADAPTER,
      ekubo_adapter: EKUBO_ADAPTER,
      fee_recipient: owner,
    },
  });
  console.log(`   ✅ AionVault (aionToken): ${aionVault.address}\n`);

  // 2. Wire new vault into StrategyRouter and PrivacyLayer
  console.log("2/3 Updating StrategyRouter and PrivacyLayer to point to new vault...");
  const wireTx = await deployer.execute([
    {
      contractAddress: STRATEGY_ROUTER,
      entrypoint: "set_vault",
      calldata: [aionVault.address],
    },
    {
      contractAddress: PRIVACY_LAYER,
      entrypoint: "set_vault",
      calldata: [aionVault.address],
    },
  ]);
  await provider.waitForTransaction(wireTx.transaction_hash);
  console.log(`   ✅ Wired! Tx: ${wireTx.transaction_hash}\n`);

  // 3. Mint aionToken to target wallet
  console.log(`3/3 Minting 1 aionToken (WBTC-denominated) to ${MINT_TARGET}...`);
  const mintTx = await deployer.execute([
    {
      contractAddress: aionVault.address,
      entrypoint: "mint",
      calldata: [MINT_TARGET, MINT_AMOUNT_LOW, MINT_AMOUNT_HIGH],
    },
  ]);
  await provider.waitForTransaction(mintTx.transaction_hash);
  console.log(`   ✅ Minted! Tx: ${mintTx.transaction_hash}\n`);

  // Save deployments
  await exportDeployments({
    AionVault: aionVault.address,
    PrivacyLayer: PRIVACY_LAYER,
    StrategyRouter: STRATEGY_ROUTER,
    VesuAdapter: VESU_ADAPTER,
    EkuboAdapter: EKUBO_ADAPTER,
    MockWBTC: MOCK_WBTC,
  });

  console.log("═══════════════════════════════════════════════════════");
  console.log("  aionToken deployed and minted!");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  aionToken address : ${aionVault.address}`);
  console.log(`  Token name        : Aion Token`);
  console.log(`  Symbol            : aionToken`);
  console.log(`  Decimals          : 8`);
  console.log(`  Minted to         : ${MINT_TARGET}`);
  console.log(`  Amount            : 1.00000000 aionToken`);
  console.log("\n  Add to ArgentX: Settings → Manage tokens → Add custom token");
  console.log(`  Contract address  : ${aionVault.address}`);
  console.log("═══════════════════════════════════════════════════════\n");
}

main().catch(console.error);
