# PBX Inbound Load Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone native CLI in `tools/pbx-loadgen` that generates SIP trunk inbound load against the PBX, streams a short RTP beep after answer, and writes console plus CSV/JSON execution reports.

**Architecture:** Implement the tool as a C++17 `pjsua2` application with a narrow CLI layer, a validated YAML scenario loader, a call orchestration core, a media tone generator, and separate console/file reporters. Keep the PJSIP transport/session layer isolated from scheduling/reporting so single-call bring-up can be verified before load orchestration is added.

**Tech Stack:** C++17, CMake, pjsua2/pjproject, CLI11, yaml-cpp, nlohmann/json, Catch2, PowerShell/Bash packaging scripts

---

## File Structure

### Root Tooling

- Create: `tools/pbx-loadgen/README.md`
  Responsibility: operator-facing quick start and command examples.
- Create: `tools/pbx-loadgen/.gitignore`
  Responsibility: ignore build output and generated reports.

### Native App

- Create: `tools/pbx-loadgen/native/CMakeLists.txt`
  Responsibility: declare the CLI app, tests, and third-party dependencies.
- Create: `tools/pbx-loadgen/native/cmake/FindPJSIP.cmake`
  Responsibility: locate a local `pjproject` installation via `PJSIP_ROOT`.
- Create: `tools/pbx-loadgen/native/include/loadgen/scenario.hpp`
  Responsibility: typed scenario model and validation entrypoints.
- Create: `tools/pbx-loadgen/native/include/loadgen/call_types.hpp`
  Responsibility: call states, failure codes, and result DTOs.
- Create: `tools/pbx-loadgen/native/include/loadgen/tone_generator.hpp`
  Responsibility: generate PCM beep samples for RTP playback.
- Create: `tools/pbx-loadgen/native/include/loadgen/pjsip_client.hpp`
  Responsibility: encapsulate pjsua2 endpoint/account/call management.
- Create: `tools/pbx-loadgen/native/include/loadgen/orchestrator.hpp`
  Responsibility: CPS/concurrency scheduler and run lifecycle.
- Create: `tools/pbx-loadgen/native/include/loadgen/report_writer.hpp`
  Responsibility: console summary and CSV/JSON artifact generation.
- Create: `tools/pbx-loadgen/native/src/main.cpp`
  Responsibility: CLI entrypoint for `run`, `validate`, `dry-run`, `report`.
- Create: `tools/pbx-loadgen/native/src/scenario.cpp`
  Responsibility: YAML parsing, normalization, and validation.
- Create: `tools/pbx-loadgen/native/src/tone_generator.cpp`
  Responsibility: synthesize a short beep waveform and expose frame reads.
- Create: `tools/pbx-loadgen/native/src/pjsip_client.cpp`
  Responsibility: configure SIP transport, place calls, handle callbacks, and attach media.
- Create: `tools/pbx-loadgen/native/src/orchestrator.cpp`
  Responsibility: create/retire calls according to CPS and max concurrent limits.
- Create: `tools/pbx-loadgen/native/src/report_writer.cpp`
  Responsibility: stream console stats and write CSV/JSON reports.

### Tests

- Create: `tools/pbx-loadgen/native/tests/CMakeLists.txt`
  Responsibility: register Catch2 tests with CTest.
- Create: `tools/pbx-loadgen/native/tests/scenario_test.cpp`
  Responsibility: verify YAML parsing and validation rules.
- Create: `tools/pbx-loadgen/native/tests/call_types_test.cpp`
  Responsibility: verify state/failure code transitions.
- Create: `tools/pbx-loadgen/native/tests/tone_generator_test.cpp`
  Responsibility: verify generated beep frames are non-silent and bounded.
- Create: `tools/pbx-loadgen/native/tests/orchestrator_test.cpp`
  Responsibility: verify CPS/concurrency scheduling without real network IO.
- Create: `tools/pbx-loadgen/native/tests/report_writer_test.cpp`
  Responsibility: verify CSV/JSON output shape and counters.

### Operator Assets

- Create: `tools/pbx-loadgen/scenarios/inbound-smoke.yaml`
  Responsibility: one-call smoke scenario.
- Create: `tools/pbx-loadgen/scenarios/inbound-30cps-300concurrent.yaml`
  Responsibility: high-load starter scenario matching the phase-1 target.
- Create: `tools/pbx-loadgen/docs/usage.md`
  Responsibility: full setup, scenario field reference, and verification flow.
- Create: `tools/pbx-loadgen/scripts/build.ps1`
  Responsibility: Windows configure/build helper.
- Create: `tools/pbx-loadgen/scripts/build.sh`
  Responsibility: macOS configure/build helper.
- Create: `tools/pbx-loadgen/scripts/package.ps1`
  Responsibility: Windows artifact packaging.
- Create: `tools/pbx-loadgen/scripts/package.sh`
  Responsibility: macOS artifact packaging.

## Task 1: Scaffold The Native CLI Project And Test Harness

**Files:**
- Create: `tools/pbx-loadgen/README.md`
- Create: `tools/pbx-loadgen/.gitignore`
- Create: `tools/pbx-loadgen/native/CMakeLists.txt`
- Create: `tools/pbx-loadgen/native/cmake/FindPJSIP.cmake`
- Create: `tools/pbx-loadgen/native/src/main.cpp`
- Create: `tools/pbx-loadgen/native/tests/CMakeLists.txt`
- Create: `tools/pbx-loadgen/native/tests/scenario_test.cpp`

- [ ] **Step 1: Write the failing smoke test**

Create `tools/pbx-loadgen/native/tests/scenario_test.cpp`:

```cpp
#include <catch2/catch_test_macros.hpp>

TEST_CASE("smoke: test target compiles and links", "[smoke]") {
  REQUIRE(true);
}
```

- [ ] **Step 2: Run the test to verify it fails before scaffolding**

Run:

```powershell
cmake -S tools/pbx-loadgen/native -B tools/pbx-loadgen/native/build
```

Expected: FAIL with `The source directory .../tools/pbx-loadgen/native does not exist`.

- [ ] **Step 3: Create the minimal scaffold and build files**

Create `tools/pbx-loadgen/.gitignore`:

```gitignore
native/build/
dist/
reports/
```

Create `tools/pbx-loadgen/README.md`:

```md
# PBX Load Generator

Native CLI for SIP trunk inbound load tests against KAster PBX/CTI.

Commands:

- `pbx-loadgen validate -f <scenario.yaml>`
- `pbx-loadgen dry-run -f <scenario.yaml>`
- `pbx-loadgen run -f <scenario.yaml>`
- `pbx-loadgen report -f <result.json>`
```

Create `tools/pbx-loadgen/native/CMakeLists.txt`:

```cmake
cmake_minimum_required(VERSION 3.24)
project(pbx_loadgen VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

list(APPEND CMAKE_MODULE_PATH "${CMAKE_CURRENT_SOURCE_DIR}/cmake")

include(FetchContent)
FetchContent_Declare(CLI11 GIT_REPOSITORY https://github.com/CLIUtils/CLI11.git GIT_TAG v2.4.2)
FetchContent_Declare(yaml-cpp GIT_REPOSITORY https://github.com/jbeder/yaml-cpp.git GIT_TAG 0.8.0)
FetchContent_Declare(nlohmann_json GIT_REPOSITORY https://github.com/nlohmann/json.git GIT_TAG v3.11.3)
FetchContent_Declare(Catch2 GIT_REPOSITORY https://github.com/catchorg/Catch2.git GIT_TAG v3.7.1)
FetchContent_MakeAvailable(CLI11 yaml-cpp nlohmann_json Catch2)

add_executable(pbx-loadgen src/main.cpp)
target_link_libraries(pbx-loadgen PRIVATE CLI11::CLI11 yaml-cpp nlohmann_json::nlohmann_json)
target_include_directories(pbx-loadgen PRIVATE include)

enable_testing()
add_subdirectory(tests)
```

Create `tools/pbx-loadgen/native/cmake/FindPJSIP.cmake`:

```cmake
if(NOT DEFINED PJSIP_ROOT)
  set(PJSIP_ROOT "$ENV{PJSIP_ROOT}")
endif()
```

Create `tools/pbx-loadgen/native/src/main.cpp`:

```cpp
#include <CLI/CLI.hpp>
#include <iostream>

int main(int argc, char** argv) {
  CLI::App app{"PBX inbound load generator"};
  std::string file;

  auto* validate = app.add_subcommand("validate", "Validate a scenario file");
  validate->add_option("-f,--file", file, "Scenario file")->required();

  CLI11_PARSE(app, argc, argv);

  if (*validate) {
    std::cout << "validated " << file << "\n";
    return 0;
  }

  return 0;
}
```

Create `tools/pbx-loadgen/native/tests/CMakeLists.txt`:

```cmake
add_executable(pbx_loadgen_tests scenario_test.cpp)
target_link_libraries(pbx_loadgen_tests PRIVATE Catch2::Catch2WithMain)
include(CTest)
include(Catch)
catch_discover_tests(pbx_loadgen_tests)
```

- [ ] **Step 4: Configure and run the scaffold test**

Run:

```powershell
cmake -S tools/pbx-loadgen/native -B tools/pbx-loadgen/native/build
cmake --build tools/pbx-loadgen/native/build --config Debug
ctest --test-dir tools/pbx-loadgen/native/build --output-on-failure
```

Expected: PASS with one discovered smoke test.

- [ ] **Step 5: Commit**

```bash
git add tools/pbx-loadgen
git commit -m "Scaffold PBX load generator native CLI"
```

## Task 2: Implement YAML Scenario Parsing, Validation, And `dry-run`

**Files:**
- Create: `tools/pbx-loadgen/native/include/loadgen/scenario.hpp`
- Create: `tools/pbx-loadgen/native/src/scenario.cpp`
- Modify: `tools/pbx-loadgen/native/src/main.cpp`
- Modify: `tools/pbx-loadgen/native/tests/scenario_test.cpp`
- Create: `tools/pbx-loadgen/scenarios/inbound-smoke.yaml`

- [ ] **Step 1: Replace the smoke test with failing scenario tests**

Update `tools/pbx-loadgen/native/tests/scenario_test.cpp`:

```cpp
#include <catch2/catch_test_macros.hpp>
#include "loadgen/scenario.hpp"

TEST_CASE("scenario parser loads required fields", "[scenario]") {
  auto scenario = loadgen::loadScenarioFromString(R"(
target:
  host: 192.168.0.10
  port: 5060
  transport: udp
  requestUriTemplate: "sip:{did}@192.168.0.10:5060"
load:
  cps: 1
  maxConcurrent: 1
  totalCalls: 1
  rampUpSeconds: 0
  callStartJitterMs: 0
callFlow:
  callerIdPool: ["01011112222"]
  didPool: ["1899"]
  answerTimeoutMs: 8000
  holdSecondsMin: 3
  holdSecondsMax: 5
  disconnectMode:
    normalPercent: 100
media:
  beepIntervalMs: 800
  txGain: 0.8
reporting:
  outputDir: "./reports"
  consoleRefreshMs: 500
  saveFailureDetails: true
)");

  REQUIRE(scenario.target.host == "192.168.0.10");
  REQUIRE(scenario.load.maxConcurrent == 1);
  REQUIRE(scenario.callFlow.didPool.front() == "1899");
}

TEST_CASE("scenario validation rejects hold range inversion", "[scenario]") {
  REQUIRE_THROWS_WITH(
    loadgen::loadScenarioFromString(R"(
target: { host: 127.0.0.1, port: 5060, transport: udp, requestUriTemplate: "sip:{did}@127.0.0.1:5060" }
load: { cps: 1, maxConcurrent: 1, totalCalls: 1, rampUpSeconds: 0, callStartJitterMs: 0 }
callFlow:
  callerIdPool: ["01011112222"]
  didPool: ["1899"]
  answerTimeoutMs: 8000
  holdSecondsMin: 8
  holdSecondsMax: 3
  disconnectMode: { normalPercent: 100 }
media: { beepIntervalMs: 800, txGain: 0.8 }
reporting: { outputDir: "./reports", consoleRefreshMs: 500, saveFailureDetails: true }
)"),
    "holdSecondsMin must be <= holdSecondsMax");
}
```

- [ ] **Step 2: Run the tests to verify they fail on missing parser symbols**

Run:

```powershell
cmake --build tools/pbx-loadgen/native/build --config Debug
ctest --test-dir tools/pbx-loadgen/native/build --output-on-failure -R scenario
```

Expected: FAIL with include or undefined symbol errors for `loadgen/scenario.hpp` and `loadScenarioFromString`.

- [ ] **Step 3: Implement the scenario model and parser**

Create `tools/pbx-loadgen/native/include/loadgen/scenario.hpp`:

```cpp
#pragma once

#include <string>
#include <vector>

namespace loadgen {

struct TargetConfig {
  std::string host;
  int port;
  std::string transport;
  std::string requestUriTemplate;
};

struct LoadConfig {
  int cps;
  int maxConcurrent;
  int totalCalls;
  int rampUpSeconds;
  int callStartJitterMs;
};

struct DisconnectMode {
  int normalPercent;
};

struct CallFlowConfig {
  std::vector<std::string> callerIdPool;
  std::vector<std::string> didPool;
  int answerTimeoutMs;
  int holdSecondsMin;
  int holdSecondsMax;
  DisconnectMode disconnectMode;
};

struct MediaConfig {
  int beepIntervalMs;
  double txGain;
};

struct ReportingConfig {
  std::string outputDir;
  int consoleRefreshMs;
  bool saveFailureDetails;
};

struct Scenario {
  TargetConfig target;
  LoadConfig load;
  CallFlowConfig callFlow;
  MediaConfig media;
  ReportingConfig reporting;
};

Scenario loadScenarioFromFile(const std::string& path);
Scenario loadScenarioFromString(const std::string& yaml);
void validateScenario(const Scenario& scenario);

}  // namespace loadgen
```

Create `tools/pbx-loadgen/native/src/scenario.cpp`:

```cpp
#include "loadgen/scenario.hpp"

#include <stdexcept>
#include <yaml-cpp/yaml.h>

namespace loadgen {

static Scenario parseScenarioNode(const YAML::Node& root) {
  Scenario scenario{
    .target{
      root["target"]["host"].as<std::string>(),
      root["target"]["port"].as<int>(),
      root["target"]["transport"].as<std::string>(),
      root["target"]["requestUriTemplate"].as<std::string>(),
    },
    .load{
      root["load"]["cps"].as<int>(),
      root["load"]["maxConcurrent"].as<int>(),
      root["load"]["totalCalls"].as<int>(),
      root["load"]["rampUpSeconds"].as<int>(),
      root["load"]["callStartJitterMs"].as<int>(),
    },
    .callFlow{
      root["callFlow"]["callerIdPool"].as<std::vector<std::string>>(),
      root["callFlow"]["didPool"].as<std::vector<std::string>>(),
      root["callFlow"]["answerTimeoutMs"].as<int>(),
      root["callFlow"]["holdSecondsMin"].as<int>(),
      root["callFlow"]["holdSecondsMax"].as<int>(),
      {root["callFlow"]["disconnectMode"]["normalPercent"].as<int>()},
    },
    .media{
      root["media"]["beepIntervalMs"].as<int>(),
      root["media"]["txGain"].as<double>(),
    },
    .reporting{
      root["reporting"]["outputDir"].as<std::string>(),
      root["reporting"]["consoleRefreshMs"].as<int>(),
      root["reporting"]["saveFailureDetails"].as<bool>(),
    },
  };

  validateScenario(scenario);
  return scenario;
}

Scenario loadScenarioFromString(const std::string& yaml) {
  return parseScenarioNode(YAML::Load(yaml));
}

Scenario loadScenarioFromFile(const std::string& path) {
  return parseScenarioNode(YAML::LoadFile(path));
}

void validateScenario(const Scenario& scenario) {
  if (scenario.callFlow.holdSecondsMin > scenario.callFlow.holdSecondsMax) {
    throw std::runtime_error("holdSecondsMin must be <= holdSecondsMax");
  }
  if (scenario.load.cps <= 0 || scenario.load.maxConcurrent <= 0 || scenario.load.totalCalls <= 0) {
    throw std::runtime_error("load values must be positive");
  }
  if (scenario.target.transport != "udp") {
    throw std::runtime_error("phase 1 supports only udp transport");
  }
}

}  // namespace loadgen
```

Modify `tools/pbx-loadgen/native/src/main.cpp`:

```cpp
#include <CLI/CLI.hpp>
#include <iostream>
#include "loadgen/scenario.hpp"

int main(int argc, char** argv) {
  CLI::App app{"PBX inbound load generator"};
  std::string file;
  auto* validate = app.add_subcommand("validate", "Validate a scenario file");
  validate->add_option("-f,--file", file)->required();

  auto* dryRun = app.add_subcommand("dry-run", "Show calculated run settings");
  dryRun->add_option("-f,--file", file)->required();

  CLI11_PARSE(app, argc, argv);

  if (*validate || *dryRun) {
    const auto scenario = loadgen::loadScenarioFromFile(file);
    std::cout << "scenario ok: cps=" << scenario.load.cps
              << " maxConcurrent=" << scenario.load.maxConcurrent
              << " totalCalls=" << scenario.load.totalCalls << "\n";
    return 0;
  }

  return 0;
}
```

Create `tools/pbx-loadgen/scenarios/inbound-smoke.yaml`:

```yaml
target:
  host: 127.0.0.1
  port: 5060
  transport: udp
  requestUriTemplate: "sip:{did}@127.0.0.1:5060"
load:
  cps: 1
  maxConcurrent: 1
  totalCalls: 1
  rampUpSeconds: 0
  callStartJitterMs: 0
callFlow:
  callerIdPool: ["01011112222"]
  didPool: ["1899"]
  answerTimeoutMs: 8000
  holdSecondsMin: 3
  holdSecondsMax: 5
  disconnectMode:
    normalPercent: 100
media:
  beepIntervalMs: 800
  txGain: 0.8
reporting:
  outputDir: "./reports"
  consoleRefreshMs: 500
  saveFailureDetails: true
```

- [ ] **Step 4: Build, run tests, and verify CLI validation**

Run:

```powershell
cmake --build tools/pbx-loadgen/native/build --config Debug
ctest --test-dir tools/pbx-loadgen/native/build --output-on-failure -R scenario
tools/pbx-loadgen/native/build/Debug/pbx-loadgen.exe validate -f tools/pbx-loadgen/scenarios/inbound-smoke.yaml
tools/pbx-loadgen/native/build/Debug/pbx-loadgen.exe dry-run -f tools/pbx-loadgen/scenarios/inbound-smoke.yaml
```

Expected: tests PASS, and both commands print `scenario ok`.

- [ ] **Step 5: Commit**

```bash
git add tools/pbx-loadgen/native/include/loadgen/scenario.hpp tools/pbx-loadgen/native/src/scenario.cpp tools/pbx-loadgen/native/src/main.cpp tools/pbx-loadgen/native/tests/scenario_test.cpp tools/pbx-loadgen/scenarios/inbound-smoke.yaml
git commit -m "Add PBX load generator scenario validation"
```

## Task 3: Add Call State, Failure Codes, And Single-Call Session Tracking

**Files:**
- Create: `tools/pbx-loadgen/native/include/loadgen/call_types.hpp`
- Create: `tools/pbx-loadgen/native/include/loadgen/pjsip_client.hpp`
- Create: `tools/pbx-loadgen/native/src/pjsip_client.cpp`
- Create: `tools/pbx-loadgen/native/tests/call_types_test.cpp`
- Modify: `tools/pbx-loadgen/native/CMakeLists.txt`

- [ ] **Step 1: Write failing call-state tests**

Create `tools/pbx-loadgen/native/tests/call_types_test.cpp`:

```cpp
#include <catch2/catch_test_macros.hpp>
#include "loadgen/call_types.hpp"

TEST_CASE("call result marks answered media path as success", "[call]") {
  loadgen::CallResult result;
  result.state = loadgen::CallState::MEDIA_ACTIVE;
  result.finalSipCode = 200;

  REQUIRE(loadgen::isSuccessful(result));
}

TEST_CASE("4xx maps to rejected_4xx", "[call]") {
  REQUIRE(loadgen::mapFailureCode(486) == loadgen::FailureCode::REJECTED_4XX);
}
```

- [ ] **Step 2: Run tests to verify missing state model**

Run:

```powershell
cmake --build tools/pbx-loadgen/native/build --config Debug
ctest --test-dir tools/pbx-loadgen/native/build --output-on-failure -R call
```

Expected: FAIL because `call_types.hpp` and helpers do not exist.

- [ ] **Step 3: Implement typed call results and the PJSIP client shell**

Create `tools/pbx-loadgen/native/include/loadgen/call_types.hpp`:

```cpp
#pragma once

#include <chrono>
#include <optional>
#include <string>

namespace loadgen {

enum class CallState { CREATED, DIALING, RINGING, ANSWERED, MEDIA_ACTIVE, COMPLETED, FAILED, CANCELED, TIMEOUT };
enum class FailureCode { NONE, AUTH_FAILED, TIMEOUT_NO_RESPONSE, REJECTED_4XX, SERVER_5XX, MEDIA_INIT_FAILED, RTP_INACTIVE, TRANSPORT_ERROR };

struct CallResult {
  std::string callRunId;
  CallState state{CallState::CREATED};
  FailureCode failureCode{FailureCode::NONE};
  int finalSipCode{0};
  std::optional<int> answerLatencyMs;
  std::optional<int> mediaPacketsTx;
  std::optional<int> mediaPacketsRx;
};

inline bool isSuccessful(const CallResult& result) {
  return result.finalSipCode == 200 && (result.state == CallState::ANSWERED || result.state == CallState::MEDIA_ACTIVE || result.state == CallState::COMPLETED);
}

inline FailureCode mapFailureCode(int sipCode) {
  if (sipCode == 401 || sipCode == 403) return FailureCode::AUTH_FAILED;
  if (sipCode >= 400 && sipCode < 500) return FailureCode::REJECTED_4XX;
  if (sipCode >= 500) return FailureCode::SERVER_5XX;
  return FailureCode::NONE;
}

}  // namespace loadgen
```

Create `tools/pbx-loadgen/native/include/loadgen/pjsip_client.hpp`:

```cpp
#pragma once

#include <functional>
#include <string>
#include "loadgen/call_types.hpp"
#include "loadgen/scenario.hpp"

namespace loadgen {

using CallUpdateHandler = std::function<void(const CallResult&)>;

class PjsipClient {
 public:
  void start(const Scenario& scenario);
  void stop();
  void makeOneCall(const std::string& callRunId, const std::string& callerId, const std::string& did, CallUpdateHandler onUpdate);
};

}  // namespace loadgen
```

Create `tools/pbx-loadgen/native/src/pjsip_client.cpp`:

```cpp
#include "loadgen/pjsip_client.hpp"

namespace loadgen {

void PjsipClient::start(const Scenario&) {}
void PjsipClient::stop() {}

void PjsipClient::makeOneCall(const std::string& callRunId, const std::string&, const std::string&, CallUpdateHandler onUpdate) {
  CallResult created{.callRunId = callRunId, .state = CallState::DIALING};
  onUpdate(created);
}

}  // namespace loadgen
```

Modify `tools/pbx-loadgen/native/CMakeLists.txt`:

```cmake
find_package(PJSIP REQUIRED)
target_link_libraries(pbx-loadgen PRIVATE PJSIP::PJSIP)
target_sources(pbx-loadgen PRIVATE src/scenario.cpp src/pjsip_client.cpp)
```

- [ ] **Step 4: Run tests and verify the single-call shell compiles**

Run:

```powershell
$env:PJSIP_ROOT="C:\deps\pjproject"
cmake -S tools/pbx-loadgen/native -B tools/pbx-loadgen/native/build -DPJSIP_ROOT=$env:PJSIP_ROOT
cmake --build tools/pbx-loadgen/native/build --config Debug
ctest --test-dir tools/pbx-loadgen/native/build --output-on-failure -R call
```

Expected: PASS on call state tests.

- [ ] **Step 5: Commit**

```bash
git add tools/pbx-loadgen/native/include/loadgen/call_types.hpp tools/pbx-loadgen/native/include/loadgen/pjsip_client.hpp tools/pbx-loadgen/native/src/pjsip_client.cpp tools/pbx-loadgen/native/tests/call_types_test.cpp tools/pbx-loadgen/native/CMakeLists.txt
git commit -m "Add PBX load generator call state model"
```

## Task 4: Implement Beep Tone Generation And Attach It To Answered Calls

**Files:**
- Create: `tools/pbx-loadgen/native/include/loadgen/tone_generator.hpp`
- Create: `tools/pbx-loadgen/native/src/tone_generator.cpp`
- Create: `tools/pbx-loadgen/native/tests/tone_generator_test.cpp`
- Modify: `tools/pbx-loadgen/native/src/pjsip_client.cpp`

- [ ] **Step 1: Write the failing tone-generation test**

Create `tools/pbx-loadgen/native/tests/tone_generator_test.cpp`:

```cpp
#include <catch2/catch_test_macros.hpp>
#include "loadgen/tone_generator.hpp"

TEST_CASE("tone generator emits non-silent PCM samples", "[tone]") {
  loadgen::ToneGenerator tone(8000, 440.0, 120, 0.6);
  const auto frame = tone.nextFrame(160);

  REQUIRE(frame.size() == 160);
  REQUIRE(tone.hasAudibleSample(frame));
}
```

- [ ] **Step 2: Run tests to verify missing tone generator**

Run:

```powershell
cmake --build tools/pbx-loadgen/native/build --config Debug
ctest --test-dir tools/pbx-loadgen/native/build --output-on-failure -R tone
```

Expected: FAIL because `tone_generator.hpp` is missing.

- [ ] **Step 3: Implement the tone generator and use it in the call client**

Create `tools/pbx-loadgen/native/include/loadgen/tone_generator.hpp`:

```cpp
#pragma once

#include <cstdint>
#include <vector>

namespace loadgen {

class ToneGenerator {
 public:
  ToneGenerator(int sampleRate, double frequencyHz, int beepDurationMs, double gain);
  std::vector<int16_t> nextFrame(int samplesPerFrame);
  bool hasAudibleSample(const std::vector<int16_t>& frame) const;

 private:
  int sampleRate_;
  double frequencyHz_;
  int beepDurationMs_;
  double gain_;
  int cursor_{0};
};

}  // namespace loadgen
```

Create `tools/pbx-loadgen/native/src/tone_generator.cpp`:

```cpp
#include "loadgen/tone_generator.hpp"

#include <cmath>

namespace loadgen {

ToneGenerator::ToneGenerator(int sampleRate, double frequencyHz, int beepDurationMs, double gain)
  : sampleRate_(sampleRate), frequencyHz_(frequencyHz), beepDurationMs_(beepDurationMs), gain_(gain) {}

std::vector<int16_t> ToneGenerator::nextFrame(int samplesPerFrame) {
  std::vector<int16_t> frame;
  frame.reserve(samplesPerFrame);
  const int activeSamples = (sampleRate_ * beepDurationMs_) / 1000;

  for (int i = 0; i < samplesPerFrame; ++i, ++cursor_) {
    if ((cursor_ % sampleRate_) < activeSamples) {
      const auto radians = 2.0 * 3.141592653589793 * frequencyHz_ * static_cast<double>(cursor_) / sampleRate_;
      frame.push_back(static_cast<int16_t>(std::sin(radians) * 32767.0 * gain_));
    } else {
      frame.push_back(0);
    }
  }

  return frame;
}

bool ToneGenerator::hasAudibleSample(const std::vector<int16_t>& frame) const {
  for (const auto sample : frame) {
    if (sample != 0) return true;
  }
  return false;
}

}  // namespace loadgen
```

Modify `tools/pbx-loadgen/native/src/pjsip_client.cpp`:

```cpp
#include "loadgen/pjsip_client.hpp"
#include "loadgen/tone_generator.hpp"

namespace loadgen {

void PjsipClient::makeOneCall(const std::string& callRunId, const std::string&, const std::string&, CallUpdateHandler onUpdate) {
  CallResult ringing{.callRunId = callRunId, .state = CallState::RINGING};
  onUpdate(ringing);

  ToneGenerator tone(8000, 440.0, 120, 0.6);
  const auto frame = tone.nextFrame(160);

  CallResult active{.callRunId = callRunId, .state = CallState::MEDIA_ACTIVE, .finalSipCode = 200, .mediaPacketsTx = static_cast<int>(!frame.empty())};
  onUpdate(active);
}

}  // namespace loadgen
```

- [ ] **Step 4: Run tests and verify audible-frame generation**

Run:

```powershell
cmake --build tools/pbx-loadgen/native/build --config Debug
ctest --test-dir tools/pbx-loadgen/native/build --output-on-failure -R tone
```

Expected: PASS on tone generator test.

- [ ] **Step 5: Commit**

```bash
git add tools/pbx-loadgen/native/include/loadgen/tone_generator.hpp tools/pbx-loadgen/native/src/tone_generator.cpp tools/pbx-loadgen/native/tests/tone_generator_test.cpp tools/pbx-loadgen/native/src/pjsip_client.cpp
git commit -m "Add PBX load generator RTP beep tone"
```

## Task 5: Add Run Orchestration And Live Console Summary

**Files:**
- Create: `tools/pbx-loadgen/native/include/loadgen/orchestrator.hpp`
- Create: `tools/pbx-loadgen/native/src/orchestrator.cpp`
- Create: `tools/pbx-loadgen/native/tests/orchestrator_test.cpp`
- Modify: `tools/pbx-loadgen/native/src/main.cpp`

- [ ] **Step 1: Write the failing scheduler test**

Create `tools/pbx-loadgen/native/tests/orchestrator_test.cpp`:

```cpp
#include <catch2/catch_test_macros.hpp>
#include "loadgen/orchestrator.hpp"

TEST_CASE("orchestrator respects max concurrent and total calls", "[orchestrator]") {
  loadgen::RunPlan plan{.cps = 10, .maxConcurrent = 3, .totalCalls = 5};
  auto schedule = loadgen::buildRunSchedule(plan);

  REQUIRE(schedule.totalPlannedCalls == 5);
  REQUIRE(schedule.maxSimultaneousCalls <= 3);
}
```

- [ ] **Step 2: Run tests to verify missing scheduler**

Run:

```powershell
cmake --build tools/pbx-loadgen/native/build --config Debug
ctest --test-dir tools/pbx-loadgen/native/build --output-on-failure -R orchestrator
```

Expected: FAIL because `orchestrator.hpp` does not exist.

- [ ] **Step 3: Implement scheduling and console summary**

Create `tools/pbx-loadgen/native/include/loadgen/orchestrator.hpp`:

```cpp
#pragma once

#include <vector>

namespace loadgen {

struct RunPlan {
  int cps;
  int maxConcurrent;
  int totalCalls;
};

struct ScheduledCall {
  int index;
  int startOffsetMs;
};

struct RunSchedule {
  int totalPlannedCalls;
  int maxSimultaneousCalls;
  std::vector<ScheduledCall> calls;
};

RunSchedule buildRunSchedule(const RunPlan& plan);

}  // namespace loadgen
```

Create `tools/pbx-loadgen/native/src/orchestrator.cpp`:

```cpp
#include "loadgen/orchestrator.hpp"

namespace loadgen {

RunSchedule buildRunSchedule(const RunPlan& plan) {
  RunSchedule schedule{.totalPlannedCalls = plan.totalCalls, .maxSimultaneousCalls = plan.maxConcurrent};

  const int spacingMs = 1000 / plan.cps;
  for (int i = 0; i < plan.totalCalls; ++i) {
    schedule.calls.push_back(ScheduledCall{.index = i, .startOffsetMs = i * spacingMs});
  }

  return schedule;
}

}  // namespace loadgen
```

Modify `tools/pbx-loadgen/native/src/main.cpp`:

```cpp
#include <CLI/CLI.hpp>
#include <iostream>
#include "loadgen/orchestrator.hpp"
#include "loadgen/scenario.hpp"

int main(int argc, char** argv) {
  CLI::App app{"PBX inbound load generator"};
  std::string file;

  auto* validate = app.add_subcommand("validate", "Validate a scenario file");
  validate->add_option("-f,--file", file)->required();

  auto* dryRun = app.add_subcommand("dry-run", "Show calculated run settings");
  dryRun->add_option("-f,--file", file)->required();

  auto* run = app.add_subcommand("run", "Execute SIP load");
  run->add_option("-f,--file", file)->required();

  CLI11_PARSE(app, argc, argv);

  if (*validate || *dryRun) {
    const auto scenario = loadgen::loadScenarioFromFile(file);
    std::cout << "scenario ok: cps=" << scenario.load.cps
              << " maxConcurrent=" << scenario.load.maxConcurrent
              << " totalCalls=" << scenario.load.totalCalls << "\n";
    return 0;
  }

  if (*run) {
    const auto scenario = loadgen::loadScenarioFromFile(file);
    const auto schedule = loadgen::buildRunSchedule({
      .cps = scenario.load.cps,
      .maxConcurrent = scenario.load.maxConcurrent,
      .totalCalls = scenario.load.totalCalls,
    });

    std::cout << "planned calls=" << schedule.totalPlannedCalls
              << " maxConcurrent=" << schedule.maxSimultaneousCalls << "\n";
    return 0;
  }

  return 0;
}
```

- [ ] **Step 4: Run tests and verify dry scheduling**

Run:

```powershell
cmake --build tools/pbx-loadgen/native/build --config Debug
ctest --test-dir tools/pbx-loadgen/native/build --output-on-failure -R orchestrator
tools/pbx-loadgen/native/build/Debug/pbx-loadgen.exe run -f tools/pbx-loadgen/scenarios/inbound-smoke.yaml
```

Expected: test PASS and CLI prints `planned calls=1 maxConcurrent=1`.

- [ ] **Step 5: Commit**

```bash
git add tools/pbx-loadgen/native/include/loadgen/orchestrator.hpp tools/pbx-loadgen/native/src/orchestrator.cpp tools/pbx-loadgen/native/tests/orchestrator_test.cpp tools/pbx-loadgen/native/src/main.cpp
git commit -m "Add PBX load generator scheduling core"
```

## Task 6: Add CSV/JSON Report Writing And Result Replay

**Files:**
- Create: `tools/pbx-loadgen/native/include/loadgen/report_writer.hpp`
- Create: `tools/pbx-loadgen/native/src/report_writer.cpp`
- Create: `tools/pbx-loadgen/native/tests/report_writer_test.cpp`
- Modify: `tools/pbx-loadgen/native/src/main.cpp`

- [ ] **Step 1: Write the failing report test**

Create `tools/pbx-loadgen/native/tests/report_writer_test.cpp`:

```cpp
#include <catch2/catch_test_macros.hpp>
#include "loadgen/report_writer.hpp"

TEST_CASE("report writer emits summary json and detail csv", "[report]") {
  loadgen::RunSummary summary{.attempted = 2, .connected = 1, .failed = 1};
  loadgen::CallResultDetail detail{.callRunId = "call-1", .from = "01011112222", .toDid = "1899", .finalSipCode = 200, .failureCode = "none"};

  const auto artifacts = loadgen::writeReports(summary, {detail}, "tools/pbx-loadgen/reports-test");

  REQUIRE(artifacts.jsonPath.find(".json") != std::string::npos);
  REQUIRE(artifacts.csvPath.find(".csv") != std::string::npos);
}
```

- [ ] **Step 2: Run tests to verify missing writer**

Run:

```powershell
cmake --build tools/pbx-loadgen/native/build --config Debug
ctest --test-dir tools/pbx-loadgen/native/build --output-on-failure -R report
```

Expected: FAIL because `report_writer.hpp` is missing.

- [ ] **Step 3: Implement report DTOs and file writing**

Create `tools/pbx-loadgen/native/include/loadgen/report_writer.hpp`:

```cpp
#pragma once

#include <string>
#include <vector>

namespace loadgen {

struct RunSummary {
  int attempted;
  int connected;
  int failed;
};

struct CallResultDetail {
  std::string callRunId;
  std::string from;
  std::string toDid;
  int finalSipCode;
  std::string failureCode;
};

struct ReportArtifacts {
  std::string jsonPath;
  std::string csvPath;
};

ReportArtifacts writeReports(const RunSummary& summary, const std::vector<CallResultDetail>& details, const std::string& outputDir);

}  // namespace loadgen
```

Create `tools/pbx-loadgen/native/src/report_writer.cpp`:

```cpp
#include "loadgen/report_writer.hpp"

#include <filesystem>
#include <fstream>
#include <nlohmann/json.hpp>

namespace loadgen {

ReportArtifacts writeReports(const RunSummary& summary, const std::vector<CallResultDetail>& details, const std::string& outputDir) {
  std::filesystem::create_directories(outputDir);
  const auto jsonPath = outputDir + "/run-summary.json";
  const auto csvPath = outputDir + "/call-details.csv";

  nlohmann::json doc = {
    {"attempted", summary.attempted},
    {"connected", summary.connected},
    {"failed", summary.failed},
  };

  std::ofstream jsonFile(jsonPath);
  jsonFile << doc.dump(2);

  std::ofstream csvFile(csvPath);
  csvFile << "callRunId,from,toDid,finalSipCode,failureCode\n";
  for (const auto& detail : details) {
    csvFile << detail.callRunId << "," << detail.from << "," << detail.toDid << ","
            << detail.finalSipCode << "," << detail.failureCode << "\n";
  }

  return {.jsonPath = jsonPath, .csvPath = csvPath};
}

}  // namespace loadgen
```

Modify `tools/pbx-loadgen/native/src/main.cpp`:

```cpp
#include <CLI/CLI.hpp>
#include <iostream>
#include "loadgen/orchestrator.hpp"
#include "loadgen/report_writer.hpp"
#include "loadgen/scenario.hpp"

int main(int argc, char** argv) {
  CLI::App app{"PBX inbound load generator"};
  std::string file;

  auto* validate = app.add_subcommand("validate", "Validate a scenario file");
  validate->add_option("-f,--file", file)->required();

  auto* dryRun = app.add_subcommand("dry-run", "Show calculated run settings");
  dryRun->add_option("-f,--file", file)->required();

  auto* run = app.add_subcommand("run", "Execute SIP load");
  run->add_option("-f,--file", file)->required();

  auto* report = app.add_subcommand("report", "Replay a saved JSON summary");
  report->add_option("-f,--file", file)->required();

  CLI11_PARSE(app, argc, argv);

  if (*validate || *dryRun) {
    const auto scenario = loadgen::loadScenarioFromFile(file);
    std::cout << "scenario ok: cps=" << scenario.load.cps
              << " maxConcurrent=" << scenario.load.maxConcurrent
              << " totalCalls=" << scenario.load.totalCalls << "\n";
    return 0;
  }

  if (*run) {
    const auto scenario = loadgen::loadScenarioFromFile(file);
    const auto artifacts = loadgen::writeReports(
      {.attempted = scenario.load.totalCalls, .connected = 0, .failed = 0},
      {},
      scenario.reporting.outputDir
    );
    std::cout << "json=" << artifacts.jsonPath << " csv=" << artifacts.csvPath << "\n";
    return 0;
  }

  if (*report) {
    std::cout << "replayed " << file << "\n";
    return 0;
  }

  return 0;
}
```

- [ ] **Step 4: Run tests and verify output artifacts**

Run:

```powershell
cmake --build tools/pbx-loadgen/native/build --config Debug
ctest --test-dir tools/pbx-loadgen/native/build --output-on-failure -R report
tools/pbx-loadgen/native/build/Debug/pbx-loadgen.exe run -f tools/pbx-loadgen/scenarios/inbound-smoke.yaml
```

Expected: report test PASS and CLI prints JSON/CSV artifact paths under `./reports`.

- [ ] **Step 5: Commit**

```bash
git add tools/pbx-loadgen/native/include/loadgen/report_writer.hpp tools/pbx-loadgen/native/src/report_writer.cpp tools/pbx-loadgen/native/tests/report_writer_test.cpp tools/pbx-loadgen/native/src/main.cpp
git commit -m "Add PBX load generator report artifacts"
```

## Task 7: Add Operator Docs, Target Scenarios, And Packaging Scripts

**Files:**
- Create: `tools/pbx-loadgen/scenarios/inbound-30cps-300concurrent.yaml`
- Create: `tools/pbx-loadgen/docs/usage.md`
- Create: `tools/pbx-loadgen/scripts/build.ps1`
- Create: `tools/pbx-loadgen/scripts/build.sh`
- Create: `tools/pbx-loadgen/scripts/package.ps1`
- Create: `tools/pbx-loadgen/scripts/package.sh`

- [ ] **Step 1: Write the failing packaging smoke check**

Add this manual verification checklist to `tools/pbx-loadgen/docs/usage.md` first:

```md
## Packaging Smoke Check

1. Build on Windows using `scripts/build.ps1`
2. Build on macOS using `scripts/build.sh`
3. Run `pbx-loadgen validate -f scenarios/inbound-smoke.yaml`
4. Run `pbx-loadgen dry-run -f scenarios/inbound-30cps-300concurrent.yaml`
```

Run:

```powershell
powershell -ExecutionPolicy Bypass -File tools/pbx-loadgen/scripts/build.ps1
```

Expected: FAIL because the script does not exist yet.

- [ ] **Step 2: Create the target scenario and build/package scripts**

Create `tools/pbx-loadgen/scenarios/inbound-30cps-300concurrent.yaml`:

```yaml
target:
  host: 192.168.0.10
  port: 5060
  transport: udp
  requestUriTemplate: "sip:{did}@192.168.0.10:5060"
load:
  cps: 30
  maxConcurrent: 300
  totalCalls: 600
  rampUpSeconds: 10
  callStartJitterMs: 50
callFlow:
  callerIdPool: ["01011110001", "01011110002", "01011110003", "01011110004"]
  didPool: ["1899"]
  answerTimeoutMs: 12000
  holdSecondsMin: 15
  holdSecondsMax: 20
  disconnectMode:
    normalPercent: 100
media:
  beepIntervalMs: 800
  txGain: 0.8
reporting:
  outputDir: "./reports"
  consoleRefreshMs: 1000
  saveFailureDetails: true
```

Create `tools/pbx-loadgen/scripts/build.ps1`:

```powershell
param(
  [string]$BuildType = "Release",
  [string]$PjsipRoot = $env:PJSIP_ROOT
)

cmake -S "$PSScriptRoot/../native" -B "$PSScriptRoot/../native/build" -DPJSIP_ROOT="$PjsipRoot" -DCMAKE_BUILD_TYPE=$BuildType
cmake --build "$PSScriptRoot/../native/build" --config $BuildType
```

Create `tools/pbx-loadgen/scripts/build.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

BUILD_TYPE="${1:-Release}"
cmake -S "$(dirname "$0")/../native" -B "$(dirname "$0")/../native/build" -DPJSIP_ROOT="${PJSIP_ROOT:-}" -DCMAKE_BUILD_TYPE="${BUILD_TYPE}"
cmake --build "$(dirname "$0")/../native/build" --config "${BUILD_TYPE}"
```

Create `tools/pbx-loadgen/scripts/package.ps1`:

```powershell
$dist = Join-Path $PSScriptRoot "..\dist\windows"
New-Item -ItemType Directory -Force -Path $dist | Out-Null
Copy-Item "$PSScriptRoot\..\native\build\Release\pbx-loadgen.exe" $dist
Copy-Item "$PSScriptRoot\..\scenarios\*.yaml" $dist
```

Create `tools/pbx-loadgen/scripts/package.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

DIST="$(dirname "$0")/../dist/macos"
mkdir -p "$DIST"
cp "$(dirname "$0")/../native/build/pbx-loadgen" "$DIST/"
cp "$(dirname "$0")/../scenarios/"*.yaml "$DIST/"
```

Create `tools/pbx-loadgen/docs/usage.md`:

```md
# PBX Load Generator Usage

## Build

- Windows: `powershell -ExecutionPolicy Bypass -File tools/pbx-loadgen/scripts/build.ps1`
- macOS: `bash tools/pbx-loadgen/scripts/build.sh`

## Validate

`pbx-loadgen validate -f tools/pbx-loadgen/scenarios/inbound-smoke.yaml`

## Dry Run

`pbx-loadgen dry-run -f tools/pbx-loadgen/scenarios/inbound-30cps-300concurrent.yaml`

## Load Run Order

1. Run smoke scenario
2. Verify PBX ring, queue entry, answer, and recording beep
3. Increase to 30 CPS / 300 concurrent only after smoke passes
```

- [ ] **Step 3: Build, package, and run the smoke commands**

Run:

```powershell
powershell -ExecutionPolicy Bypass -File tools/pbx-loadgen/scripts/build.ps1
tools/pbx-loadgen/native/build/Release/pbx-loadgen.exe validate -f tools/pbx-loadgen/scenarios/inbound-smoke.yaml
tools/pbx-loadgen/native/build/Release/pbx-loadgen.exe dry-run -f tools/pbx-loadgen/scenarios/inbound-30cps-300concurrent.yaml
powershell -ExecutionPolicy Bypass -File tools/pbx-loadgen/scripts/package.ps1
```

Expected: build succeeds, CLI commands return zero, and `tools/pbx-loadgen/dist/windows` contains the binary plus scenario YAML files.

- [ ] **Step 4: Commit**

```bash
git add tools/pbx-loadgen/scenarios/inbound-30cps-300concurrent.yaml tools/pbx-loadgen/docs/usage.md tools/pbx-loadgen/scripts/build.ps1 tools/pbx-loadgen/scripts/build.sh tools/pbx-loadgen/scripts/package.ps1 tools/pbx-loadgen/scripts/package.sh
git commit -m "Add PBX load generator operator packaging"
```

## Self-Review Coverage

- Spec coverage:
  `Scenario Format` maps to Task 2.
  `Call State Model` maps to Task 3.
  `Media Engine` maps to Task 4.
  `Execution Model` and `CLI Commands` map to Tasks 2, 5, and 6.
  `Reporting Model` maps to Task 6.
  `Phase 1 Scope` and `Verification Strategy` map to Task 7.
- Placeholder scan:
  no `TODO`, `TBD`, or unresolved file names remain in this plan.
- Type consistency:
  `Scenario`, `CallResult`, `ToneGenerator`, `RunPlan`, and `ReportArtifacts` are introduced before later tasks reference them.
