#pragma once

#include <string>
#include <vector>

namespace loadgen {

struct TestStepResult {
  std::string stepType;
  std::string status;
  std::string failureCode;
  std::string observation;
};

struct TestExecutionResult {
  std::string planId;
  std::string title;
  std::string status;
  std::vector<TestStepResult> steps;
};

struct TestResultArtifacts {
  std::string jsonPath;
  std::string markdownPath;
};

TestResultArtifacts writeTestResult(const TestExecutionResult& result,
                                    const std::string& outputDir);
TestExecutionResult readTestResult(const std::string& jsonPath);
std::string renderTestResultMarkdown(const TestExecutionResult& result);
std::string renderFeedbackMarkdown(const TestExecutionResult& result);

}  // namespace loadgen
