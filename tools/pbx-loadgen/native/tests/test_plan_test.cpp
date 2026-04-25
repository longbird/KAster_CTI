#include <catch2/catch_test_macros.hpp>
#include <catch2/matchers/catch_matchers_string.hpp>

#include <stdexcept>
#include <string>

#include "loadgen/test_plan.hpp"

TEST_CASE("test plan parser loads generated inbound plan", "[test-plan]") {
  const auto plan = loadgen::loadTestPlanFromString(R"(
id: calls.inbound.basic
title: Basic inbound call reaches CTI active call state
source:
  generatedFrom:
    - docs/openapi.json
    - apps/server/src/modules/calls/calls.controller.ts
  generatorVersion: 1
environment:
  apiBaseUrl: "${CTI_API_BASE_URL}"
  wsUrl: "${CTI_WS_URL}"
  accessToken: "${CTI_ACCESS_TOKEN}"
scenario:
  target:
    host: 49.247.46.86
    port: 36070
    transport: udp
    requestUriTemplate: "sip:{did}@49.247.46.86:36070"
  callFlow:
    callerIdPool: ["01011112222"]
    didPool: ["07052346380"]
steps:
  - type: inbound_call
    id: call-1
    answerTimeoutMs: 12000
    holdSeconds: 5
  - type: wait_ws_event
    event: call.updated
    timeoutMs: 10000
    expect:
      statusAnyOf: ["QUEUED", "RINGING_AGENT", "TALKING"]
  - type: assert_api
    method: GET
    path: /calls/active
    expect:
      containsDid: "07052346380"
  - type: assert_result
    expect:
      finalSipCode: 200
)");

  REQUIRE(plan.id == "calls.inbound.basic");
  REQUIRE(plan.source.generatedFrom.size() == 2);
  REQUIRE(plan.scenario.target.host == "49.247.46.86");
  REQUIRE(plan.scenario.callFlow.didPool.front() == "07052346380");
  REQUIRE(plan.steps.size() == 4);
  REQUIRE(plan.steps[0].type == "inbound_call");
  REQUIRE(plan.steps[1].event == "call.updated");
  REQUIRE(plan.steps[2].path == "/calls/active");
  REQUIRE(plan.steps[3].expectedFinalSipCode == 200);
}

TEST_CASE("test plan validation rejects missing executable steps", "[test-plan]") {
  REQUIRE_THROWS_WITH(
      loadgen::loadTestPlanFromString(R"(
id: calls.inbound.basic
title: Broken plan
source: { generatedFrom: ["docs/openapi.json"], generatorVersion: 1 }
environment: { apiBaseUrl: "${CTI_API_BASE_URL}", wsUrl: "${CTI_WS_URL}", accessToken: "${CTI_ACCESS_TOKEN}" }
scenario:
  target: { host: 49.247.46.86, port: 36070, transport: udp, requestUriTemplate: "sip:{did}@49.247.46.86:36070" }
  callFlow: { callerIdPool: ["01011112222"], didPool: ["07052346380"] }
steps: []
)"),
      "test plan calls.inbound.basic must contain at least one step");
}

TEST_CASE("test plan dry run describes steps without network access", "[test-plan]") {
  const auto plan = loadgen::loadTestPlanFromString(R"(
id: queues.summary.after-inbound
title: Queue summary reflects inbound call
source: { generatedFrom: ["docs/openapi.json"], generatorVersion: 1 }
environment: { apiBaseUrl: "${CTI_API_BASE_URL}", wsUrl: "${CTI_WS_URL}", accessToken: "${CTI_ACCESS_TOKEN}" }
scenario:
  target: { host: 49.247.46.86, port: 36070, transport: udp, requestUriTemplate: "sip:{did}@49.247.46.86:36070" }
  callFlow: { callerIdPool: ["01011112222"], didPool: ["07052346380"] }
steps:
  - { type: inbound_call, id: call-1, answerTimeoutMs: 12000, holdSeconds: 5 }
  - { type: assert_api, method: GET, path: /queues/summary }
)");

  const auto text = loadgen::formatTestPlanDryRun(plan);
  REQUIRE_THAT(text, Catch::Matchers::ContainsSubstring("plan=queues.summary.after-inbound"));
  REQUIRE_THAT(text, Catch::Matchers::ContainsSubstring("1. inbound_call id=call-1"));
  REQUIRE_THAT(text, Catch::Matchers::ContainsSubstring("2. assert_api GET /queues/summary"));
}
