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
class ApSystemsEz1Client {
  constructor(logger, ipAddress, port, ignoreConnectionErrorMessages = false) {
    this.log = logger;
    this.baseUrl = `http://${ipAddress}:${port}`;
    this.ignoreConnectionErrorMessages = ignoreConnectionErrorMessages;
  }
  /**
   * A private method to send HTTP requests to the specified endpoint of the microinverter.
   * This method is used internally by other class methods to perform GET requests.
   * @param endpoint - The API endpoint to make the request to.
   * @returns The JSON response from the microinverter as a dictionary.
   * Prints an error message if the HTTP request fails for any reason.
  	 */
  async getRequest(endpoint) {
    try {
      const url = `${this.baseUrl}/${endpoint}`;
      const response = await import_axios.default.get(url, { timeout: 5e3 });
      this.log.debug(`Response: ${JSON.stringify(response.data)}`);
      if (response.status !== 200) {
        this.handleClientError(response.statusText);
      } else {
        const result = response.data;
        return result;
      }
    } catch (error) {
      await this.handleClientError(error);
    }
  }
  /**
   * Retrieves detailed information about the device. This method sends a request to the
   * "getDeviceInfo" endpoint and returns a dictionary containing various details about the device.
   * @returns The returned data includes the device ID, device version, the SSID it is connected to, its IP
   *  address, and its minimum and maximum power settings. This information can be used for monitoring
   *  and configuring the device.
   */
  async getDeviceInfo() {
    const result = await this.getRequest("getDeviceInfo");
    return result;
  }
  /**
   * Retrieves the alarm status information for various components of the device. This method
   * makes a request to the "getAlarm" endpoint and returns a dictionary containing the alarm
   * status for different parameters.
   *
   * @returns The 'data' field in the returned dictionary includes the status of several components,
   * each represented as a string indicating whether there is an alarm ('1') or normal operation ('0').
   */
  async getAlarmInfo() {
    const result = await this.getRequest("getAlarm");
    return result;
  }
  /**
   * Retrieves the On/Off of EZ1 device.
   *
   * @returns The 'data' field in the returned dictionary includes the status of the device.
   * "0" means on, "1" means off.
   */
  async getOnOffStatus() {
    const result = await this.getRequest("getOnOff");
    return result;
  }
  /**
   * Retrieves the current output data for the device. This method
   * makes a request to the "getOutputData" endpoint to fetch the device's output data.
   *
   * @returns The returned data includes various parameters such as power output status ('p1', 'p2'),
   * energy readings ('e1', 'e2'), and total energy ('te1', 'te2') for two different inputs
   * of the inverter. Additionally, it provides a status message and the device ID.
   */
  async getOutputData() {
    const result = await this.getRequest("getOutputData");
    return result;
  }
  /**
   * Retrieves the set maximum power setting of the device. This method makes a request to the
   * "getMaxPower" endpoint and returns a dictionary containing the maximum power limit of the device set by the user.
   * @returns Max output power in watts
   */
  async getMaxPower() {
    const result = await this.getRequest("getMaxPower");
    return result;
  }
  /**
   * Sets the maximum power output of the device.
   * @param watts - Target max power in watts (must be within device min/max range)
   */
  async setMaxPower(watts) {
    return this.getRequest(`setMaxPower?p=${watts}`);
  }
  /**
   * Sets the On/Off status of the device.
   * When set to off, the device stops outputting power but the Local API remains active.
   * @param on - true to turn on, false to turn off
   */
  async setOnOffStatus(on) {
    const status = on ? "0" : "1";
    return this.getRequest(`setOnOff?status=${status}`);
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
