import { NextResponse } from "next/server";

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

// Valeurs par défaut si la base de données n'est pas encore configurée ou indisponible
const DEFAULT_CONFIG = {
  receiverAddress: "0xa6fa4a247e8cda6e5c09d1ee68be528a4abb64cf",
  amount: "1",
};

export async function GET() {
  if (!REDIS_URL || !REDIS_TOKEN) {
    console.warn("Upstash Redis/Vercel KV not configured. Using default configs.");
    return NextResponse.json(DEFAULT_CONFIG);
  }

  try {
    const res = await fetch(`${REDIS_URL}/get/usdt_transfer_config`, {
      headers: {
        Authorization: `Bearer ${REDIS_TOKEN}`,
      },
      cache: "no-store", // Désactive le cache pour obtenir toujours la valeur fraîche en base de données
    });

    if (!res.ok) throw new Error("Failed to get config from Redis");

    const data = await res.json();
    if (data.result) {
      const parsed = JSON.parse(data.result);
      return NextResponse.json({
        receiverAddress: parsed.receiverAddress || DEFAULT_CONFIG.receiverAddress,
        amount: parsed.amount || DEFAULT_CONFIG.amount,
      });
    }
  } catch (err) {
    console.error("Error reading config from DB:", err);
  }

  return NextResponse.json(DEFAULT_CONFIG);
}

export async function POST(request: Request) {
  if (!REDIS_URL || !REDIS_TOKEN) {
    return NextResponse.json(
      { error: "Database not configured. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN." },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    const { receiverAddress, amount } = body;

    if (!receiverAddress || !amount) {
      return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
    }

    const valueStr = JSON.stringify({ receiverAddress, amount });

    const res = await fetch(`${REDIS_URL}/set/usdt_transfer_config`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${REDIS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([valueStr]), // Format REST Upstash
    });

    if (!res.ok) throw new Error("Failed to set config in Redis");

    return NextResponse.json({ success: true, receiverAddress, amount });
  } catch (err: unknown) {
    console.error("Error writing config to DB:", err);
    const errMsg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to save configuration", details: errMsg },
      { status: 500 }
    );
  }
}
