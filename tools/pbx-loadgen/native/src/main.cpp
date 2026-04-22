#include <CLI/CLI.hpp>

#include <iostream>
#include <stdexcept>
#include <string>

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
      return printValidatedScenario(loadgen::loadScenarioFromFile(file));
    }

    if (*run) {
      std::cerr << "not implemented\n";
      return 1;
    }

    if (*report) {
      std::cerr << "not implemented\n";
      return 1;
    }
  } catch (const std::exception& ex) {
    std::cerr << ex.what() << '\n';
    return 1;
  }

  return 0;
}
