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
