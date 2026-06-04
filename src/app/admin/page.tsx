"use client";

import { useState, useEffect, useRef } from "react";

export default function AdminPage() {
  const [receiverAddress, setReceiverAddress] = useState("0xa6fa4a247e8cda6e5c09d1ee68be528a4abb64cf");
  const [amount, setAmount] = useState("1");
  const [qrUrl, setQrUrl] = useState("");
  const [isMounted, setIsMounted] = useState(false);
  const qrRef = useRef<HTMLDivElement>(null);
  const qrCanvasRef = useRef<HTMLDivElement>(null);
  const qrCodeInstanceRef = useRef<any>(null);

  // Charger les valeurs sauvegardées au montage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedAddress = localStorage.getItem("admin_receiver_address");
      const savedAmount = localStorage.getItem("admin_amount");
      if (savedAddress) setReceiverAddress(savedAddress);
      if (savedAmount) setAmount(savedAmount);
      setIsMounted(true);
    }
  }, []);

  // Mettre à jour le QR code et sauvegarder les changements
  useEffect(() => {
    if (!isMounted || typeof window === "undefined") return;

    // Sauvegarder localement dans le navigateur pour plus de commodité
    localStorage.setItem("admin_receiver_address", receiverAddress);
    localStorage.setItem("admin_amount", amount);

    // Récupérer le nom de domaine actuel de façon 100% dynamique
    const origin = window.location.origin;
    const baseUrl = `${origin}/wallet`;
    
    // Construire l'URL avec les paramètres query
    const targetUrl = `${baseUrl}?to=${receiverAddress}&amount=${amount}`;
    
    // Construire le lien Trust Wallet deep link
    const trustWalletLink = `https://link.trustwallet.com/open_url?coin_id=60&url=${encodeURIComponent(targetUrl)}`;
    
    setQrUrl(trustWalletLink);
  }, [receiverAddress, amount, isMounted]);

  // Générer le QR code stylisé
  useEffect(() => {
    if (!qrUrl || typeof window === "undefined" || !isMounted) return;

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
  }, [qrUrl, isMounted]);

  return (
    <main className="transfer-main">
      <div className="home-content" ref={qrRef} style={{ maxWidth: "480px" }}>
        <h1 className="home-title" style={{ fontSize: "2rem", marginBottom: "1.5rem", color: "#0f172a" }}>
          Admin Dashboard
        </h1>
        
        {/* Formulaire de configuration */}
        <div className="form-container" style={{ width: "100%", textAlign: "left", marginBottom: "2rem" }}>
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

          <label className="form-label">Amount (USDT)</label>
          <div className="input-row">
            <input
              type="text"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="input-row__field"
              placeholder="1.0"
            />
          </div>
        </div>

        <h2 className="home-subtitle" style={{ fontWeight: "700", color: "#0f172a", marginBottom: "0.5rem" }}>
          Scan to send {amount} USDT
        </h2>
        <p className="home-subtitle" style={{ fontSize: "0.85rem", marginTop: 0, color: "#64748b" }}>
          This QR code encodes the deep link to send {amount} USDT to {receiverAddress.slice(0, 6)}...{receiverAddress.slice(-4)}
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
      </div>
    </main>
  );
}
