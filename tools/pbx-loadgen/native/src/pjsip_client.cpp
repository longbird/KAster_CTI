#include "loadgen/pjsip_client.hpp"

#ifndef NOMINMAX
#define NOMINMAX
#endif

#include <algorithm>
#include <chrono>
#include <condition_variable>
#include <cctype>
#include <mutex>
#include <stdexcept>
#include <string>
#include <thread>
#include <utility>

#include <pj/os.h>
#include <pj/timer.h>
#include <pjmedia/tonegen.h>
#include <pjsua-lib/pjsua.h>

namespace loadgen {

namespace {

constexpr int kBeepDurationMs = 120;

std::string toLower(std::string value) {
  std::transform(value.begin(),
                 value.end(),
                 value.begin(),
                 [](unsigned char ch) { return static_cast<char>(std::tolower(ch)); });
  return value;
}

pjsip_transport_type_e transportTypeFor(const std::string& transport) {
  const auto normalized = toLower(transport);
  if (normalized == "udp") {
    return PJSIP_TRANSPORT_UDP;
  }
  if (normalized == "tcp") {
    return PJSIP_TRANSPORT_TCP;
  }
  if (normalized == "tls") {
    return PJSIP_TRANSPORT_TLS;
  }
  throw std::runtime_error("unsupported transport: " + transport);
}

std::string replaceDid(std::string value, const std::string& did) {
  const std::string placeholder = "{did}";
  std::size_t pos = 0;
  while ((pos = value.find(placeholder, pos)) != std::string::npos) {
    value.replace(pos, placeholder.size(), did);
    pos += did.size();
  }
  return value;
}

std::string buildLocalUri(const std::string& callerId, const TargetConfig& target) {
  return "sip:" + callerId + "@" + target.host;
}

pj_str_t pjStr(std::string& value) {
  return pj_str(const_cast<char*>(value.c_str()));
}

pj_time_val delayForMs(int delayMs) {
  pj_time_val value;
  value.sec = delayMs / 1000;
  value.msec = delayMs % 1000;
  return value;
}

template <typename T>
T maxValue(const T& lhs, const T& rhs) {
  return (lhs < rhs) ? rhs : lhs;
}

template <typename T>
T minValue(const T& lhs, const T& rhs) {
  return (rhs < lhs) ? rhs : lhs;
}

short toneVolumeForGain(double gain) {
  const auto clamped = maxValue(0.05, minValue(1.0, gain));
  return static_cast<short>(clamped * 32000.0);
}

int toneOffDurationMs(const MediaConfig& media) {
  return maxValue(0, media.beepIntervalMs - kBeepDurationMs);
}

void registerCurrentThread(const char* name) {
  thread_local pj_thread_desc desc;
  thread_local pj_thread_t* thread = nullptr;

  if (!pj_thread_is_registered()) {
    pj_thread_register(name, desc, &thread);
  }
}

struct CallContext {
  LiveCallRequest request;
  MediaConfig media;
  CallResult result;
  std::mutex mutex;
  std::condition_variable cv;
  std::chrono::steady_clock::time_point startedAt;
  pjsua_call_id callId{PJSUA_INVALID_ID};
  pj_timer_entry answerTimer{};
  pj_timer_entry hangupTimer{};
  bool answerTimerScheduled{false};
  bool hangupTimerScheduled{false};
  bool answered{false};
  bool mediaConnected{false};
  bool dtmfStarted{false};
  bool done{false};
  bool timeoutBeforeAnswer{false};
  bool hasMediaIndex{false};
  unsigned mediaIndex{0};
  pj_pool_t* tonePool{nullptr};
  pjmedia_port* tonePort{nullptr};
  pjsua_conf_port_id toneSlot{PJSUA_INVALID_ID};
  std::thread dtmfThread;

  explicit CallContext(const LiveCallRequest& liveRequest,
                       const MediaConfig& mediaConfig)
      : request(liveRequest),
        media(mediaConfig),
        result{liveRequest.callRunId},
        startedAt(std::chrono::steady_clock::now()) {}

  ~CallContext() {
    {
      std::lock_guard<std::mutex> lock(mutex);
      done = true;
    }
    if (dtmfThread.joinable()) {
      dtmfThread.join();
    }
    cleanupTone();
  }

  void cleanupTone() {
    if (toneSlot != PJSUA_INVALID_ID) {
      pjsua_conf_remove_port(toneSlot);
      toneSlot = PJSUA_INVALID_ID;
    }
    if (tonePool != nullptr) {
      pj_pool_release(tonePool);
      tonePool = nullptr;
      tonePort = nullptr;
    }
  }
};

void sendDtmfSequence(CallContext& context) {
  registerCurrentThread("loadgen-dtmf");
  const auto sequence = context.request.dtmf.sequence;
  if (sequence.empty()) {
    return;
  }

  std::this_thread::sleep_for(
      std::chrono::milliseconds(context.request.dtmf.sendAfterAnswerMs));

  for (char digit : sequence) {
    {
      std::lock_guard<std::mutex> lock(context.mutex);
      if (context.done || context.callId == PJSUA_INVALID_ID) {
        return;
      }
    }

    std::string digitText(1, digit);
    pj_str_t pjDigit = pjStr(digitText);
    pjsua_call_dial_dtmf(context.callId, &pjDigit);

    if (context.request.dtmf.interDigitMs > 0) {
      std::this_thread::sleep_for(
          std::chrono::milliseconds(context.request.dtmf.interDigitMs));
    }
  }
}

void maybeStartDtmf(CallContext& context) {
  if (context.request.dtmf.sequence.empty()) {
    return;
  }
  if (context.dtmfStarted || context.done) {
    return;
  }
  context.dtmfStarted = true;
  context.dtmfThread = std::thread([&context] { sendDtmfSequence(context); });
}

void cancelTimerIfRunning(pj_timer_entry& timerEntry, bool& scheduled) {
  if (scheduled && pj_timer_entry_running(&timerEntry)) {
    pjsua_cancel_timer(&timerEntry);
  }
  scheduled = false;
}

pj_status_t ensureTonePort(CallContext& context) {
  if (context.toneSlot != PJSUA_INVALID_ID) {
    return PJ_SUCCESS;
  }

  context.tonePool = pjsua_pool_create("pbx-loadgen-tone", 1024, 1024);
  if (context.tonePool == nullptr) {
    return PJ_ENOMEM;
  }

  pj_status_t status =
      pjmedia_tonegen_create(context.tonePool,
                             8000,
                             1,
                             160,
                             16,
                             PJMEDIA_TONEGEN_LOOP,
                             &context.tonePort);
  if (status != PJ_SUCCESS) {
    context.cleanupTone();
    return status;
  }

  pjmedia_tone_desc tone{};
  tone.freq1 = 440;
  tone.freq2 = 0;
  tone.on_msec = kBeepDurationMs;
  tone.off_msec = static_cast<short>(toneOffDurationMs(context.media));
  tone.volume = toneVolumeForGain(context.media.txGain);

  status = pjmedia_tonegen_play(context.tonePort, 1, &tone, PJMEDIA_TONEGEN_LOOP);
  if (status != PJ_SUCCESS) {
    context.cleanupTone();
    return status;
  }

  status = pjsua_conf_add_port(context.tonePool, context.tonePort, &context.toneSlot);
  if (status != PJ_SUCCESS) {
    context.cleanupTone();
    return status;
  }

  return PJ_SUCCESS;
}

void finalizeResultLocked(CallContext& context, const pjsua_call_info& info) {
  cancelTimerIfRunning(context.answerTimer, context.answerTimerScheduled);
  cancelTimerIfRunning(context.hangupTimer, context.hangupTimerScheduled);

  if (context.hasMediaIndex) {
    pjsua_stream_stat stat;
    if (pjsua_call_get_stream_stat(context.callId, context.mediaIndex, &stat) == PJ_SUCCESS) {
      context.result.mediaPacketsTx = static_cast<int>(stat.rtcp.tx.pkt);
      context.result.mediaPacketsRx = static_cast<int>(stat.rtcp.rx.pkt);
    }
  }

  if (context.timeoutBeforeAnswer || info.last_status == 408) {
    context.result.state = CallState::TIMEOUT;
    context.result.failureCode = FailureCode::TIMEOUT_NO_RESPONSE;
    context.result.finalSipCode = 408;
    return;
  }

  context.result.finalSipCode = info.last_status;
  const auto mappedFailure = mapFailureCode(info.last_status);
  if (mappedFailure != FailureCode::NONE) {
    context.result.state = CallState::FAILED;
    context.result.failureCode = mappedFailure;
    return;
  }

  if (context.answered || info.last_status == 200) {
    context.result.state = CallState::COMPLETED;
    context.result.failureCode = FailureCode::NONE;
    if (context.result.finalSipCode == 0) {
      context.result.finalSipCode = 200;
    }
    return;
  }

  context.result.state = CallState::FAILED;
  context.result.failureCode = FailureCode::TRANSPORT_ERROR;
}

void onAnswerTimeout(pj_timer_heap_t*, pj_timer_entry* entry) {
  auto* context = static_cast<CallContext*>(entry->user_data);
  if (context == nullptr) {
    return;
  }

  pjsua_call_id callId = PJSUA_INVALID_ID;
  {
    std::lock_guard<std::mutex> lock(context->mutex);
    context->answerTimerScheduled = false;
    if (context->answered || context->done) {
      return;
    }
    context->timeoutBeforeAnswer = true;
    callId = context->callId;
  }

  if (callId != PJSUA_INVALID_ID) {
    pjsua_call_hangup(callId, 408, nullptr, nullptr);
  }
}

void onScheduledHangup(pj_timer_heap_t*, pj_timer_entry* entry) {
  auto* context = static_cast<CallContext*>(entry->user_data);
  if (context == nullptr) {
    return;
  }

  pjsua_call_id callId = PJSUA_INVALID_ID;
  {
    std::lock_guard<std::mutex> lock(context->mutex);
    context->hangupTimerScheduled = false;
    if (context->done) {
      return;
    }
    callId = context->callId;
  }

  if (callId != PJSUA_INVALID_ID) {
    pjsua_call_hangup(callId, 200, nullptr, nullptr);
  }
}

void onCallState(pjsua_call_id callId, pjsip_event*) {
  auto* context = static_cast<CallContext*>(pjsua_call_get_user_data(callId));
  if (context == nullptr) {
    return;
  }

  pjsua_call_info info;
  if (pjsua_call_get_info(callId, &info) != PJ_SUCCESS) {
    return;
  }

  bool shouldScheduleHangup = false;

  {
    std::lock_guard<std::mutex> lock(context->mutex);

    if (info.last_status != 0) {
      context->result.finalSipCode = info.last_status;
    }

    switch (info.state) {
      case PJSIP_INV_STATE_CALLING:
        context->result.state = CallState::DIALING;
        break;
      case PJSIP_INV_STATE_EARLY:
        context->result.state = CallState::RINGING;
        break;
      case PJSIP_INV_STATE_CONNECTING:
        context->result.state = CallState::ANSWERED;
        break;
      case PJSIP_INV_STATE_CONFIRMED:
        context->answered = true;
        if (!context->result.answerLatencyMs.has_value()) {
          const auto elapsed =
              std::chrono::duration_cast<std::chrono::milliseconds>(
                  std::chrono::steady_clock::now() - context->startedAt)
                  .count();
          context->result.answerLatencyMs = static_cast<int>(elapsed);
        }
        if (context->result.finalSipCode == 0) {
          context->result.finalSipCode = 200;
        }
        if (context->result.state != CallState::MEDIA_ACTIVE) {
          context->result.state = CallState::ANSWERED;
        }
        if (!context->hangupTimerScheduled) {
          shouldScheduleHangup = true;
        }
        break;
      case PJSIP_INV_STATE_DISCONNECTED:
        finalizeResultLocked(*context, info);
        context->done = true;
        break;
      default:
        break;
    }
  }

  if (shouldScheduleHangup) {
    pj_timer_entry_init(&context->hangupTimer, 2, context, &onScheduledHangup);
    const auto delay = delayForMs(maxValue(0, context->request.holdDurationMs));
    if (pjsua_schedule_timer(&context->hangupTimer, &delay) == PJ_SUCCESS) {
      std::lock_guard<std::mutex> lock(context->mutex);
      context->hangupTimerScheduled = true;
    }
  }

  context->cv.notify_all();
}

void onCallMediaState(pjsua_call_id callId) {
  auto* context = static_cast<CallContext*>(pjsua_call_get_user_data(callId));
  if (context == nullptr) {
    return;
  }

  pjsua_call_info info;
  if (pjsua_call_get_info(callId, &info) != PJ_SUCCESS) {
    return;
  }

  if (info.media_status != PJSUA_CALL_MEDIA_ACTIVE || info.conf_slot == PJSUA_INVALID_ID) {
    return;
  }

  pj_status_t status = ensureTonePort(*context);
  std::lock_guard<std::mutex> lock(context->mutex);
  if (status != PJ_SUCCESS) {
    context->result.state = CallState::FAILED;
    context->result.failureCode = FailureCode::MEDIA_INIT_FAILED;
    context->done = true;
    context->cv.notify_all();
    return;
  }

  if (!context->mediaConnected) {
    pjsua_conf_connect(context->toneSlot, info.conf_slot);
    context->mediaConnected = true;
  }

  context->answered = true;
  if (!context->result.answerLatencyMs.has_value()) {
    const auto elapsed =
        std::chrono::duration_cast<std::chrono::milliseconds>(
            std::chrono::steady_clock::now() - context->startedAt)
            .count();
    context->result.answerLatencyMs = static_cast<int>(elapsed);
  }

  for (unsigned i = 0; i < info.media_cnt; ++i) {
    if (info.media[i].type == PJMEDIA_TYPE_AUDIO &&
        info.media[i].status == PJSUA_CALL_MEDIA_ACTIVE) {
      context->hasMediaIndex = true;
      context->mediaIndex = i;
      break;
    }
  }

  context->result.finalSipCode = 200;
  context->result.state = CallState::MEDIA_ACTIVE;
  maybeStartDtmf(*context);
  context->cv.notify_all();
}

}  // namespace

struct PjsipClient::Impl {
  Scenario scenario;
  pjsua_transport_id transportId{PJSUA_INVALID_ID};
  pjsua_acc_id accountId{PJSUA_INVALID_ID};
  std::mutex lifecycleMutex;
  bool started{false};
};

PjsipClient::PjsipClient() : impl_(new Impl()) {}

PjsipClient::~PjsipClient() {
  try {
    stop();
  } catch (...) {
  }
}

void PjsipClient::start(const Scenario& scenario) {
  std::lock_guard<std::mutex> lock(impl_->lifecycleMutex);
  if (impl_->started) {
    return;
  }

  registerCurrentThread("loadgen-start");
  impl_->scenario = scenario;

  pj_status_t status = pjsua_create();
  if (status != PJ_SUCCESS) {
    throw std::runtime_error("pjsua_create failed");
  }

  pjsua_config config;
  pjsua_logging_config loggingConfig;
  pjsua_media_config mediaConfig;
  pjsua_config_default(&config);
  pjsua_logging_config_default(&loggingConfig);
  pjsua_media_config_default(&mediaConfig);

  config.thread_cnt = 1;
  config.cb.on_call_state = &onCallState;
  config.cb.on_call_media_state = &onCallMediaState;
  loggingConfig.console_level = 0;
  loggingConfig.level = 2;

  status = pjsua_init(&config, &loggingConfig, &mediaConfig);
  if (status != PJ_SUCCESS) {
    pjsua_destroy();
    throw std::runtime_error("pjsua_init failed");
  }

  pjsua_transport_config transportConfig;
  pjsua_transport_config_default(&transportConfig);
  transportConfig.port = 0;

  status = pjsua_transport_create(transportTypeFor(scenario.target.transport),
                                  &transportConfig,
                                  &impl_->transportId);
  if (status != PJ_SUCCESS) {
    pjsua_destroy();
    throw std::runtime_error("pjsua_transport_create failed");
  }

  status = pjsua_acc_add_local(impl_->transportId, PJ_TRUE, &impl_->accountId);
  if (status != PJ_SUCCESS) {
    pjsua_destroy();
    throw std::runtime_error("pjsua_acc_add_local failed");
  }

  status = pjsua_start();
  if (status != PJ_SUCCESS) {
    pjsua_destroy();
    throw std::runtime_error("pjsua_start failed");
  }

  pjsua_set_null_snd_dev();
  impl_->started = true;
}

void PjsipClient::stop() {
  std::lock_guard<std::mutex> lock(impl_->lifecycleMutex);
  if (!impl_->started) {
    return;
  }

  registerCurrentThread("loadgen-stop");
  pjsua_destroy();
  impl_->transportId = PJSUA_INVALID_ID;
  impl_->accountId = PJSUA_INVALID_ID;
  impl_->started = false;
}

CallResult PjsipClient::runCall(const LiveCallRequest& request) {
  {
    std::lock_guard<std::mutex> lock(impl_->lifecycleMutex);
    if (!impl_->started) {
      throw std::runtime_error("PJSIP client has not been started");
    }
  }

  registerCurrentThread("loadgen-call");

  CallContext context(request, impl_->scenario.media);
  context.result.state = CallState::DIALING;

  std::string destinationUri = replaceDid(impl_->scenario.target.requestUriTemplate, request.did);
  std::string localUri = buildLocalUri(request.callerId, impl_->scenario.target);

  pjsua_call_setting callSetting;
  pjsua_call_setting_default(&callSetting);
  callSetting.aud_cnt = 1;
  callSetting.vid_cnt = 0;

  pjsua_msg_data messageData;
  pjsua_msg_data_init(&messageData);
  messageData.local_uri = pjStr(localUri);
  auto destination = pjStr(destinationUri);

  pj_status_t status = pjsua_call_make_call(impl_->accountId,
                                            &destination,
                                            &callSetting,
                                            &context,
                                            &messageData,
                                            &context.callId);
  if (status != PJ_SUCCESS) {
    context.result.state = CallState::FAILED;
    context.result.failureCode = FailureCode::TRANSPORT_ERROR;
    return context.result;
  }

  pj_timer_entry_init(&context.answerTimer, 1, &context, &onAnswerTimeout);
  const auto answerDelay = delayForMs(maxValue(1, request.answerTimeoutMs));
  if (pjsua_schedule_timer(&context.answerTimer, &answerDelay) == PJ_SUCCESS) {
    context.answerTimerScheduled = true;
  }

  std::unique_lock<std::mutex> lock(context.mutex);
  context.cv.wait(lock, [&context] { return context.done; });
  return context.result;
}

}  // namespace loadgen
