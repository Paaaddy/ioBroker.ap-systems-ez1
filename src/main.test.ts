// Adapter integration tests live in test/integration.js (requires physical device).
// Unit tests for ApSystemsEz1Client live in src/lib/ApSystemsEz1Client.test.ts.
//
// This file covers unit-testable logic extracted from the adapter class.
// All tests use pure functions mirroring the adapter's internal logic so the
// adapter class itself (which requires ioBroker infrastructure) is not instantiated.

import { expect } from "chai";
import sinon from "sinon";

describe("onStateChange ack guard", () => {
	it("ignores state where ack=true", () => {
		const onStateChange = (state: ioBroker.State | null | undefined, commandFn: () => void): void => {
			if (!state || state.ack) return;
			commandFn();
		};

		const command = sinon.stub();

		onStateChange({ val: true, ack: true, ts: 0, lc: 0, from: "", q: 0 }, command);
		onStateChange(null, command);

		expect(command).to.not.have.been.called;
	});

	it("calls command when ack=false", () => {
		const onStateChange = (state: ioBroker.State | null | undefined, commandFn: () => void): void => {
			if (!state || state.ack) return;
			commandFn();
		};

		const command = sinon.stub();

		onStateChange({ val: false, ack: false, ts: 0, lc: 0, from: "", q: 0 }, command);

		expect(command).to.have.been.calledOnce;
	});
});

// Mirrors ApSystemsEz1.coerceToFiniteNumber so scripts/Blockly/vis writes arriving
// as numeric strings (issue #3) are accepted instead of rejected with a type error.
describe("coerceToFiniteNumber", () => {
	const coerceToFiniteNumber = (val: unknown): number | null => {
		if (typeof val === "number") {
			return Number.isFinite(val) ? val : null;
		}
		if (typeof val === "string" && val.trim() !== "") {
			const parsed = Number(val);
			return Number.isFinite(parsed) ? parsed : null;
		}
		return null;
	};

	it("returns numeric values unchanged", () => {
		expect(coerceToFiniteNumber(600)).to.equal(600);
		expect(coerceToFiniteNumber(0)).to.equal(0);
		expect(coerceToFiniteNumber(-5.5)).to.equal(-5.5);
	});

	it("parses numeric strings", () => {
		expect(coerceToFiniteNumber("600")).to.equal(600);
		expect(coerceToFiniteNumber("  600  ")).to.equal(600);
		expect(coerceToFiniteNumber("800.5")).to.equal(800.5);
	});

	it("rejects non-finite numbers", () => {
		expect(coerceToFiniteNumber(NaN)).to.equal(null);
		expect(coerceToFiniteNumber(Infinity)).to.equal(null);
		expect(coerceToFiniteNumber(-Infinity)).to.equal(null);
	});

	it("rejects non-numeric strings and empty/whitespace strings", () => {
		expect(coerceToFiniteNumber("abc")).to.equal(null);
		expect(coerceToFiniteNumber("")).to.equal(null);
		expect(coerceToFiniteNumber("   ")).to.equal(null);
	});

	it("rejects booleans, null, undefined, objects", () => {
		expect(coerceToFiniteNumber(true)).to.equal(null);
		expect(coerceToFiniteNumber(false)).to.equal(null);
		expect(coerceToFiniteNumber(null)).to.equal(null);
		expect(coerceToFiniteNumber(undefined)).to.equal(null);
		expect(coerceToFiniteNumber({})).to.equal(null);
	});
});

// Mirrors the setConnected dedup guard added in the refactor.
// Without dedup, every poll cycle writes the connected state even when unchanged,
// causing unnecessary DB writes at poll frequency (e.g. 60 writes/min → 86k/day).
describe("setConnected dedup", () => {
	const makeSetConnected = () => {
		let lastConnected: boolean | undefined;
		let callCount = 0;
		const setConnected = (connected: boolean): boolean => {
			if (lastConnected === connected) return false;
			lastConnected = connected;
			callCount++;
			return true;
		};
		return { setConnected, getCallCount: () => callCount };
	};

	it("always writes on first call (undefined initial state)", () => {
		const { setConnected } = makeSetConnected();
		expect(setConnected(false)).to.be.true;
	});

	it("skips write when value unchanged", () => {
		const { setConnected, getCallCount } = makeSetConnected();
		setConnected(true);
		setConnected(true);
		setConnected(true);
		expect(getCallCount()).to.equal(1);
	});

	it("writes when value changes", () => {
		const { setConnected, getCallCount } = makeSetConnected();
		setConnected(true);
		setConnected(false);
		setConnected(true);
		expect(getCallCount()).to.equal(3);
	});
});

// Mirrors the null-limits guard in validateAndSetMaxPower.
// Device limits (minPower/maxPower) are loaded asynchronously on startup.
// Any MaxPower write arriving before the first successful device poll must be rejected.
describe("validateAndSetMaxPower null limits guard", () => {
	const validatePowerWatts = (
		min: number | null,
		max: number | null,
		watts: number,
	): string | null => {
		if (!Number.isFinite(watts)) return "not finite";
		if (min === null || max === null) return "limits not loaded";
		if (watts < min) return `below minimum ${min}W`;
		if (watts > max) return `above maximum ${max}W`;
		return null;
	};

	it("rejects when min is null", () => {
		expect(validatePowerWatts(null, 800, 400)).to.equal("limits not loaded");
	});

	it("rejects when max is null", () => {
		expect(validatePowerWatts(30, null, 400)).to.equal("limits not loaded");
	});

	it("rejects when both are null", () => {
		expect(validatePowerWatts(null, null, 400)).to.equal("limits not loaded");
	});

	it("rejects value below device minimum", () => {
		expect(validatePowerWatts(30, 800, 10)).to.include("below minimum 30W");
	});

	it("rejects value above device maximum", () => {
		expect(validatePowerWatts(30, 800, 900)).to.include("above maximum 800W");
	});

	it("accepts value within range", () => {
		expect(validatePowerWatts(30, 800, 400)).to.be.null;
	});

	it("accepts boundary values (min and max exactly)", () => {
		expect(validatePowerWatts(30, 800, 30)).to.be.null;
		expect(validatePowerWatts(30, 800, 800)).to.be.null;
	});

	it("rejects non-finite watts", () => {
		expect(validatePowerWatts(30, 800, NaN)).to.equal("not finite");
		expect(validatePowerWatts(30, 800, Infinity)).to.equal("not finite");
	});
});

// Mirrors the confirmed?.data null guard added to applyOnOffStatus and
// validateAndSetMaxPower. Device can return { data: null, message, deviceId }
// on transient errors; without this guard, .data.status/.data.maxPower throws.
describe("write verification null guard", () => {
	const isVerificationFailure = (confirmed: { data: unknown } | undefined): boolean =>
		!confirmed?.data;

	it("treats undefined confirmed as failure", () => {
		expect(isVerificationFailure(undefined)).to.be.true;
	});

	it("treats null data as failure", () => {
		expect(isVerificationFailure({ data: null })).to.be.true;
	});

	it("passes when data is a non-null object", () => {
		expect(isVerificationFailure({ data: { status: "0" } })).to.be.false;
	});
});
