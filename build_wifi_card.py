"""Transform BLE pool-cleaner-card.js into pool-cleaner-wifi-card.js."""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BLE = ROOT.parent / "ha-pool-cleaner-card" / "pool-cleaner-card.js"
OUT = ROOT / "pool-cleaner-wifi-card.js"

text = BLE.read_text(encoding="utf-8")

text = text.replace(
    "Pool Cleaner Card — Home Assistant Lovelace (Maytronics Dolphin BLE).",
    "Pool Cleaner WiFi Card — Home Assistant Lovelace (MyDolphin Plus / dolphin-robot).",
)

# Drop BLE-only schedule integration helpers.
for fn in (
    "findScheduleEntityId",
    "scheduleEnabledFromState",
    "parseScheduleStateFromEntity",
    "readIntegrationSchedule",
    "formatScheduleSummaryFromState",
    "usesIntegrationSchedule",
):
    text = re.sub(
        rf"  function {fn}\([^)]*\) \{{.*?\n  \}}\n\n",
        "",
        text,
        count=1,
        flags=re.DOTALL,
    )

# Entity + state layer
pattern = re.compile(
    r"  const ENTITY_SUFFIXES = \{.*?  function isOn\(hass, entityId\) \{.*?\n    return st\.state === \"on\";\n  \}\n",
    re.DOTALL,
)
wifi_helpers = open(ROOT / "_wifi_helpers.js", encoding="utf-8").read()
text, n = pattern.subn(wifi_helpers, text, count=1)
if n != 1:
    raise SystemExit(f"entity block replace failed ({n})")

# scheduleConfigured (after usesIntegrationSchedule removed)
text = text.replace(
    """  function scheduleSlot2Configured(hass, config) {
    if (usesIntegrationSchedule(hass, config)) return true;
    const c = config || {};
    return Boolean(
      c.entity_schedule_2_enabled &&
        c.entity_schedule_time_2 &&
        c.entity_schedule_duration_2
    );
  }

  function scheduleConfigured(hass, config) {
    if (usesIntegrationSchedule(hass, config)) {
      return Boolean(mergeConfig(config).device);
    }
    const c = config || {};
    return Boolean(
      c.entity_schedule_enabled &&
        c.entity_schedule_time &&
        c.entity_schedule_duration &&
        c.entity_schedule_days &&
        c.entity_script_timed
    );
  }""",
    """  function scheduleSlot2Configured(hass, config) {
    const c = config || {};
    return Boolean(
      c.entity_schedule_2_enabled &&
        c.entity_schedule_time_2 &&
        c.entity_schedule_duration_2
    );
  }

  function scheduleConfigured(hass, config) {
    const c = config || {};
    return Boolean(
      c.entity_schedule_enabled &&
        c.entity_schedule_time &&
        c.entity_schedule_duration &&
        c.entity_schedule_days &&
        c.entity_script_timed
    );
  }""",
)

text = text.replace(
    """  function formatScheduleSummary(hass, cfg, entities) {
    if (usesIntegrationSchedule(hass, cfg)) {
      return formatScheduleSummaryFromState(
        readIntegrationSchedule(hass, entities.schedule)
      );
    }
    if (!isOn(hass, cfg.entity_schedule_enabled)) return "Schedule off";""",
    """  function formatScheduleSummary(hass, cfg, entities) {
    if (!isOn(hass, cfg.entity_schedule_enabled)) return "Schedule off";""",
)

text = text.replace(
    """      show_schedule: false,
      schedule_source: "auto",
      ...config,""",
    """      show_schedule: false,
      ...config,""",
)

text = text.replace("class PoolCleanerCard ", "class PoolCleanerWifiCard ")
text = text.replace("class PoolCleanerCardEditor ", "class PoolCleanerWifiCardEditor ")

# pendingResolved body
text = text.replace(
    """    const st = entityState(hass, entities.state);
    const raw = st?.state;
    const phase = cleanerUiPhase(hass, entities, config);
    const powerOn = entities.power && isOn(hass, entities.power);
    const working = getWorkingStatus(hass, entities);

    if (pending === "on") {
      if (!powerOn) return false;
      // HOLD/finished = previous cycle done — not a successful new start.
      if (raw === "hold") return false;
      if (working === "finished") return false;
      if (working === "at_work") return true;
      if (raw === "on") return true;
      if (phase === "cleaning") return true;
      return false;
    }
    if (pending === "off") {
      if (raw === "off") return true;
      if (!powerOn && phase !== "unavailable") return true;
      return false;
    }""",
    """    const phase = cleanerUiPhase(hass, entities, config);
    const vs = vacuumState(hass, entities.vacuum);
    if (pending === "on") {
      if (vacuumIsRunning(vs)) return true;
      if (phase === "cleaning") return true;
      return false;
    }
    if (pending === "off") {
      if (vs === "docked" || vs === "idle") return true;
      if (!vacuumIsRunning(vs) && vs !== "paused" && phase !== "unavailable") return true;
      return false;
    }""",
)

text = text.replace("return !config?.device && !config?.entity_power;", "return !config?.device && !config?.entity_vacuum;")

# Remove draft schedule class state + methods
text = text.replace(
    """        /** Optimistic integration schedule until sensor state catches up. */
        _schedDraft: { state: null },
""",
    "",
)

text = text.replace(
    """    firstUpdated() {
      this._restoreSchedDraftFromStorage();
    }

    updated(changedProperties) {""",
    """    updated(changedProperties) {""",
)

text = re.sub(
    r"      if \(changedProperties\.has\(\"config\"\)[\s\S]*?_restoreSchedDraftFromStorage\(\);\n      \}\n",
    "",
    text,
    count=1,
)

text = re.sub(
    r"      if \(changedProperties\.has\(\"hass\"\) && this\._schedDraft[\s\S]*?\n      \}\n",
    "",
    text,
    count=1,
)

for method in (
    "_schedDraftStorageKey",
    "_restoreSchedDraftFromStorage",
    "_syncSchedDraftStorage",
    "_integrationScheduleState",
    "_patchSchedDraft",
    "_dolphinSchedule",
):
    text = re.sub(rf"    {method}\(.*?\n    \}}\n\n", "", text, count=1, flags=re.DOTALL)

# Schedule service methods — helpers only
text = re.sub(
    r"    async _toggleScheduleEnabled\(ev\) \{.*?\n    \}\n\n    async _setScheduleTime",
    """    async _toggleScheduleEnabled(ev) {
      const cfg = mergeConfig(this.config);
      if (!cfg.entity_schedule_enabled || this._busy) return;
      const on = isOn(this.hass, cfg.entity_schedule_enabled);
      await this._callService("input_boolean", on ? "turn_off" : "turn_on", {
        entity_id: cfg.entity_schedule_enabled,
      });
    }

    async _setScheduleTime""",
    text,
    count=1,
    flags=re.DOTALL,
)

for _ in range(4):
    text = re.sub(
        r"      if \(usesIntegrationSchedule\(this\.hass, cfg\)\) \{.*?\n        return;\n      \}\n",
        "",
        text,
        count=1,
        flags=re.DOTALL,
    )

text = re.sub(
    r"    async _toggleScheduleRun2\(ev\) \{.*?\n    \}\n\n    _renderScheduleSlot",
    """    async _toggleScheduleRun2(ev) {
      const cfg = mergeConfig(this.config);
      if (!cfg.entity_schedule_2_enabled || this._busy) return;
      const on = isOn(this.hass, cfg.entity_schedule_2_enabled);
      await this._callService("input_boolean", on ? "turn_off" : "turn_on", {
        entity_id: cfg.entity_schedule_2_enabled,
      });
    }

    _renderScheduleSlot""",
    text,
    count=1,
    flags=re.DOTALL,
)

text = text.replace(
    """        if (usesIntegrationSchedule(this.hass, cfg) && cfg.device) {
          await this._callService("maytronics_dolphin", "run_timed", {
            device_id: cfg.device,
            duration_minutes: minutes,
          });
        } else if (cfg.entity_script_timed) {
          await this._callService("script", "turn_on", {
            entity_id: cfg.entity_script_timed,
            variables: {
              power_entity: entities.power,
              duration_minutes: minutes,
            },
          });
        } else {
          return;
        }""",
    """        if (!cfg.entity_script_timed) return;
        await this._callService("script", "turn_on", {
          entity_id: cfg.entity_script_timed,
          variables: {
            vacuum_entity: entities.vacuum,
            duration_minutes: minutes,
          },
        });""",
)

text = text.replace(
    """    _togglePower() {
      const entities = resolveEntities(this.hass, this.config);
      if (!entities.power || this._busy) return;
      const turningOn = !isOn(this.hass, entities.power);
      this._pending = turningOn ? "on" : "off";
      this._pendingSince = Date.now();
      this._busy = true;
      this.hass
        .callService("switch", "toggle", { entity_id: entities.power })
        .catch(() => {
          this._clearPending();
        })
        .finally(() => {
          this._busy = false;
        });
    }""",
    """    _togglePower() {
      const entities = resolveEntities(this.hass, this.config);
      if (!entities.vacuum || this._busy) return;
      const vs = vacuumState(this.hass, entities.vacuum);
      const stopping = vacuumIsRunning(vs) || vs === "paused";
      this._pending = stopping ? "off" : "on";
      this._pendingSince = Date.now();
      this._busy = true;
      const svc = stopping ? "stop" : "start";
      this.hass
        .callService("vacuum", svc, { entity_id: entities.vacuum })
        .catch(() => {
          this._clearPending();
        })
        .finally(() => {
          this._busy = false;
        });
    }""",
)

text = text.replace('if (pending === "on") return "Connecting…";', 'if (pending === "on") return "Starting…";')
text = text.replace('powered_idle: "Powered on",', 'powered_idle: "Ready",')

text = text.replace(
    """        entityState(this.hass, entities.power)?.attributes?.friendly_name?.replace(
          /\\s+power$/i,
          ""
        ) ||""",
    """        entityState(this.hass, entities.vacuum)?.attributes?.friendly_name ||
        entityState(this.hass, entities.status)?.attributes?.friendly_name?.replace(
          /\\s+status$/i,
          ""
        ) ||""",
)

text = text.replace(
    """      const powered =
        pending === "on"
          ? true
          : pending === "off"
            ? false
            : entities.power && isOn(this.hass, entities.power);
      const ble = entities.connected
        ? isConnected(this.hass, entities.connected)
        : entities.power &&
          entityState(this.hass, entities.power)?.state !== "unavailable";""",
    """      const vs = vacuumState(this.hass, entities.vacuum);
      const powered =
        pending === "on"
          ? true
          : pending === "off"
            ? false
            : vacuumIsReady(vs) || vacuumIsRunning(vs);
      const cloudOk = entities.connected
        ? isConnected(this.hass, entities.connected)
        : entities.vacuum &&
          entityState(this.hass, entities.vacuum)?.state !== "unavailable";""",
)

text = text.replace('class="ble ${ble ? "on" : ""}"', 'class="cloud ${cloudOk ? "on" : ""}"')
text = text.replace(
    'title="${ble ? "BLE link OK" : "Not connected"}"',
    'title="${cloudOk ? "Cloud connected" : "Not connected"}"',
)
text = text.replace("${this._bleIcon()}", "${this._cloudIcon()}")
text = text.replace("""?disabled=${!entities.power || this._busy}""", """?disabled=${!entities.vacuum || this._busy}""")

text = text.replace(
    """    _bleIcon() {
      return html`
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M6 12a6 6 0 0 1 12 0M9 12a3 3 0 0 1 6 0M12 12v3"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
          />
        </svg>
      `;
    }""",
    """    _cloudIcon() {
      return html`
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M7 18h11a4 4 0 0 0 .5-8 5.5 5.5 0 0 0-10.6-1.5A3.5 3.5 0 0 0 7 18z"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      `;
    }""",
)

text = text.replace(".ble {", ".cloud {").replace(".ble.on {", ".cloud.on {").replace(".ble svg {", ".cloud svg {")

text = text.replace(
    """              Pick your <strong>Dolphin device</strong> and use integration
              v1.15.0+ schedule, or add helpers from
              <code>examples/pool-cleaner-schedule.yaml</code>.""",
    """              Add helpers from
              <code>examples/pool-cleaner-wifi-schedule.yaml</code>
              (HA automations — MyDolphin Plus has no card schedule API).""",
)

text = text.replace(
    """                Choose your <strong>Dolphin device</strong> (recommended) or
                <strong>Power switch</strong> in the card options.""",
    """                Choose your <strong>MyDolphin device</strong> (recommended) or
                <strong>Vacuum entity</strong> in the card options.""",
)

# _renderSchedule integration vars
text = re.sub(
    r"      const integration = usesIntegrationSchedule\(this\.hass, cfg\);[\s\S]*?const time2 = integration[\s\S]*?: \"17:00\";\n",
    """      const enabled = isOn(this.hass, cfg.entity_schedule_enabled);
      const duration =
        entityState(this.hass, cfg.entity_schedule_duration)?.state || "2 hours";
      const helperDays = parseScheduleDays(
        entityState(this.hass, cfg.entity_schedule_days)?.state
      );
      const run1Days = helperDays;
      const run2Days = helperDays;
      const timeVal = scheduleTimeValue(this.hass, cfg.entity_schedule_time);
      const slot2 = scheduleSlot2Configured(this.hass, cfg);
      const slot2Enabled = slot2 && isOn(this.hass, cfg.entity_schedule_2_enabled);
      const duration2 = slot2
        ? entityState(this.hass, cfg.entity_schedule_duration_2)?.state || "2 hours"
        : "2 hours";
      const time2 = scheduleTimeValue(this.hass, cfg.entity_schedule_time_2);
""",
    text,
    count=1,
)

text = re.sub(
    r"\$\{integration\s*\? html`<p class=\"schedule-hint-inline\">[\s\S]*?`\s*: \"\"\}\n",
    "",
    text,
    count=1,
)

text = re.sub(
    r"summary=\$\{integration[\s\S]*?\}\n",
    "",
    text,
    count=1,
)

# Editor
text = text.replace('filter: { integration: "maytronics_dolphin" }', 'filter: { integration: "mydolphin_plus" }')
text = text.replace(
    """            {
              name: "entity_power",
              selector: { entity: { domain: "switch" } },
            },
            {
              name: "entity_state",
              selector: { entity: { domain: "sensor" } },
            },
            {
              name: "entity_working",
              selector: { entity: { domain: "sensor" } },
            },
            {
              name: "entity_cleaning",
              selector: { entity: { domain: "binary_sensor" } },
            },
            {
              name: "entity_connected",
              selector: { entity: { domain: "binary_sensor" } },
            },""",
    """            {
              name: "entity_vacuum",
              selector: { entity: { domain: ["vacuum"] } },
            },
            {
              name: "entity_status",
              selector: { entity: { domain: "sensor" } },
            },
            {
              name: "entity_robot_status",
              selector: { entity: { domain: "sensor" } },
            },
            {
              name: "entity_power_supply",
              selector: { entity: { domain: "sensor" } },
            },
            {
              name: "entity_connected",
              selector: { entity: { domain: "binary_sensor" } },
            },
            {
              name: "entity_clean_mode",
              selector: { entity: { domain: "sensor" } },
            },""",
)

text = re.sub(
    r"\{ name: \"schedule_source\"[\s\S]*?name: \"entity_schedule\",\n              selector: \{ entity: \{ domain: \"sensor\" \} \},\n            \},\n",
    "",
    text,
    count=1,
)

text = text.replace(
    """              device: "Dolphin device (auto-fills entities)",
              entity_power: "Power switch",
              entity_state: "Cleaner state sensor",
              entity_working: "Working status (optional; auto from device)",
              entity_cleaning: "Cleaning active (optional, not used for status pill)",
              entity_connected: "BLE OK / connected (optional)",""",
    """              device: "MyDolphin device (auto-fills vacuum + sensors)",
              entity_vacuum: "Vacuum entity (start/stop cleaning)",
              entity_status: "Status sensor (optional; auto from device)",
              entity_robot_status: "Robot status sensor (optional)",
              entity_power_supply: "Power supply status (optional)",
              entity_connected: "AWS Broker / cloud OK (optional)",
              entity_clean_mode: "Clean mode sensor (optional)",""",
)

text = text.replace(
    """              schedule_source: "Schedule backend (Auto = integration when Dolphin device is set)",
              entity_schedule:
                "Schedule sensor (optional — e.g. sensor.triton_ps_plus_cleaner_schedule)",
              entity_schedule_enabled: "Schedule — enabled (input_boolean)",""",
    """              entity_schedule_enabled: "Schedule — enabled (input_boolean)",""",
)

text = text.replace(
    "script.pool_cleaner_timed_run",
    "script.pool_cleaner_wifi_timed_run",
)

text = text.replace('customElements.define("pool-cleaner-card", PoolCleanerCard);', 'customElements.define("pool-cleaner-wifi-card", PoolCleanerWifiCard);')
text = text.replace('customElements.define("pool-cleaner-card-editor", PoolCleanerCardEditor);', 'customElements.define("pool-cleaner-wifi-card-editor", PoolCleanerWifiCardEditor);')
text = text.replace('return document.createElement("pool-cleaner-card-editor");', 'return document.createElement("pool-cleaner-wifi-card-editor");')
text = text.replace('return { type: "custom:pool-cleaner-card" };', 'return { type: "custom:pool-cleaner-wifi-card" };')
text = text.replace('type: "pool-cleaner-card",', 'type: "pool-cleaner-wifi-card",')
text = text.replace('name: "Pool Cleaner Card",', 'name: "Pool Cleaner WiFi Card",')
text = text.replace(
    "https://github.com/randrcomputers/ha-pool-cleaner-card#readme",
    "https://github.com/randrcomputers/ha-pool-cleaner-wifi-card#readme",
)
text = text.replace(
    "Maytronics Dolphin — power, status, optional HA schedule (1–2 daily runs)",
    "MyDolphin Plus (WiFi) — start/stop, status, optional HA schedule",
)

# Remove integration day row in schedule slot if still present
text = re.sub(
    r"\$\{\s*usesIntegrationSchedule\(this\.hass, cfg\)[\s\S]*?\}\s*",
    "",
    text,
    count=1,
)

OUT.write_text(text, encoding="utf-8")
print("OK", OUT, "lines", text.count("\n") + 1)
