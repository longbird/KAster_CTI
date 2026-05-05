#include "loadgen/scenario.hpp"

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

int requireInt(const YAML::Node& parent, const char* key) {
  return requireNode(parent, key).as<int>();
}

bool requireBool(const YAML::Node& parent, const char* key) {
  return requireNode(parent, key).as<bool>();
}

double requireDouble(const YAML::Node& parent, const char* key) {
  return requireNode(parent, key).as<double>();
}

std::vector<std::string> requireStringList(const YAML::Node& parent, const char* key) {
  const auto values = requireNode(parent, key).as<std::vector<std::string>>();
  if (values.empty()) {
    throw std::runtime_error(std::string(key) + " must not be empty");
  }
  return values;
}

Scenario parseScenarioNode(const YAML::Node& root) {
  const auto target = requireNode(root, "target");
  const auto load = requireNode(root, "load");
  const auto callFlow = requireNode(root, "callFlow");
  const auto media = requireNode(root, "media");
  const auto reporting = requireNode(root, "reporting");

  Scenario scenario{
      {requireString(target, "host"),
       requireInt(target, "port"),
       requireString(target, "transport"),
       requireString(target, "requestUriTemplate")},
      {requireInt(load, "cps"),
       requireInt(load, "maxConcurrent"),
       requireInt(load, "totalCalls"),
       requireInt(load, "rampUpSeconds"),
       requireInt(load, "callStartJitterMs")},
      {requireStringList(callFlow, "callerIdPool"),
       requireStringList(callFlow, "didPool"),
       requireInt(callFlow, "answerTimeoutMs"),
       requireInt(callFlow, "holdSecondsMin"),
       requireInt(callFlow, "holdSecondsMax"),
       {requireInt(requireNode(callFlow, "disconnectMode"), "normalPercent")}},
      {requireInt(media, "beepIntervalMs"), requireDouble(media, "txGain")},
      {requireString(reporting, "outputDir"),
       requireInt(reporting, "consoleRefreshMs"),
       requireBool(reporting, "saveFailureDetails")}};

  validateScenario(scenario);
  return scenario;
}

}  // namespace

Scenario loadScenarioFromString(const std::string& yaml) {
  return parseScenarioNode(YAML::Load(yaml));
}

Scenario loadScenarioFromFile(const std::string& path) {
  return parseScenarioNode(YAML::LoadFile(path));
}

void validateScenario(const Scenario& scenario) {
  if (scenario.target.port <= 0 || scenario.target.port > 65535) {
    throw std::runtime_error("target.port must be between 1 and 65535");
  }
  if (scenario.target.transport != "udp") {
    throw std::runtime_error("phase 1 supports only udp transport");
  }
  if (scenario.target.requestUriTemplate.find("{did}") == std::string::npos) {
    throw std::runtime_error("requestUriTemplate must contain {did}");
  }

  if (scenario.load.cps <= 0 || scenario.load.maxConcurrent <= 0 || scenario.load.totalCalls <= 0) {
    throw std::runtime_error("load values must be positive");
  }
  if (scenario.load.rampUpSeconds < 0 || scenario.load.callStartJitterMs < 0) {
    throw std::runtime_error("rampUpSeconds and callStartJitterMs must be >= 0");
  }
  if (scenario.load.maxConcurrent > scenario.load.totalCalls) {
    throw std::runtime_error("maxConcurrent must be <= totalCalls");
  }

  if (scenario.callFlow.answerTimeoutMs <= 0) {
    throw std::runtime_error("answerTimeoutMs must be positive");
  }
  if (scenario.callFlow.holdSecondsMin < 0 || scenario.callFlow.holdSecondsMax < 0) {
    throw std::runtime_error("holdSecondsMin and holdSecondsMax must be >= 0");
  }
  if (scenario.callFlow.holdSecondsMin > scenario.callFlow.holdSecondsMax) {
    throw std::runtime_error("holdSecondsMin must be <= holdSecondsMax");
  }
  if (scenario.callFlow.disconnectMode.normalPercent < 0 ||
      scenario.callFlow.disconnectMode.normalPercent > 100) {
    throw std::runtime_error("disconnectMode.normalPercent must be between 0 and 100");
  }

  if (scenario.media.beepIntervalMs <= 0) {
    throw std::runtime_error("beepIntervalMs must be positive");
  }
  if (scenario.media.txGain < 0.0 || scenario.media.txGain > 1.0) {
    throw std::runtime_error("txGain must be between 0.0 and 1.0");
  }

  if (scenario.reporting.consoleRefreshMs <= 0) {
    throw std::runtime_error("consoleRefreshMs must be positive");
  }
}

}  // namespace loadgen
