# World ID connect (frontend)

API นี้อยู่บน branch `feature/world-id-approval` ยังไม่ได้อยู่บน `dev`  
Backend: `@trinity/ui` ที่ `http://localhost:3000` (`APPROVAL_API_URL`)  
SDK: `@worldcoin/idkit` 4.x (backend ใช้ `@worldcoin/idkit-core@4.3.0`)

Frontend ทำแค่เปิด IDKit แล้วส่ง proof กลับ ไม่สร้าง approval และไม่ consume  
Agent สร้าง approval ตอน Guardian เป็น `soft_fail` แล้วพิมพ์ id:

```
World ID approval apr_… — submit a proof to POST /api/approvals/apr_…
```

`hard_fail` ไม่มี approval World ID ปลดไม่ได้

## สิ่งที่ frontend ได้ / ไม่ได้

ได้จาก `GET /api/approvals/:id` ใน `world`:

| field | ใช้กับ IDKit |
| --- | --- |
| `appId` | `app_id` |
| `action` | `action` |
| `signal` | `proofOfHuman({ signal })` ส่งสตริงนี้ตรง ๆ |
| `environment` | `"sandbox"` |
| `rpContext` | `rp_context` ทั้งก้อน |

`rpContext` ถูกเซ็นฝั่ง server แล้ว:

```ts
{
  rp_id: string
  nonce: string
  created_at: number   // unix seconds
  expires_at: number   // unix seconds
  signature: string
}
```

ไม่มี `RP_SIGNING_KEY` ใน response อย่าใส่ key นี้ใน frontend  
อย่าคำนวณ signal เอง อย่าแก้ `action` / `nonce` / `rpContext`

## ลำดับ

1. `GET /api/approvals/:id`
2. เปิด `IDKitRequestWidget` ด้วยฟิลด์ด้านบน
3. ใน `handleVerify` ส่ง result ของ IDKit ทั้งก้อนไป `POST /api/approvals/:id`
4. poll `GET` จน `status` ไม่ใช่ `pending`

อย่าส่ง `{ "approved": true }` และอย่าเรียก `action: "consume"` (agent เรียกเองครั้งเดียว)

## Widget

```tsx
import { IDKitRequestWidget, proofOfHuman } from "@worldcoin/idkit";

const approval = await fetch(`${API}/api/approvals/${id}`).then((r) => r.json());
const { world } = approval;

<IDKitRequestWidget
  open={open}
  onOpenChange={setOpen}
  app_id={world.appId}
  action={world.action}
  rp_context={world.rpContext}
  environment={world.environment}
  allow_legacy_proofs
  preset={proofOfHuman({ signal: world.signal })}
  handleVerify={async (result) => {
    const res = await fetch(`${API}/api/approvals/${approval.id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "proof", idkitResponse: result }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? `proof rejected (${res.status})`);
    }
  }}
  onSuccess={() => {
    /* GET อีกครั้ง: status === "approved" */
  }}
/>
```

`idkitResponse` คือ result จาก IDKit ตรง ๆ ไม่ rename field  
`handleVerify` throw แล้ว widget จะไม่เรียก `onSuccess`

## GET `/api/approvals/:id`

`200`

```ts
{
  id: string
  status: "pending" | "approved" | "denied" | "expired" | "invalid"
  agent: string
  amount: string          // atomic, USDC 6 decimals
  asset: string
  payTo: string
  network: string         // eip155:84532
  reason: string
  resource: string
  createdAt: string       // ISO
  expiresAt: string       // ISO, default ไม่เกิน 5 นาที
  consumed: boolean
  nullifier?: string
  world: {
    appId: string
    rpId: string
    action: string
    signal: string
    environment: "sandbox"
    rpContext: {
      rp_id: string
      nonce: string
      created_at: number
      expires_at: number
      signature: string
    }
  }
}
```

`404` `{ "error": "not found" }`

แสดง `amount`, `asset`, `payTo`, `reason`, `expiresAt` ก่อนเปิด World App  
signal ที่เซ็นรวม id, agent, amount, asset, payTo, reason อยู่แล้ว เปลี่ยนค่าเหล่านี้แล้ว proof จะไม่ผ่าน

## POST `/api/approvals/:id`

Proof:

```json
{ "action": "proof", "idkitResponse": { } }
```

Cancel (เจ้าของกดยกเลิก):

```json
{ "action": "cancel" }
```

สำเร็จคืน body เดียวกับ GET

| status | ความหมาย |
| --- | --- |
| 400 | ไม่มี `idkitResponse`, action ไม่รู้จัก, หรือส่ง `approved: true` |
| 404 | ไม่มี approval นี้ |
| 409 | ไม่ใช่ `pending`, action/nonce/signal ไม่ตรง, verify ไม่ผ่าน, หรือหมดอายุตอน consume |
| 503 | server ยังไม่ตั้ง World ID (เกิดตอนสร้าง ไม่ใช่ตอนส่ง proof) |

ข้อความ 409 ที่เกี่ยวกับ proof: `action mismatch`, `nonce mismatch`, `signal mismatch`, `proof has no responses`, `proof missing nullifier`, `world id verify failed (…)`

ส่ง proof ซ้ำหลัง `approved` ได้ `409` `approval already approved`  
nullifier เดิมใช้กับ approval ถัดไปได้ ถ้าเป็นคนละ id และคนละ signal

## สถานะ

| status | UI |
| --- | --- |
| `pending` | เปิด IDKit ได้ |
| `approved` | ผ่านแล้ว รอ agent จ่าย `consumed` จะเป็น `true` หลังจ่าย |
| `denied` | ยกเลิก |
| `expired` | เลย `expiresAt` หรือ agent รอครบ |
| `invalid` | proof ไม่ตรงรายการนี้ หรือ World verify ไม่ผ่าน |

## Env ฝั่งคนเปิด World App

Frontend ใช้ค่าจาก `world` ใน response ไม่ต้องมี signing key

Portal (sandbox World App) ตั้งที่ server ของ `@trinity/ui` เท่านั้น:

```
NEXT_PUBLIC_WORLD_APP_ID=app_...
NEXT_PUBLIC_WORLD_RP_ID=rp_...
WORLD_ACTION=payment-approval
RP_SIGNING_KEY=        # server only
```

## CORS

Route นี้ยังไม่ส่ง `Access-Control-Allow-Origin`  
เรียกจาก origin อื่นในเบราว์เซอร์จะติด CORS ให้ proxy ผ่าน origin ตัวเอง หรือเรียกตอน dev จาก host เดียวกับ `localhost:3000`
