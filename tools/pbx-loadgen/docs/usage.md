# PBX Load Generator Usage

`pbx-loadgen` is a native CLI for SIP trunk inbound load tests against the PBX. The scripts in this folder keep the build and package flow aligned with the current `tools/pbx-loadgen/native` layout.

## Prerequisites

- CMake 3.20 or newer
- A C++17 toolchain
- Network access for the first configure step so CMake can fetch CLI11, yaml-cpp, nlohmann/json, and Catch2
- `PJSIP_ROOT` is required and must point to a local pjproject install for the current build flow

## Build

Windows:

```powershell
powershell -ExecutionPolicy Bypass -File tools/pbx-loadgen/scripts/build.ps1
```

macOS or Linux:

```bash
bash tools/pbx-loadgen/scripts/build.sh
```

Both scripts configure into `tools/pbx-loadgen/native/build` and then build the selected configuration.

## Validate

Smoke scenario:

```bash
# single-config generator
tools/pbx-loadgen/native/build/pbx-loadgen validate -f tools/pbx-loadgen/scenarios/inbound-smoke.yaml

# multi-config generator example
tools/pbx-loadgen/native/build/Release/pbx-loadgen validate -f tools/pbx-loadgen/scenarios/inbound-smoke.yaml
```

Target load scenario:

```bash
# single-config generator
tools/pbx-loadgen/native/build/pbx-loadgen dry-run -f tools/pbx-loadgen/scenarios/inbound-30cps-300concurrent.yaml

# multi-config generator example
tools/pbx-loadgen/native/build/Release/pbx-loadgen dry-run -f tools/pbx-loadgen/scenarios/inbound-30cps-300concurrent.yaml
```

On POSIX, the binary is either `tools/pbx-loadgen/native/build/pbx-loadgen` for single-config generators or `tools/pbx-loadgen/native/build/<config>/pbx-loadgen` for multi-config generators such as `Release`, `Debug`, or `RelWithDebInfo`.

## Package

Windows:

```powershell
powershell -ExecutionPolicy Bypass -File tools/pbx-loadgen/scripts/package.ps1
```

macOS or Linux:

```bash
bash tools/pbx-loadgen/scripts/package.sh
```

The package scripts copy the built binary and the YAML scenarios into `tools/pbx-loadgen/dist/windows`, `tools/pbx-loadgen/dist/macos`, or `tools/pbx-loadgen/dist/linux` depending on platform.

## Scenario Fields

- `target.host`, `target.port`, `target.transport`, `target.requestUriTemplate`: SIP destination details
- `load.cps`, `load.maxConcurrent`, `load.totalCalls`, `load.rampUpSeconds`, `load.callStartJitterMs`: call schedule controls
- `callFlow.callerIdPool`, `callFlow.didPool`, `callFlow.answerTimeoutMs`, `callFlow.holdSecondsMin`, `callFlow.holdSecondsMax`, `callFlow.disconnectMode.normalPercent`: call behavior and termination rules
- `media.beepIntervalMs`, `media.txGain`: RTP beep playback settings
- `reporting.outputDir`, `reporting.consoleRefreshMs`, `reporting.saveFailureDetails`: report output controls

## Load Run Order

1. Run smoke scenario
2. Verify PBX ring, queue entry, answer, and recording beep
3. Increase to 30 CPS / 300 concurrent only after smoke passes

## Packaging Smoke Check

1. Build on Windows using `scripts/build.ps1`.
2. Build on macOS using `scripts/build.sh`.
3. Run `pbx-loadgen validate -f scenarios/inbound-smoke.yaml`.
4. Run `pbx-loadgen dry-run -f scenarios/inbound-30cps-300concurrent.yaml`.
5. Package the artifacts with `scripts/package.ps1` or `scripts/package.sh`.
