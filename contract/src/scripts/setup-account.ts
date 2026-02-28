/**
 * Deploy the new OZ deployer account on Sepolia.
 * Run AFTER funding the counterfactual address with testnet STRK/ETH.
 *
 * Usage: node_modules/.bin/tsx src/scripts/setup-account.ts
 */

import { RpcProvider, Account, hash, CallData, ec } from "starknet";
import * as dotenv from "dotenv";

dotenv.config();

const OZ_CLASS_HASH = "0x061dac032f228abef9c6626f995015233097ae253a7f72d68552db02f2971b8f";
const nodeUrl = process.env.RPC_URL ?? "https://free-rpc.nethermind.io/sepolia-juno/";
const deployerAddress = process.env.DEPLOYER_ADDRESS ?? "";
const deployerPrivkey = process.env.DEPLOYER_PRIVATE_KEY ?? "";

async function main() {
  const provider = new RpcProvider({ nodeUrl });
  const account = new Account({ provider: { nodeUrl }, address: deployerAddress, signer: deployerPrivkey });

  const pubKey = ec.starkCurve.getStarkKey(deployerPrivkey);
  const constructorCalldata = CallData.compile({ publicKey: pubKey });

  console.log("Deploying OZ account...");
  console.log("Address:", deployerAddress);

  // Check balance first
  try {
    const nonce = await provider.getNonceForAddress(deployerAddress);
    console.log("Current nonce:", nonce, "(if > 0, account is already deployed)");
  } catch {
    console.log("Account not yet deployed (expected for counterfactual address).");
  }

  const { transaction_hash, contract_address } = await account.deploySelf({
    classHash: OZ_CLASS_HASH,
    constructorCalldata,
    addressSalt: pubKey,
  });

  console.log("Deploy tx:", transaction_hash);
  await provider.waitForTransaction(transaction_hash);
  console.log("OZ account deployed at:", contract_address);
  console.log("\nYou can now run the main deploy script.");
}

main().catch((e) => {
  console.error("Error:", e.message ?? e);
  process.exit(1);
});
