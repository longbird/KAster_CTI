#include <CLI/CLI.hpp>

#include <filesystem>
#include <fstream>
#include <iostream>
#include <stdexcept>
#include <string>
#include <sstream>

#include "loadgen/command_logic.hpp"
#include "loadgen/live_run.hpp"
#include "loadgen/pjsip_client.hpp"
#include "loadgen/report_writer.hpp"
#include "loadgen/scenario.hpp"
#include "loadgen/test_result.hpp"

namespace {

int printValidatedScenario(const loadgen::Scenario& scenario) {
  std::cout << "scenario ok: cps=" << scenario.load.cps
            << " maxConcurrent=" << scenario.load.maxConcurrent
            << " totalCalls=" << scenario.load.totalCalls << '\n';
  return 0;
}

std::string readTextFile(const std::string& path) {
  std::ifstream file(path);
  if (!file) {
    throw std::runtime_error("unable to open file: " + path);
  }
  std::stringstream buffer;
  buffer << file.rdbuf();
  return buffer.str();
}

void writeTextFile(const std::string& path, const std::string& content) {
  const auto parent = std::filesystem::path(path).parent_path();
  if (!parent.empty()) {
    std::filesystem::create_directories(parent);
  }
  std::ofstream file(path, std::ios::trunc);
  if (!file) {
    throw std::runtime_error("unable to open file for writing: " + path);
  }
  file << content;
  if (!file) {
    throw std::runtime_error("unable to write file: " + path);
  }
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

  std::string openapiFile;
  std::string outputFile;
  std::string featureId;
  std::string feedbackOutputFile;

  auto* testPlan =
      app.add_subcommand("test-plan", "Generate and run CTI feature test plans");

  auto* tpInventory =
      testPlan->add_subcommand("inventory", "Build CTI feature inventory");
  tpInventory->add_option("--openapi", openapiFile, "OpenAPI json file")
      ->required();
  tpInventory->add_option("--out", outputFile, "Output inventory json file");

  auto* tpGenerate =
      testPlan->add_subcommand("generate", "Generate a CTI test plan");
  tpGenerate->add_option("--openapi", openapiFile, "OpenAPI json file")
      ->required();
  tpGenerate->add_option("--feature", featureId, "Feature id")->required();
  tpGenerate->add_option("--out", outputFile, "Output test plan yaml file");

  auto* tpValidate =
      testPlan->add_subcommand("validate", "Validate a CTI test plan");
  tpValidate->add_option("-f,--file", file, "Test plan file")->required();

  auto* tpDryRun =
      testPlan->add_subcommand("dry-run", "Show CTI test plan steps");
  tpDryRun->add_option("-f,--file", file, "Test plan file")->required();

  auto* tpReport =
      testPlan->add_subcommand("report", "Replay a CTI test result file");
  tpReport->add_option("-f,--file", file, "Test result json file")->required();

  auto* tpFeedback =
      testPlan->add_subcommand("feedback", "Generate improvement feedback");
  tpFeedback->add_option("-f,--file", file, "Test result json file")->required();
  tpFeedback->add_option("--out", feedbackOutputFile,
                         "Output feedback markdown file");

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

    if (*tpInventory) {
      const auto text =
          loadgen::formatFeatureInventoryFromOpenApi(readTextFile(openapiFile));
      if (!outputFile.empty()) {
        writeTextFile(outputFile, text);
      } else {
        std::cout << text << '\n';
      }
      return 0;
    }

    if (*tpGenerate) {
      const auto text = loadgen::renderGeneratedTestPlanForFeature(
          readTextFile(openapiFile), featureId);
      if (!outputFile.empty()) {
        writeTextFile(outputFile, text);
      } else {
        std::cout << text;
      }
      return 0;
    }

    if (*tpValidate) {
      std::cout << loadgen::validateTestPlanYaml(readTextFile(file)) << '\n';
      return 0;
    }

    if (*tpDryRun) {
      std::cout << loadgen::formatTestPlanDryRunFromYaml(readTextFile(file))
                << '\n';
      return 0;
    }

    if (*tpReport) {
      const auto result = loadgen::readTestResult(file);
      std::cout << loadgen::renderTestResultMarkdown(result);
      return 0;
    }

    if (*tpFeedback) {
      const auto text = loadgen::renderFeedbackFromTestResultFile(file);
      if (!feedbackOutputFile.empty()) {
        writeTextFile(feedbackOutputFile, text);
      } else {
        std::cout << text;
      }
      return 0;
    }
  } catch (const std::exception& ex) {
    std::cerr << ex.what() << '\n';
    return 1;
  }

  return 0;
}
