"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
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
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var ApSystemsEz1Client_exports = {};
__export(ApSystemsEz1Client_exports, {
  ApSystemsEz1Client: () => ApSystemsEz1Client
});
module.exports = __toCommonJS(ApSystemsEz1Client_exports);
var import_axios = __toESM(require("axios"));
var import_http = __toESM(require("http"));
const MAX_RETRIES = 3;
class ApSystemsEz1Client {
  constructor(logger, ipAddress, port, ignoreConnectionErrorMessages = false) {
    this.log = logger;
    this.baseUrl = `http://${ipAddress}:${port}`;
    this.ignoreConnectionErrorMessages = ignoreConnectionErrorMessages;
    const httpAgent = new import_http.default.Agent({
      keepAlive: true,
      maxSockets: 1,
      keepAliveMsecs: 1e3,
      // Close idle sockets so stale keep-alive connections don't hang after device reboot
      timeout: 1e4
    });
    this.axiosInstance = import_axios.default.create({ httpAgent, timeout: 5e3 });
  }
  // Read endpoints: retry on transient network failure (idempotent)
  async getRequest(endpoint, attempt = 0) {
    try {
      const url = `${this.baseUrl}/${endpoint}`;
      const response = await this.axiosInstance.get(url);
      if (this.log.level === "debug") {
        this.log.debug(`Response from ${endpoint}: ${JSON.stringify(response.data)}`);
      }
      if (response.status !== 200) {
        this.handleClientError(response.statusText);
        return void 0;
      }
      return response.data;
    } catch (error) {
      if (attempt < MAX_RETRIES) {
        const delayMs = Math.pow(2, attempt) * 100;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        return this.getRequest(endpoint, attempt + 1);
      }
      await this.handleClientError(error);
    }
  }
  // Write endpoints: fail-fast, no retries — device may apply command before response times out
  async setRequest(endpoint) {
    try {
      const url = `${this.baseUrl}/${endpoint}`;
      const response = await this.axiosInstance.get(url);
      if (this.log.level === "debug") {
        this.log.debug(`Response from ${endpoint}: ${JSON.stringify(response.data)}`);
      }
      if (response.status !== 200) {
        this.handleClientError(response.statusText);
        return void 0;
      }
      return response.data;
    } catch (error) {
      await this.handleClientError(error);
    }
  }
  async getDeviceInfo() {
    return this.getRequest("getDeviceInfo");
  }
  async getAlarmInfo() {
    return this.getRequest("getAlarm");
  }
  async getOnOffStatus() {
    return this.getRequest("getOnOff");
  }
  async getOutputData() {
    return this.getRequest("getOutputData");
  }
  async getMaxPower() {
    return this.getRequest("getMaxPower");
  }
  async setMaxPower(watts) {
    const params = new URLSearchParams({ p: String(Math.round(watts)) });
    return this.setRequest(`setMaxPower?${params}`);
  }
  async setOnOffStatus(on) {
    const params = new URLSearchParams({ status: on ? "0" : "1" });
    return this.setRequest(`setOnOff?${params}`);
  }
  async handleClientError(error) {
    if (this.ignoreConnectionErrorMessages) {
      return;
    } else if (error instanceof Error) {
      this.log.error(`Unknown error: ${error.message}`);
    } else {
      this.log.error(`Unknown error: ${error}`);
    }
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ApSystemsEz1Client
});
//# sourceMappingURL=ApSystemsEz1Client.js.map
