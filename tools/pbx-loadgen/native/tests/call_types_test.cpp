#include <catch2/catch_test_macros.hpp>

#include "loadgen/call_types.hpp"

TEST_CASE("call result marks answered media path as success", "[call]") {
  loadgen::CallResult result;
  result.state = loadgen::CallState::MEDIA_ACTIVE;
  result.finalSipCode = 200;

  REQUIRE(loadgen::isSuccessful(result));
}

TEST_CASE("4xx maps to rejected_4xx", "[call]") {
  REQUIRE(loadgen::mapFailureCode(486) == loadgen::FailureCode::REJECTED_4XX);
}

TEST_CASE("6xx does not map to server_5xx", "[call]") {
  REQUIRE(loadgen::mapFailureCode(603) == loadgen::FailureCode::NONE);
}
