#include <catch2/catch_test_macros.hpp>
#include <catch2/matchers/catch_matchers_string.hpp>

#include <filesystem>

#include "loadgen/command_logic.hpp"
#include "loadgen/report_writer.hpp"
#include "loadgen/scenario.hpp"

namespace {

loadgen::Scenario makeScenario(const std::string& outputDir,
                               bool saveFailureDetails = true) {
  return loadgen::Scenario{
      {"127.0.0.1", 5060, "udp", "sip:{did}@127.0.0.1:5060"},
      {2, 2, 4, 2, 10},
      {{"01011112222", "01011112223"}, {"1899"}, 8000, 1, 1, {100}},
      {800, 0.8},
      {outputDir, 500, saveFailureDetails},
  };
}

}  // namespace

TEST_CASE("practical dry-run summary reflects ramp and jitter adjusted schedule", "[command]") {
  const auto scenario = makeScenario("./reports-test");
  const auto schedule = loadgen::buildPracticalSchedule(scenario);
  const auto summary = loadgen::formatDryRunSummary(schedule);

  REQUIRE(schedule.schedule.calls.size() == 4);
  REQUIRE(schedule.schedule.calls[0].index == 0);
  REQUIRE(schedule.schedule.calls[0].startOffsetMs == 2000);
  REQUIRE(schedule.schedule.calls[1].index == 3);
  REQUIRE(schedule.schedule.calls[1].startOffsetMs == 2001);
  REQUIRE(schedule.schedule.calls[2].index == 1);
  REQUIRE(schedule.schedule.calls[2].startOffsetMs == 3000);
  REQUIRE(schedule.schedule.calls[3].index == 2);
  REQUIRE(schedule.schedule.calls[3].startOffsetMs == 3001);
  REQUIRE(schedule.firstStartMs == 2000);
  REQUIRE(schedule.lastStartMs == 3001);
  REQUIRE(schedule.totalScheduleMs == 4001);
  REQUIRE_THAT(summary, Catch::Matchers::ContainsSubstring("peakConcurrent="));
  REQUIRE_THAT(summary, Catch::Matchers::ContainsSubstring("simulatedCallMs=1000"));
  REQUIRE_THAT(summary, Catch::Matchers::ContainsSubstring("firstStartMs=2000"));
  REQUIRE_THAT(summary, Catch::Matchers::ContainsSubstring("lastStartMs=3001"));
  REQUIRE_THAT(summary, Catch::Matchers::ContainsSubstring("totalScheduleMs=4001"));
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
