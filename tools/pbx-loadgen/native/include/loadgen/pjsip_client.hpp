#pragma once

#include <functional>
#include <string>

#include "loadgen/call_types.hpp"
#include "loadgen/scenario.hpp"

namespace loadgen {

using CallUpdateHandler = std::function<void(const CallResult&)>;

class PjsipClient {
 public:
  void start(const Scenario& scenario);
  void stop();
  void makeOneCall(const std::string& callRunId,
                   const std::string& callerId,
                   const std::string& did,
                   CallUpdateHandler onUpdate);
};

}  // namespace loadgen
