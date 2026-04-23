#pragma once

#include <vector>

namespace loadgen {

struct RunPlan {
  int cps;
  int maxConcurrent;
  int totalCalls;
};

struct ScheduledCall {
  int index;
  int startOffsetMs;
};

struct RunSchedule {
  int totalPlannedCalls;
  int maxSimultaneousCalls;
  std::vector<ScheduledCall> calls;
};

RunSchedule buildRunSchedule(const RunPlan& plan);
RunSchedule buildRunSchedule(const RunPlan& plan, int simulatedCallDurationMs);

}  // namespace loadgen
