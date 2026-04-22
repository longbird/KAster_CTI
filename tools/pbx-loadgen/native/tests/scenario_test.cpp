#include <catch2/catch_test_macros.hpp>

#include <cstdlib>
#include <filesystem>
#include <string>

namespace {

int run_command(const std::string& command) {
  return std::system(command.c_str());
}

std::string quote_path(const std::filesystem::path& path) {
  return "\"" + path.string() + "\"";
}

}  // namespace

TEST_CASE("smoke: pbx-loadgen CLI rejects missing subcommand", "[smoke]") {
  const auto exe = std::filesystem::path{PBX_LOADGEN_EXE_PATH};
  const auto rc = run_command(quote_path(exe));

  REQUIRE(rc != 0);
}

TEST_CASE("smoke: pbx-loadgen validate accepts a scenario argument", "[smoke]") {
  const auto exe = std::filesystem::path{PBX_LOADGEN_EXE_PATH};
  const auto rc = run_command(quote_path(exe) + " validate -f smoke.yaml");

  REQUIRE(rc == 0);
}
