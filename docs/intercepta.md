# Intercepta mock (frontend)

API นี้อยู่บน branch `feature/intercepta-mock`  
Host: `https://intercepta-production.up.railway.app`  
Auth: header `X-API-KEY: tg_mock_intercepta`

ใช้เช็คว่า payTo เป็นบัญชี scam หรือไม่ ก่อนที่ agent จะเซ็น  
Account B คือบัญชี scam บัญชีอื่น รวมถึง account A ถือว่า clear

| | address | `isScam` |
| --- | --- | --- |
| A | `0x9Bb9fd0ab10f2c9231F2B0bb629ED446f0216c79` | `false` |
| B | `0x1dc5647C5D3807BA5db48ED0af2Da951F6b171af` | `true` |

`isScam: true` = hard stop ไม่จ่าย ไม่มี World ID override

## Env

ใส่ใน server ของ dashboard (`packages/ui`) ไม่ใส่ prefix `NEXT_PUBLIC_`

```
INTERCEPTA_ENABLED=true
INTERCEPTA_API_KEY=tg_mock_intercepta
INTERCEPTA_BASE_URL=https://intercepta-production.up.railway.app
SCAM_PAYTO_ADDRESS=0x1dc5647C5D3807BA5db48ED0af2Da951F6b171af
```

`INTERCEPTA_ENABLED` ไม่ใช่ `true` = ข้ามการเช็ค ทั้งก้อน ไม่บล็อก account B  
ถ้าไม่ตั้ง `SCAM_PAYTO_ADDRESS` dashboard ใช้ `SELLER_ADDRESS_B` แทน

## Quick scan

```
GET /api/public/v2/extension/account/{address}/quick-scan
X-API-KEY: tg_mock_intercepta
```

Account A (และ address ที่ไม่ใช่ B):

```json
{ "isScam": false, "toxicScore": 0, "traits": [] }
```

Account B:

```json
{
  "isScam": true,
  "toxicScore": 100,
  "traits": [
    {
      "risk": 100,
      "name": "known_scammer",
      "txsCount": 12,
      "description": "Reported rugpull / scam entity"
    }
  ]
}
```

ไม่มี key หรือ key ผิด:

```json
{ "response": "invalid api key" }
```

HTTP `401`

## แสดงผล

| `isScam` | UI |
| --- | --- |
| `false` | clear ไปต่อได้ |
| `true` | scam โชว์ `known_scammer` / `Reported rugpull / scam entity` แล้วปฏิเสธ |
| `401` หรือเรียกไม่ถึง | ไม่ถือว่าผ่าน ส่งให้เจ้าของดู |

อย่าถือว่า `traits` ว่าง = ปลอดภัย ถ้า response ไม่ใช่ 200  
ดู `isScam` ก่อน แล้วค่อยใช้ `toxicScore` กับ `traits` เป็นหลักฐานบนการ์ด

## ตัวอย่าง

```bash
curl -s \
  -H 'X-API-KEY: tg_mock_intercepta' \
  https://intercepta-production.up.railway.app/api/public/v2/extension/account/0x1dc5647C5D3807BA5db48ED0af2Da951F6b171af/quick-scan
```
