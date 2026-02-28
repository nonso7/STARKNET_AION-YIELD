/**
 * Deploy MockWBTC + mint tokens to a target wallet
 * Run: cd contract && npx tsx src/scripts/deploy-mock-wbtc.ts
 *
 * After running, copy the printed MockWBTC address into:
 *   nextjs/lib/contracts.ts → CONTRACTS.WBTC_TOKEN
 */

import { deployContract, deployer, provider } from "./utils";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config();

// ─── Config ───────────────────────────────────────────────────────────────────

// The wallet that should receive minted mock WBTC (your Argent X / Braavos wallet).
// Default: same as deployer. Pass USER_WALLET env var to override.
const MINT_TARGET = process.env.USER_WALLET || deployer.address;

// How much mock WBTC to mint (in satoshis, 1 BTC = 100_000_000 sats)
const MINT_AMOUNT_BTC = 10; // 10 WBTC for testing
const MINT_AMOUNT_SATS = BigInt(MINT_AMOUNT_BTC) * 100_000_000n;

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n🚀 Deploying MockWBTC...\n");
  console.log(`   Deployer  : ${deployer.address}`);
  console.log(`   Mint to   : ${MINT_TARGET}`);
  console.log(`   Mint amount: ${MINT_AMOUNT_BTC} WBTC (${MINT_AMOUNT_SATS} sats)\n`);

  // 1. Deploy MockWBTC
  const mockWBTC = await deployContract({
    contract: "MockWBTC",
    constructorArgs: { owner: deployer.address },
  });

  console.log(`\n✅ MockWBTC deployed at: ${mockWBTC.address}`);
  console.log(`   Class hash: ${mockWBTC.classHash}`);
  console.log(`   Tx hash   : ${mockWBTC.txHash}\n`);

  // 2. Mint to target wallet
  console.log(`💰 Minting ${MINT_AMOUNT_BTC} WBTC to ${MINT_TARGET}...`);

  // mint(recipient: ContractAddress, amount: u256)
  const mintTx = await deployer.execute([
    {
      contractAddress: mockWBTC.address,
      entrypoint: "mint",
      calldata: [MINT_TARGET, MINT_AMOUNT_SATS.toString(), "0"], // amount u256 = (low, high)
    },
  ]);
  await provider.waitForTransaction(mintTx.transaction_hash);
  console.log(`   ✅ Minted! Tx: ${mintTx.transaction_hash}\n`);

  // 3. Also mint to deployer if different from mint target
  if (MINT_TARGET !== deployer.address) {
    console.log(`💰 Minting ${MINT_AMOUNT_BTC} WBTC to deployer (${deployer.address})...`);
    const mintTx2 = await deployer.execute([
      {
        contractAddress: mockWBTC.address,
        entrypoint: "mint",
        calldata: [deployer.address, MINT_AMOUNT_SATS.toString(), "0"],
      },
    ]);
    await provider.waitForTransaction(mintTx2.transaction_hash);
    console.log(`   ✅ Minted! Tx: ${mintTx2.transaction_hash}\n`);
  }

  console.log("═══════════════════════════════════════════════════════");
  console.log("  ACTION REQUIRED: Update your frontend config");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`\n  In nextjs/lib/contracts.ts, set:`);
  console.log(`  WBTC_TOKEN: "${mockWBTC.address}",\n`);
  console.log("═══════════════════════════════════════════════════════\n");

  // Save address for reference
  const outFile = path.join(__dirname, "../deployments/mock-wbtc.json");
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify({
    MockWBTC: mockWBTC.address,
    classHash: mockWBTC.classHash,
    mintTarget: MINT_TARGET,
    mintAmount: MINT_AMOUNT_SATS.toString(),
  }, null, 2));
  console.log(`💾 Saved to ${outFile}`);
}

main().catch(console.error);
