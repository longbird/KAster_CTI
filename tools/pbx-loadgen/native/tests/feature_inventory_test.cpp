#include <catch2/catch_test_macros.hpp>
#include <catch2/matchers/catch_matchers_string.hpp>

#include <string>
#include <vector>

#include "loadgen/feature_inventory.hpp"

TEST_CASE("feature inventory extracts CTI features from OpenAPI paths", "[inventory]") {
  const std::string openapi = R"({
    "openapi": "3.0.0",
    "paths": {
      "/calls/active": { "get": {} },
      "/calls/{callId}/transfer": { "post": {} },
      "/queues/summary": { "get": {} },
      "/agents/{agentId}/status": { "post": {} },
      "/asterisk-config/blocklist": { "get": {}, "post": {} }
    }
  })";

  const auto inventory = loadgen::buildFeatureInventoryFromOpenApi(openapi);

  REQUIRE(loadgen::hasFeature(inventory, "calls.inbound.basic"));
  REQUIRE(loadgen::hasFeature(inventory, "calls.transfer.control"));
  REQUIRE(loadgen::hasFeature(inventory, "queues.summary.after-inbound"));
  REQUIRE(loadgen::hasFeature(inventory, "agents.status.api"));
  REQUIRE(loadgen::hasFeature(inventory, "asterisk-config.blocklist.api"));
}

TEST_CASE("changed paths map to generated feature ids", "[inventory]") {
  const std::vector<std::string> paths = {
      "apps/server/src/modules/calls/calls.controller.ts",
      "apps/server/src/modules/queues/queues.controller.ts",
      "apps/admin/src/pages/CustomersPage.tsx",
      "tools/pbx-loadgen/test-templates/inbound-basic.yaml"};

  const auto features = loadgen::mapChangedPathsToFeatureIds(paths);

  REQUIRE(features.count("calls.inbound.basic") == 1);
  REQUIRE(features.count("queues.summary.after-inbound") == 1);
  REQUIRE(features.count("admin.api-smoke") == 1);
  REQUIRE(features.count("templates.regenerate") == 1);
}

TEST_CASE("generated inbound plan is parseable test plan yaml", "[inventory]") {
  loadgen::FeatureDescriptor feature;
  feature.id = "calls.inbound.basic";
  feature.module = "calls";
  feature.kind = "inbound-call";
  feature.api = {"GET /calls/active"};
  feature.events = {"call.updated"};
  feature.requiresSipInbound = true;
  feature.templates = {"inbound-basic"};

  const auto yaml = loadgen::renderGeneratedTestPlan(feature);

  REQUIRE_THAT(yaml, Catch::Matchers::ContainsSubstring("id: calls.inbound.basic"));
  REQUIRE_THAT(yaml, Catch::Matchers::ContainsSubstring("type: inbound_call"));
  REQUIRE_THAT(yaml, Catch::Matchers::ContainsSubstring("event: call.updated"));
  REQUIRE_THAT(yaml, Catch::Matchers::ContainsSubstring("path: /calls/active"));
}
