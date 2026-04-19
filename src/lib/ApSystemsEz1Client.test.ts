import { expect } from "chai";
import sinon from "sinon";
import axios from "axios";
import { ApSystemsEz1Client } from "./ApSystemsEz1Client";
import { TypedReturnDto } from "./TypedReturnDto";
import { ReturnOutputData } from "./ReturnOutputData";
import { ReturnOnOffStatus } from "./ReturnOnOffStatus";
import { ReturnMaxPower } from "./ReturnMaxPower";
import { ReturnDeviceInfo } from "./ReturnDeviceInfo";
import { ReturnAlarmInfo } from "./ReturnAlarmInfo";

function dto<T>(data: T): TypedReturnDto<T> {
	return { data, message: "ok", deviceId: "TEST-001" };
}

function makeLogger(): ioBroker.Logger {
	return {
		info: sinon.stub(),
		warn: sinon.stub(),
		error: sinon.stub(),
		debug: sinon.stub(),
		silly: sinon.stub(),
		level: "info",
	} as unknown as ioBroker.Logger;
}

function axiosOk<T>(data: T): Promise<{ status: number; data: T }> {
	return Promise.resolve({ status: 200, data });
}

describe("ApSystemsEz1Client", () => {
	let axiosGetStub: sinon.SinonStub;
	let axiosCreateStub: sinon.SinonStub;
	let logger: ioBroker.Logger;
	let client: ApSystemsEz1Client;

	beforeEach(() => {
		axiosGetStub = sinon.stub();
		axiosCreateStub = sinon.stub(axios, "create").returns({ get: axiosGetStub } as any);
		logger = makeLogger();
		client = new ApSystemsEz1Client(logger, "192.168.1.100", 8050);
	});

	afterEach(() => {
		sinon.restore();
	});

	// ── URL construction ──────────────────────────────────────────────────────

	it("uses correct base URL and configures timeout 5000", async () => {
		axiosGetStub.resolves(axiosOk(dto<ReturnDeviceInfo>({
			deviceId: "X", devVer: "1", ssid: "net", ipAddr: "192.168.1.100", minPower: 30, maxPower: 800,
		})));

		await client.getDeviceInfo();

		expect(axiosGetStub.firstCall.args[0]).to.equal("http://192.168.1.100:8050/getDeviceInfo");
		expect(axiosCreateStub.firstCall.args[0]).to.deep.include({ timeout: 5000 });
	});

	// ── getDeviceInfo ─────────────────────────────────────────────────────────

	describe("getDeviceInfo", () => {
		it("returns typed DTO with all fields", async () => {
			const data: ReturnDeviceInfo = {
				deviceId: "ABC123", devVer: "1.0.0", ssid: "MyNet",
				ipAddr: "192.168.1.100", minPower: 30, maxPower: 800,
			};
			axiosGetStub.resolves(axiosOk(dto(data)));

			const result = await client.getDeviceInfo();

			expect(result?.data.deviceId).to.equal("ABC123");
			expect(result?.data.maxPower).to.equal(800);
			expect(result?.data.minPower).to.equal(30);
		});
	});

	// ── getOutputData ─────────────────────────────────────────────────────────

	describe("getOutputData", () => {
		it("returns all power and energy fields", async () => {
			const data: ReturnOutputData = { p1: 120, p2: 80, e1: 0.5, e2: 0.3, te1: 10.1, te2: 8.4 };
			axiosGetStub.resolves(axiosOk(dto(data)));

			const result = await client.getOutputData();

			expect(result?.data.p1).to.equal(120);
			expect(result?.data.p2).to.equal(80);
			expect(result?.data.te1).to.equal(10.1);
		});
	});

	// ── setOnOffStatus ────────────────────────────────────────────────────────

	describe("setOnOffStatus", () => {
		it("sends status=0 when turning ON (true → 0)", async () => {
			axiosGetStub.resolves(axiosOk(dto<ReturnOnOffStatus>({ status: "0" })));

			await client.setOnOffStatus(true);

			expect(axiosGetStub.firstCall.args[0]).to.include("setOnOff?status=0");
		});

		it("sends status=1 when turning OFF (false → 1)", async () => {
			axiosGetStub.resolves(axiosOk(dto<ReturnOnOffStatus>({ status: "1" })));

			await client.setOnOffStatus(false);

			expect(axiosGetStub.firstCall.args[0]).to.include("setOnOff?status=1");
		});

		it("does NOT send status=1 when turning ON", async () => {
			axiosGetStub.resolves(axiosOk(dto<ReturnOnOffStatus>({ status: "0" })));

			await client.setOnOffStatus(true);

			expect(axiosGetStub.firstCall.args[0]).to.not.include("status=1");
		});
	});

	// ── setMaxPower ───────────────────────────────────────────────────────────

	describe("setMaxPower", () => {
		it("encodes watt value correctly in URL", async () => {
			axiosGetStub.resolves(axiosOk(dto<ReturnMaxPower>({ maxPower: "800" })));

			await client.setMaxPower(800);

			expect(axiosGetStub.firstCall.args[0]).to.include("setMaxPower?p=800");
		});

		it("encodes minimum power value", async () => {
			axiosGetStub.resolves(axiosOk(dto<ReturnMaxPower>({ maxPower: "30" })));

			await client.setMaxPower(30);

			expect(axiosGetStub.firstCall.args[0]).to.include("setMaxPower?p=30");
		});
	});

	// ── getOnOffStatus ────────────────────────────────────────────────────────

	describe("getOnOffStatus", () => {
		it("returns on/off status from device", async () => {
			axiosGetStub.resolves(axiosOk(dto<ReturnOnOffStatus>({ status: "0" })));

			const result = await client.getOnOffStatus();

			expect(result?.data.status).to.equal("0");
		});
	});

	// ── getMaxPower ───────────────────────────────────────────────────────────

	describe("getMaxPower", () => {
		it("returns current max power cap", async () => {
			axiosGetStub.resolves(axiosOk(dto<ReturnMaxPower>({ maxPower: "600" })));

			const result = await client.getMaxPower();

			expect(result?.data.maxPower).to.equal("600");
		});
	});

	// ── getAlarmInfo ──────────────────────────────────────────────────────────

	describe("getAlarmInfo", () => {
		it("returns all alarm fields", async () => {
			const data: ReturnAlarmInfo = { og: "0", isce1: "0", isce2: "1", oe: "0" };
			axiosGetStub.resolves(axiosOk(dto(data)));

			const result = await client.getAlarmInfo();

			expect(result?.data.og).to.equal("0");
			expect(result?.data.isce2).to.equal("1");
		});
	});

	// ── error handling ────────────────────────────────────────────────────────

	describe("error handling", () => {
		it("logs error on network failure when ignoreConnectionErrorMessages=false", async () => {
			axiosGetStub.rejects(new Error("ECONNREFUSED"));

			await client.getDeviceInfo();

			expect((logger.error as sinon.SinonStub)).to.have.been.called;
		});

		it("does NOT log error when ignoreConnectionErrorMessages=true", async () => {
			const silentClient = new ApSystemsEz1Client(logger, "192.168.1.100", 8050, true);
			axiosGetStub.rejects(new Error("ECONNREFUSED"));

			await silentClient.getDeviceInfo();

			expect((logger.error as sinon.SinonStub)).to.not.have.been.called;
		});

		it("returns undefined on network error", async () => {
			axiosGetStub.rejects(new Error("timeout of 5000ms exceeded"));

			const result = await client.getOutputData();

			expect(result).to.be.undefined;
		});

		it("returns undefined on non-200 response", async () => {
			axiosGetStub.resolves({ status: 503, statusText: "Service Unavailable", data: null });

			const result = await client.getDeviceInfo();

			expect(result).to.be.undefined;
		});

		it("retries up to MAX_RETRIES times before giving up", async () => {
			axiosGetStub.rejects(new Error("ECONNREFUSED"));

			await client.getDeviceInfo();

			// 4 total calls: attempt 0, 1, 2, 3
			expect(axiosGetStub.callCount).to.equal(4);
		});
	});
});
