#pragma once

#include <string>
#include <vector>

namespace loadgen {

struct TargetConfig {
  std::string host;
  int port;
  std::string transport;
  std::string requestUriTemplate;
};

struct LoadConfig {
  int cps;
  int maxConcurrent;
  int totalCalls;
  int rampUpSeconds;
  int callStartJitterMs;
};

struct DisconnectMode {
  int normalPercent;
};

struct DtmfConfig {
  std::string sequence;
  int sendAfterAnswerMs{0};
  int interDigitMs{0};
};

struct CallFlowConfig {
  std::vector<std::string> callerIdPool;
  std::vector<std::string> didPool;
  int answerTimeoutMs;
  int holdSecondsMin;
  int holdSecondsMax;
  DisconnectMode disconnectMode;
  DtmfConfig dtmf;
};

struct MediaConfig {
  int beepIntervalMs;
  double txGain;
};

struct ReportingConfig {
  std::string outputDir;
  int consoleRefreshMs;
  bool saveFailureDetails;
};

struct Scenario {
  TargetConfig target;
  LoadConfig load;
  CallFlowConfig callFlow;
  MediaConfig media;
  ReportingConfig reporting;
};

Scenario loadScenarioFromFile(const std::string& path);
Scenario loadScenarioFromString(const std::string& yaml);
void validateScenario(const Scenario& scenario);

}  // namespace loadgen
