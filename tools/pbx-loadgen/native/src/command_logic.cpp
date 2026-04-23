#include "loadgen/command_logic.hpp"

#include <algorithm>
#include <atomic>
#include <chrono>
#include <cmath>
#include <future>
#include <limits>
#include <queue>
#include <string>
#include <thread>
#include <vector>

#include "loadgen/live_run.hpp"

namespace loadgen {

namespace {

int deriveSimulatedCallDurationMs(const Scenario& scenario) {
  return std::max(1, scenario.callFlow.holdSecondsMax * 1000);
}

int deterministicJitterMs(int index, int jitterMs) {
  if (jitterMs <= 0) {
    return 0;
  }
  return (index * 37) % (jitterMs + 1);
}

int rampedStartOffsetMs(std::size_t callNumber,
                        const Scenario& scenario) {
  const int rampUpMs = std::max(0, scenario.load.rampUpSeconds * 1000);
  if (rampUpMs <= 0) {
    return 0;
  }

  const int targetCps = scenario.load.cps;
  const long long callOrdinal = static_cast<long long>(callNumber) + 1;
  const long long rampThresholdNumerator =
      static_cast<long long>(targetCps) * rampUpMs;

  // Linear ramp: the call rate increases from 0 CPS to the target CPS over
  // the ramp window, then stays at the steady-state cadence.
  if (callOrdinal * 2000LL <= rampThresholdNumerator) {
    const double rampStartMs = std::sqrt(
        (2000.0 * static_cast<double>(rampUpMs) * callOrdinal) / targetCps);
    return static_cast<int>(rampStartMs);
  }

  return static_cast<int>(static_cast<long long>(rampUpMs) / 2 +
                          (1000LL * callOrdinal) / targetCps);
}

int deriveHoldDurationMs(std::size_t callIndex, const Scenario& scenario) {
  const int minHoldSeconds = std::max(0, scenario.callFlow.holdSecondsMin);
  const int maxHoldSeconds =
      std::max(minHoldSeconds, scenario.callFlow.holdSecondsMax);
  const int rangeSeconds = maxHoldSeconds - minHoldSeconds;
  const int holdSeconds =
      minHoldSeconds + (rangeSeconds > 0 ? static_cast<int>(callIndex % (rangeSeconds + 1)) : 0);
  return holdSeconds * 1000;
}

std::string failureCodeToString(FailureCode failureCode) {
  switch (failureCode) {
    case FailureCode::NONE:
      return "none";
    case FailureCode::AUTH_FAILED:
      return "auth_failed";
    case FailureCode::TIMEOUT_NO_RESPONSE:
      return "timeout_no_response";
    case FailureCode::REJECTED_4XX:
      return "rejected_4xx";
    case FailureCode::SERVER_5XX:
      return "server_5xx";
    case FailureCode::MEDIA_INIT_FAILED:
      return "media_init_failed";
    case FailureCode::RTP_INACTIVE:
      return "rtp_inactive";
    case FailureCode::TRANSPORT_ERROR:
      return "transport_error";
  }
  return "unknown";
}

std::vector<CallResultDetail> buildSimulatedDetails(
    const Scenario& scenario,
    const RunSchedule& schedule) {
  std::vector<CallResultDetail> details;
  details.reserve(schedule.calls.size());

  for (std::size_t i = 0; i < schedule.calls.size(); ++i) {
    const auto& scheduledCall = schedule.calls[i];
    details.push_back(CallResultDetail{
        "call-" + std::to_string(scheduledCall.index + 1),
        scenario.callFlow
            .callerIdPool[scheduledCall.index % scenario.callFlow.callerIdPool.size()],
        scenario.callFlow.didPool[scheduledCall.index % scenario.callFlow.didPool.size()],
        200,
        "none",
        scheduledCall.startOffsetMs,
    });
  }

  return details;
}

}  // namespace

PracticalSchedule buildPracticalSchedule(const Scenario& scenario) {
  const int simulatedCallDurationMs = deriveSimulatedCallDurationMs(scenario);
  const auto baseSchedule = buildRunSchedule(
      {scenario.load.cps,
       scenario.load.maxConcurrent,
       scenario.load.totalCalls},
      simulatedCallDurationMs);

  RunSchedule effectiveSchedule{
      baseSchedule.totalPlannedCalls,
      0,
      {},
  };
  effectiveSchedule.calls.reserve(baseSchedule.calls.size());

  std::priority_queue<int, std::vector<int>, std::greater<int>> activeCallEndTimes;
  std::vector<ScheduledCall> candidateCalls;
  candidateCalls.reserve(baseSchedule.calls.size());

  for (std::size_t i = 0; i < baseSchedule.calls.size(); ++i) {
    const auto& baseCall = baseSchedule.calls[i];
    candidateCalls.push_back(ScheduledCall{
        baseCall.index,
        rampedStartOffsetMs(i, scenario) +
            deterministicJitterMs(static_cast<int>(i),
                                  scenario.load.callStartJitterMs),
    });
  }

  std::sort(candidateCalls.begin(),
            candidateCalls.end(),
            [](const ScheduledCall& lhs, const ScheduledCall& rhs) {
              if (lhs.startOffsetMs != rhs.startOffsetMs) {
                return lhs.startOffsetMs < rhs.startOffsetMs;
              }
              return lhs.index < rhs.index;
            });

  int firstStartMs = 0;
  int lastStartMs = 0;
  int totalScheduleMs = 0;
  bool hasCalls = false;

  for (const auto& candidateCall : candidateCalls) {
    int scheduledStartMs = candidateCall.startOffsetMs;

    while (!activeCallEndTimes.empty() &&
           activeCallEndTimes.top() <= scheduledStartMs) {
      activeCallEndTimes.pop();
    }

    if (static_cast<int>(activeCallEndTimes.size()) >= scenario.load.maxConcurrent) {
      scheduledStartMs = activeCallEndTimes.top();
      while (!activeCallEndTimes.empty() &&
             activeCallEndTimes.top() <= scheduledStartMs) {
        activeCallEndTimes.pop();
      }
    }

    activeCallEndTimes.push(scheduledStartMs + simulatedCallDurationMs);
    effectiveSchedule.maxSimultaneousCalls = std::max(
        effectiveSchedule.maxSimultaneousCalls,
        static_cast<int>(activeCallEndTimes.size()));
    effectiveSchedule.calls.push_back(
        ScheduledCall{candidateCall.index, scheduledStartMs});

    if (!hasCalls) {
      firstStartMs = scheduledStartMs;
      lastStartMs = scheduledStartMs;
      totalScheduleMs = scheduledStartMs + simulatedCallDurationMs;
      hasCalls = true;
    } else {
      firstStartMs = std::min(firstStartMs, scheduledStartMs);
      lastStartMs = std::max(lastStartMs, scheduledStartMs);
      totalScheduleMs =
          std::max(totalScheduleMs, scheduledStartMs + simulatedCallDurationMs);
    }
  }

  return {effectiveSchedule,
          simulatedCallDurationMs,
          firstStartMs,
          lastStartMs,
          totalScheduleMs};
}

std::string formatDryRunSummary(const PracticalSchedule& schedule) {
  return "planned calls=" + std::to_string(schedule.schedule.totalPlannedCalls) +
         " peakConcurrent=" +
         std::to_string(schedule.schedule.maxSimultaneousCalls) +
         " simulatedCallMs=" + std::to_string(schedule.simulatedCallDurationMs) +
         " firstStartMs=" + std::to_string(schedule.firstStartMs) +
         " lastStartMs=" + std::to_string(schedule.lastStartMs) +
         " totalScheduleMs=" + std::to_string(schedule.totalScheduleMs);
}

PracticalRunResult executeLiveRun(const Scenario& scenario,
                                  LiveCallRunner& runner) {
  const auto practicalSchedule = buildPracticalSchedule(scenario);
  std::vector<std::future<std::pair<CallResult, CallResultDetail>>> futures;
  futures.reserve(practicalSchedule.schedule.calls.size());

  std::atomic<int> activeCalls{0};
  std::atomic<int> peakConcurrent{0};
  const auto testStart = std::chrono::steady_clock::now();

  runner.start(scenario);

  try {
    for (const auto& scheduledCall : practicalSchedule.schedule.calls) {
      futures.push_back(std::async(
          std::launch::async,
          [&scenario,
           &runner,
           &activeCalls,
           &peakConcurrent,
           scheduledCall,
           testStart]() -> std::pair<CallResult, CallResultDetail> {
            std::this_thread::sleep_until(
                testStart + std::chrono::milliseconds(scheduledCall.startOffsetMs));

            const int currentActive = activeCalls.fetch_add(1) + 1;
            int observedPeak = peakConcurrent.load();
            while (currentActive > observedPeak &&
                   !peakConcurrent.compare_exchange_weak(observedPeak,
                                                         currentActive)) {
            }

            struct ActiveCallScope {
              std::atomic<int>& counter;
              ~ActiveCallScope() { counter.fetch_sub(1); }
            } scope{activeCalls};

            const std::string callRunId =
                "call-" + std::to_string(scheduledCall.index + 1);
            const std::string callerId =
                scenario.callFlow.callerIdPool[scheduledCall.index %
                                               scenario.callFlow.callerIdPool.size()];
            const std::string did =
                scenario.callFlow.didPool[scheduledCall.index %
                                          scenario.callFlow.didPool.size()];

            const LiveCallRequest request{
                callRunId,
                callerId,
                did,
                scheduledCall.startOffsetMs,
                scenario.callFlow.answerTimeoutMs,
                deriveHoldDurationMs(scheduledCall.index, scenario),
            };

            CallResult result;
            try {
              result = runner.runCall(request);
            } catch (...) {
              result.callRunId = request.callRunId;
              result.state = CallState::FAILED;
              result.failureCode = FailureCode::TRANSPORT_ERROR;
            }

            if (result.callRunId.empty()) {
              result.callRunId = request.callRunId;
            }

            return {
                result,
                CallResultDetail{
                    request.callRunId,
                    request.callerId,
                    request.did,
                    result.finalSipCode,
                    failureCodeToString(result.failureCode),
                    request.startOffsetMs,
                },
            };
          }));
    }

    int connected = 0;
    std::vector<CallResultDetail> details;
    details.reserve(futures.size());

    for (auto& future : futures) {
      auto [result, detail] = future.get();
      if (isSuccessful(result)) {
        ++connected;
      }
      details.push_back(std::move(detail));
    }

    runner.stop();

    const RunSummary summary{
        static_cast<int>(practicalSchedule.schedule.calls.size()),
        connected,
        static_cast<int>(practicalSchedule.schedule.calls.size()) - connected,
        peakConcurrent.load(),
        practicalSchedule.totalScheduleMs,
    };

    const auto artifacts = writeReports(summary,
                                        details,
                                        scenario.reporting.outputDir,
                                        scenario.reporting.saveFailureDetails);

    return {summary, artifacts};
  } catch (...) {
    runner.stop();
    throw;
  }
}

PracticalRunResult executePracticalRun(const Scenario& scenario) {
  const auto practicalSchedule = buildPracticalSchedule(scenario);
  const auto details =
      buildSimulatedDetails(scenario, practicalSchedule.schedule);

  const RunSummary summary{
      practicalSchedule.schedule.totalPlannedCalls,
      practicalSchedule.schedule.totalPlannedCalls,
      0,
      practicalSchedule.schedule.maxSimultaneousCalls,
      practicalSchedule.totalScheduleMs,
  };

  const auto artifacts = writeReports(summary,
                                      details,
                                      scenario.reporting.outputDir,
                                      scenario.reporting.saveFailureDetails);

  return {summary, artifacts};
}

std::string formatRunArtifacts(const ReportArtifacts& artifacts) {
  std::string text = "json=" + artifacts.jsonPath;
  if (!artifacts.csvPath.empty()) {
    text += " csv=" + artifacts.csvPath;
  }
  return text;
}

std::string formatReportReplay(const RunSummary& summary) {
  return "attempted=" + std::to_string(summary.attempted) +
         " connected=" + std::to_string(summary.connected) +
         " failed=" + std::to_string(summary.failed) +
         " peakConcurrent=" + std::to_string(summary.peakConcurrent) +
         " totalScheduleMs=" + std::to_string(summary.totalScheduleMs);
}

}  // namespace loadgen
