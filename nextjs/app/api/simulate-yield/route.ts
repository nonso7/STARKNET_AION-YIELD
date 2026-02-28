/**
 * POST /api/simulate-yield
 * Simulates a WBTC yield deposit to a chosen strategy (Vesu or Ekubo).
 * Reads live APY from on-chain, then computes projected returns and a mock tx hash.
 * Does NOT require Anthropic API credits — pure on-chain + math.
 */

import { NextResponse } from "next/server";
import { RpcProvider } from "starknet";

const AION_VAULT = "0x026678549ab6611b092d99527ead085713f3bd36ebdcbf1755dee4289d0fdcd7";

// Fallback APY if RPC fails (basis points)
const FALLBACK_APY_BPS: Record<string, number> = {
  vesu:  650,  // 6.50%
  ekubo: 1120, // 11.20%
};

const STRATEGY_LABELS: Record<string, string> = {
  vesu:  "Vesu Lending",
  ekubo: "Ekubo Liquidity",
};

function mockTxHash(strategy: string, amount: string, ts: number): string {
  // Deterministic-looking hash based on inputs
  const seed = `${strategy}${amount}${ts}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = (Math.imul(h, 0x01000193) >>> 0);
  }
  const hex = h.toString(16).padStart(8, "0");
  return `0x0${hex}a4f9b2c71e3d8${Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, "0")}4a9c2b1f`;
}

function fmtWBTC(satoshis: number): string {
  return (satoshis / 1e8).toFixed(8);
}

export async function POST(req: Request) {
  try {
    const { strategy, amount } = await req.json();

    if (!strategy || !amount) {
      return NextResponse.json({ error: "strategy and amount required" }, { status: 400 });
    }

    const amountBTC = parseFloat(amount);
    if (isNaN(amountBTC) || amountBTC <= 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }

    // Try to read live blended APY from contract
    let apyBps = FALLBACK_APY_BPS[strategy] ?? 700;
    try {
      const nodeUrl = process.env.STARKNET_RPC_URL ?? "https://free-rpc.nethermind.io/sepolia-juno/";
      const provider = new RpcProvider({ nodeUrl });
      const res = await provider.callContract({
        contractAddress: AION_VAULT,
        entrypoint: "get_apy_bps",
        calldata: [],
      });
      const blendedBps = Number(BigInt(res[0]));
      if (blendedBps > 0) {
        // Vesu gets ~60% of blended APY, Ekubo gets ~140% (higher risk/reward)
        apyBps = strategy === "vesu"
          ? Math.round(blendedBps * 0.6)
          : Math.round(blendedBps * 1.4);
      }
    } catch {
      // Use fallback — RPC error doesn't fail the simulation
    }

    const apyDecimal = apyBps / 10000;
    const satoshis = Math.round(amountBTC * 1e8);

    const yield30d  = fmtWBTC(Math.round(satoshis * apyDecimal * (30 / 365)));
    const yield90d  = fmtWBTC(Math.round(satoshis * apyDecimal * (90 / 365)));
    const yield1y   = fmtWBTC(Math.round(satoshis * apyDecimal));

    const ts = Date.now();
    const txHash = mockTxHash(strategy, amount, ts);
    const block  = 300000 + Math.floor(Math.random() * 50000);

    return NextResponse.json({
      strategy,
      strategyLabel: STRATEGY_LABELS[strategy] ?? strategy,
      amount: amountBTC.toFixed(8),
      apyBps,
      apyFormatted: (apyDecimal * 100).toFixed(2) + "%",
      yield30d,
      yield90d,
      yield1y,
      txHash,
      block,
      timestamp: ts,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
