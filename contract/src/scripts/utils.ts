import { RpcProvider, Account, json } from "starknet";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config();

// ─── Provider ─────────────────────────────────────────────────────────────────

const network = process.env.NETWORK ?? "sepolia";

const RPC_URLS: Record<string, string> = {
  sepolia: "https://free-rpc.nethermind.io/sepolia-juno/",
  mainnet: "https://free-rpc.nethermind.io/mainnet-juno/",
  devnet: "http://127.0.0.1:5050/rpc",
};

const nodeUrl = process.env.RPC_URL ?? RPC_URLS[network];
export const provider = new RpcProvider({ nodeUrl, blockIdentifier: "latest" });

// ─── Deployer account ─────────────────────────────────────────────────────────

const deployerAddress = process.env.DEPLOYER_ADDRESS ?? "";
const deployerPrivkey = process.env.DEPLOYER_PRIVATE_KEY ?? "";

if (!deployerAddress || !deployerPrivkey) {
  console.warn("⚠️  DEPLOYER_ADDRESS or DEPLOYER_PRIVATE_KEY not set in .env");
}

export const deployer = new Account({ provider: { nodeUrl, blockIdentifier: "latest" }, address: deployerAddress, signer: deployerPrivkey });

// ─── Deploy helper ────────────────────────────────────────────────────────────

interface DeployOptions {
  contract: string;
  constructorArgs: Record<string, unknown>;
  salt?: string;
}

export async function deployContract({ contract, constructorArgs, salt }: DeployOptions) {
  const artifactsDir = path.join(__dirname, "../../target/dev");
  const sierraPath = path.join(artifactsDir, `stark_hackathon_${contract}.contract_class.json`);
  const casmPath = path.join(artifactsDir, `stark_hackathon_${contract}.compiled_contract_class.json`);

  if (!fs.existsSync(sierraPath)) {
    throw new Error(`Sierra artifact not found: ${sierraPath}\nRun: scarb build`);
  }

  const sierra = json.parse(fs.readFileSync(sierraPath).toString());
  const casm = json.parse(fs.readFileSync(casmPath).toString());

  // Declare (V3 transaction — required by Starknet Sepolia)
  let classHash = "";
  try {
    const declareResponse = await deployer.declare({ contract: sierra, casm }, { version: 3 });
    await provider.waitForTransaction(declareResponse.transaction_hash);
    console.log(`   Declared class hash: ${declareResponse.class_hash}`);
    classHash = declareResponse.class_hash;
  } catch (e: any) {
    const errorMsg = e.message || JSON.stringify(e);
    if (errorMsg.includes("already declared") || errorMsg.includes("is already declared")) {
      // It's already declared
      classHash = require("starknet").hash.computeContractClassHash(sierra);
      console.log(`   Class already declared. Computed hash: ${classHash}`);
    } else if (errorMsg.includes("Expected:") || (e.response && JSON.stringify(e.response).includes("Expected:"))) {
      try {
        const fullErr = errorMsg + (e.response ? JSON.stringify(e.response) : "");
        const match = fullErr.match(/Expected:\s*(0x[0-9a-fA-F]+)/);
        if (match && match[1]) {
           const expectedHash = match[1];
           console.log(`   Retrying declare with expected compiled class hash: ${expectedHash}`);
           const declareRetry = await deployer.declare({ contract: sierra, casm, compiledClassHash: expectedHash }, { version: 3 });
           await provider.waitForTransaction(declareRetry.transaction_hash);
           console.log(`   Declared class hash: ${declareRetry.class_hash}`);
           classHash = declareRetry.class_hash;
        } else {
           throw e;
        }
      } catch (retryErr: any) {
         if (retryErr.message && retryErr.message.includes("already declared")) {
            classHash = require("starknet").hash.computeContractClassHash(sierra);
            console.log(`   Class already declared on retry. Computed hash: ${classHash}`);
         } else {
            throw retryErr;
         }
      }
    } else {
      throw e;
    }
  }

  // Deploy (V3 transaction)
  const calldata = Object.values(constructorArgs).map((v) => v?.toString() ?? "0x0");

  const deployResponse = await deployer.deployContract(
    {
      classHash: classHash,
      constructorCalldata: calldata,
      salt: salt ?? Date.now().toString(),
    },
    { version: 3 }
  );

  await provider.waitForTransaction(deployResponse.transaction_hash);

  return {
    address: deployResponse.contract_address,
    classHash: classHash,
    txHash: deployResponse.transaction_hash,
  };
}

// ─── Export deployments ───────────────────────────────────────────────────────

export async function exportDeployments(deployments: Record<string, string>) {
  const outDir = path.join(__dirname, "../deployments");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const outFile = path.join(outDir, `${network}.json`);
  fs.writeFileSync(outFile, JSON.stringify(deployments, null, 2));
  console.log(`\n💾 Deployments saved to ${outFile}`);
}

export function loadDeployedAddresses(network: string): Record<string, string> {
  const filePath = path.join(__dirname, "../deployments", `${network}.json`);
  if (!fs.existsSync(filePath)) return {};
  return JSON.parse(fs.readFileSync(filePath).toString());
}
