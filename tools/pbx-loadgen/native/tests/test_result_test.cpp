#include <catch2/catch_test_macros.hpp>
#include <catch2/matchers/catch_matchers_string.hpp>

#include <filesystem>
#include <string>

#include "loadgen/test_result.hpp"

TEST_CASE("test result writer emits json and markdown", "[test-result]") {
  const auto outputDir =
      (std::filesystem::temp_directory_path() / "pbx-loadgen-test-result").string();
  std::filesystem::remove_all(outputDir);

  loadgen::TestExecutionResult result;
  result.planId = "calls.inbound.basic";
  result.title = "Basic inbound call reaches CTI active call state";
  result.status = "FAIL";
  result.steps.push_back({"inbound_call", "PASS", "", "SIP 200"});
  result.steps.push_back({"wait_ws_event", "FAIL", "WS_TIMEOUT", "call.updated missing"});

  const auto artifacts = loadgen::writeTestResult(result, outputDir);

  REQUIRE(std::filesystem::exists(artifacts.jsonPath));
  REQUIRE(std::filesystem::exists(artifacts.markdownPath));

  const auto replayed = loadgen::readTestResult(artifacts.jsonPath);
  REQUIRE(replayed.planId == "calls.inbound.basic");
  REQUIRE(replayed.status == "FAIL");
  REQUIRE(replayed.steps.size() == 2);
}

TEST_CASE("feedback generator turns ws timeout into improvement requirement", "[test-result]") {
  loadgen::TestExecutionResult result;
  result.planId = "calls.inbound.basic";
  result.title = "Basic inbound call reaches CTI active call state";
  result.status = "FAIL";
  result.steps.push_back({"inbound_call", "PASS", "", "SIP 200"});
  result.steps.push_back({"wait_ws_event", "FAIL", "WS_TIMEOUT", "call.updated missing"});

  const auto feedback = loadgen::renderFeedbackMarkdown(result);

  REQUIRE_THAT(feedback,
               Catch::Matchers::ContainsSubstring(
                   "# Improvement Requirements: calls.inbound.basic"));
  REQUIRE_THAT(feedback,
               Catch::Matchers::ContainsSubstring(
                   "CTI did not emit the expected WebSocket event"));
  REQUIRE_THAT(feedback,
               Catch::Matchers::ContainsSubstring(
                   "AMI normalization, event outbox, and WS broadcast path"));
}
