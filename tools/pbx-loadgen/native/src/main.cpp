#include <CLI/CLI.hpp>
#include <iostream>

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

  if (*validate) {
    std::cout << "validated " << file << '\n';
    return 0;
  }

  if (*dryRun) {
    std::cout << "dry-run " << file << '\n';
    return 0;
  }

  if (*run) {
    std::cout << "run " << file << '\n';
    return 0;
  }

  if (*report) {
    std::cout << "report " << file << '\n';
    return 0;
  }

  return 0;
}
