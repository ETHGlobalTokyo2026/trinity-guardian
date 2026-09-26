# สร้าง Agent ตัวอย่าง — 5 Steps

## 0 — Prerequisites

- Node.js ≥ 20
- **pnpm** (repo ใช้ workspace protocol — `npm` ติดตั้งไม่ได้): `npm i -g pnpm@9`
- ติดตั้งครั้งแรกจาก root: `pnpm install`

## Step 1 — สร้าง burner wallet

อย่าใช้กระเป๋าหลักเด็ดขาด สร้าง burner ใหม่สำหรับ agent เสมอ:

```bash
cd trinity-guardian/packages/agent

cat > genkey.tmp.ts <<'EOF'
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
const k = generatePrivateKey();
console.log("address:", privateKeyToAccount(k).address);
console.log("private key:", k);
EOF
npx tsx genkey.tmp.ts && rm genkey.tmp.ts
```

จด address + private key ไว้

> ชื่อ agent ใช้ **subname เต็ม** เช่น `momo.agents.trinityguard.eth` — policy (สิทธิ์/วงเงิน) map ด้วยชื่อนี้ ถ้าใช้แค่ "momo" Guardian จะตอบ `authority missing` และบล็อกทุกการจ่าย

## Step 2 — เติม USDC ที่ address นั้น (ครั้งเดียว)

faucet: https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet

- ใส่ address จาก step 1 แล้วกด claim USDC
- ไม่ต้องมี ETH สำหรับ gas — EIP-3009 ผ่าน facilitator แล้วเขาจ่ายแทน
- เช็คยอดได้ที่ basescan.org ที่ address

## Step 3 — กรอก .env (ที่ root โปรเจกต์)

```bash
# จาก root trinity-guardian/
cp .env.sample .env
```

แล้วแก้ `.env`:

```
# ปล่อยว่าง = recycle mode: เงินจ่ายไปวนกลับเข้ากระเป๋า agent เอง
SELLER_ADDRESS_A=
SELLER_ADDRESS_B=<address อะไรก็ได้ที่จะเล่นบท "ร้าน scam" — แค่ address ไม่ต้องมี key>

EVM_PRIVATE_KEY=<private key จาก step 1 — ต้องขึ้นต้น 0x>
```

ข้อควรระวัง:
- `EVM_PRIVATE_KEY` ต้องมี prefix `0x` (เคยเจอ bug ตอนพี่ใส่แบบไม่มี 0x แล้ว viem ปฏิเสธ)
- `SELLER_ADDRESS_B` ไม่โดนจ่ายจริง (Guardian บล็อกก่อนเสมอ) ไม่ต้องเติมอะไร
- `.env` ถูก gitignore แล้ว ปลอดภัย

## Step 4 — เปิด seller (terminal 1 ค้างไว้)

```bash
cd packages/seller
node --env-file=../../.env --import tsx src/index.ts
```

เห็น log นี้คือใช้ได้:

```
[x402-seller] http://127.0.0.1:4020  (/weather $0.01 · /data $0.25 · /compute $7.00 · /merchants)
             payTo A 0x...  (recycle mode → agent wallet)
             payTo B 0x...  (flagged)
```

## Step 5 — รัน agent demo (terminal 2)

```bash
cd packages/agent
node --env-file=../../.env --import tsx cli/demo.ts
```

ผลที่ต้องเห็น (4 acts):

```
#1 PAID    $0.01   → ได้ weather data, เงินวนกลับเข้ากระเป๋า agent (recycle)
#2 REFUSED $0.25   → บล็อกร้าน scam พร้อมเหตุผล
#3 REFUSED $7.00   → เกิน cap $5 → ถาม approve/deny
#4 REFUSED $0.01   → rogue agent: authority revoked (kill switch)

spend today: $0.01 across 1 tx — dailyCap $50
```

ตอนถึง Act 3 จะมี prompt `approve / deny >` — ลองกดทั้งสองแบบ:
- `approve` = จ่าย $7 จริง (ยอดรวมเป็น $7.01)
- `deny` = ปฏิเสธ + log เหตุผล

Act 4 สาธิต kill switch: agent ชื่อ `rogue.agents.trinityguard.eth` มี `roleActive: false` ใน demo policies → Guardian hard-fail ทันทีก่อนถึง cap/Intercepta ไม่ว่าร้านจะสะอาดแค่ไหน

เช็คยืนยัน: ไป basescan.org ที่ address agent → เห็น tx ของ USDC ออก/เข้า (recycle mode)

---

## เพิ่ม agent ใหม่ (เช่น ตัวที่สาม)

เปิด `packages/agent/src/index.ts` แล้วเพิ่มใน `DEMO_POLICIES`:

```typescript
"alpha.agents.trinityguard.eth": { roleActive: true, perTxMax: 1_000_000n, dailyCap: 10_000_000n, allowedAsset: "" },
```

แล้วเรียกด้วยชื่อเต็ม: `createAgent("alpha.agents.trinityguard.eth", key)`

> ตอนนี้ policy เป็น demo map (mock) — จุดสลับเป็น chain read จริงอยู่ที่ `readDemoPolicy` ดู `packages/agent/migration/onchain-policy.md`

---

หากใช้ในโค้ดเอง (ไม่ผ่าน CLI):

```typescript
import { createAgent } from "@trinity/agent";

const agent = await createAgent(
  "momo.agents.trinityguard.eth",
  process.env.EVM_PRIVATE_KEY as `0x${string}`
);

// ฟัง events (UI ใช้ hook นี้)
agent.onPaymentEvent((e) => console.log(e.type));

const result = await agent.buy("/weather?city=tokyo");
console.log(result.status, result.txHash);
```
