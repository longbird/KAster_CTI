#include "loadgen/test_plan.hpp"

#include <fstream>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

#include <yaml-cpp/yaml.h>

namespace loadgen {
namespace {

YAML::Node requireNode(const YAML::Node& parent, const char* key) {
  const auto node = parent[key];
  if (!node) {
    throw std::runtime_error(std::string("missing required field: ") + key);
  }
  return node;
}

std::string requireString(const YAML::Node& parent, const char* key) {
  const auto node = requireNode(parent, key);
  const auto value = node.as<std::string>();
  if (value.empty()) {
    throw std::runtime_error(std::string(key) + " must not be empty");
  }
  return value;
}

int optionalInt(const YAML::Node& parent, const char* key, int fallback = 0) {
  const auto node = parent[key];
  return node ? node.as<int>() : fallback;
}

std::string optionalString(const YAML::Node& parent, const char* key) {
  const auto node = parent[key];
  return node ? node.as<std::string>() : std::string{};
}

std::vector<std::string> requireStringList(const YAML::Node& parent,
                                           const char* key) {
  const auto values = requireNode(parent, key).as<std::vector<std::string>>();
  if (values.empty()) {
    throw std::runtime_error(std::string(key) + " must not be empty");
  }
  return values;
}

std::vector<std::string> optionalStringList(const YAML::Node& parent,
                                            const char* key) {
  const auto node = parent[key];
  if (!node) {
    return {};
  }
  return node.as<std::vector<std::string>>();
}

TestPlanStep parseStep(const YAML::Node& node) {
  TestPlanStep step;
  step.type = requireString(node, "type");
  step.id = optionalString(node, "id");
  step.callRef = optionalString(node, "callRef");
  step.event = optionalString(node, "event");
  step.method = optionalString(node, "method");
  step.path = optionalString(node, "path");
  step.timeoutMs = optionalInt(node, "timeoutMs");
  step.answerTimeoutMs = optionalInt(node, "answerTimeoutMs");
  step.holdSeconds = optionalInt(node, "holdSeconds");

  const auto expect = node["expect"];
  if (expect) {
    step.expectedFinalSipCode = optionalInt(expect, "finalSipCode");
    step.expectedStatusAnyOf = optionalStringList(expect, "statusAnyOf");
    step.expectedContainsDid = optionalString(expect, "containsDid");
  }
  return step;
}

std::string describeStep(const TestPlanStep& step) {
  if (step.type == "inbound_call") {
    return "inbound_call id=" + step.id;
  }
  if (step.type == "assert_api") {
    return "assert_api " + step.method + " " + step.path;
  }
  if (step.type == "wait_ws_event") {
    return "wait_ws_event " + step.event;
  }
  if (step.type == "assert_result") {
    return "assert_result finalSipCode=" +
           std::to_string(step.expectedFinalSipCode);
  }
  if (step.type == "hangup") {
    return "hangup callRef=" + step.callRef;
  }
  if (step.type == "wait") {
    return "wait timeoutMs=" + std::to_string(step.timeoutMs);
  }
  return step.type;
}

}  // namespace

TestPlan loadTestPlanFromString(const std::string& yaml) {
  const auto root = YAML::Load(yaml);
  const auto source = requireNode(root, "source");
  const auto environment = requireNode(root, "environment");
  const auto scenario = requireNode(root, "scenario");
  const auto target = requireNode(scenario, "target");
  const auto callFlow = requireNode(scenario, "callFlow");

  TestPlan plan;
  plan.id = requireString(root, "id");
  plan.title = requireString(root, "title");
  plan.source.generatedFrom = requireStringList(source, "generatedFrom");
  plan.source.generatorVersion = requireNode(source, "generatorVersion").as<int>();
  plan.environment.apiBaseUrl = requireString(environment, "apiBaseUrl");
  plan.environment.wsUrl = requireString(environment, "wsUrl");
  plan.environment.accessToken = requireString(environment, "accessToken");
  plan.scenario.target.host = requireString(target, "host");
  plan.scenario.target.port = requireNode(target, "port").as<int>();
  plan.scenario.target.transport = requireString(target, "transport");
  plan.scenario.target.requestUriTemplate =
      requireString(target, "requestUriTemplate");
  plan.scenario.callFlow.callerIdPool =
      requireStringList(callFlow, "callerIdPool");
  plan.scenario.callFlow.didPool = requireStringList(callFlow, "didPool");

  const auto steps = requireNode(root, "steps");
  for (const auto& stepNode : steps) {
    plan.steps.push_back(parseStep(stepNode));
  }

  validateTestPlan(plan);
  return plan;
}

TestPlan loadTestPlanFromFile(const std::string& path) {
  std::ifstream file(path);
  if (!file) {
    throw std::runtime_error("unable to open test plan file");
  }
  std::stringstream buffer;
  buffer << file.rdbuf();
  return loadTestPlanFromString(buffer.str());
}

void validateTestPlan(const TestPlan& plan) {
  if (plan.id.empty()) {
    throw std::runtime_error("test plan id must not be empty");
  }
  if (plan.steps.empty()) {
    throw std::runtime_error("test plan " + plan.id +
                             " must contain at least one step");
  }
  if (plan.scenario.target.port <= 0 || plan.scenario.target.port > 65535) {
    throw std::runtime_error("test plan " + plan.id +
                             " target.port must be between 1 and 65535");
  }
  for (const auto& step : plan.steps) {
    if (step.type == "inbound_call" && step.id.empty()) {
      throw std::runtime_error("inbound_call step requires id");
    }
    if (step.type == "assert_api" &&
        (step.method.empty() || step.path.empty())) {
      throw std::runtime_error("assert_api step requires method and path");
    }
    if (step.type == "wait_ws_event" && step.event.empty()) {
      throw std::runtime_error("wait_ws_event step requires event");
    }
  }
}

std::string formatTestPlanDryRun(const TestPlan& plan) {
  std::ostringstream stream;
  stream << "plan=" << plan.id << " title=" << plan.title
         << " steps=" << plan.steps.size();
  for (std::size_t i = 0; i < plan.steps.size(); ++i) {
    stream << "\n" << (i + 1) << ". " << describeStep(plan.steps[i]);
  }
  return stream.str();
}

}  // namespace loadgen
