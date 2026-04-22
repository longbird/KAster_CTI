#include "loadgen/pjsip_client.hpp"
#include "loadgen/tone_generator.hpp"

namespace loadgen {

void PjsipClient::start(const Scenario&) {}

void PjsipClient::stop() {}

void PjsipClient::makeOneCall(const std::string& callRunId,
                              const std::string&,
                              const std::string&,
                              CallUpdateHandler onUpdate) {
  CallResult ringing;
  ringing.callRunId = callRunId;
  ringing.state = CallState::RINGING;
  onUpdate(ringing);

  ToneGenerator tone(8000, 440.0, 120, 0.6);
  const auto frame = tone.nextFrame(160);

  CallResult active;
  active.callRunId = callRunId;
  active.state = CallState::MEDIA_ACTIVE;
  active.finalSipCode = 200;
  active.mediaPacketsTx = static_cast<int>(!frame.empty());
  onUpdate(active);
}

}  // namespace loadgen
