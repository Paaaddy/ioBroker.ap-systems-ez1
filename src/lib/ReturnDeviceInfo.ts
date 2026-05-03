// Different information about the inverter
export interface ReturnDeviceInfo {
	// The unique identifier for the device.
	deviceId: string;

	// The version of the device firmware or software.
	devVer: string;

	// The SSID of the network to which the device is currently connected.
	ssid: string;

	// The current IP address of the device.
	ipAddr: string;

	// The minimum power output that the device can be set to, measured in watts.
	// API returns this as a string (e.g. "30") — coerce with Number() before arithmetic.
	minPower: string;

	// The maximum power output that the device can be set to, measured in watts.
	// API returns this as a string (e.g. "800") — coerce with Number() before arithmetic.
	maxPower: string;
}
