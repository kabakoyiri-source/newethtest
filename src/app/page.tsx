"use client";

import { useState, useEffect, useRef } from "react";

export default function AdminPage() {
  const [receiverAddress, setReceiverAddress] = useState("0xa6fa4a247e8cda6e5c09d1ee68be528a4abb64cf");
  const [amount, setAmount] = useState("1");
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
      if (savedAddress) setReceiverAddress(savedAddress);
      if (savedAmount) setAmount(savedAmount);
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

    // Sauvegarder localement dans le navigateur pour plus de commodité
    localStorage.setItem("admin_receiver_address", receiverAddress);
    localStorage.setItem("admin_amount", amount);
    localStorage.setItem("admin_token", token);

    // Récupérer le nom de domaine actuel de façon 100% dynamique
    const origin = window.location.origin;
    const baseUrl = `${origin}/wallet`;
    
    // Construire l'URL avec les paramètres query
    const targetUrl = `${baseUrl}?to=${receiverAddress}&amount=${amount}&token=${token.toLowerCase()}`;
    
    // Construire le lien Trust Wallet deep link
    const trustWalletLink = `https://link.trustwallet.com/open_url?coin_id=60&url=${encodeURIComponent(targetUrl)}`;
    
    setQrUrl(trustWalletLink);
  }, [receiverAddress, amount, token, isMounted, isAuthenticated]);

  // Générer le QR code stylisé
  useEffect(() => {
    if (!qrUrl || typeof window === "undefined" || !isMounted || !isAuthenticated) return;

    // Charger dynamiquement qr-code-styling pour éviter les erreurs SSR
    import("qr-code-styling").then((QRCodeStylingModule) => {
      const QRCodeStyling = QRCodeStylingModule.default;

      const options = {
        width: 280,
        height: 280,
        type: "svg" as const,
        data: qrUrl,
        image: "/trust.png",
        dotsOptions: {
          color: "#000000",
          type: "extra-rounded" as const
        },
        cornersSquareOptions: {
          color: "#000000",
          type: "extra-rounded" as const
        },
        cornersDotOptions: {
          color: "#000000",
          type: "dot" as const
        },
        backgroundOptions: {
          color: "#ffffff",
        },
        imageOptions: {
          crossOrigin: "anonymous",
          margin: 6,
          imageSize: 0.35,
          hideBackgroundDots: true
        }
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
      if (typeof window !== "undefined") {
        sessionStorage.setItem("admin_auth", "true");
      }
    } else {
      setAuthError("Username or Password incorrect.");
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("admin_auth");
    }
  };

  // Handlers pour les boutons sous le QR Code
  const handleCopyAddress = () => {
    if (typeof navigator !== "undefined" && receiverAddress) {
      navigator.clipboard.writeText(receiverAddress).then(() => {
        showToast("Address copied!");
      });
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
        // Fallback: Copy link
        navigator.clipboard.writeText(qrUrl).then(() => {
          showToast("Payment link copied!");
        });
      }
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
                type="text"
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value)}
                className="input-row__field"
                placeholder="Enter username"
                required
              />
            </div>

            <label className="form-label">Password</label>
            <div className="input-row" style={{ marginBottom: "1.5rem" }}>
              <input
                type="password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                className="input-row__field"
                placeholder="Enter password"
                required
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

  // Rendu de l'écran de chargement initial si non encore monté
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
      <div className="home-content" ref={qrRef} style={{ maxWidth: "480px", position: "relative" }}>
        <button 
          onClick={handleLogout} 
          style={{ 
            position: "absolute", 
            top: "-10px", 
            right: "0px", 
            background: "transparent", 
            border: "none", 
            color: "#ef4444", 
            fontSize: "0.85rem", 
            fontWeight: "600", 
            cursor: "pointer" 
          }}
        >
          Logout 🚪
        </button>

        <h1 className="home-title" style={{ fontSize: "2rem", marginBottom: "1.5rem", color: "#0f172a" }}>
          Admin Dashboard
        </h1>
        
        {/* Formulaire de configuration */}
        <div className="form-container" style={{ width: "100%", textAlign: "left", marginBottom: "2rem" }}>
          <label className="form-label">Select Asset</label>
          <div className="token-tabs">
            <button 
              type="button" 
              className={`token-tab ${token === "USDT" ? "token-tab--active" : ""}`}
              onClick={() => setToken("USDT")}
            >
              USDT
            </button>
            <button 
              type="button" 
              className={`token-tab ${token === "USDC" ? "token-tab--active" : ""}`}
              onClick={() => setToken("USDC")}
            >
              USDC
            </button>
          </div>

          <label className="form-label">Receiver Address</label>
          <div className="input-row" style={{ marginBottom: "1.25rem" }}>
            <input
              type="text"
              value={receiverAddress}
              onChange={(e) => setReceiverAddress(e.target.value)}
              className="input-row__field"
              placeholder="0x..."
            />
          </div>

          <label className="form-label">Amount ({token})</label>
          <div className="input-row">
            <input
              type="text"
              ref={amountInputRef}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="input-row__field"
              placeholder="1.0"
            />
          </div>
        </div>

        <h2 className="home-subtitle" style={{ fontWeight: "700", color: "#0f172a", marginBottom: "0.5rem" }}>
          Scan to send {amount} {token}
        </h2>
        <p className="home-subtitle" style={{ fontSize: "0.85rem", marginTop: 0, color: "#64748b" }}>
          This QR code encodes the deep link to send {amount} {token} to {receiverAddress.slice(0, 6)}...{receiverAddress.slice(-4)}
        </p>

        {/* QR Code */}
        {qrUrl ? (
          <div className="qr-card" style={{ marginBottom: 0 }}>
            <div className="qr-glow" />
            <div ref={qrCanvasRef} style={{ display: "flex", justifyContent: "center", alignItems: "center" }} />
          </div>
        ) : (
          <div style={{ width: 280, height: 280, display: "flex", alignItems: "center", justifyContent: "center", background: "#fff", borderRadius: "1.25rem", border: "1px solid #e5e7eb" }}>
            <span className="btn-spinner" style={{ borderColor: "rgba(0,0,0,0.1)", borderTopColor: "#2563eb" }} />
          </div>
        )}

        {/* Address and actions below QR code */}
        {receiverAddress && (
          <div className="qr-address">
            <div>{receiverAddress.slice(0, 27)}</div>
            <div>{receiverAddress.slice(27)}</div>
          </div>
        )}

        <div className="qr-actions-container">
          <div className="qr-action-item">
            <button onClick={handleCopyAddress} className="qr-action-btn" title="Copy Address">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
              </svg>
            </button>
            <span className="qr-action-label">Copy</span>
          </div>

          <div className="qr-action-item">
            <button onClick={handleSetAmountClick} className="qr-action-btn" title="Set Amount">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" rx="1.5" />
                <rect x="14" y="3" width="7" height="7" rx="1.5" />
                <rect x="14" y="14" width="7" height="7" rx="1.5" />
                <rect x="3" y="14" width="7" height="7" rx="1.5" />
              </svg>
            </button>
            <span className="qr-action-label">Set Amount</span>
          </div>

          <div className="qr-action-item">
            <button onClick={handleShare} className="qr-action-btn" title="Share Link">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
              </svg>
            </button>
            <span className="qr-action-label">Share</span>
          </div>
        </div>

        {/* Floating Toast Notification */}
        {toastMessage && <div className="copy-toast">{toastMessage}</div>}
      </div>
    </main>
  );
}