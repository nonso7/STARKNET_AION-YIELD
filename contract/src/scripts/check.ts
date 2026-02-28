import { RpcProvider, Account, json } from "starknet";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
dotenv.config();

const provider = new RpcProvider({ nodeUrl: process.env.RPC_URL || "https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_7/C0QbCFsNjOTOMdlpsNGao" });
const deployer = new Account(provider, process.env.DEPLOYER_ADDRESS!, process.env.DEPLOYER_PRIVATE_KEY!);

async function main() {
  const artifactsDir = path.join(__dirname, "../contracts/target/dev");
  const sierraPath = path.join(artifactsDir, `aion_yield_contracts_VesuAdapter.contract_class.json`);
  const casmPath = path.join(artifactsDir, `aion_yield_contracts_VesuAdapter.compiled_contract_class.json`);

  const sierra = json.parse(fs.readFileSync(sierraPath).toString());
  const casm = json.parse(fs.readFileSync(casmPath).toString());

  console.log("Trying to declare VesuAdapter...");
  try {
      const { transaction_hash, class_hash } = await deployer.declare({ contract: sierra, casm }, { version: 3 });
      console.log("Declared successfully! Tx:", transaction_hash, "Hash:", class_hash);
  } catch(e: any) {
      console.error("Declare error:", JSON.stringify((e as any).response || e, null, 2));
      console.error(e.message);
  }
}
main().catch(console.error);
