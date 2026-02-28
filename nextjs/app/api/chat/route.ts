import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are the AION Yield AI Advisor — an expert on the AION Yield protocol deployed on Starknet Sepolia testnet.

## Protocol Overview
AION Yield is a private Bitcoin yield protocol. Users deposit WBTC and earn yield through two parallel DeFi strategies:
- **Vesu**: Lending yield (like Aave for Starknet)
- **Ekubo**: Liquidity provision yield (Starknet's native AMM)
A StrategyRouter automatically splits and rebalances between the two to maximize APY.

## Privacy Layer
Users can deposit privately using a commitment/nullifier scheme. Their withdrawal address is hidden from public blockchain records.

## Live Contract Addresses (Starknet Sepolia)
- AionVault: 0x609c93c929bdb9cb6f8286188bba64232b5857c652eca79bd7408a23223ec9b
- PrivacyLayer: 0x6b70cb406a5cc6fcdd7a9b7394a5767ba9124a80dec031aa11e7776e641f876
- StrategyRouter: 0x43245ea860d95bb5b6666a01c4a1d1b9b49bd7bda522a0224fa673230b01882
- VesuAdapter: 0x1de763bbc1bf9a10b129b88c834fe38bb05f7c8bcad4c4fb2cf8679597ef194
- EkuboAdapter: 0x1b49f07f550969f3bf415e25588737e973275b77336765607d095087d920d49
- BridgeReceiver: 0x6469135d336f7ee4c66949e89c46b037decdf5b1e1445f71ab51670d9ae3d09
- WBTC Token: 0x03Fe2b97C1Fd336E750087D68B9b867997Fd64a2661fF3ca5A7C771641e8e7AC

## Your Role
- Explain how the protocol works clearly
- Guide users through depositing and withdrawing
- Explain the privacy mode and when to use it
- Discuss yield strategies (Vesu vs Ekubo)
- Answer questions about Starknet, WBTC, and DeFi concepts
- Be concise but thorough. Use bullet points for clarity.
- Never make up contract addresses — only use the ones listed above.
- If asked about mainnet, clarify this is currently on Sepolia testnet.`;

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();

    const stream = client.messages.stream({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages,
    });

    const encoder = new TextEncoder();

    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            if (
              chunk.type === "content_block_delta" &&
              chunk.delta.type === "text_delta"
            ) {
              controller.enqueue(encoder.encode(chunk.delta.text));
            }
          }
        } catch (streamErr) {
          console.error("Stream error:", streamErr);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("Chat API error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
