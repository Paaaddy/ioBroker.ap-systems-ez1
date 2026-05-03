"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var utils = __toESM(require("@iobroker/adapter-core"));
var import_net = __toESM(require("net"));
var import_ApSystemsEz1Client = require("./lib/ApSystemsEz1Client");
const _ApSystemsEz1 = class _ApSystemsEz1 extends utils.Adapter {
  constructor(options = {}) {
    super({
      ...options,
      name: "ap-systems-ez1"
    });
    this.pollIntervalInMilliSeconds = 60;
    // 1 hour
    // Serializes write commands — prevents concurrent device commands from racing
    this.writeQueue = Promise.resolve();
    this.lastConnectedLogged = void 0;
    /**
     * Cache to track which states have been created to avoid repeated getStateAsync calls.
     */
    this.createdStates = /* @__PURE__ */ new Set();
    this.on("ready", this.onReady.bind(this));
    this.on("stateChange", this.onStateChange.bind(this));
    this.on("unload", this.onUnload.bind(this));
  }
  /**
   * Is called when databases are connected and adapter received configuration.
   */
  async onReady() {
    var _a, _b, _c, _d;
    this.log.debug("config ipAddress: " + this.config.ipAddress);
    this.log.debug("config port: " + this.config.port);
    this.log.debug("config pollIntervalInSeconds: " + this.config.pollIntervalInSeconds);
    this.log.debug("config ignoreConnectionErrorMessages: " + this.config.ignoreConnectionErrorMessages);
    const port = Number((_a = this.config) == null ? void 0 : _a.port);
    const pollInterval = Number((_b = this.config) == null ? void 0 : _b.pollIntervalInSeconds);
    if (!((_c = this.config) == null ? void 0 : _c.ipAddress) || !import_net.default.isIPv4(this.config.ipAddress)) {
      this.log.error("Invalid IP address in config. Must be a valid IPv4 address.");
      return;
    }
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      this.log.error("Invalid port in config. Must be an integer between 1 and 65535.");
      return;
    }
    if (!Number.isFinite(pollInterval) || pollInterval < 1) {
      this.log.error("Invalid pollIntervalInSeconds in config. Must be a positive number.");
      return;
    }
    this.pollIntervalInMilliSeconds = pollInterval * 1e3;
    this.apiClient = new import_ApSystemsEz1Client.ApSystemsEz1Client(this.log, this.config.ipAddress, this.config.port, (_d = this.config) == null ? void 0 : _d.ignoreConnectionErrorMessages);
    await this.extendObjectAsync("connected", {
      type: "state",
      common: {
        name: "Connected",
        type: "boolean",
        role: "indicator.connected",
        read: true,
        write: false
      },
      native: {}
    });
    this.markStateCreated("connected");
    await this.setStateAsync("connected", { val: false, ack: true });
    await this.extendObjectAsync("OnOffStatus", { type: "channel", common: { name: "OnOffStatus" }, native: {} });
    await this.extendObjectAsync("OnOffStatus.OnOffStatus", {
      type: "state",
      common: {
        name: "OnOffStatus",
        type: "boolean",
        role: "switch",
        read: true,
        write: true
      },
      native: {}
    });
    this.markStateCreated("OnOffStatus.OnOffStatus");
    await this.extendObjectAsync("MaxPower", { type: "channel", common: { name: "MaxPower" }, native: {} });
    await this.extendObjectAsync("MaxPower.MaxPower", {
      type: "state",
      common: {
        name: "MaxPower",
        type: "number",
        role: "value.power",
        unit: "W",
        read: true,
        write: true
      },
      native: {}
    });
    this.markStateCreated("MaxPower.MaxPower");
    try {
      await Promise.all([
        this.setDeviceInfoStates(),
        this.setMaxPowerState(),
        this.setOutputDataStates(),
        this.setAlarmInfoStates(),
        this.setOnOffStatusState()
      ]);
    } catch (e) {
      this.log.error(`Initial poll failed unexpectedly: ${e}`);
    }
    await this.logBootSummary();
    this.slowTimer = setInterval(() => {
      void this.setDeviceInfoStates();
      void this.setMaxPowerState();
    }, _ApSystemsEz1.SLOW_POLL_INTERVAL_MS);
    this.timer = setInterval(() => {
      void this.setOutputDataStates();
      void this.setAlarmInfoStates();
      void this.setOnOffStatusState();
    }, this.pollIntervalInMilliSeconds);
    this.subscribeStates("OnOffStatus.OnOffStatus");
    this.subscribeStates("MaxPower.MaxPower");
  }
  async setDeviceInfoStates() {
    try {
      const deviceInfo = await this.apiClient.getDeviceInfo();
      this.log.debug("deviceInfo received");
      if ((deviceInfo == null ? void 0 : deviceInfo.data) != null) {
        await this.setConnected(true);
        const res = deviceInfo.data;
        const stringPromises = _ApSystemsEz1.DEVICE_INFO_STRINGS.map(async (element) => {
          const stateId = `DeviceInfo.${element.name}`;
          if (!this.stateExists(stateId)) {
            this.markStateCreated(stateId);
            this.createState(
              "DeviceInfo",
              "",
              element.name,
              { type: "string", role: "text", read: true, write: false },
              () => {
                this.log.info(`state ${element.name} created`);
              }
            );
          }
          await this.setStateAsync(stateId, { val: element.value(res), ack: true });
        });
        const numberPromises = _ApSystemsEz1.DEVICE_INFO_NUMBERS.map(async (element) => {
          const value = element.value(res);
          if (!Number.isFinite(value)) {
            const raw = element.raw(res);
            this.log.error(`Invalid device limit for ${element.name}: ${JSON.stringify(raw)} (type ${typeof raw})`);
            return;
          }
          const stateId = `DeviceInfo.${element.name}`;
          if (!this.stateExists(stateId)) {
            this.markStateCreated(stateId);
            this.createState(
              "DeviceInfo",
              "",
              element.name,
              { type: "number", role: "value", read: true, write: false },
              () => {
                this.log.info(`state ${element.name} created`);
              }
            );
          }
          await this.setStateAsync(stateId, { val: value, ack: true });
        });
        await Promise.all([...stringPromises, ...numberPromises]);
      } else {
        await this.setConnected(false);
      }
    } catch (e) {
      this.log.error(`setDeviceInfoStates failed: ${e}`);
      await this.setConnected(false);
    }
  }
  async setOutputDataStates() {
    try {
      const outputData = await this.apiClient.getOutputData();
      this.log.debug("outputData received");
      if ((outputData == null ? void 0 : outputData.data) != null) {
        const res = outputData.data;
        const promises = _ApSystemsEz1.OUTPUT_DATA_NUMBERS.map(async (element) => {
          const value = element.value(res);
          if (!Number.isFinite(value)) {
            this.log.error(`Invalid output data for ${element.name}: ${JSON.stringify(value)} (type ${typeof value})`);
            return;
          }
          const stateId = `OutputData.${element.name}`;
          if (!this.stateExists(stateId)) {
            this.markStateCreated(stateId);
            this.createState(
              "OutputData",
              "",
              element.name,
              { type: "number", role: element.role, unit: element.unit, read: true, write: false },
              () => {
                this.log.info(`state ${element.name} created`);
              }
            );
          }
          await this.setStateAsync(stateId, { val: value, ack: true });
        });
        await Promise.all(promises);
      } else {
        await this.setConnected(false);
      }
    } catch (e) {
      this.log.error(`setOutputDataStates failed: ${e}`);
      await this.setConnected(false);
    }
  }
  async setAlarmInfoStates() {
    try {
      const alarmInfo = await this.apiClient.getAlarmInfo();
      this.log.debug("alarmInfo received");
      if ((alarmInfo == null ? void 0 : alarmInfo.data) != null) {
        const res = alarmInfo.data;
        const promises = _ApSystemsEz1.ALARM_INFO_NUMBERS.map(async (element) => {
          const stateId = `AlarmInfo.${element.name}`;
          if (!this.stateExists(stateId)) {
            this.markStateCreated(stateId);
            this.createState(
              "AlarmInfo",
              "",
              element.name,
              { type: "string", role: "text", read: true, write: false },
              () => {
                this.log.info(`state ${element.name} created`);
              }
            );
          }
          const rawValue = element.value(res);
          if (rawValue !== "0" && rawValue !== "1") {
            this.log.error(`Unexpected alarm value for ${element.name}: ${JSON.stringify(rawValue)} (type ${typeof rawValue}, expected "0" or "1")`);
            return;
          }
          const value = rawValue === "0" ? "Normal" : "Alarm";
          await this.setStateAsync(stateId, { val: value, ack: true });
        });
        await Promise.all(promises);
      } else {
        await this.setConnected(false);
      }
    } catch (e) {
      this.log.error(`setAlarmInfoStates failed: ${e}`);
      await this.setConnected(false);
    }
  }
  async setOnOffStatusState() {
    try {
      const onOffStatus = await this.apiClient.getOnOffStatus();
      this.log.debug("onOffStatus received");
      if ((onOffStatus == null ? void 0 : onOffStatus.data) != null) {
        const res = onOffStatus.data;
        const stateId = "OnOffStatus.OnOffStatus";
        if (!this.stateExists(stateId)) {
          this.markStateCreated(stateId);
          this.createState(
            "OnOffStatus",
            "",
            "OnOffStatus",
            { type: "boolean", role: "switch", read: true, write: true },
            () => {
              this.log.info(`state OnOffStatus created`);
            }
          );
        }
        if (res.status !== "0" && res.status !== "1") {
          this.log.error(`Unexpected OnOffStatus from device: ${JSON.stringify(res.status)} (type ${typeof res.status}, expected "0" or "1")`);
          return;
        }
        const value = res.status === "0";
        await this.setStateAsync(stateId, { val: value, ack: true });
      } else {
        await this.setConnected(false);
      }
    } catch (e) {
      this.log.error(`setOnOffStatusState failed: ${e}`);
      await this.setConnected(false);
    }
  }
  async setMaxPowerState() {
    try {
      const maxPower = await this.apiClient.getMaxPower();
      this.log.debug("maxPower received");
      if ((maxPower == null ? void 0 : maxPower.data) != null) {
        const res = maxPower.data;
        const powerValue = Number(res.maxPower);
        if (!Number.isFinite(powerValue)) {
          this.log.error(`Invalid maxPower from device: ${JSON.stringify(res.maxPower)} (type ${typeof res.maxPower})`);
          return;
        }
        const stateId = "MaxPower.MaxPower";
        if (!this.stateExists(stateId)) {
          this.markStateCreated(stateId);
          this.createState(
            "MaxPower",
            "",
            "MaxPower",
            { type: "number", role: "value.power", unit: "W", read: true, write: true },
            () => {
              this.log.info(`state MaxPower created`);
            }
          );
        }
        await this.setStateAsync(stateId, { val: powerValue, ack: true });
      } else {
        await this.setConnected(false);
      }
    } catch (e) {
      this.log.error(`setMaxPowerState failed: ${e}`);
      await this.setConnected(false);
    }
  }
  async setConnected(connected) {
    if (this.lastConnectedLogged !== connected) {
      if (connected) {
        this.log.info(`Connected to inverter at ${this.config.ipAddress}:${this.config.port}`);
      } else if (this.lastConnectedLogged === true) {
        this.log.warn(`Lost connection to inverter at ${this.config.ipAddress}:${this.config.port}`);
      }
      this.lastConnectedLogged = connected;
    }
    await this.setStateAsync("connected", { val: connected, ack: true });
  }
  async logBootSummary() {
    try {
      const [deviceId, devVer, minPower, maxPower, currentCap, onOff] = await Promise.all([
        this.getStateAsync("DeviceInfo.DeviceId"),
        this.getStateAsync("DeviceInfo.DevVer"),
        this.getStateAsync("DeviceInfo.MinPower"),
        this.getStateAsync("DeviceInfo.MaxPower"),
        this.getStateAsync("MaxPower.MaxPower"),
        this.getStateAsync("OnOffStatus.OnOffStatus")
      ]);
      const fmt = (s) => {
        if (s == null || s.val == null) return "unknown";
        return String(s.val);
      };
      this.log.info(
        `Adapter ready. Device ${fmt(deviceId)} (firmware ${fmt(devVer)}) at ${this.config.ipAddress}:${this.config.port}; on=${fmt(onOff)}; limits=${fmt(minPower)}-${fmt(maxPower)}W; current cap=${fmt(currentCap)}W`
      );
    } catch (e) {
      this.log.warn(`Could not assemble boot summary: ${e}`);
    }
  }
  stateExists(stateId) {
    return this.createdStates.has(stateId);
  }
  markStateCreated(stateId) {
    this.createdStates.add(stateId);
  }
  // Scripts, Blockly, and vis widgets frequently write numeric states as strings.
  // Return the numeric value, or null when the input cannot be interpreted as a finite number.
  coerceToFiniteNumber(val) {
    if (typeof val === "number") {
      return Number.isFinite(val) ? val : null;
    }
    if (typeof val === "string" && val.trim() !== "") {
      const parsed = Number(val);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }
  /**
   * Is called when adapter shuts down - callback has to be called under any circumstances!
   */
  onUnload(callback) {
    try {
      clearInterval(this.timer);
      clearInterval(this.slowTimer);
      callback();
    } catch (e) {
      callback();
    }
  }
  onStateChange(id, state) {
    if (!state || state.ack) {
      return;
    }
    if (id.endsWith(".OnOffStatus.OnOffStatus")) {
      if (typeof state.val !== "boolean") {
        this.log.error(`OnOffStatus: expected boolean, got ${typeof state.val}`);
        return;
      }
      const target = state.val;
      this.writeQueue = this.writeQueue.then(() => this.applyOnOffStatus(target)).catch(() => {
      });
    } else if (id.endsWith(".MaxPower.MaxPower")) {
      const watts = this.coerceToFiniteNumber(state.val);
      if (watts === null) {
        this.log.error(`MaxPower: expected number, got ${typeof state.val} (${JSON.stringify(state.val)})`);
        return;
      }
      this.writeQueue = this.writeQueue.then(() => this.validateAndSetMaxPower(watts)).catch(() => {
      });
    }
  }
  async applyOnOffStatus(on) {
    await this.apiClient.setOnOffStatus(on);
    await new Promise((r) => setTimeout(r, 2e3));
    const confirmed = await this.apiClient.getOnOffStatus();
    if (!confirmed) {
      this.log.error(`OnOff command sent but could not verify device state`);
      await this.setConnected(false);
      return;
    }
    const expected = on ? "0" : "1";
    if (confirmed.data.status !== expected) {
      this.log.error(`OnOff verification failed: sent ${on}, device reports status=${confirmed.data.status}`);
      const actual = confirmed.data.status === "0";
      await this.setStateAsync("OnOffStatus.OnOffStatus", { val: actual, ack: true });
      return;
    }
    this.log.info(`OnOff set to ${on}`);
  }
  async validateAndSetMaxPower(watts) {
    if (!Number.isFinite(watts)) {
      this.log.error(`MaxPower rejected: value ${watts} is not a finite number`);
      return;
    }
    const minState = await this.getStateAsync("DeviceInfo.MinPower");
    const maxState = await this.getStateAsync("DeviceInfo.MaxPower");
    const min = typeof (minState == null ? void 0 : minState.val) === "number" && Number.isFinite(minState.val) ? minState.val : null;
    const max = typeof (maxState == null ? void 0 : maxState.val) === "number" && Number.isFinite(maxState.val) ? maxState.val : null;
    if (min === null || max === null) {
      this.log.error(
        `MaxPower ${watts}W rejected: device limits unavailable (MinPower=${min === null ? "missing" : min}, MaxPower=${max === null ? "missing" : max}). Check earlier setDeviceInfoStates errors and that /getDeviceInfo is reachable.`
      );
      return;
    }
    if (watts < min) {
      this.log.error(`MaxPower ${watts}W rejected: below device minimum ${min}W`);
      return;
    }
    if (watts > max) {
      this.log.error(`MaxPower ${watts}W rejected: above device maximum ${max}W`);
      return;
    }
    await this.apiClient.setMaxPower(watts);
    await new Promise((r) => setTimeout(r, 2e3));
    const confirmed = await this.apiClient.getMaxPower();
    if (!confirmed) {
      this.log.error(`MaxPower command sent but could not verify device state`);
      await this.setConnected(false);
      return;
    }
    const actual = Number(confirmed.data.maxPower);
    if (!Number.isFinite(actual) || actual !== watts) {
      this.log.error(`MaxPower verification failed: sent ${watts}W, device reports ${confirmed.data.maxPower}W`);
      if (Number.isFinite(actual)) {
        await this.setStateAsync("MaxPower.MaxPower", { val: actual, ack: true });
      }
      return;
    }
    this.log.info(`MaxPower set to ${watts}W`);
  }
  // If you need to react to object changes, uncomment the following block and the corresponding line in the constructor.
  // You also need to subscribe to the objects with `this.subscribeObjects`, similar to `this.subscribeStates`.
  // /**
  //  * Is called if a subscribed object changes
  //  */
  // private onObjectChange(id: string, obj: ioBroker.Object | null | undefined): void {
  // 	if (obj) {
  // 		// The object was changed
  // 		this.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
  // 	} else {
  // 		// The object was deleted
  // 		this.log.info(`object ${id} deleted`);
  // 	}
  // }
  // If you need to accept messages in your adapter, uncomment the following block and the corresponding line in the constructor.
  // /**
  //  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
  //  * Using this method requires "common.messagebox" property to be set to true in io-package.json
  //  */
  // private onMessage(obj: ioBroker.Message): void {
  // 	if (typeof obj === "object" && obj.message) {
  // 		if (obj.command === "send") {
  // 			// e.g. send email or pushover or whatever
  // 			this.log.info("send command");
  // 			// Send response in callback if required
  // 			if (obj.callback) this.sendTo(obj.from, obj.command, "Message received", obj.callback);
  // 		}
  // 	}
  // }
};
_ApSystemsEz1.SLOW_POLL_INTERVAL_MS = 60 * 60 * 1e3;
// State mappings cached to avoid object allocation on every poll cycle
_ApSystemsEz1.DEVICE_INFO_STRINGS = [
  { name: "DeviceId", value: (res) => res.deviceId },
  { name: "DevVer", value: (res) => res.devVer },
  { name: "Ssid", value: (res) => res.ssid },
  { name: "IpAddr", value: (res) => res.ipAddr }
];
// /getDeviceInfo returns minPower/maxPower as strings (e.g. "30", "800") per OpenAPI;
// `value` coerces so the Number.isFinite() guard below accepts them. `raw` preserves
// the original payload so the diagnostic log can show the device's actual response.
_ApSystemsEz1.DEVICE_INFO_NUMBERS = [
  { name: "MaxPower", raw: (res) => res.maxPower, value: (res) => Number(res.maxPower) },
  { name: "MinPower", raw: (res) => res.minPower, value: (res) => Number(res.minPower) }
];
_ApSystemsEz1.OUTPUT_DATA_NUMBERS = [
  { name: "CurrentPower_1", role: "value.power", unit: "W", value: (res) => res.p1 },
  { name: "CurrentPower_2", role: "value.power", unit: "W", value: (res) => res.p2 },
  { name: "CurrentPower_Total", role: "value.power", unit: "W", value: (res) => res.p1 + res.p2 },
  { name: "EnergyToday_1", role: "value.energy", unit: "kWh", value: (res) => res.e1 },
  { name: "EnergyToday_2", role: "value.energy", unit: "kWh", value: (res) => res.e2 },
  { name: "EnergyToday_Total", role: "value.energy", unit: "kWh", value: (res) => res.e1 + res.e2 },
  { name: "EnergyLifetime_1", role: "value.energy", unit: "kWh", value: (res) => res.te1 },
  { name: "EnergyLifetime_2", role: "value.energy", unit: "kWh", value: (res) => res.te2 },
  { name: "EnergyLifetime_Total", role: "value.energy", unit: "kWh", value: (res) => res.te1 + res.te2 }
];
_ApSystemsEz1.ALARM_INFO_NUMBERS = [
  { name: "OffGrid", value: (res) => res.og },
  { name: "ShortCircuitError_1", value: (res) => res.isce1 },
  { name: "ShortCircuitError_2", value: (res) => res.isce2 },
  { name: "OutputFault", value: (res) => res.oe }
];
let ApSystemsEz1 = _ApSystemsEz1;
if (require.main !== module) {
  module.exports = (options) => new ApSystemsEz1(options);
} else {
  (() => new ApSystemsEz1())();
}
//# sourceMappingURL=main.js.map
