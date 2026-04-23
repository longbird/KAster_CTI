#pragma once

#include <optional>
#include <string>

namespace loadgen {

enum class CallState {
  CREATED,
  DIALING,
  RINGING,
  ANSWERED,
  MEDIA_ACTIVE,
  COMPLETED,
  FAILED,
  CANCELED,
  TIMEOUT
};

enum class FailureCode {
  NONE,
  AUTH_FAILED,
  TIMEOUT_NO_RESPONSE,
  REJECTED_4XX,
  SERVER_5XX,
  MEDIA_INIT_FAILED,
  RTP_INACTIVE,
  TRANSPORT_ERROR
};

struct CallResult {
  std::string callRunId;
  CallState state{CallState::CREATED};
  FailureCode failureCode{FailureCode::NONE};
  int finalSipCode{0};
  std::optional<int> answerLatencyMs;
  std::optional<int> mediaPacketsTx;
  std::optional<int> mediaPacketsRx;
};

inline bool isSuccessful(const CallResult& result) {
  return result.finalSipCode == 200 &&
         (result.state == CallState::ANSWERED ||
          result.state == CallState::MEDIA_ACTIVE ||
          result.state == CallState::COMPLETED);
}

inline FailureCode mapFailureCode(int sipCode) {
  if (sipCode == 401 || sipCode == 403) {
    return FailureCode::AUTH_FAILED;
  }
  if (sipCode >= 400 && sipCode < 500) {
    return FailureCode::REJECTED_4XX;
  }
  if (sipCode >= 500 && sipCode < 600) {
    return FailureCode::SERVER_5XX;
  }
  return FailureCode::NONE;
}

}  // namespace loadgen
