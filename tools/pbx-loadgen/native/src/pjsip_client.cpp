#include "loadgen/pjsip_client.hpp"
#include "loadgen/tone_generator.hpp"

namespace loadgen {

void PjsipClient::start(const Scenario& scenario) {
  scenario_ = scenario;
}

void PjsipClient::stop() {}

void PjsipClient::makeOneCall(const std::string& callRunId,
                              const std::string&,
                              const std::string&,
                              CallUpdateHandler onUpdate) {
  CallResult ringing;
  ringing.callRunId = callRunId;
  ringing.state = CallState::RINGING;
  onUpdate(ringing);

  const int beepIntervalMs = scenario_.has_value() ? scenario_->media.beepIntervalMs : 1000;
  const double txGain = scenario_.has_value() ? scenario_->media.txGain : 0.6;

  ToneGenerator tone(8000, 440.0, 120, beepIntervalMs, txGain);
  const auto frame = tone.nextFrame(160);

  CallResult active;
  active.callRunId = callRunId;
  active.state = CallState::MEDIA_ACTIVE;
  active.finalSipCode = 200;
  active.mediaPacketsTx = static_cast<int>(!frame.empty());
  onUpdate(active);
}

}  // namespace loadgen
