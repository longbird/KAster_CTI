#include "loadgen/orchestrator.hpp"

#include <algorithm>
#include <queue>
#include <stdexcept>

namespace loadgen {

namespace {

constexpr int kSimulatedCallDurationMs = 1000;

}  // namespace

RunSchedule buildRunSchedule(const RunPlan& plan) {
  return buildRunSchedule(plan, kSimulatedCallDurationMs);
}

RunSchedule buildRunSchedule(const RunPlan& plan, int simulatedCallDurationMs) {
  if (plan.cps <= 0 || plan.maxConcurrent <= 0 || plan.totalCalls <= 0) {
    throw std::runtime_error("run plan values must be positive");
  }
  if (simulatedCallDurationMs <= 0) {
    throw std::runtime_error("simulated call duration must be positive");
  }

  if (plan.cps > 1000) {
    throw std::runtime_error("cps exceeds scheduler resolution");
  }

  RunSchedule schedule{
      plan.totalCalls,
      0,
      {},
  };

  schedule.calls.reserve(plan.totalCalls);
  std::priority_queue<int, std::vector<int>, std::greater<int>>
      activeCallEndTimes;

  for (int i = 0; i < plan.totalCalls; ++i) {
    const int rateReadyMs = (i * 1000) / plan.cps;

    while (!activeCallEndTimes.empty() &&
           activeCallEndTimes.top() <= rateReadyMs) {
      activeCallEndTimes.pop();
    }

    int startOffsetMs = rateReadyMs;
    if (static_cast<int>(activeCallEndTimes.size()) >= plan.maxConcurrent) {
      startOffsetMs = activeCallEndTimes.top();
      while (!activeCallEndTimes.empty() &&
             activeCallEndTimes.top() <= startOffsetMs) {
        activeCallEndTimes.pop();
      }
    }

    activeCallEndTimes.push(startOffsetMs + simulatedCallDurationMs);

    schedule.maxSimultaneousCalls = std::max(
        schedule.maxSimultaneousCalls,
        static_cast<int>(activeCallEndTimes.size()));
    schedule.calls.push_back(ScheduledCall{i, startOffsetMs});
  }

  return schedule;
}

}  // namespace loadgen
