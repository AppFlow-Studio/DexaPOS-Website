# QR Dine-In — 25× Repetition Run Log

**Goal (acceptance criterion #1):** happy path executed **25 consecutive times**, **zero failures**, every run meeting speed targets — mixed **iOS Safari + Android Chrome**, mixed **Wi-Fi/LTE**, **≥2 different tables**.

## Speed targets (§C — under a minute of active interaction)
- Scan → menu loaded: **≤ 5 s**
- Add item → reach checkout: **≤ 20 s**
- Pay → confirmation shown: **≤ 15 s**
- Total active interaction: **≤ 60 s**

## Two QR tents (scan off-screen from the scratchpad PNGs)
- **Table 1 — "New 2-Seater Square":** `scratchpad/qr-tent-table-square.png`
- **Table 2 — "New 4-Seater Square":** `scratchpad/qr-tent-table2-4seater.png`

## Test card
`4111 1111 1111 1111` · exp `12/28` · CVV `123` · ZIP `10001`

## How to log a run
For each run, jot: device (iOS/Android), network (WiFi/LTE), table (1/2), rough seconds for each phase, and PASS/FAIL. Tell me the batch and I verify the orders in the DB (order_type=qr_dine_in, table stamped, single charge, tip-exclusive total).

| # | Device | Net | Table | Scan→menu | →checkout | pay→conf | total | order # | PASS? | notes |
|---|--------|-----|-------|-----------|-----------|----------|-------|---------|-------|-------|
| 1 |        |     |       |           |           |          |       |         |       |       |
| 2 |        |     |       |           |           |          |       |         |       |       |
| 3 |        |     |       |           |           |          |       |         |       |       |
| 4 |        |     |       |           |           |          |       |         |       |       |
| 5 |        |     |       |           |           |          |       |         |       |       |
| 6 |        |     |       |           |           |          |       |         |       |       |
| 7 |        |     |       |           |           |          |       |         |       |       |
| 8 |        |     |       |           |           |          |       |         |       |       |
| 9 |        |     |       |           |           |          |       |         |       |       |
| 10|        |     |       |           |           |          |       |         |       |       |
| 11|        |     |       |           |           |          |       |         |       |       |
| 12|        |     |       |           |           |          |       |         |       |       |
| 13|        |     |       |           |           |          |       |         |       |       |
| 14|        |     |       |           |           |          |       |         |       |       |
| 15|        |     |       |           |           |          |       |         |       |       |
| 16|        |     |       |           |           |          |       |         |       |       |
| 17|        |     |       |           |           |          |       |         |       |       |
| 18|        |     |       |           |           |          |       |         |       |       |
| 19|        |     |       |           |           |          |       |         |       |       |
| 20|        |     |       |           |           |          |       |         |       |       |
| 21|        |     |       |           |           |          |       |         |       |       |
| 22|        |     |       |           |           |          |       |         |       |       |
| 23|        |     |       |           |           |          |       |         |       |       |
| 24|        |     |       |           |           |          |       |         |       |       |
| 25|        |     |       |           |           |          |       |         |       |       |

## Suggested mix (to satisfy the "mixed" requirements)
- Runs 1–8: iOS Safari, Wi-Fi, Table 1
- Runs 9–16: Android Chrome, Wi-Fi, Table 2
- Runs 17–21: iOS Safari, LTE (turn off Wi-Fi on the phone), Table 1
- Runs 22–25: Android Chrome, LTE, Table 2

## ⚠️ LTE caveat
The dev server is on your LAN (`192.168.1.115`), reachable only over **Wi-Fi**. On **LTE the phone can't reach it**, so the LTE rows can't be done against this local setup — they need the app deployed to a public URL (e.g. `dexaposai.com` pointed at staging). Log LTE rows as **blocked-needs-deploy** unless a public staging URL is available.
