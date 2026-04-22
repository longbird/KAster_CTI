#include "loadgen/pjsip_client.hpp"

namespace loadgen {

void PjsipClient::start(const Scenario&) {}

void PjsipClient::stop() {}

void PjsipClient::makeOneCall(const std::string& callRunId,
                              const std::string&,
                              const std::string&,
                              CallUpdateHandler onUpdate) {
  CallResult dialing;
  dialing.callRunId = callRunId;
  dialing.state = CallState::DIALING;
  onUpdate(dialing);
}

}  // namespace loadgen
