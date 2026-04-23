#include "loadgen/report_writer.hpp"

#include <atomic>
#include <chrono>
#include <filesystem>
#include <fstream>
#if defined(_WIN32)
#include <process.h>
#else
#include <unistd.h>
#endif
#include <sstream>
#include <stdexcept>
#include <string>

#include <nlohmann/json.hpp>

namespace loadgen {

namespace {

unsigned long long currentProcessId() {
#if defined(_WIN32)
  return static_cast<unsigned long long>(_getpid());
#else
  return static_cast<unsigned long long>(getpid());
#endif
}

std::string nextRunSuffix() {
  static std::atomic<unsigned long long> counter{0};
  const auto now = std::chrono::system_clock::now().time_since_epoch();
  const auto ticks =
      std::chrono::duration_cast<std::chrono::microseconds>(now).count();
  const auto pid = currentProcessId();
  const auto ordinal = counter.fetch_add(1, std::memory_order_relaxed);

  std::ostringstream stream;
  stream << ticks << "-" << pid << "-" << ordinal;
  return stream.str();
}

std::string escapeCsvField(const std::string& field) {
  bool needsQuoting = false;
  std::string escaped;
  escaped.reserve(field.size());

  for (const char ch : field) {
    if (ch == '"' || ch == ',' || ch == '\n' || ch == '\r') {
      needsQuoting = true;
    }
    if (ch == '"') {
      escaped += "\"\"";
    } else {
      escaped.push_back(ch);
    }
  }

  if (!needsQuoting) {
    return escaped;
  }
  return "\"" + escaped + "\"";
}

void ensureStreamReady(const std::ios& stream, const char* message) {
  if (!stream) {
    throw std::runtime_error(message);
  }
}

}  // namespace

ReportArtifacts writeReports(const RunSummary& summary,
                             const std::vector<CallResultDetail>& details,
                             const std::string& outputDir,
                             bool saveFailureDetails) {
  std::filesystem::create_directories(outputDir);
  const auto runSuffix = nextRunSuffix();

  const auto jsonPath =
      (std::filesystem::path(outputDir) /
       ("run-summary-" + runSuffix + ".json"))
          .string();
  const auto csvPath =
      saveFailureDetails
          ? (std::filesystem::path(outputDir) /
             ("call-details-" + runSuffix + ".csv"))
                .string()
          : std::string{};

  nlohmann::json doc = {
      {"attempted", summary.attempted},
      {"connected", summary.connected},
      {"failed", summary.failed},
      {"peakConcurrent", summary.peakConcurrent},
      {"totalScheduleMs", summary.totalScheduleMs},
  };

  std::ofstream jsonFile(jsonPath, std::ios::trunc);
  ensureStreamReady(jsonFile, "unable to open summary json for writing");
  jsonFile << doc.dump(2);
  jsonFile.flush();
  ensureStreamReady(jsonFile, "unable to write summary json");

  if (saveFailureDetails) {
    std::ofstream csvFile(csvPath, std::ios::trunc);
    ensureStreamReady(csvFile, "unable to open detail csv for writing");
    csvFile << "callRunId,from,toDid,finalSipCode,failureCode,startOffsetMs\n";
    for (const auto& detail : details) {
      csvFile << escapeCsvField(detail.callRunId) << ","
              << escapeCsvField(detail.from) << ","
              << escapeCsvField(detail.toDid) << "," << detail.finalSipCode
              << "," << escapeCsvField(detail.failureCode) << ","
              << detail.startOffsetMs << "\n";
    }
    csvFile.flush();
    ensureStreamReady(csvFile, "unable to write detail csv");
  }

  return {jsonPath, csvPath};
}

RunSummary readSummaryReport(const std::string& jsonPath) {
  std::ifstream jsonFile(jsonPath);
  if (!jsonFile) {
    throw std::runtime_error("unable to open summary report");
  }

  nlohmann::json doc;
  jsonFile >> doc;

  return {
      doc.at("attempted").get<int>(),
      doc.at("connected").get<int>(),
      doc.at("failed").get<int>(),
      doc.at("peakConcurrent").get<int>(),
      doc.at("totalScheduleMs").get<int>(),
  };
}

}  // namespace loadgen
