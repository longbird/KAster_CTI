#pragma once

#include <string>

#include "loadgen/call_types.hpp"
#include "loadgen/command_logic.hpp"
#include "loadgen/scenario.hpp"

namespace loadgen {

struct LiveCallRequest {
  std::string callRunId;
  std::string callerId;
  std::string did;
  int startOffsetMs{0};
  int answerTimeoutMs{0};
  int holdDurationMs{0};
};

class LiveCallRunner {
 public:
  virtual ~LiveCallRunner() = default;

  virtual void start(const Scenario& scenario) = 0;
  virtual void stop() = 0;
  virtual CallResult runCall(const LiveCallRequest& request) = 0;
};

PracticalRunResult executeLiveRun(const Scenario& scenario, LiveCallRunner& runner);

}  // namespace loadgen
