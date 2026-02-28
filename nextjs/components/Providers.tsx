"use client";

import { ReactNode } from "react";
import { mainnet, sepolia } from "@starknet-react/chains";
import {
  StarknetConfig,
  argent,
  braavos,
  useInjectedConnectors,
  voyager,
  jsonRpcProvider,
} from "@starknet-react/core";
import { Toaster } from "react-hot-toast";

function Providers({ children }: { children: ReactNode }) {
  const { connectors } = useInjectedConnectors({
    recommended: [argent(), braavos()],
    includeRecommended: "onlyIfNoConnectors",
    order: "random",
  });

  return (
    <StarknetConfig
      chains={[sepolia, mainnet]}
      provider={jsonRpcProvider({
        rpc: (chain) => ({
          nodeUrl:
            chain.id === BigInt(sepolia.id)
              ? "https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_10/C0QbCFsNjOTOMdlpsNGao"
              : "https://starknet-mainnet.public.blastapi.io/rpc/v0_7",
        }),
      })}
      connectors={connectors}
      explorer={voyager}
      autoConnect
    >
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: "#12121A",
            color: "#E0E0F0",
            border: "1px solid #1E1E2E",
          },
        }}
      />
      {children}
    </StarknetConfig>
  );
}

export default Providers;
