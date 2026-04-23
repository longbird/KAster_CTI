#include <catch2/catch_test_macros.hpp>
#include <catch2/matchers/catch_matchers_string.hpp>

#include "loadgen/orchestrator.hpp"

TEST_CASE("orchestrator respects max concurrent and total calls", "[orchestrator]") {
  loadgen::RunPlan plan{10, 3, 5};
  const auto schedule = loadgen::buildRunSchedule(plan);

  REQUIRE(schedule.totalPlannedCalls == 5);
  REQUIRE(schedule.maxSimultaneousCalls <= 3);
}

TEST_CASE("orchestrator delays launches when concurrency is saturated", "[orchestrator]") {
  loadgen::RunPlan plan{10, 2, 5};
  const auto schedule = loadgen::buildRunSchedule(plan, 1000);

  REQUIRE(schedule.calls.size() == 5);
  REQUIRE(schedule.maxSimultaneousCalls == 2);
  REQUIRE(schedule.calls[0].startOffsetMs == 0);
  REQUIRE(schedule.calls[1].startOffsetMs == 100);
  REQUIRE(schedule.calls[2].startOffsetMs >= 1000);
  REQUIRE(schedule.calls[3].startOffsetMs >= 1100);
  REQUIRE(schedule.calls[4].startOffsetMs >= 2000);
}

TEST_CASE("orchestrator accepts scenario-derived shorter simulated durations", "[orchestrator]") {
  loadgen::RunPlan plan{10, 2, 5};
  const auto schedule = loadgen::buildRunSchedule(plan, 250);

  REQUIRE(schedule.calls[0].startOffsetMs == 0);
  REQUIRE(schedule.calls[1].startOffsetMs == 100);
  REQUIRE(schedule.calls[2].startOffsetMs == 250);
  REQUIRE(schedule.calls[3].startOffsetMs == 350);
}

TEST_CASE("orchestrator approximates non-divisible cps with cumulative division", "[orchestrator]") {
  loadgen::RunPlan plan{333, 10, 4};
  const auto schedule = loadgen::buildRunSchedule(plan, 1);

  REQUIRE(schedule.calls[0].startOffsetMs == 0);
  REQUIRE(schedule.calls[1].startOffsetMs == 3);
  REQUIRE(schedule.calls[2].startOffsetMs == 6);
  REQUIRE(schedule.calls[3].startOffsetMs == 9);
}

TEST_CASE("orchestrator rejects unsupported cps above microsecond resolution", "[orchestrator]") {
  loadgen::RunPlan plan{1001, 1, 1};

  REQUIRE_THROWS_WITH(
      loadgen::buildRunSchedule(plan),
      Catch::Matchers::ContainsSubstring("cps exceeds scheduler resolution"));
}
