#pragma once

#include <string>
#include <vector>

namespace loadgen {

struct TestPlanSource {
  std::vector<std::string> generatedFrom;
  int generatorVersion{0};
};

struct TestPlanEnvironment {
  std::string apiBaseUrl;
  std::string wsUrl;
  std::string accessToken;
};

struct TestPlanTarget {
  std::string host;
  int port{0};
  std::string transport;
  std::string requestUriTemplate;
};

struct TestPlanCallFlow {
  std::vector<std::string> callerIdPool;
  std::vector<std::string> didPool;
};

struct TestPlanScenario {
  TestPlanTarget target;
  TestPlanCallFlow callFlow;
};

struct TestPlanStep {
  std::string type;
  std::string id;
  std::string callRef;
  std::string event;
  std::string method;
  std::string path;
  int timeoutMs{0};
  int answerTimeoutMs{0};
  int holdSeconds{0};
  int expectedFinalSipCode{0};
  std::vector<std::string> expectedStatusAnyOf;
  std::string expectedContainsDid;
};

struct TestPlan {
  std::string id;
  std::string title;
  TestPlanSource source;
  TestPlanEnvironment environment;
  TestPlanScenario scenario;
  std::vector<TestPlanStep> steps;
};

TestPlan loadTestPlanFromString(const std::string& yaml);
TestPlan loadTestPlanFromFile(const std::string& path);
void validateTestPlan(const TestPlan& plan);
std::string formatTestPlanDryRun(const TestPlan& plan);

}  // namespace loadgen
