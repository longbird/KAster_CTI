#include <catch2/catch_test_macros.hpp>
#include <catch2/matchers/catch_matchers_string.hpp>

#include <algorithm>
#include <filesystem>
#include <mutex>

#include "loadgen/command_logic.hpp"
#include "loadgen/live_run.hpp"
#include "loadgen/report_writer.hpp"
#include "loadgen/scenario.hpp"

namespace {

loadgen::Scenario makeScenario(const std::string& outputDir,
                               bool saveFailureDetails = true,
                               int rampUpSeconds = 2,
                               int callStartJitterMs = 0) {
  return loadgen::Scenario{
      {"127.0.0.1", 5060, "udp", "sip:{did}@127.0.0.1:5060"},
      {2, 2, 4, rampUpSeconds, callStartJitterMs},
      {{"01011112222", "01011112223"}, {"1899"}, 8000, 1, 1, {100}},
      {800, 0.8},
      {outputDir, 500, saveFailureDetails},
  };
}

class FakeLiveRunner : public loadgen::LiveCallRunner {
 public:
  void start(const loadgen::Scenario&) override { started = true; }
  void stop() override { stopped = true; }

  loadgen::CallResult runCall(const loadgen::LiveCallRequest& request) override {
    std::lock_guard<std::mutex> lock(mutex);
    requests.push_back(request);

    loadgen::CallResult result;
    result.callRunId = request.callRunId;
    result.finalSipCode = request.did == "1898" ? 486 : 200;
    result.state = result.finalSipCode == 200 ? loadgen::CallState::COMPLETED
                                              : loadgen::CallState::FAILED;
    result.failureCode = loadgen::mapFailureCode(result.finalSipCode);
    return result;
  }

  bool started{false};
  bool stopped{false};
  std::mutex mutex;
  std::vector<loadgen::LiveCallRequest> requests;
};

}  // namespace

TEST_CASE("practical dry-run ramps calls gradually toward target cps", "[command]") {
  const auto scenario = makeScenario("./reports-test");
  const auto schedule = loadgen::buildPracticalSchedule(scenario);
  const auto summary = loadgen::formatDryRunSummary(schedule);

  REQUIRE(schedule.schedule.calls.size() == 4);
  REQUIRE(schedule.schedule.calls[0].index == 0);
  REQUIRE(schedule.schedule.calls[0].startOffsetMs == 1414);
  REQUIRE(schedule.schedule.calls[1].index == 1);
  REQUIRE(schedule.schedule.calls[1].startOffsetMs == 2000);
  REQUIRE(schedule.schedule.calls[2].index == 2);
  REQUIRE(schedule.schedule.calls[2].startOffsetMs == 2500);
  REQUIRE(schedule.schedule.calls[3].index == 3);
  REQUIRE(schedule.schedule.calls[3].startOffsetMs == 3000);
  REQUIRE(schedule.firstStartMs == 1414);
  REQUIRE(schedule.lastStartMs == 3000);
  REQUIRE(schedule.totalScheduleMs == 4000);
  REQUIRE_THAT(summary, Catch::Matchers::ContainsSubstring("peakConcurrent="));
  REQUIRE_THAT(summary, Catch::Matchers::ContainsSubstring("simulatedCallMs=1000"));
  REQUIRE_THAT(summary, Catch::Matchers::ContainsSubstring("firstStartMs=1414"));
  REQUIRE_THAT(summary, Catch::Matchers::ContainsSubstring("lastStartMs=3000"));
  REQUIRE_THAT(summary, Catch::Matchers::ContainsSubstring("totalScheduleMs=4000"));
}

TEST_CASE("practical dry-run does not bunch every call at the ramp boundary", "[command]") {
  const auto scenario = makeScenario("./reports-test-bunching", true, 2, 0);
  const auto schedule = loadgen::buildPracticalSchedule(scenario);

  REQUIRE(schedule.schedule.calls.front().startOffsetMs < 2000);
  REQUIRE(schedule.schedule.calls[0].startOffsetMs < schedule.schedule.calls[1].startOffsetMs);
  REQUIRE(schedule.schedule.calls[1].startOffsetMs < schedule.schedule.calls[2].startOffsetMs);
  REQUIRE(schedule.schedule.calls[2].startOffsetMs < schedule.schedule.calls[3].startOffsetMs);
}

TEST_CASE("practical run writes json and optional csv artifacts", "[command]") {
  const auto outputDir =
      (std::filesystem::temp_directory_path() / "pbx-loadgen-command-run").string();
  std::filesystem::remove_all(outputDir);
  const auto scenario = makeScenario(outputDir, false);

  const auto result = loadgen::executePracticalRun(scenario);
  const auto text = loadgen::formatRunArtifacts(result.artifacts);

  REQUIRE(std::filesystem::exists(result.artifacts.jsonPath));
  REQUIRE(result.artifacts.csvPath.empty());
  REQUIRE_THAT(text, Catch::Matchers::ContainsSubstring("json="));
  REQUIRE_FALSE(std::filesystem::exists(
      std::filesystem::path(outputDir) / "call-details.csv"));
}

TEST_CASE("practical run generates distinct artifact names per execution", "[command]") {
  const auto outputDir =
      (std::filesystem::temp_directory_path() / "pbx-loadgen-command-unique").string();
  std::filesystem::remove_all(outputDir);
  const auto scenario = makeScenario(outputDir, true);

  const auto firstRun = loadgen::executePracticalRun(scenario);
  const auto secondRun = loadgen::executePracticalRun(scenario);

  REQUIRE(firstRun.artifacts.jsonPath != secondRun.artifacts.jsonPath);
  REQUIRE(firstRun.artifacts.csvPath != secondRun.artifacts.csvPath);
  REQUIRE(std::filesystem::exists(firstRun.artifacts.jsonPath));
  REQUIRE(std::filesystem::exists(secondRun.artifacts.jsonPath));
  REQUIRE(std::filesystem::exists(firstRun.artifacts.csvPath));
  REQUIRE(std::filesystem::exists(secondRun.artifacts.csvPath));
}

TEST_CASE("practical report replay formats saved summary", "[command]") {
  const auto outputDir =
      (std::filesystem::temp_directory_path() / "pbx-loadgen-command-report").string();
  std::filesystem::remove_all(outputDir);
  const auto scenario = makeScenario(outputDir, true);
  const auto result = loadgen::executePracticalRun(scenario);

  const auto replayed = loadgen::readSummaryReport(result.artifacts.jsonPath);
  const auto text = loadgen::formatReportReplay(replayed);

  REQUIRE_THAT(text, Catch::Matchers::ContainsSubstring("attempted=4"));
  REQUIRE_THAT(text, Catch::Matchers::ContainsSubstring("connected=4"));
  REQUIRE_THAT(text, Catch::Matchers::ContainsSubstring("failed=0"));
}

TEST_CASE("live run executes scheduled calls through the provided runner", "[command]") {
  const auto outputDir =
      (std::filesystem::temp_directory_path() / "pbx-loadgen-command-live").string();
  std::filesystem::remove_all(outputDir);
  auto scenario = makeScenario(outputDir, true, 0, 0);
  scenario.load.totalCalls = 2;
  scenario.load.maxConcurrent = 2;
  scenario.callFlow.didPool = {"1899", "1898"};
  scenario.callFlow.holdSecondsMin = 1;
  scenario.callFlow.holdSecondsMax = 1;

  FakeLiveRunner runner;
  const auto result = loadgen::executeLiveRun(scenario, runner);

  REQUIRE(runner.started);
  REQUIRE(runner.stopped);
  REQUIRE(runner.requests.size() == 2);
  REQUIRE(std::all_of(runner.requests.begin(),
                      runner.requests.end(),
                      [](const loadgen::LiveCallRequest& request) {
                        return request.answerTimeoutMs == 8000 &&
                               request.holdDurationMs == 1000;
                      }));
  REQUIRE(result.summary.attempted == 2);
  REQUIRE(result.summary.connected == 1);
  REQUIRE(result.summary.failed == 1);
  REQUIRE(std::filesystem::exists(result.artifacts.jsonPath));
  REQUIRE(std::filesystem::exists(result.artifacts.csvPath));

  const auto replayed = loadgen::readSummaryReport(result.artifacts.jsonPath);
  REQUIRE(replayed.connected == 1);
  REQUIRE(replayed.failed == 1);
}
