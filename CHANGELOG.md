# Changelog

All notable changes to this project will be documented in this file.

## [0.1.1] - 2026-05-15

### Changed
- Connected state now deduplicated: skip DB write when value unchanged, eliminating ~86k redundant writes per day at default poll rate
- Device power limits (minPower/maxPower) cached in-memory on first poll; MaxPower write validation no longer needs an async DB roundtrip
- MaxPower state object extended with `min`/`max` bounds after device limits load, so admin UI shows the valid slider range
- All state mapping lambdas are now properly typed (removed `any`); compiler validates field access on ReturnDeviceInfo, ReturnOutputData, ReturnAlarmInfo
- `handleClientError` in the HTTP client is now synchronous (was incorrectly marked `async` with no awaitable work inside)
- `ALARM_INFO_NUMBERS` renamed to `ALARM_INFO_STATES` to reflect that alarm values are strings, not numbers

### Fixed
- Write verification null guard: `confirmed?.data` replaces `confirmed` in both `applyOnOffStatus` and `validateAndSetMaxPower`, correctly handling the case where the device returns `{ data: null, message, deviceId }` on transient errors — previously, this would throw instead of safely marking the device disconnected
- `pollIntervalInMilliSeconds` initializer corrected from misleading `60` (ms, not seconds) to `0`

### Removed
- Commented-out `onObjectChange` and `onMessage` boilerplate removed from adapter class

## [0.1.0] - 2024-01-01

### Fixed
- Error message when connection fails

## [0.0.1] - 2024-01-01

### Added
- Initial release
