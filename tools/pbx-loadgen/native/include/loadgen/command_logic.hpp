#pragma once

#include <string>
#include <vector>

#include "loadgen/orchestrator.hpp"
#include "loadgen/report_writer.hpp"
#include "loadgen/scenario.hpp"

namespace loadgen {

struct PracticalSchedule {
  RunSchedule schedule;
  int simulatedCallDurationMs;
  int firstStartMs;
  int lastStartMs;
  int totalScheduleMs;
};

struct PracticalRunResult {
  RunSummary summary;
  ReportArtifacts artifacts;
};

PracticalSchedule buildPracticalSchedule(const Scenario& scenario);
std::string formatDryRunSummary(const PracticalSchedule& schedule);
PracticalRunResult executePracticalRun(const Scenario& scenario);
std::string formatRunArtifacts(const ReportArtifacts& artifacts);
std::string formatReportReplay(const RunSummary& summary);

}  // namespace loadgen
