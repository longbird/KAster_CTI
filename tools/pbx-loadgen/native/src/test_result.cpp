#include "loadgen/test_result.hpp"

#include <atomic>
#include <chrono>
#include <filesystem>
#include <fstream>
#include <sstream>
#include <stdexcept>

#if defined(_WIN32)
#include <process.h>
#else
#include <unistd.h>
#endif

#include <nlohmann/json.hpp>

namespace loadgen {
namespace {

unsigned long long currentProcessId() {
#if defined(_WIN32)
  return static_cast<unsigned long long>(_getpid());
#else
  return static_cast<unsigned long long>(getpid());
#endif
}

std::string nextRunSuffix() {
  static std::atomic<unsigned long long> counter{0};
  const auto now = std::chrono::system_clock::now().time_since_epoch();
  const auto ticks =
      std::chrono::duration_cast<std::chrono::microseconds>(now).count();
  std::ostringstream stream;
  stream << ticks << "-" << currentProcessId() << "-"
         << counter.fetch_add(1, std::memory_order_relaxed);
  return stream.str();
}

void ensureWritable(const std::ios& stream, const char* message) {
  if (!stream) {
    throw std::runtime_error(message);
  }
}

}  // namespace

TestResultArtifacts writeTestResult(const TestExecutionResult& result,
                                    const std::string& outputDir) {
  std::filesystem::create_directories(outputDir);
  const auto suffix = nextRunSuffix();
  const auto jsonPath =
      (std::filesystem::path(outputDir) / ("test-result-" + suffix + ".json"))
          .string();
  const auto markdownPath =
      (std::filesystem::path(outputDir) / ("test-result-" + suffix + ".md"))
          .string();

  nlohmann::json doc;
  doc["planId"] = result.planId;
  doc["title"] = result.title;
  doc["status"] = result.status;
  doc["steps"] = nlohmann::json::array();
  for (const auto& step : result.steps) {
    doc["steps"].push_back({
        {"stepType", step.stepType},
        {"status", step.status},
        {"failureCode", step.failureCode},
        {"observation", step.observation},
    });
  }

  std::ofstream jsonFile(jsonPath, std::ios::trunc);
  ensureWritable(jsonFile, "unable to open test result json for writing");
  jsonFile << doc.dump(2);
  jsonFile.flush();
  ensureWritable(jsonFile, "unable to write test result json");

  std::ofstream markdownFile(markdownPath, std::ios::trunc);
  ensureWritable(markdownFile,
                 "unable to open test result markdown for writing");
  markdownFile << renderTestResultMarkdown(result);
  markdownFile.flush();
  ensureWritable(markdownFile, "unable to write test result markdown");

  return {jsonPath, markdownPath};
}

TestExecutionResult readTestResult(const std::string& jsonPath) {
  std::ifstream file(jsonPath);
  if (!file) {
    throw std::runtime_error("unable to open test result json");
  }
  nlohmann::json doc;
  file >> doc;

  TestExecutionResult result;
  result.planId = doc.at("planId").get<std::string>();
  result.title = doc.at("title").get<std::string>();
  result.status = doc.at("status").get<std::string>();
  for (const auto& stepDoc : doc.at("steps")) {
    result.steps.push_back({stepDoc.at("stepType").get<std::string>(),
                            stepDoc.at("status").get<std::string>(),
                            stepDoc.at("failureCode").get<std::string>(),
                            stepDoc.at("observation").get<std::string>()});
  }
  return result;
}

std::string renderTestResultMarkdown(const TestExecutionResult& result) {
  std::ostringstream stream;
  stream << "# Test Result: " << result.planId << "\n\n";
  stream << "- Title: " << result.title << "\n";
  stream << "- Status: " << result.status << "\n\n";
  stream << "| Step | Status | Failure | Observation |\n";
  stream << "| --- | --- | --- | --- |\n";
  for (const auto& step : result.steps) {
    stream << "| " << step.stepType << " | " << step.status << " | "
           << step.failureCode << " | " << step.observation << " |\n";
  }
  return stream.str();
}

std::string renderFeedbackMarkdown(const TestExecutionResult& result) {
  std::ostringstream stream;
  stream << "# Improvement Requirements: " << result.planId << "\n\n";
  stream << "## Summary\n\n";
  stream << "Automated test `" << result.planId << "` finished with status `"
         << result.status << "`.\n\n";
  stream << "## Requirements\n\n";

  bool wroteRequirement = false;
  for (const auto& step : result.steps) {
    if (step.status != "FAIL") {
      continue;
    }
    wroteRequirement = true;
    if (step.failureCode == "WS_TIMEOUT") {
      stream << "- CTI did not emit the expected WebSocket event after the SIP "
                "path succeeded. Investigate AMI normalization, event outbox, "
                "and WS broadcast path.\n";
    } else if (step.failureCode == "API_ASSERT_FAILED") {
      stream << "- CTI API response did not match the expected state. "
                "Investigate query filters, tenant scoping, and delayed state "
                "transitions.\n";
    } else if (step.failureCode == "SIP_FAILED") {
      stream << "- SIP inbound call did not complete successfully. Investigate "
                "trunk routing, DID mapping, and Asterisk endpoint "
                "identification.\n";
    } else {
      stream << "- Step `" << step.stepType << "` failed with `"
             << step.failureCode << "`. Observation: " << step.observation
             << "\n";
    }
  }

  if (!wroteRequirement) {
    stream << "- No improvement requirement generated because no failed step was found.\n";
  }
  return stream.str();
}

}  // namespace loadgen
