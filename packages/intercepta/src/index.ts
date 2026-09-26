import { Router } from "express";
import express from "express";
import type { Request, Response } from "express";

export const DEFAULT_API_KEY = "tg_mock_intercepta";

const USDC = new Set([
  "0x036cbd53842c5426634e7929541ec2318f3dcf7e",
  "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
]);

export function apiKey(): string {
  return process.env.INTERCEPTA_API_KEY?.trim() || DEFAULT_API_KEY;
}

export function scamAccount(): string {
  return (process.env.SELLER_ADDRESS_B ?? process.env.SCAM_PAYTO_ADDRESS ?? "").trim().toLowerCase();
}

export function isScamAccount(address: string): boolean {
  const scam = scamAccount();
  return Boolean(scam) && address.toLowerCase() === scam;
}

export function quickScanBody(address: string) {
  if (!isScamAccount(address)) return { isScam: false, toxicScore: 0, traits: [] };
  return {
    isScam: true,
    toxicScore: 100,
    traits: [
      {
        risk: 100,
        name: "known_scammer",
        txsCount: 12,
        description: "Reported rugpull / scam entity",
      },
    ],
  };
}

export function tokenRiskBody(address: string, chainId: string) {
  if (USDC.has(address.toLowerCase())) {
    return {
      riskScore: 0,
      riskLevel: "low",
      category: "stablecoin",
      trust: "whitelist",
      action: "info",
      detectors: [],
      token: { chainId, address, symbol: "USDC" },
    };
  }
  return {
    riskScore: 100,
    riskLevel: "high",
    category: "malicious",
    trust: "blocklist",
    action: "block",
    detectors: [{ code: "lookalike_token", description: "Token is not USDC" }],
    token: { chainId, address, symbol: "???" },
  };
}

export function signatureBody(message: string) {
  const scam = scamAccount();
  if (!scam || !message.toLowerCase().includes(scam)) {
    return { riskGroup: "Low", detectors: [], addresses: [] };
  }
  return {
    riskGroup: "High",
    detectors: [{ code: "known_scammer", description: "Reported rugpull / scam entity" }],
    addresses: [{ address: scam, type: "payTo", detectors: ["known_scammer"] }],
  };
}

function authorized(req: Request, res: Response): boolean {
  if (req.header("x-api-key") === apiKey()) return true;
  res.status(401).json({ response: "invalid api key" });
  return false;
}

function param(value: string | string[]): string {
  return Array.isArray(value) ? value[0] ?? "" : value;
}

export function interceptaRouter() {
  const router = Router();
  router.use(express.json());
  router.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  router.get("/api/public/v2/extension/account/:address/quick-scan", (req, res) => {
    if (!authorized(req, res)) return;
    res.json(quickScanBody(param(req.params.address)));
  });

  router.get("/api/public/v2/extension/token-intelligence/token/:address/risks", (req, res) => {
    if (!authorized(req, res)) return;
    res.json(tokenRiskBody(param(req.params.address), String(req.query.chainId ?? "1")));
  });

  router.post("/api/public/v2/extension/analysis/signature", (req, res) => {
    if (!authorized(req, res)) return;
    const message = typeof req.body?.message === "string" ? req.body.message : JSON.stringify(req.body ?? {});
    res.json(signatureBody(message));
  });

  return router;
}
