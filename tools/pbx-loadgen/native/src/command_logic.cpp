#include "loadgen/command_logic.hpp"

#include <algorithm>
#include <limits>
#include <queue>
#include <string>
#include <vector>

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

  const int rampUpMs = std::max(0, scenario.load.rampUpSeconds * 1000);
  std::priority_queue<int, std::vector<int>, std::greater<int>> activeCallEndTimes;
  std::vector<ScheduledCall> candidateCalls;
  candidateCalls.reserve(baseSchedule.calls.size());

  for (std::size_t i = 0; i < baseSchedule.calls.size(); ++i) {
    const auto& baseCall = baseSchedule.calls[i];
    const int rampDelayMs =
        rampUpMs > 0 ? std::max(0, rampUpMs - baseCall.startOffsetMs) : 0;
    candidateCalls.push_back(ScheduledCall{
        baseCall.index,
        baseCall.startOffsetMs + rampDelayMs +
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
