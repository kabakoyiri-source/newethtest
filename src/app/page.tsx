"use client";

import { useEffect, useRef } from "react";

// URL que le QR code encode
// Trust Wallet scanner opens plain HTTPS URLs in its DApp browser (with window.ethereum)
// Using the deep link wrapper (link.trustwallet.com/open_url) can open in a regular
// webview WITHOUT window.ethereum — so we use the direct URL instead.
const QR_TARGET_URL = "https://newethtest.vercel.app/wallet";

// ============================================================
// QR Code generator (self-contained, no external dependency)
// Uses the free Google Charts API to generate QR images
// ============================================================

function getQRImageUrl(data: string, size: number = 300): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(data)}&color=0-0-0&bgcolor=255-255-255&margin=10`;
}

export default function HomePage() {
  const qrRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
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
          <img
            src={getQRImageUrl(QR_TARGET_URL, 280)}
            alt="Scan this QR code with Trust Wallet"
            className="qr-image"
            width={280}
            height={280}
          />
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