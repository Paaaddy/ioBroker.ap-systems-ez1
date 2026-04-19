import axios, { AxiosInstance, AxiosResponse } from "axios";
import http from "http";
import { ReturnAlarmInfo } from "./ReturnAlarmInfo";
import { ReturnDeviceInfo } from "./ReturnDeviceInfo";
import { ReturnOutputData } from "./ReturnOutputData";
import { TypedReturnDto } from "./TypedReturnDto";
import { ReturnOnOffStatus } from "./ReturnOnOffStatus";
import { ReturnMaxPower } from "./ReturnMaxPower";

const MAX_RETRIES = 3;

export class ApSystemsEz1Client {
	private baseUrl: string;
	private ignoreConnectionErrorMessages: boolean;
	private log: ioBroker.Logger;
	private axiosInstance: AxiosInstance;

	constructor(logger: ioBroker.Logger, ipAddress: string, port: number, ignoreConnectionErrorMessages: boolean = false) {
		this.log = logger;
		this.baseUrl = `http://${ipAddress}:${port}`;
		this.ignoreConnectionErrorMessages = ignoreConnectionErrorMessages;

		const httpAgent = new http.Agent({
			keepAlive: true,
			maxSockets: 1,
			keepAliveMsecs: 1000,
		});

		this.axiosInstance = axios.create({ httpAgent, timeout: 5000 });
	}

	private async getRequest<TResult>(endpoint: string, attempt = 0): Promise<TResult | undefined> {
		try {
			const url = `${this.baseUrl}/${endpoint}`;
			const response: AxiosResponse = await this.axiosInstance.get(url);

			if (this.log.level === "debug") {
				this.log.debug(`Response from ${endpoint}: ${JSON.stringify(response.data)}`);
			}

			if (response.status !== 200) {
				this.handleClientError(response.statusText);
				return undefined;
			}

			return response.data as TResult;
		} catch (error) {
			if (attempt < MAX_RETRIES) {
				const delayMs = Math.pow(2, attempt) * 100;
				await new Promise(resolve => setTimeout(resolve, delayMs));
				return this.getRequest<TResult>(endpoint, attempt + 1);
			}
			await this.handleClientError(error);
		}
	}

	public async getDeviceInfo(): Promise<TypedReturnDto<ReturnDeviceInfo> | undefined> {
		return this.getRequest<TypedReturnDto<ReturnDeviceInfo>>("getDeviceInfo");
	}

	public async getAlarmInfo(): Promise<TypedReturnDto<ReturnAlarmInfo> | undefined> {
		return this.getRequest<TypedReturnDto<ReturnAlarmInfo>>("getAlarm");
	}

	public async getOnOffStatus(): Promise<TypedReturnDto<ReturnOnOffStatus> | undefined> {
		return this.getRequest<TypedReturnDto<ReturnOnOffStatus>>("getOnOff");
	}

	public async getOutputData(): Promise<TypedReturnDto<ReturnOutputData> | undefined> {
		return this.getRequest<TypedReturnDto<ReturnOutputData>>("getOutputData");
	}

	public async getMaxPower(): Promise<TypedReturnDto<ReturnMaxPower> | undefined> {
		return this.getRequest<TypedReturnDto<ReturnMaxPower>>("getMaxPower");
	}

	public async setMaxPower(watts: number): Promise<TypedReturnDto<ReturnMaxPower> | undefined> {
		const params = new URLSearchParams({ p: String(watts) });
		return this.getRequest<TypedReturnDto<ReturnMaxPower>>(`setMaxPower?${params}`);
	}

	public async setOnOffStatus(on: boolean): Promise<TypedReturnDto<ReturnOnOffStatus> | undefined> {
		const params = new URLSearchParams({ status: on ? "0" : "1" });
		return this.getRequest<TypedReturnDto<ReturnOnOffStatus>>(`setOnOff?${params}`);
	}

	private async handleClientError(error: unknown): Promise<void> {
		if (this.ignoreConnectionErrorMessages) {
			return;
		} else if (error instanceof Error) {
			this.log.error(`Unknown error: ${error.message}`);
		} else {
			this.log.error(`Unknown error: ${error}`);
		}
	}
}
