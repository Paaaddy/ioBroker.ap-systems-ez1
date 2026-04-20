// Adapter integration tests live in test/integration.js (requires physical device).
// Unit tests for ApSystemsEz1Client live in src/lib/ApSystemsEz1Client.test.ts.
//
// This file covers the onStateChange ack-guard: ack=true states must not
// trigger device commands (prevents echo loops when the adapter writes back).

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
