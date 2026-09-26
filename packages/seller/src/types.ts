// Shared types for @trinity/seller — contract from plan/task-seller.md

export interface EndpointInfo {
  path: string;
  method: "GET" | "POST";
  price: string; // "$0.01"
  priceUnits: string; // "10000" (atomic)
  description: string;
}

export interface MerchantInfo {
  id: string;
  name: string;
  description: string;
  address: string;
  isSpam: boolean;
  spamReason?: string;
  endpoints: EndpointInfo[];
}

export interface MerchantsResponse {
  merchants: MerchantInfo[];
}
