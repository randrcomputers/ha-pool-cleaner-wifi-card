/**
 * Pool Cleaner WiFi Card — Home Assistant Lovelace (MyDolphin Plus / dolphin-robot).
 */
(function () {
  const LitElement = Object.getPrototypeOf(customElements.get("ha-panel-lovelace"));
  const { html, css } = LitElement.prototype;

  const DEFAULTS = Object.freeze({
    image_robot: "/local/pool_card/robot.png",
    image_psu: "/local/pool_card/psu.png",
    robot_led_top: 32,
    robot_led_left: 44,
    robot_led_width: 12,
    robot_led_height: 40,
    robot_led_radius: 6,
    robot_led_brightness: 100,
    psu_ring_cx: 40,
    psu_ring_cy: 55,
    psu_ring_size: 15,
  });

  function num(config, key, fallback) {
    const v = config[key];
    if (v === undefined || v === null || v === "") return fallback;
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  function numPx(config, key, fallback) {
    const v = config[key];
    if (v === undefined || v === null || v === "") return fallback;
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(48, Math.max(0, n));
  }

  function ledBrightnessMul(config) {
    const b = num(config, "robot_led_brightness", DEFAULTS.robot_led_brightness);
    const clamped = Math.min(220, Math.max(25, b));
    return (clamped / 100).toFixed(3);
  }

  function overlayVars(config) {
    const c = config;
    return `
      --pc-led-top:${num(c, "robot_led_top", DEFAULTS.robot_led_top)}%;
      --pc-led-left:${num(c, "robot_led_left", DEFAULTS.robot_led_left)}%;
      --pc-led-w:${num(c, "robot_led_width", DEFAULTS.robot_led_width)}%;
      --pc-led-h:${num(c, "robot_led_height", DEFAULTS.robot_led_height)}%;
      --pc-led-radius:${numPx(c, "robot_led_radius", DEFAULTS.robot_led_radius)}px;
      --pc-led-brightness:${ledBrightnessMul(c)};
      --pc-ring-cx:${num(c, "psu_ring_cx", DEFAULTS.psu_ring_cx)}%;
      --pc-ring-cy:${num(c, "psu_ring_cy", DEFAULTS.psu_ring_cy)}%;
      --pc-ring-size:${num(c, "psu_ring_size", DEFAULTS.psu_ring_size)}%;
    `.trim();
  }

  const WIFI_UID_SUFFIXES = [
    ["vacuum", "_vacuum"],
    ["status", "_status"],
    ["robot_status", "_robot_status"],
    ["power_supply", "_power_supply_status"],
    ["connected", "_aws_broker"],
    ["clean_mode", "_clean_mode"],
  ];

  function entityState(hass, entityId) {
    if (!entityId || !hass?.states?.[entityId]) return null;
    return hass.states[entityId];
  }

  function resolveEntities(hass, config) {
    const manual = {
      vacuum: config.entity_vacuum || null,
      status: config.entity_status || null,
      robot_status: config.entity_robot_status || null,
      power_supply: config.entity_power_supply || null,
      connected: config.entity_connected || null,
      clean_mode: config.entity_clean_mode || null,
    };
    if (!config.device) return manual;

    const devId = config.device;
    const found = {
      vacuum: null,
      status: null,
      robot_status: null,
      power_supply: null,
      connected: null,
      clean_mode: null,
    };
    const registry = hass.entities || {};
    const byUid = [];

    for (const [eid, ent] of Object.entries(registry)) {
      if (ent.device_id !== devId) continue;
      byUid.push({
        eid,
        uid: (ent.unique_id || "").toLowerCase(),
        platform: ent.platform,
      });
    }

    for (const [key, suffix] of WIFI_UID_SUFFIXES) {
      const hit = byUid.find((x) => x.uid.endsWith(suffix));
      if (hit && (hass.states[hit.eid] || key === "vacuum")) {
        found[key] = hit.eid;
      }
    }

    if (!found.vacuum) {
      const vac = byUid.find((x) => x.platform === "vacuum");
      if (vac) found.vacuum = vac.eid;
    }
    if (!found.status) {
      const st = byUid.find(
        (x) =>
          x.platform === "sensor" &&
          x.uid.endsWith("_status") &&
          !x.uid.includes("robot") &&
          !x.uid.includes("power_supply") &&
          !x.uid.includes("filter")
      );
      if (st) found.status = st.eid;
    }

    return {
      ...found,
      ...manual,
      vacuum: manual.vacuum || found.vacuum,
      status: manual.status || found.status,
      robot_status: manual.robot_status || found.robot_status,
      connected: manual.connected || found.connected,
    };
  }

  function vacuumState(hass, entityId) {
    const st = entityState(hass, entityId);
    if (!st) return null;
    const raw = String(st.state || "").toLowerCase();
    if (raw && raw !== "unknown" && raw !== "unavailable") return raw;
    return null;
  }

  function vacuumIsRunning(state) {
    return state === "cleaning" || state === "returning";
  }

  function vacuumIsReady(state) {
    return state === "idle" || state === "docked" || state === "paused";
  }

  function cleanerUiPhase(hass, entities, config) {
    const vs = vacuumState(hass, entities.vacuum);
    const statusRaw = entityState(hass, entities.status)?.state;
    const status = statusRaw ? String(statusRaw).toLowerCase() : "";

    if (vs === "unavailable") return "unavailable";
    if (vs === "error" || status.includes("error") || status.includes("fault")) {
      return "fault";
    }
    if (vacuumIsRunning(vs)) return "cleaning";
    if (vs === "paused") return "powered_idle";
    if (vs === "docked") return "done";
    if (vs === "idle") return "powered_idle";
    if (status.includes("clean")) return "cleaning";
    if (status.includes("finish") || status.includes("complete")) return "done";
    if (!vs) return "unknown";
    return "unknown";
  }

  function isOn(hass, entityId) {
    const st = entityState(hass, entityId);
    if (!st) return false;
    return st.state === "on";
  }

  function isConnected(hass, entityId) {
    const st = entityState(hass, entityId);
    if (!st) return false;
    return st.state === "on";
  }

  function displayState(hass, entities, config, pending) {
    if (pending === "on") return "Starting…";
    if (pending === "off") return "Turning off…";
    if (config.state_text) return config.state_text;
    const phase = cleanerUiPhase(hass, entities, config);
    const labels = {
      cleaning: "Cleaning",
      done: "Done cleaning",
      powered_idle: "Ready",
      off: "Off",
      programming: "Programming",
      self_test: "Self test",
      fault: "Fault",
      unknown: "Unknown",
      unavailable: "Unavailable",
    };
    return labels[phase] || "—";
  }

  function statusDotClass(phase, showRobot, pending) {
    if (pending) return "pending";
    if (showRobot) return "pulse";
    if (phase === "done") return "done";
    if (phase === "powered_idle") return "idle";
    if (phase === "fault") return "fault";
    return "";
  }

  const PENDING_TIMEOUT_MS = 120000;

  function pendingResolved(hass, entities, config, pending, pendingSince) {
    if (!pending) return true;
    if (Date.now() - pendingSince > PENDING_TIMEOUT_MS) return true;

    const phase = cleanerUiPhase(hass, entities, config);
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
    }
    return true;
  }

  function showCleanerActive(hass, entities, config) {
    if (config.show_cleaner_when === "always") return true;
    if (config.show_cleaner_when === "never") return false;
    return cleanerUiPhase(hass, entities, config) === "cleaning";
  }

  function isConfigIncomplete(config) {
    return !config?.device && !config?.entity_vacuum;
  }

  const WEEKDAYS = Object.freeze([
    { id: 0, label: "M" },
    { id: 1, label: "T" },
    { id: 2, label: "W" },
    { id: 3, label: "T" },
    { id: 4, label: "F" },
    { id: 5, label: "S" },
    { id: 6, label: "S" },
  ]);

  function scheduleSlot2Configured(hass, config) {
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
  }

  function durationLabelFromMinutes(mins) {
    return Number(mins) === 60 ? "1 hour" : "2 hours";
  }

  function durationMinutesFromLabel(label) {
    return label === "1 hour" ? 60 : 120;
  }

  function parseScheduleDays(raw) {
    if (!raw || raw === "unknown" || raw === "unavailable") return new Set();
    return new Set(
      String(raw)
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s !== "")
    );
  }

  function formatScheduleDays(set) {
    return [...set].sort((a, b) => Number(a) - Number(b)).join(",");
  }

  function scheduleTimeValue(hass, entityId) {
    const st = entityState(hass, entityId);
    if (!st) return "09:00";
    const attrs = st.attributes || {};
    if (attrs.time) return String(attrs.time).slice(0, 5);
    if (st.state && st.state.includes(":")) return st.state.slice(0, 5);
    return "09:00";
  }

  function formatScheduleSummary(hass, cfg, entities) {
    if (!isOn(hass, cfg.entity_schedule_enabled)) return "Schedule off";
    const t1 = scheduleTimeValue(hass, cfg.entity_schedule_time);
    if (!scheduleSlot2Configured(hass, cfg)) return `On · ${t1}`;
    if (!isOn(hass, cfg.entity_schedule_2_enabled)) return `On · ${t1}`;
    const t2 = scheduleTimeValue(hass, cfg.entity_schedule_time_2);
    return `On · ${t1} & ${t2}`;
  }

  function mergeConfig(config) {
    return {
      ...DEFAULTS,
      show_cleaner_when: "auto",
      show_schedule: false,
      ...config,
    };
  }

  class PoolCleanerWifiCard extends LitElement {
    static get properties() {
      return {
        hass: {},
        config: {},
        _busy: { state: false },
        _pending: { state: null },
        _pendingSince: { state: 0 },
        _scheduleExpanded: { state: false },
      };
    }

    static getConfigElement() {
      return document.createElement("pool-cleaner-wifi-card-editor");
    }

    static getStubConfig() {
      return { type: "custom:pool-cleaner-wifi-card" };
    }

    getCardSize() {
      const cfg = mergeConfig(this.config);
      if (cfg.show_schedule && scheduleConfigured(this.hass, cfg)) {
        if (!this._scheduleExpanded) return 5;
        return scheduleSlot2Configured(this.hass, cfg) ? 9 : 7;
      }
      return 4;
    }

    _toggleSchedulePanel() {
      this._scheduleExpanded = !this._scheduleExpanded;
    }

    setConfig(config) {
      this.config = mergeConfig(config);
    }

    _clearPending() {
      this._pending = null;
      this._pendingSince = 0;
    }

    _resolvePendingIfReady() {
      if (!this._pending) return;
      const entities = resolveEntities(this.hass, this.config);
      if (
        pendingResolved(
          this.hass,
          entities,
          this.config,
          this._pending,
          this._pendingSince
        )
      ) {
        this._clearPending();
      }
    }

    updated(changedProperties) {
      super.updated(changedProperties);
      if (this._pending && changedProperties.has("hass")) {
        this._resolvePendingIfReady();
      }
    }

    async _callService(domain, service, data) {
      await this.hass.callService(domain, service, data);
    }

    async _toggleScheduleEnabled(ev) {
      const cfg = mergeConfig(this.config);
      if (!cfg.entity_schedule_enabled || this._busy) return;
      const on = isOn(this.hass, cfg.entity_schedule_enabled);
      await this._callService("input_boolean", on ? "turn_off" : "turn_on", {
        entity_id: cfg.entity_schedule_enabled,
      });
    }

    async _setScheduleTime(ev, entityKey = "entity_schedule_time") {
      const cfg = mergeConfig(this.config);
      if (this._busy) return;
      const value = ev.target.value;
      if (!value) return;
      const entity_id = cfg[entityKey];
      if (!entity_id) return;
      await this._callService("input_datetime", "set_datetime", {
        entity_id,
        time: `${value}:00`,
      });
    }

    async _setScheduleDuration(
      option,
      entityKey = "entity_schedule_duration"
    ) {
      const cfg = mergeConfig(this.config);
      if (this._busy) return;
      const entity_id = cfg[entityKey];
      if (!entity_id) return;
      await this._callService("input_select", "select_option", {
        entity_id,
        option,
      });
    }

    async _toggleSchedule2Enabled(ev) {
      const cfg = mergeConfig(this.config);
      if (this._busy) return;
      if (!cfg.entity_schedule_2_enabled) return;
      const on = isOn(this.hass, cfg.entity_schedule_2_enabled);
      await this._callService("input_boolean", on ? "turn_off" : "turn_on", {
        entity_id: cfg.entity_schedule_2_enabled,
      });
    }

    _renderScheduleSlot(
      cfg,
      {
        title,
        masterEnabled,
        timeVal,
        duration,
        onTimeChange,
        onDuration,
        showSlotEnable = false,
        slotEnabled = false,
        onSlotEnable,
        showDays = false,
        days = new Set(),
        onDayToggle = null,
      }
    ) {
      const disabled = this._busy;
      const slotOff = showSlotEnable && !slotEnabled;
      return html`
        <div class="schedule-slot">
          <div class="schedule-slot-head">
            <span class="schedule-slot-title">${title}</span>
            ${showSlotEnable
              ? html`
                  <label class="sched-slot-toggle">
                    <input
                      type="checkbox"
                      .checked=${slotEnabled}
                      ?disabled=${this._busy || !masterEnabled}
                      @change=${onSlotEnable}
                    />
                    <span>${slotEnabled ? "On" : "Off"}</span>
                  </label>
                `
              : ""}
          </div>
          <div class="schedule-row">
            <span class="sched-label">Start</span>
            <input
              type="time"
              class="sched-time"
              .value=${timeVal}
              ?disabled=${disabled || slotOff}
              @change=${onTimeChange}
            />
          </div>
          <div class="schedule-row">
            <span class="sched-label">Run</span>
            <div class="seg">
              <button
                type="button"
                class="seg-btn ${duration === "1 hour" ? "active" : ""}"
                ?disabled=${disabled || slotOff}
                @click=${() => onDuration("1 hour")}
              >
                1 h
              </button>
              <button
                type="button"
                class="seg-btn ${duration === "2 hours" ? "active" : ""}"
                ?disabled=${disabled || slotOff}
                @click=${() => onDuration("2 hours")}
              >
                2 h
              </button>
            </div>
          </div>
          ${showDays
            ? html`
                <div class="schedule-row days-row">
                  <span class="sched-label">Days</span>
                  <div class="day-chips">
                    ${WEEKDAYS.map(
                      (d) => html`
                        <button
                          type="button"
                          class="day-chip ${days.has(String(d.id)) ? "on" : ""}"
                          ?disabled=${disabled || slotOff}
                          @click=${() => onDayToggle?.(d.id)}
                          title="Weekday ${d.id}"
                        >
                          ${d.label}
                        </button>
                      `
                    )}
                  </div>
                </div>
              `
            : ""}
        </div>
      `;
    }

    async _toggleScheduleDay(dayId, runSlot = "run1") {
      const cfg = mergeConfig(this.config);
      if (this._busy) return;
      if (!cfg.entity_schedule_days) return;
      const current = parseScheduleDays(
        entityState(this.hass, cfg.entity_schedule_days)?.state
      );
      const key = String(dayId);
      if (current.has(key)) current.delete(key);
      else current.add(key);
      await this._callService("input_text", "set_value", {
        entity_id: cfg.entity_schedule_days,
        value: formatScheduleDays(current),
      });
    }

    async _runTimed(minutes) {
      const cfg = mergeConfig(this.config);
      const entities = resolveEntities(this.hass, cfg);
      if (!entities.vacuum || this._busy) return;
      this._busy = true;
      try {
        if (!cfg.entity_script_timed) return;
        await this._callService("script", "turn_on", {
          entity_id: cfg.entity_script_timed,
          variables: {
            vacuum_entity: entities.vacuum,
            duration_minutes: minutes,
          },
        });
        this._pending = "on";
        this._pendingSince = Date.now();
      } finally {
        this._busy = false;
      }
    }

    _renderSchedule(cfg, entities) {
      if (!cfg.show_schedule) return html``;

      if (!scheduleConfigured(this.hass, cfg)) {
        return html`
          <div class="schedule schedule-hint">
            <span class="schedule-title">Schedule</span>
            <p class="schedule-msg">
              Add helpers from
              <code>examples/pool-cleaner-wifi-schedule.yaml</code>
              (HA automations — MyDolphin Plus has no card schedule API).
            </p>
          </div>
        `;
      }

      const enabled = isOn(this.hass, cfg.entity_schedule_enabled);
      const duration =
        entityState(this.hass, cfg.entity_schedule_duration)?.state || "2 hours";
      const helperDays = parseScheduleDays(
        entityState(this.hass, cfg.entity_schedule_days)?.state
      );
      const timeVal = scheduleTimeValue(this.hass, cfg.entity_schedule_time);
      const slot2 = scheduleSlot2Configured(this.hass, cfg);
      const slot2Enabled =
        slot2 && isOn(this.hass, cfg.entity_schedule_2_enabled);
      const duration2 = slot2
        ? entityState(this.hass, cfg.entity_schedule_duration_2)?.state ||
          "2 hours"
        : "2 hours";
      const timeVal2 = slot2
        ? scheduleTimeValue(this.hass, cfg.entity_schedule_time_2)
        : "17:00";
      const summary = formatScheduleSummary(this.hass, cfg, entities);

      return html`
        <div class="schedule ${this._scheduleExpanded ? "open" : "collapsed"}">
          <div class="schedule-head">
            <button
              type="button"
              class="schedule-expand"
              @click=${this._toggleSchedulePanel}
              aria-expanded=${this._scheduleExpanded ? "true" : "false"}
            >
              <span class="schedule-title">Schedule</span>
              <span class="schedule-chevron" aria-hidden="true"
                >${this._scheduleExpanded ? "▾" : "▸"}</span
              >
            </button>
            ${!this._scheduleExpanded
              ? html`<span class="schedule-summary">${summary}</span>`
              : ""}
          </div>

          ${this._scheduleExpanded
            ? html`
          <label class="sched-toggle sched-enable-row">
            <span class="sched-label">Enable</span>
            <input
              type="checkbox"
              .checked=${enabled}
              ?disabled=${this._busy}
              @change=${(ev) => this._toggleScheduleEnabled(ev)}
            />
            <span>${enabled ? "On" : "Off"}</span>
          </label>
          ${!enabled
            ? html`<p class="schedule-hint-inline">
                Set times and days below, then turn <strong>Enable</strong> on to
                run automatically.
              </p>`
            : ""}

          ${this._renderScheduleSlot(cfg, {
            title: slot2 ? "Run 1" : "Daily run",
            masterEnabled: enabled,
            timeVal,
            duration,
            onTimeChange: (ev) => this._setScheduleTime(ev),
            onDuration: (opt) => this._setScheduleDuration(opt),
            showDays: false,
            days: helperDays,
            onDayToggle: (d) => this._toggleScheduleDay(d, "run1"),
          })}
          ${slot2
            ? this._renderScheduleSlot(cfg, {
                title: "Run 2",
                masterEnabled: enabled,
                timeVal: timeVal2,
                duration: duration2,
                showSlotEnable: true,
                slotEnabled: slot2Enabled,
                onSlotEnable: (ev) => this._toggleSchedule2Enabled(ev),
                onTimeChange: (ev) =>
                  this._setScheduleTime(ev, "entity_schedule_time_2"),
                onDuration: (opt) =>
                  this._setScheduleDuration(opt, "entity_schedule_duration_2"),
                showDays: false,
                days: helperDays,
                onDayToggle: (d) => this._toggleScheduleDay(d, "run2"),
              })
            : ""}

          ${html`
          <div class="schedule-row days-row">
            <span class="sched-label">Days</span>
            <div class="day-chips">
              ${WEEKDAYS.map(
                (d) => html`
                  <button
                    type="button"
                    class="day-chip ${helperDays.has(String(d.id)) ? "on" : ""}"
                    ?disabled=${this._busy}
                    @click=${() => this._toggleScheduleDay(d.id)}
                    title="Weekday ${d.id}"
                  >
                    ${d.label}
                  </button>
                `
              )}
            </div>
          </div>
            `}

          <div class="schedule-row run-row">
            <span class="sched-label">Now</span>
            <div class="run-btns">
              <button
                type="button"
                class="run-btn"
                ?disabled=${!entities.vacuum || this._busy}
                @click=${() => this._runTimed(60)}
              >
                Run 1 h
              </button>
              <button
                type="button"
                class="run-btn"
                ?disabled=${!entities.vacuum || this._busy}
                @click=${() => this._runTimed(120)}
              >
                Run 2 h
              </button>
            </div>
          </div>
            `
            : ""}
        </div>
      `;
    }

    _togglePower() {
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
    }

    render() {
      if (!this.hass || !this.config) return html``;

      if (isConfigIncomplete(this.config)) {
        return html`
          <ha-card>
            <div class="card setup-card">
              <p class="setup-msg">
                Choose your <strong>MyDolphin device</strong> (recommended) or
                <strong>Vacuum entity</strong> in the card options.
              </p>
            </div>
          </ha-card>
        `;
      }

      const cfg = mergeConfig(this.config);
      const entities = resolveEntities(this.hass, cfg);
      const title =
        cfg.name ||
        entityState(this.hass, entities.vacuum)?.attributes?.friendly_name ||
        entityState(this.hass, entities.status)?.attributes?.friendly_name?.replace(
          /\s+status$/i,
          ""
        ) ||
        "Pool cleaner";

      const pending = this._pending;
      const phase = cleanerUiPhase(this.hass, entities, cfg);
      const active = !pending && showCleanerActive(this.hass, entities, cfg);
      const vs = vacuumState(this.hass, entities.vacuum);
      const powered =
        pending === "on"
          ? true
          : pending === "off"
            ? false
            : vacuumIsReady(vs) || vacuumIsRunning(vs);
      const cloudOk = entities.connected
        ? isConnected(this.hass, entities.connected)
        : entities.vacuum &&
          entityState(this.hass, entities.vacuum)?.state !== "unavailable";

      const stateLabel = displayState(this.hass, entities, cfg, pending);
      const dotClass = statusDotClass(phase, active, pending);
      const imgSrc = active ? cfg.image_robot : cfg.image_psu;
      const showPsuRing =
        !active && (powered || pending === "on");

      return html`
        <ha-card>
          <div
            class="card pc-local ${active ? "active" : "idle"} ${showPsuRing ? "power-supply-on" : ""} ${pending ? "pending" : ""}"
          >
            <div class="header">
              <span class="title">${title}</span>
              <span
                class="cloud ${cloudOk ? "on" : ""}"
                title="${cloudOk ? "Cloud connected" : "Not connected"}"
              >
                ${this._cloudIcon()}
              </span>
            </div>

            <div class="stage" aria-hidden="true">
              <div class="art-local-wrap" style="${overlayVars(cfg)}">
                <img class="art-img" src="${imgSrc}" alt="" draggable="false" />
                ${active ? html`<div class="robot-led-overlay"></div>` : ""}
                ${!active ? html`<div class="psu-ring-overlay"></div>` : ""}
              </div>
              ${active ? html`<div class="bubbles"></div>` : ""}
            </div>

            <div class="footer">
              <div class="state-pill ${pending ? "is-pending" : ""}">
                <span class="dot ${dotClass}"></span>
                <span class="state-text">${stateLabel}</span>
              </div>
              <button
                class="power ${powered ? "on" : ""} ${pending ? "pending" : ""}"
                ?disabled=${!entities.vacuum || this._busy}
                @click=${this._togglePower}
                title="${pending ? stateLabel : powered ? "Turn off" : "Turn on"}"
              >
                ${pending ? this._pendingIcon() : this._powerIcon()}
              </button>
            </div>

            ${this._renderSchedule(cfg, entities)}
          </div>
        </ha-card>
      `;
    }

    _powerIcon() {
      return html`
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M12 3v9M8.5 5.5a7 7 0 1 0 7 0"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
          />
        </svg>
      `;
    }

    _pendingIcon() {
      return html`
        <svg class="spin" viewBox="0 0 24 24" aria-hidden="true">
          <circle
            cx="12"
            cy="12"
            r="9"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-dasharray="42"
            stroke-linecap="round"
          />
        </svg>
      `;
    }

    _cloudIcon() {
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
    }

    static get styles() {
      return css`
        :host {
          display: block;
        }
        ha-card {
          overflow: hidden;
          background: var(--card-background-color, var(--ha-card-background));
        }
        .card {
          padding: 12px 14px 14px;
          min-height: 200px;
          display: flex;
          flex-direction: column;
        }
        .setup-card {
          justify-content: center;
          text-align: center;
        }
        .setup-msg {
          margin: 0 0 8px;
          color: var(--primary-text-color);
          font-size: 0.95rem;
        }
        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 4px;
        }
        .title {
          font-size: 1rem;
          font-weight: 600;
          color: var(--primary-text-color);
        }
        .cloud {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--disabled-text-color);
          background: var(--secondary-background-color);
          transition:
            color 0.3s,
            background 0.3s,
            box-shadow 0.3s;
        }
        .cloud.on {
          color: #38bdf8;
          background: rgba(56, 189, 248, 0.15);
          box-shadow: 0 0 12px rgba(56, 189, 248, 0.45);
        }
        .cloud svg {
          width: 18px;
          height: 18px;
        }
        .stage {
          flex: 1;
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 130px;
        }
        .art-local-wrap {
          position: relative;
          width: 100%;
          max-width: 240px;
          display: inline-block;
          line-height: 0;
        }
        .art-img {
          width: 100%;
          height: auto;
          max-height: 160px;
          object-fit: contain;
          display: block;
          border-radius: 8px;
        }
        .robot-led-overlay {
          position: absolute;
          top: var(--pc-led-top, 32%);
          left: var(--pc-led-left, 44%);
          width: var(--pc-led-w, 12%);
          height: var(--pc-led-h, 40%);
          border-radius: var(--pc-led-radius, 6px);
          pointer-events: none;
          background: radial-gradient(
            ellipse at center,
            rgba(147, 224, 255, 0.95) 0%,
            rgba(56, 189, 248, 0.55) 45%,
            rgba(56, 189, 248, 0.15) 100%
          );
          mix-blend-mode: lighten;
          filter: brightness(var(--pc-led-brightness, 1));
        }
        .card.active.pc-local .robot-led-overlay {
          animation: led-soft-breathe 2.8s ease-in-out infinite;
        }
        .psu-ring-overlay {
          position: absolute;
          top: calc(var(--pc-ring-cy, 55%) - var(--pc-ring-size, 15%) / 2);
          left: calc(var(--pc-ring-cx, 40%) - var(--pc-ring-size, 15%) / 2);
          width: var(--pc-ring-size, 15%);
          aspect-ratio: 1;
          border-radius: 50%;
          pointer-events: none;
          box-sizing: border-box;
          visibility: visible;
          opacity: 0;
          background: transparent;
        }
        .card.idle.pc-local.power-supply-on .psu-ring-overlay {
          opacity: 1;
          border: 3px solid rgba(56, 189, 248, 0.95);
          animation: psu-ring-soft 2.4s ease-in-out infinite;
        }
        .card.idle.pc-local:not(.power-supply-on) .psu-ring-overlay {
          visibility: hidden;
        }
        .card.active.pc-local .art-local-wrap {
          animation: float-soft 4s ease-in-out infinite;
        }
        .bubbles {
          position: absolute;
          inset: 0;
          pointer-events: none;
          background: radial-gradient(
              circle at 30% 78%,
              rgba(56, 189, 248, 0.1) 0%,
              transparent 42%
            ),
            radial-gradient(
              circle at 72% 74%,
              rgba(56, 189, 248, 0.08) 0%,
              transparent 38%
            );
          animation: shimmer 5s linear infinite;
        }
        .footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin-top: 6px;
        }
        .state-pill {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 12px;
          border-radius: 20px;
          background: var(--secondary-background-color);
          flex: 1;
          min-width: 0;
        }
        .dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--disabled-text-color);
          flex-shrink: 0;
        }
        .dot.pulse {
          background: #22c55e;
          animation: pulse-dot 1.5s ease-in-out infinite;
        }
        .dot.done {
          background: #f59e0b;
        }
        .dot.idle {
          background: #64748b;
        }
        .dot.fault {
          background: #ef4444;
        }
        .dot.pending {
          background: #38bdf8;
          animation: pulse-dot 1.2s ease-in-out infinite;
        }
        .state-pill.is-pending {
          box-shadow: 0 0 0 1px rgba(56, 189, 248, 0.25);
        }
        .state-text {
          font-size: 0.9rem;
          color: var(--primary-text-color);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .power {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--secondary-background-color);
          color: var(--primary-text-color);
          transition:
            background 0.25s,
            box-shadow 0.25s,
            transform 0.15s;
          flex-shrink: 0;
        }
        .power:hover:not(:disabled) {
          transform: scale(1.05);
        }
        .power:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }
        .power.on {
          background: #1d4ed8;
          color: #fff;
          box-shadow: 0 0 16px rgba(29, 78, 216, 0.55);
        }
        .power.pending {
          background: #1e3a5f;
          color: #93c5fd;
          box-shadow: 0 0 14px rgba(56, 189, 248, 0.45);
        }
        .power svg {
          width: 26px;
          height: 26px;
        }
        .power svg.spin {
          animation: spin 0.9s linear infinite;
        }
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
        @keyframes led-soft-breathe {
          0%,
          100% {
            opacity: 0.28;
          }
          50% {
            opacity: 1;
          }
        }
        @keyframes psu-ring-soft {
          0%,
          100% {
            opacity: 0.55;
            box-shadow: 0 0 6px rgba(56, 189, 248, 0.35);
          }
          50% {
            opacity: 1;
            box-shadow: 0 0 20px rgba(56, 189, 248, 0.95);
          }
        }
        @keyframes float-soft {
          0%,
          100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-3px);
          }
        }
        @keyframes shimmer {
          0% {
            opacity: 0.5;
          }
          50% {
            opacity: 1;
          }
          100% {
            opacity: 0.5;
          }
        }
        @keyframes pulse-dot {
          0%,
          100% {
            box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.5);
          }
          50% {
            box-shadow: 0 0 0 6px rgba(34, 197, 94, 0);
          }
        }
        .schedule {
          margin-top: 12px;
          padding-top: 10px;
          border-top: 1px solid var(--divider-color, rgba(255, 255, 255, 0.08));
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .schedule-hint .schedule-msg {
          margin: 4px 0 0;
          font-size: 0.78rem;
          color: var(--secondary-text-color);
          line-height: 1.35;
        }
        .schedule-hint code {
          font-size: 0.72rem;
        }
        .schedule-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }
        .schedule-expand {
          display: flex;
          align-items: center;
          gap: 6px;
          flex: 1;
          padding: 0;
          border: none;
          background: none;
          color: inherit;
          font: inherit;
          cursor: pointer;
          text-align: left;
        }
        .schedule-expand:focus-visible {
          outline: 2px solid var(--primary-color);
          outline-offset: 2px;
          border-radius: 4px;
        }
        .schedule-chevron {
          font-size: 0.85rem;
          color: var(--secondary-text-color);
        }
        .schedule-summary {
          font-size: 0.78rem;
          color: var(--secondary-text-color);
          flex-shrink: 0;
        }
        .schedule.collapsed .schedule-summary {
          color: var(--primary-color);
        }
        .schedule-slot {
          margin-top: 4px;
          padding: 8px 0 4px;
          border-top: 1px solid var(--divider-color, rgba(255, 255, 255, 0.08));
        }
        .schedule-slot:first-of-type {
          border-top: none;
          padding-top: 0;
        }
        .schedule-slot-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 6px;
        }
        .schedule-slot-title {
          font-size: 0.72rem;
          font-weight: 600;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--secondary-text-color);
        }
        .sched-slot-toggle {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.78rem;
          cursor: pointer;
        }
        .schedule-title {
          font-size: 0.78rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: var(--secondary-text-color);
        }
        .sched-toggle {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.82rem;
          color: var(--primary-text-color);
          cursor: pointer;
        }
        .sched-enable-row {
          justify-content: flex-start;
          margin-bottom: 2px;
        }
        .sched-enable-row .sched-label {
          width: auto;
          min-width: 2.5rem;
        }
        .schedule-hint-inline {
          margin: 0 0 6px;
          font-size: 0.74rem;
          line-height: 1.35;
          color: var(--secondary-text-color);
        }
        .schedule-row {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .days-row {
          align-items: flex-start;
        }
        .sched-label {
          width: 2.5rem;
          flex-shrink: 0;
          font-size: 0.78rem;
          color: var(--secondary-text-color);
        }
        .sched-time {
          flex: 1;
          padding: 6px 8px;
          border-radius: 8px;
          border: 1px solid var(--divider-color, rgba(255, 255, 255, 0.12));
          background: var(--secondary-background-color);
          color: var(--primary-text-color);
          font-size: 0.9rem;
        }
        .seg {
          display: flex;
          flex: 1;
          gap: 6px;
        }
        .seg-btn,
        .run-btn {
          flex: 1;
          padding: 6px 10px;
          border-radius: 8px;
          border: 1px solid var(--divider-color, rgba(255, 255, 255, 0.12));
          background: var(--secondary-background-color);
          color: var(--primary-text-color);
          font-size: 0.82rem;
          cursor: pointer;
        }
        .seg-btn.active {
          background: rgba(29, 78, 216, 0.35);
          border-color: #1d4ed8;
          color: #fff;
        }
        .seg-btn:disabled,
        .run-btn:disabled,
        .sched-time:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }
        .day-chips {
          display: flex;
          flex: 1;
          gap: 4px;
          flex-wrap: wrap;
        }
        .day-chip {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          border: 1px solid var(--divider-color, rgba(255, 255, 255, 0.12));
          background: var(--secondary-background-color);
          color: var(--primary-text-color);
          font-size: 0.72rem;
          font-weight: 600;
          cursor: pointer;
          padding: 0;
        }
        .day-chip.on {
          background: #1d4ed8;
          border-color: #1d4ed8;
          color: #fff;
        }
        .run-row .run-btns {
          display: flex;
          flex: 1;
          gap: 6px;
        }
      `;
    }
  }

  function numPercentSchema(name) {
    return {
      name,
      selector: {
        number: {
          mode: "box",
          min: 0,
          max: 100,
          step: 0.5,
        },
      },
    };
  }

  class PoolCleanerWifiCardEditor extends LitElement {
    static get properties() {
      return { hass: {}, config: {} };
    }

    setConfig(config) {
      this.config = mergeConfig(config || {});
    }

    _valueChanged(ev) {
      this.dispatchEvent(
        new CustomEvent("config-changed", {
          detail: { config: ev.detail.value },
        })
      );
    }

    render() {
      if (!this.hass) return html``;
      const merged = mergeConfig(this.config || {});
      return html`
        <ha-form
          .hass=${this.hass}
          .data=${merged}
          .schema=${[
            {
              name: "device",
              selector: {
                device: {
                  filter: { integration: "mydolphin_plus" },
                },
              },
            },
            {
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
            },
            { name: "name", selector: { text: {} } },
            {
              name: "show_cleaner_when",
              type: "select",
              options: [
                ["auto", "Auto (only while truly cleaning)"],
                ["always", "Always show robot image"],
                ["never", "Always show PSU image"],
              ],
            },
            {
              name: "image_robot",
              selector: { text: {} },
            },
            {
              name: "image_psu",
              selector: { text: {} },
            },
            numPercentSchema("robot_led_top"),
            numPercentSchema("robot_led_left"),
            numPercentSchema("robot_led_width"),
            numPercentSchema("robot_led_height"),
            {
              name: "robot_led_radius",
              selector: {
                number: { mode: "box", min: 0, max: 48, step: 1 },
              },
            },
            {
              name: "robot_led_brightness",
              selector: {
                number: { mode: "box", min: 25, max: 220, step: 5 },
              },
            },
            numPercentSchema("psu_ring_cx"),
            numPercentSchema("psu_ring_cy"),
            numPercentSchema("psu_ring_size"),
            {
              name: "show_schedule",
              selector: { boolean: {} },
            },
            {
              name: "entity_schedule_enabled",
              selector: { entity: { domain: "input_boolean" } },
            },
            {
              name: "entity_schedule_time",
              selector: { entity: { domain: "input_datetime" } },
            },
            {
              name: "entity_schedule_duration",
              selector: { entity: { domain: "input_select" } },
            },
            {
              name: "entity_schedule_days",
              selector: { entity: { domain: "input_text" } },
            },
            {
              name: "entity_schedule_2_enabled",
              selector: { entity: { domain: "input_boolean" } },
            },
            {
              name: "entity_schedule_time_2",
              selector: { entity: { domain: "input_datetime" } },
            },
            {
              name: "entity_schedule_duration_2",
              selector: { entity: { domain: "input_select" } },
            },
            {
              name: "entity_script_timed",
              selector: { entity: { domain: "script" } },
            },
          ]}
          .computeLabel=${(s) =>
            ({
              device: "MyDolphin device (auto-fills vacuum + sensors)",
              entity_vacuum: "Vacuum entity (start/stop cleaning)",
              entity_status: "Status sensor (optional; auto from device)",
              entity_robot_status: "Robot status sensor (optional)",
              entity_power_supply: "Power supply status (optional)",
              entity_connected: "AWS Broker / cloud OK (optional)",
              entity_clean_mode: "Clean mode sensor (optional)",
              name: "Card title override",
              show_cleaner_when: "Robot vs power supply image",
              show_schedule: "Show schedule panel",
              entity_schedule_enabled: "Schedule — enabled (input_boolean)",
              entity_schedule_time: "Schedule — start time (input_datetime, time only)",
              entity_schedule_duration: "Schedule — duration (input_select: 1 hour / 2 hours)",
              entity_schedule_days: "Schedule — days (input_text, comma weekdays 0=Mon)",
              entity_schedule_2_enabled: "Schedule run 2 — enabled (input_boolean)",
              entity_schedule_time_2: "Schedule run 2 — start time (input_datetime)",
              entity_schedule_duration_2: "Schedule run 2 — duration (input_select)",
              entity_script_timed: "Timed run script (script.pool_cleaner_wifi_timed_run)",
              image_robot: "Robot image URL",
              image_psu: "Power supply image URL",
              robot_led_top: "Robot LED — top %",
              robot_led_left: "Robot LED — left %",
              robot_led_width: "Robot LED — width %",
              robot_led_height: "Robot LED — height %",
              robot_led_radius: "Robot LED — corner radius (px)",
              robot_led_brightness: "Robot LED — brightness %",
              psu_ring_cx: "PSU ring — center X %",
              psu_ring_cy: "PSU ring — center Y %",
              psu_ring_size: "PSU ring — diameter %",
            })[s.name] || s.name}
          @value-changed=${this._valueChanged}
        ></ha-form>
      `;
    }
  }

  customElements.define("pool-cleaner-wifi-card", PoolCleanerWifiCard);
  customElements.define("pool-cleaner-wifi-card-editor", PoolCleanerWifiCardEditor);

  window.customCards = window.customCards || [];
  window.customCards.push({
    type: "pool-cleaner-wifi-card",
    name: "Pool Cleaner WiFi Card",
    description:
      "MyDolphin Plus (WiFi) — start/stop, status, optional HA schedule",
    preview: true,
    documentationURL:
      "https://github.com/randrcomputers/ha-pool-cleaner-wifi-card#readme",
  });
})();
