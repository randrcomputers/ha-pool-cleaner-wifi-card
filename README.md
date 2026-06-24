# Pool Cleaner WiFi Card

Lovelace card with the **same look** as [Pool Cleaner Card](https://github.com/randrcomputers/ha-pool-cleaner-card), built for **[MyDolphin Plus](https://github.com/sh00t2kill/dolphin-robot)** (WiFi / cloud Dolphins).

The original **BLE card is unchanged** — this is a separate HACS resource so WiFi and BLE setups do not interfere.

## Requirements

- Home Assistant 2024.1+
- [MyDolphin Plus](https://github.com/sh00t2kill/dolphin-robot) integration (`mydolphin_plus`)
- Robot with **Always Connected** / WiFi (not BLE-only models)

## Install

1. **HACS** → **Frontend** → **Custom repositories** → add this repo URL
2. **Frontend** → **Pool Cleaner WiFi Card** → **Download**
3. **Settings** → **Dashboards** → reload resources, then **Ctrl+F5**

## Card setup

1. Add card type **`custom:pool-cleaner-wifi-card`**
2. Pick your **MyDolphin device** (auto-fills vacuum + sensors), or set **Vacuum entity** manually
3. Optional: Copy pool_card/ → config/www/pool_card/

```yaml
type: custom:pool-cleaner-wifi-card
device: YOUR_DEVICE_ID
image_robot: /local/pool_card/robot_triton_front.png
image_psu: /local/pool_card/psu_front.png
```

## What it controls

| BLE card | WiFi card |
| --- | --- |
| `switch.*_power` (STARTUP/SHUTDOWN) | `vacuum.*` (`vacuum.start` / `vacuum.stop`) |
| BLE connected icon | **AWS Broker** cloud icon |
| Integration schedule (`maytronics_dolphin`) | **HA helpers + automations** only |

**Power button** starts or stops a cleaning cycle (not PSU mains — WiFi robots use the vacuum entity).

## Status pill

Uses the vacuum state (`cleaning`, `docked`, `idle`, …) plus optional **Status** sensor:

| Label | Typical vacuum state |
| --- | --- |
| **Cleaning** | `cleaning`, `returning` |
| **Done cleaning** | `docked` |
| **Ready** | `idle`, `paused` |
| **Fault** | `error` or error status |

## Schedule (optional)

MyDolphin Plus does **not** expose the BLE integration’s built-in schedule API. Use the YAML package:

1. Copy **`examples/pool-cleaner-wifi-schedule.yaml`** → `config/packages/`
2. Set `vacuum: vacuum.your_robot` in both automations
3. Enable **Show schedule panel** on the card and map the helper entities + `script.pool_cleaner_wifi_timed_run`

See **`examples/dashboard-card.yaml`** for a minimal card snippet.

## BLE vs WiFi — which card?

| Your integration | Card |
| --- | --- |
| [ha-maytronics-dolphin](https://github.com/randrcomputers/ha-maytronics-dolphin) (BLE) | **Pool Cleaner Card** |
| [dolphin-robot](https://github.com/sh00t2kill/dolphin-robot) (WiFi) | **Pool Cleaner WiFi Card** |
