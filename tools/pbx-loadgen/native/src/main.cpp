#include <CLI/CLI.hpp>

#include <iostream>
#include <stdexcept>
#include <string>

#include "loadgen/command_logic.hpp"
#include "loadgen/live_run.hpp"
#include "loadgen/pjsip_client.hpp"
#include "loadgen/report_writer.hpp"
#include "loadgen/scenario.hpp"

namespace {

int printValidatedScenario(const loadgen::Scenario& scenario) {
  std::cout << "scenario ok: cps=" << scenario.load.cps
            << " maxConcurrent=" << scenario.load.maxConcurrent
            << " totalCalls=" << scenario.load.totalCalls << '\n';
  return 0;
}

}  // namespace

int main(int argc, char** argv) {
  CLI::App app{"PBX inbound load generator"};
  std::string file;

  auto* validate = app.add_subcommand("validate", "Validate a scenario file");
  validate->add_option("-f,--file", file, "Scenario file")->required();
  auto* dryRun = app.add_subcommand("dry-run", "Show calculated run settings");
  dryRun->add_option("-f,--file", file, "Scenario file")->required();
  auto* run = app.add_subcommand("run", "Execute SIP load");
  run->add_option("-f,--file", file, "Scenario file")->required();
  auto* report = app.add_subcommand("report", "Replay a saved result file");
  report->add_option("-f,--file", file, "Result file")->required();

  app.require_subcommand(1);

  CLI11_PARSE(app, argc, argv);

  try {
    if (*validate) {
      return printValidatedScenario(loadgen::loadScenarioFromFile(file));
    }

    if (*dryRun) {
      const auto scenario = loadgen::loadScenarioFromFile(file);
      std::cout << loadgen::formatDryRunSummary(
                       loadgen::buildPracticalSchedule(scenario))
                << '\n';
      return 0;
    }

    if (*run) {
      const auto scenario = loadgen::loadScenarioFromFile(file);
      loadgen::PjsipClient client;
      std::cout
          << loadgen::formatRunArtifacts(loadgen::executeLiveRun(scenario, client).artifacts)
          << '\n';
      return 0;
    }

    if (*report) {
      const auto summary = loadgen::readSummaryReport(file);
      std::cout << loadgen::formatReportReplay(summary) << '\n';
      return 0;
    }
  } catch (const std::exception& ex) {
    std::cerr << ex.what() << '\n';
    return 1;
  }

  return 0;
}
