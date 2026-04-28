#include <catch2/catch_test_macros.hpp>

#include <filesystem>
#include <stdexcept>
#include <string>
#include <vector>

#if defined(PBX_LOADGEN_HAS_CLI)
#include <cstdlib>
#ifdef _WIN32
#include <process.h>
#else
#include <spawn.h>
#include <sys/wait.h>
extern char** environ;
#endif
#endif

#include "loadgen/scenario.hpp"

namespace {

std::filesystem::path sample_scenario_path() {
  return std::filesystem::path{PBX_LOADGEN_ROOT} / "tools" / "pbx-loadgen" /
         "scenarios" / "inbound-smoke.yaml";
}

std::filesystem::path missing_path() {
  return std::filesystem::path{PBX_LOADGEN_ROOT} / "tools" / "pbx-loadgen" /
         "scenarios" / "missing-file-does-not-exist.yaml";
}

#if defined(PBX_LOADGEN_HAS_CLI)
int run_cli(const std::vector<std::string>& arguments) {
  const auto exe = std::filesystem::path{PBX_LOADGEN_EXE_PATH};

#ifdef _WIN32
  std::vector<std::string> argv_storage;
  argv_storage.reserve(arguments.size() + 1);
  argv_storage.push_back(exe.string());
  argv_storage.insert(argv_storage.end(), arguments.begin(), arguments.end());

  std::vector<const char*> argv;
  argv.reserve(argv_storage.size() + 1);
  for (const auto& arg : argv_storage) {
    argv.push_back(arg.c_str());
  }
  argv.push_back(nullptr);

  return _spawnv(_P_WAIT, exe.string().c_str(), argv.data());
#else
  std::vector<std::string> argv_storage;
  argv_storage.reserve(arguments.size() + 1);
  argv_storage.push_back(exe.string());
  argv_storage.insert(argv_storage.end(), arguments.begin(), arguments.end());

  std::vector<char*> argv;
  argv.reserve(argv_storage.size() + 1);
  for (auto& arg : argv_storage) {
    argv.push_back(arg.data());
  }
  argv.push_back(nullptr);

  pid_t pid = 0;
  const int spawn_rc = posix_spawn(&pid, exe.c_str(), nullptr, nullptr, argv.data(), environ);
  if (spawn_rc != 0) {
    return spawn_rc;
  }

  int status = 0;
  if (waitpid(pid, &status, 0) == -1) {
    return -1;
  }
  if (WIFEXITED(status)) {
    return WEXITSTATUS(status);
  }
  return -1;
#endif
}
#endif

}  // namespace

TEST_CASE("scenario parser loads required fields", "[scenario]") {
  const auto scenario = loadgen::loadScenarioFromString(R"(
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

TEST_CASE("scenario parser loads optional DTMF settings", "[scenario]") {
  const auto scenario = loadgen::loadScenarioFromString(R"(
target: { host: 127.0.0.1, port: 5060, transport: udp, requestUriTemplate: "sip:{did}@127.0.0.1:5060" }
load: { cps: 1, maxConcurrent: 1, totalCalls: 1, rampUpSeconds: 0, callStartJitterMs: 0 }
callFlow:
  callerIdPool: ["01011112222"]
  didPool: ["1899"]
  answerTimeoutMs: 8000
  holdSecondsMin: 8
  holdSecondsMax: 8
  dtmf:
    sequence: "1#"
    sendAfterAnswerMs: 1000
    interDigitMs: 300
  disconnectMode: { normalPercent: 100 }
media: { beepIntervalMs: 800, txGain: 0.8 }
reporting: { outputDir: "./reports", consoleRefreshMs: 500, saveFailureDetails: true }
)");

  REQUIRE(scenario.callFlow.dtmf.sequence == "1#");
  REQUIRE(scenario.callFlow.dtmf.sendAfterAnswerMs == 1000);
  REQUIRE(scenario.callFlow.dtmf.interDigitMs == 300);
}

TEST_CASE("scenario validation rejects invalid DTMF digits", "[scenario]") {
  try {
    static_cast<void>(loadgen::loadScenarioFromString(R"(
target: { host: 127.0.0.1, port: 5060, transport: udp, requestUriTemplate: "sip:{did}@127.0.0.1:5060" }
load: { cps: 1, maxConcurrent: 1, totalCalls: 1, rampUpSeconds: 0, callStartJitterMs: 0 }
callFlow:
  callerIdPool: ["01011112222"]
  didPool: ["1899"]
  answerTimeoutMs: 8000
  holdSecondsMin: 8
  holdSecondsMax: 8
  dtmf: { sequence: "1A" }
  disconnectMode: { normalPercent: 100 }
media: { beepIntervalMs: 800, txGain: 0.8 }
reporting: { outputDir: "./reports", consoleRefreshMs: 500, saveFailureDetails: true }
)"));
    FAIL("expected loadScenarioFromString to throw");
  } catch (const std::runtime_error& ex) {
    REQUIRE(std::string{ex.what()} == "dtmf.sequence must contain only 0-9, * or #");
  }
}

TEST_CASE("scenario validation rejects hold range inversion", "[scenario]") {
  try {
    static_cast<void>(loadgen::loadScenarioFromString(R"(
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
)"));
    FAIL("expected loadScenarioFromString to throw");
  } catch (const std::runtime_error& ex) {
    REQUIRE(std::string{ex.what()} == "holdSecondsMin must be <= holdSecondsMax");
  }
}

TEST_CASE("scenario parser loads the smoke scenario file", "[scenario]") {
  const auto scenario = loadgen::loadScenarioFromFile(sample_scenario_path().string());

  REQUIRE(scenario.target.host == "49.247.46.86");
  REQUIRE(scenario.load.totalCalls == 1);
  REQUIRE(scenario.callFlow.holdSecondsMin == 5);
}

#if defined(PBX_LOADGEN_HAS_CLI)
TEST_CASE("run command rejects a missing scenario file", "[scenario]") {
  REQUIRE(run_cli({"run", "-f", missing_path().string()}) != 0);
}

TEST_CASE("report command rejects a missing result file", "[scenario]") {
  REQUIRE(run_cli({"report", "-f", missing_path().string()}) != 0);
}

TEST_CASE("test-plan command rejects a missing test plan file", "[scenario]") {
  REQUIRE(run_cli({"test-plan", "validate", "-f", missing_path().string()}) != 0);
}

TEST_CASE("test-plan inventory rejects a missing openapi file", "[scenario]") {
  REQUIRE(run_cli({"test-plan", "inventory", "--openapi", missing_path().string()}) != 0);
}
#endif

TEST_CASE("scenario file loader rejects a missing file", "[scenario]") {
  REQUIRE_THROWS(loadgen::loadScenarioFromFile(missing_path().string()));
}
