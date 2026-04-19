/*
 * Created with @iobroker/create-adapter v2.5.0
 */

import * as utils from "@iobroker/adapter-core";
import { ApSystemsEz1Client } from "./lib/ApSystemsEz1Client";

class ApSystemsEz1 extends utils.Adapter {

	private pollIntervalInMilliSeconds: number = 60;
	private apiClient!: ApSystemsEz1Client;
	private timer: NodeJS.Timeout | undefined;
	private slowTimer: NodeJS.Timeout | undefined;
	private static readonly SLOW_POLL_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

	// State mappings cached to avoid object allocation on every poll cycle
	private static readonly DEVICE_INFO_STRINGS = [
		{ name: "DeviceId", value: (res: any) => res.deviceId },
		{ name: "DevVer", value: (res: any) => res.devVer },
		{ name: "Ssid", value: (res: any) => res.ssid },
		{ name: "IpAddr", value: (res: any) => res.ipAddr },
	];

	private static readonly DEVICE_INFO_NUMBERS = [
		{ name: "MaxPower", value: (res: any) => res.maxPower },
		{ name: "MinPower", value: (res: any) => res.minPower },
	];

	private static readonly OUTPUT_DATA_NUMBERS = [
		{ name: "CurrentPower_1", value: (res: any) => res.p1 },
		{ name: "CurrentPower_2", value: (res: any) => res.p2 },
		{ name: "CurrentPower_Total", value: (res: any) => res.p1 + res.p2 },
		{ name: "EnergyToday_1", value: (res: any) => res.e1 },
		{ name: "EnergyToday_2", value: (res: any) => res.e2 },
		{ name: "EnergyToday_Total", value: (res: any) => res.e1 + res.e2 },
		{ name: "EnergyLifetime_1", value: (res: any) => res.te1 },
		{ name: "EnergyLifetime_2", value: (res: any) => res.te2 },
		{ name: "EnergyLifetime_Total", value: (res: any) => res.te1 + res.te2 },
	];

	private static readonly ALARM_INFO_NUMBERS = [
		{ name: "OffGrid", value: (res: any) => res.og },
		{ name: "ShortCircuitError_1", value: (res: any) => res.isce1 },
		{ name: "ShortCircuitError_2", value: (res: any) => res.isce2 },
		{ name: "OutputFault", value: (res: any) => res.oe },
	];

	public constructor(options: Partial<utils.AdapterOptions> = {}) {
		super({
			...options,
			name: "ap-systems-ez1",
		});
		this.on("ready", this.onReady.bind(this));
		this.on("stateChange", this.onStateChange.bind(this));
		// this.on("objectChange", this.onObjectChange.bind(this));
		// this.on("message", this.onMessage.bind(this));
		this.on("unload", this.onUnload.bind(this));
	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	private async onReady(): Promise<void> {
		this.log.debug("config ipAddress: " + this.config.ipAddress);
		this.log.debug("config port: " + this.config.port);
		this.log.debug("config pollIntervalInSeconds: " + this.config.pollIntervalInSeconds);
		this.log.debug("config ignoreConnectionErrorMessages: " + this.config.ignoreConnectionErrorMessages);

		const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}$/;
		const port = Number(this.config?.port);
		const pollInterval = Number(this.config?.pollIntervalInSeconds);

		if (!this.config?.ipAddress || !ipv4Pattern.test(this.config.ipAddress)) {
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

		this.pollIntervalInMilliSeconds = pollInterval * 1000;
		this.apiClient = new ApSystemsEz1Client(this.log, this.config.ipAddress, this.config.port, this.config?.ignoreConnectionErrorMessages);

		await this.extendObjectAsync("connected", {
			type: "state",
			common: {
				name: "Connected",
				type: "boolean",
				role: "indicator.connected",
				read: true,
				write: false,
			},
			native: {},
		});
		this.markStateCreated("connected");
		await this.setStateAsync("connected", { val: false, ack: true });

		await this.setDeviceInfoStates();
		await this.setMaxPowerState();

		this.slowTimer = setInterval(() => {
			void this.setDeviceInfoStates();
			void this.setMaxPowerState();
		}, ApSystemsEz1.SLOW_POLL_INTERVAL_MS);

		this.timer = setInterval(() => {
			void this.setOutputDataStates();
			void this.setAlarmInfoStates();
			void this.setOnOffStatusState();
		}, this.pollIntervalInMilliSeconds);

		this.subscribeStates("OnOffStatus.OnOffStatus");
		this.subscribeStates("MaxPower.MaxPower");
	}

	private async setDeviceInfoStates(): Promise<void> {
		try {
			const deviceInfo = await this.apiClient.getDeviceInfo();
			this.log.debug("deviceInfo received");

			if (deviceInfo !== undefined) {
				await this.setConnected(true);
				const res = deviceInfo.data;

				// Parallelize state creation and setting for both strings and numbers
				const stringPromises = ApSystemsEz1.DEVICE_INFO_STRINGS.map(async (element) => {
					const stateId = `DeviceInfo.${element.name}`;
					// Only create state once if it doesn't exist, avoid repeated getStateAsync calls
					if (!this.stateExists(stateId)) {
						this.createState("DeviceInfo", "", element.name,
							{ type: "string", role: "text", read: true, write: false },
							() => {
								this.markStateCreated(stateId);
								this.log.info(`state ${element.name} created`);
							});
					}
					await this.setStateAsync(stateId, { val: element.value(res), ack: true });
				});

				const numberPromises = ApSystemsEz1.DEVICE_INFO_NUMBERS.map(async (element) => {
					const stateId = `DeviceInfo.${element.name}`;
					// Only create state once if it doesn't exist, avoid repeated getStateAsync calls
					if (!this.stateExists(stateId)) {
						this.createState("DeviceInfo", "", element.name,
							{ type: "number", role: "value", read: true, write: false },
							() => {
								this.markStateCreated(stateId);
								this.log.info(`state ${element.name} created`);
							});
					}
					await this.setStateAsync(stateId, { val: element.value(res), ack: true });
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

	private async setOutputDataStates(): Promise<void> {
		try {
			const outputData = await this.apiClient.getOutputData();
			this.log.debug("outputData received");

			if (outputData !== undefined) {
				const res = outputData.data;

				// Parallelize state creation and setting - avoid repeated getStateAsync calls
				const promises = ApSystemsEz1.OUTPUT_DATA_NUMBERS.map(async (element) => {
					const stateId = `OutputData.${element.name}`;
					if (!this.stateExists(stateId)) {
						this.createState("OutputData", "", element.name,
							{ type: "number", role: "value", read: true, write: false },
							() => {
								this.markStateCreated(stateId);
								this.log.info(`state ${element.name} created`);
							});
					}
					await this.setStateAsync(stateId, { val: element.value(res), ack: true });
				});

				await Promise.all(promises);
			}
		} catch (e) {
			this.log.error(`setOutputDataStates failed: ${e}`);
		}
	}

	private async setAlarmInfoStates(): Promise<void> {
		try {
			const alarmInfo = await this.apiClient.getAlarmInfo();
			this.log.debug("alarmInfo received");

			if (alarmInfo !== undefined) {
				const res = alarmInfo.data;

				// Parallelize state creation and setting - avoid repeated getStateAsync calls
				const promises = ApSystemsEz1.ALARM_INFO_NUMBERS.map(async (element) => {
					const stateId = `AlarmInfo.${element.name}`;
					if (!this.stateExists(stateId)) {
						this.createState("AlarmInfo", "", element.name,
							{ type: "string", role: "text", read: true, write: false },
							() => {
								this.markStateCreated(stateId);
								this.log.info(`state ${element.name} created`);
							});
					}
					const rawValue = element.value(res);
					const value = rawValue === "0" ? "Normal" : "Alarm";
					await this.setStateAsync(stateId, { val: value, ack: true });
				});

				await Promise.all(promises);
			}
		} catch (e) {
			this.log.error(`setAlarmInfoStates failed: ${e}`);
		}
	}

	private async setOnOffStatusState(): Promise<void> {
		try {
			const onOffStatus = await this.apiClient.getOnOffStatus();
			this.log.debug("onOffStatus received");

			if (onOffStatus !== undefined) {
				const res = onOffStatus.data;
				const stateId = "OnOffStatus.OnOffStatus";
				// Only create state once if it doesn't exist - avoid repeated getStateAsync calls
				if (!this.stateExists(stateId)) {
					this.createState("OnOffStatus", "", "OnOffStatus",
						{ type: "boolean", role: "switch", read: true, write: true },
						() => {
							this.markStateCreated(stateId);
							this.log.info(`state OnOffStatus created`);
						});
				}
				const value = res.status === "0";
				await this.setStateAsync(stateId, { val: value, ack: true });
			}
		} catch (e) {
			this.log.error(`setOnOffStatusState failed: ${e}`);
		}
	}

	private async setMaxPowerState(): Promise<void> {
		try {
			const maxPower = await this.apiClient.getMaxPower();
			this.log.debug("maxPower received");

			if (maxPower !== undefined) {
				const res = maxPower.data;
				const stateId = "MaxPower.MaxPower";
				// Only create state once if it doesn't exist - avoid repeated getStateAsync calls
				if (!this.stateExists(stateId)) {
					this.createState("MaxPower", "", "MaxPower",
						{ type: "number", role: "value.power", unit: "W", read: true, write: true },
						() => {
							this.markStateCreated(stateId);
							this.log.info(`state MaxPower created`);
						});
				}
				await this.setStateAsync(stateId, { val: Number(res.maxPower), ack: true });
			}
		} catch (e) {
			this.log.error(`setMaxPowerState failed: ${e}`);
		}
	}

	private async setConnected(connected: boolean): Promise<void> {
		await this.setStateAsync("connected", { val: connected, ack: true });
	}

	/**
	 * Cache to track which states have been created to avoid repeated getStateAsync calls.
	 * This is populated during initialization and state creation callbacks.
	 */
	private readonly createdStates = new Set<string>();

	/**
	 * Check if a state has been created (without a database call).
	 * @param stateId State ID relative to adapter namespace
	 * @returns true if state was created by this adapter, false otherwise
	 */
	private stateExists(stateId: string): boolean {
		return this.createdStates.has(stateId);
	}

	/**
	 * Mark a state as created in the cache.
	 * @param stateId State ID relative to adapter namespace
	 */
	private markStateCreated(stateId: string): void {
		this.createdStates.add(stateId);
	}

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 */
	private onUnload(callback: () => void): void {
		try {
			clearInterval(this.timer);
			clearInterval(this.slowTimer);
			callback();
		} catch (e) {
			callback();
		}
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

	private onStateChange(id: string, state: ioBroker.State | null | undefined): void {
		if (!state || state.ack) {
			return;
		}
		if (id.endsWith(".OnOffStatus.OnOffStatus")) {
			if (typeof state.val !== "boolean") {
				this.log.error(`OnOffStatus: expected boolean, got ${typeof state.val}`);
				return;
			}
			this.apiClient.setOnOffStatus(state.val)
				.then(() => this.log.info(`OnOff set to ${state.val}`))
				.catch((e) => this.log.error(`Failed to set OnOff: ${e}`));
		} else if (id.endsWith(".MaxPower.MaxPower")) {
			if (typeof state.val !== "number") {
				this.log.error(`MaxPower: expected number, got ${typeof state.val}`);
				return;
			}
			void this.validateAndSetMaxPower(state.val);
		}
	}

	private async validateAndSetMaxPower(watts: number): Promise<void> {
		if (!Number.isFinite(watts)) {
			this.log.error(`MaxPower rejected: value ${watts} is not a finite number`);
			return;
		}

		const minState = await this.getStateAsync("DeviceInfo.MinPower");
		const maxState = await this.getStateAsync("DeviceInfo.MaxPower");
		const min = typeof minState?.val === "number" && Number.isFinite(minState.val) ? minState.val : null;
		const max = typeof maxState?.val === "number" && Number.isFinite(maxState.val) ? maxState.val : null;

		if (min === null || max === null) {
			this.log.error(`MaxPower ${watts}W rejected: device power limits not yet loaded`);
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

		this.apiClient.setMaxPower(watts)
			.then(() => this.log.info(`MaxPower set to ${watts}W`))
			.catch((e) => this.log.error(`Failed to set MaxPower: ${e}`));
	}

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

}

if (require.main !== module) {
	// Export the constructor in compact mode
	module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new ApSystemsEz1(options);
} else {
	// otherwise start the instance directly
	(() => new ApSystemsEz1())();
}
