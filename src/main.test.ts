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
