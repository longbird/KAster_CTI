#include <catch2/catch_test_macros.hpp>
#include <catch2/matchers/catch_matchers_string.hpp>

#include <filesystem>
#include <fstream>
#include <string>

#include "loadgen/report_writer.hpp"

TEST_CASE("report writer emits summary json and detail csv", "[report]") {
  const auto outputDir =
      (std::filesystem::temp_directory_path() / "pbx-loadgen-report-test").string();
  std::filesystem::remove_all(outputDir);

  const loadgen::RunSummary summary{2, 1, 1, 1, 3000};
  const loadgen::CallResultDetail detail{
      "call-1", "0101,\"112222\"\nnext", "18,99", 200, "none", 0};

  const auto artifacts = loadgen::writeReports(summary, {detail}, outputDir, true);

  REQUIRE(std::filesystem::exists(artifacts.jsonPath));
  REQUIRE(std::filesystem::exists(artifacts.csvPath));

  const auto replayed = loadgen::readSummaryReport(artifacts.jsonPath);
  REQUIRE(replayed.attempted == 2);
  REQUIRE(replayed.connected == 1);
  REQUIRE(replayed.failed == 1);
  REQUIRE(replayed.peakConcurrent == 1);
  REQUIRE(replayed.totalScheduleMs == 3000);

  std::ifstream csvFile(artifacts.csvPath);
  std::string csv;
  csv.assign(std::istreambuf_iterator<char>(csvFile),
             std::istreambuf_iterator<char>());
  REQUIRE_THAT(csv, Catch::Matchers::ContainsSubstring("callRunId,from,toDid"));
  REQUIRE_THAT(
      csv,
      Catch::Matchers::ContainsSubstring(
          "call-1,\"0101,\"\"112222\"\"\nnext\",\"18,99\",200,none,0"));
}

TEST_CASE("report writer skips csv when failure details are disabled", "[report]") {
  const auto outputDir =
      (std::filesystem::temp_directory_path() / "pbx-loadgen-report-no-csv").string();
  std::filesystem::remove_all(outputDir);

  const loadgen::RunSummary summary{1, 1, 0, 1, 1000};
  const loadgen::CallResultDetail detail{
      "call-1", "from", "to", 200, "none", 0};

  const auto artifacts = loadgen::writeReports(summary, {detail}, outputDir, false);

  REQUIRE(std::filesystem::exists(artifacts.jsonPath));
  REQUIRE(artifacts.csvPath.empty());
  REQUIRE_FALSE(std::filesystem::exists(
      std::filesystem::path(outputDir) / "call-details.csv"));
}

TEST_CASE("report writer fails when output path is not writable as directory", "[report]") {
  const auto blockedPath =
      (std::filesystem::temp_directory_path() / "pbx-loadgen-report-blocked.txt").string();
  {
    std::ofstream blockedFile(blockedPath, std::ios::trunc);
    blockedFile << "occupied";
  }

  const loadgen::RunSummary summary{1, 1, 0, 1, 1000};
  const loadgen::CallResultDetail detail{
      "call-1", "from", "to", 200, "none", 0};

  REQUIRE_THROWS(loadgen::writeReports(summary, {detail}, blockedPath, true));
}
