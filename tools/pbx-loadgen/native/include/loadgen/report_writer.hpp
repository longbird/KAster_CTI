#pragma once

#include <string>
#include <vector>

namespace loadgen {

struct RunSummary {
  int attempted;
  int connected;
  int failed;
  int peakConcurrent;
  int totalScheduleMs;
};

struct CallResultDetail {
  std::string callRunId;
  std::string from;
  std::string toDid;
  int finalSipCode;
  std::string failureCode;
  int startOffsetMs;
};

struct ReportArtifacts {
  std::string jsonPath;
  std::string csvPath;
};

ReportArtifacts writeReports(const RunSummary& summary,
                             const std::vector<CallResultDetail>& details,
                             const std::string& outputDir,
                             bool saveFailureDetails);
RunSummary readSummaryReport(const std::string& jsonPath);

}  // namespace loadgen
