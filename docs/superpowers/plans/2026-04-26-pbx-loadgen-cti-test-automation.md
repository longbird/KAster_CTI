# PBX Loadgen CTI Test Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `tools/pbx-loadgen` so it can automatically generate CTI feature test plans, execute them, aggregate results, and draft improvement requirements.

**Architecture:** Keep the existing SIP load scenario commands unchanged. Add a separate `test-plan` layer with focused modules for feature inventory, generated YAML plans, test-plan parsing, dry-run formatting, result writing, and rule-based feedback. The first implementation is offline-friendly by default and only touches live SIP/API/WS when `test-plan run` is invoked with required environment values.

**Tech Stack:** C++17, CMake, CLI11, yaml-cpp, nlohmann/json, Catch2, existing PJSIP-backed runner.

---

## File Structure

- Create `tools/pbx-loadgen/native/include/loadgen/feature_inventory.hpp`
  - Defines `FeatureDescriptor`, `FeatureInventory`, and inventory/generation functions.
- Create `tools/pbx-loadgen/native/src/feature_inventory.cpp`
  - Reads `docs/openapi.json`, applies deterministic route/module rules, maps changed paths to feature ids, and renders generated test-plan YAML.
- Create `tools/pbx-loadgen/native/include/loadgen/test_plan.hpp`
  - Defines `TestPlan`, `TestPlanStep`, environment/source/scenario subsets, parser, validator, and dry-run formatter.
- Create `tools/pbx-loadgen/native/src/test_plan.cpp`
  - Parses generated YAML, validates required step fields, and formats network-free execution summaries.
- Create `tools/pbx-loadgen/native/include/loadgen/test_result.hpp`
  - Defines step status/result structs and feedback/report APIs.
- Create `tools/pbx-loadgen/native/src/test_result.cpp`
  - Writes `test-result-*.json`, `test-result-*.md`, reads result JSON, and produces feedback Markdown.
- Modify `tools/pbx-loadgen/native/include/loadgen/command_logic.hpp`
  - Add command-facing helpers for test-plan inventory/generate/validate/dry-run/report/feedback.
- Modify `tools/pbx-loadgen/native/src/command_logic.cpp`
  - Implement test-plan command-facing helpers using the new modules.
- Modify `tools/pbx-loadgen/native/src/main.cpp`
  - Add `test-plan` subcommands without changing existing commands.
- Modify `tools/pbx-loadgen/native/CMakeLists.txt`
  - Add new static libraries and link them into `loadgen_command_logic` and CLI.
- Modify `tools/pbx-loadgen/native/tests/CMakeLists.txt`
  - Register tests for the new modules.
- Create `tools/pbx-loadgen/native/tests/feature_inventory_test.cpp`
- Create `tools/pbx-loadgen/native/tests/test_plan_test.cpp`
- Create `tools/pbx-loadgen/native/tests/test_result_test.cpp`
- Create `tools/pbx-loadgen/test-templates/README.md`
  - Documents the rule-based template strategy.
- Modify `tools/pbx-loadgen/README.md` and `tools/pbx-loadgen/docs/usage.md`
  - Document the new automation commands.

---

### Task 1: Add Test Plan Model and Parser

**Files:**
- Create: `tools/pbx-loadgen/native/include/loadgen/test_plan.hpp`
- Create: `tools/pbx-loadgen/native/src/test_plan.cpp`
- Test: `tools/pbx-loadgen/native/tests/test_plan_test.cpp`
- Modify: `tools/pbx-loadgen/native/CMakeLists.txt`
- Modify: `tools/pbx-loadgen/native/tests/CMakeLists.txt`

- [ ] **Step 1: Write the failing parser test**

Create `tools/pbx-loadgen/native/tests/test_plan_test.cpp`:

```cpp
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
cmake --build tools/pbx-loadgen/native/build --target pbx_loadgen_test_plan_tests
```

Expected: build fails because `loadgen/test_plan.hpp` and the CMake test target do not exist.

- [ ] **Step 3: Add the test plan header**

Create `tools/pbx-loadgen/native/include/loadgen/test_plan.hpp`:

```cpp
#pragma once

#include <string>
#include <vector>

namespace loadgen {

struct TestPlanSource {
  std::vector<std::string> generatedFrom;
  int generatorVersion{0};
};

struct TestPlanEnvironment {
  std::string apiBaseUrl;
  std::string wsUrl;
  std::string accessToken;
};

struct TestPlanTarget {
  std::string host;
  int port{0};
  std::string transport;
  std::string requestUriTemplate;
};

struct TestPlanCallFlow {
  std::vector<std::string> callerIdPool;
  std::vector<std::string> didPool;
};

struct TestPlanScenario {
  TestPlanTarget target;
  TestPlanCallFlow callFlow;
};

struct TestPlanStep {
  std::string type;
  std::string id;
  std::string callRef;
  std::string event;
  std::string method;
  std::string path;
  int timeoutMs{0};
  int answerTimeoutMs{0};
  int holdSeconds{0};
  int expectedFinalSipCode{0};
  std::vector<std::string> expectedStatusAnyOf;
  std::string expectedContainsDid;
};

struct TestPlan {
  std::string id;
  std::string title;
  TestPlanSource source;
  TestPlanEnvironment environment;
  TestPlanScenario scenario;
  std::vector<TestPlanStep> steps;
};

TestPlan loadTestPlanFromString(const std::string& yaml);
TestPlan loadTestPlanFromFile(const std::string& path);
void validateTestPlan(const TestPlan& plan);
std::string formatTestPlanDryRun(const TestPlan& plan);

}  // namespace loadgen
```

- [ ] **Step 4: Add the parser implementation**

Create `tools/pbx-loadgen/native/src/test_plan.cpp`:

```cpp
#include "loadgen/test_plan.hpp"

#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

#include <yaml-cpp/yaml.h>

namespace loadgen {
namespace {

YAML::Node requireNode(const YAML::Node& parent, const char* key) {
  const auto node = parent[key];
  if (!node) {
    throw std::runtime_error(std::string("missing required field: ") + key);
  }
  return node;
}

std::string requireString(const YAML::Node& parent, const char* key) {
  const auto node = requireNode(parent, key);
  const auto value = node.as<std::string>();
  if (value.empty()) {
    throw std::runtime_error(std::string(key) + " must not be empty");
  }
  return value;
}

int optionalInt(const YAML::Node& parent, const char* key, int fallback = 0) {
  const auto node = parent[key];
  return node ? node.as<int>() : fallback;
}

std::string optionalString(const YAML::Node& parent, const char* key) {
  const auto node = parent[key];
  return node ? node.as<std::string>() : std::string{};
}

std::vector<std::string> requireStringList(const YAML::Node& parent,
                                           const char* key) {
  const auto values = requireNode(parent, key).as<std::vector<std::string>>();
  if (values.empty()) {
    throw std::runtime_error(std::string(key) + " must not be empty");
  }
  return values;
}

std::vector<std::string> optionalStringList(const YAML::Node& parent,
                                            const char* key) {
  const auto node = parent[key];
  if (!node) {
    return {};
  }
  return node.as<std::vector<std::string>>();
}

TestPlanStep parseStep(const YAML::Node& node) {
  TestPlanStep step;
  step.type = requireString(node, "type");
  step.id = optionalString(node, "id");
  step.callRef = optionalString(node, "callRef");
  step.event = optionalString(node, "event");
  step.method = optionalString(node, "method");
  step.path = optionalString(node, "path");
  step.timeoutMs = optionalInt(node, "timeoutMs");
  step.answerTimeoutMs = optionalInt(node, "answerTimeoutMs");
  step.holdSeconds = optionalInt(node, "holdSeconds");

  const auto expect = node["expect"];
  if (expect) {
    step.expectedFinalSipCode = optionalInt(expect, "finalSipCode");
    step.expectedStatusAnyOf = optionalStringList(expect, "statusAnyOf");
    step.expectedContainsDid = optionalString(expect, "containsDid");
  }
  return step;
}

std::string describeStep(const TestPlanStep& step) {
  if (step.type == "inbound_call") {
    return "inbound_call id=" + step.id;
  }
  if (step.type == "assert_api") {
    return "assert_api " + step.method + " " + step.path;
  }
  if (step.type == "wait_ws_event") {
    return "wait_ws_event " + step.event;
  }
  if (step.type == "assert_result") {
    return "assert_result finalSipCode=" +
           std::to_string(step.expectedFinalSipCode);
  }
  if (step.type == "hangup") {
    return "hangup callRef=" + step.callRef;
  }
  if (step.type == "wait") {
    return "wait timeoutMs=" + std::to_string(step.timeoutMs);
  }
  return step.type;
}

}  // namespace

TestPlan loadTestPlanFromString(const std::string& yaml) {
  const auto root = YAML::Load(yaml);
  const auto source = requireNode(root, "source");
  const auto environment = requireNode(root, "environment");
  const auto scenario = requireNode(root, "scenario");
  const auto target = requireNode(scenario, "target");
  const auto callFlow = requireNode(scenario, "callFlow");

  TestPlan plan;
  plan.id = requireString(root, "id");
  plan.title = requireString(root, "title");
  plan.source.generatedFrom = requireStringList(source, "generatedFrom");
  plan.source.generatorVersion = requireNode(source, "generatorVersion").as<int>();
  plan.environment.apiBaseUrl = requireString(environment, "apiBaseUrl");
  plan.environment.wsUrl = requireString(environment, "wsUrl");
  plan.environment.accessToken = requireString(environment, "accessToken");
  plan.scenario.target.host = requireString(target, "host");
  plan.scenario.target.port = requireNode(target, "port").as<int>();
  plan.scenario.target.transport = requireString(target, "transport");
  plan.scenario.target.requestUriTemplate =
      requireString(target, "requestUriTemplate");
  plan.scenario.callFlow.callerIdPool =
      requireStringList(callFlow, "callerIdPool");
  plan.scenario.callFlow.didPool = requireStringList(callFlow, "didPool");

  const auto steps = requireNode(root, "steps");
  for (const auto& stepNode : steps) {
    plan.steps.push_back(parseStep(stepNode));
  }

  validateTestPlan(plan);
  return plan;
}

TestPlan loadTestPlanFromFile(const std::string& path) {
  return loadTestPlanFromString(YAML::LoadFile(path).as<std::string>());
}

void validateTestPlan(const TestPlan& plan) {
  if (plan.id.empty()) {
    throw std::runtime_error("test plan id must not be empty");
  }
  if (plan.steps.empty()) {
    throw std::runtime_error("test plan " + plan.id +
                             " must contain at least one step");
  }
  if (plan.scenario.target.port <= 0 || plan.scenario.target.port > 65535) {
    throw std::runtime_error("test plan " + plan.id +
                             " target.port must be between 1 and 65535");
  }
  for (const auto& step : plan.steps) {
    if (step.type == "inbound_call" && step.id.empty()) {
      throw std::runtime_error("inbound_call step requires id");
    }
    if (step.type == "assert_api" &&
        (step.method.empty() || step.path.empty())) {
      throw std::runtime_error("assert_api step requires method and path");
    }
    if (step.type == "wait_ws_event" && step.event.empty()) {
      throw std::runtime_error("wait_ws_event step requires event");
    }
  }
}

std::string formatTestPlanDryRun(const TestPlan& plan) {
  std::ostringstream stream;
  stream << "plan=" << plan.id << " title=" << plan.title
         << " steps=" << plan.steps.size();
  for (std::size_t i = 0; i < plan.steps.size(); ++i) {
    stream << "\n" << (i + 1) << ". " << describeStep(plan.steps[i]);
  }
  return stream.str();
}

}  // namespace loadgen
```

- [ ] **Step 5: Fix file loading implementation before running**

Replace `loadTestPlanFromFile` in `tools/pbx-loadgen/native/src/test_plan.cpp` with an implementation that reads file bytes directly:

```cpp
#include <fstream>
```

Add the include near the top, then replace the function:

```cpp
TestPlan loadTestPlanFromFile(const std::string& path) {
  std::ifstream file(path);
  if (!file) {
    throw std::runtime_error("unable to open test plan file");
  }
  std::stringstream buffer;
  buffer << file.rdbuf();
  return loadTestPlanFromString(buffer.str());
}
```

- [ ] **Step 6: Wire CMake target and test executable**

Modify `tools/pbx-loadgen/native/CMakeLists.txt` after `loadgen_scenario`:

```cmake
add_library(loadgen_test_plan STATIC src/test_plan.cpp)
target_link_libraries(loadgen_test_plan PUBLIC yaml-cpp)
target_include_directories(loadgen_test_plan PUBLIC include)
```

Modify `tools/pbx-loadgen/native/tests/CMakeLists.txt` after the scenario tests:

```cmake
add_executable(pbx_loadgen_test_plan_tests test_plan_test.cpp)
target_link_libraries(
  pbx_loadgen_test_plan_tests
  PRIVATE
    Catch2::Catch2WithMain
    loadgen_test_plan
)
target_include_directories(pbx_loadgen_test_plan_tests PRIVATE ../include)

catch_discover_tests(pbx_loadgen_test_plan_tests)
```

- [ ] **Step 7: Run the new parser tests**

Run:

```powershell
cmake --build tools/pbx-loadgen/native/build --target pbx_loadgen_test_plan_tests
ctest --test-dir tools/pbx-loadgen/native/build -R pbx_loadgen_test_plan_tests --output-on-failure
```

Expected: all `test-plan` parser tests pass.

- [ ] **Step 8: Commit**

Run:

```powershell
git add -- tools/pbx-loadgen/native/include/loadgen/test_plan.hpp tools/pbx-loadgen/native/src/test_plan.cpp tools/pbx-loadgen/native/tests/test_plan_test.cpp tools/pbx-loadgen/native/CMakeLists.txt tools/pbx-loadgen/native/tests/CMakeLists.txt
git commit -m "Add pbx loadgen test plan parser"
```

---

### Task 2: Add Feature Inventory and Plan Generation

**Files:**
- Create: `tools/pbx-loadgen/native/include/loadgen/feature_inventory.hpp`
- Create: `tools/pbx-loadgen/native/src/feature_inventory.cpp`
- Test: `tools/pbx-loadgen/native/tests/feature_inventory_test.cpp`
- Modify: `tools/pbx-loadgen/native/CMakeLists.txt`
- Modify: `tools/pbx-loadgen/native/tests/CMakeLists.txt`

- [ ] **Step 1: Write failing inventory tests**

Create `tools/pbx-loadgen/native/tests/feature_inventory_test.cpp`:

```cpp
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
cmake --build tools/pbx-loadgen/native/build --target pbx_loadgen_feature_inventory_tests
```

Expected: build fails because feature inventory files and target do not exist.

- [ ] **Step 3: Add the inventory header**

Create `tools/pbx-loadgen/native/include/loadgen/feature_inventory.hpp`:

```cpp
#pragma once

#include <set>
#include <string>
#include <vector>

namespace loadgen {

struct FeatureDescriptor {
  std::string id;
  std::string module;
  std::string kind;
  std::vector<std::string> api;
  std::vector<std::string> events;
  bool requiresSipInbound{false};
  std::vector<std::string> templates;
};

struct FeatureInventory {
  std::vector<FeatureDescriptor> features;
};

FeatureInventory buildFeatureInventoryFromOpenApi(const std::string& openapiJson);
FeatureInventory loadFeatureInventoryFromOpenApiFile(const std::string& path);
bool hasFeature(const FeatureInventory& inventory, const std::string& featureId);
std::set<std::string> mapChangedPathsToFeatureIds(const std::vector<std::string>& paths);
std::string renderFeatureInventoryJson(const FeatureInventory& inventory);
std::string renderGeneratedTestPlan(const FeatureDescriptor& feature);

}  // namespace loadgen
```

- [ ] **Step 4: Implement deterministic inventory rules**

Create `tools/pbx-loadgen/native/src/feature_inventory.cpp`:

```cpp
#include "loadgen/feature_inventory.hpp"

#include <algorithm>
#include <fstream>
#include <set>
#include <sstream>
#include <stdexcept>
#include <string>

#include <nlohmann/json.hpp>

namespace loadgen {
namespace {

bool contains(const std::string& text, const std::string& needle) {
  return text.find(needle) != std::string::npos;
}

void addFeatureOnce(FeatureInventory& inventory, FeatureDescriptor feature) {
  if (hasFeature(inventory, feature.id)) {
    return;
  }
  inventory.features.push_back(std::move(feature));
}

std::string jsonArray(const std::vector<std::string>& values) {
  nlohmann::json array = nlohmann::json::array();
  for (const auto& value : values) {
    array.push_back(value);
  }
  return array.dump();
}

std::string defaultTitleFor(const FeatureDescriptor& feature) {
  if (feature.id == "calls.inbound.basic") {
    return "Basic inbound call reaches CTI active call state";
  }
  if (feature.id == "queues.summary.after-inbound") {
    return "Queue summary reflects inbound call";
  }
  if (feature.id == "calls.transfer.control") {
    return "Call transfer API accepts active call transfer";
  }
  if (feature.id == "agents.status.api") {
    return "Agent status API updates state";
  }
  if (feature.id == "asterisk-config.blocklist.api") {
    return "Blocklist API remains available";
  }
  return "Generated CTI feature smoke test";
}

std::string firstApiPath(const FeatureDescriptor& feature,
                         const std::string& fallback) {
  if (feature.api.empty()) {
    return fallback;
  }
  const auto api = feature.api.front();
  const auto space = api.find(' ');
  return space == std::string::npos ? api : api.substr(space + 1);
}

}  // namespace

FeatureInventory buildFeatureInventoryFromOpenApi(const std::string& openapiJson) {
  const auto doc = nlohmann::json::parse(openapiJson);
  const auto paths = doc.at("paths");
  FeatureInventory inventory;

  for (auto it = paths.begin(); it != paths.end(); ++it) {
    const auto path = it.key();
    if (contains(path, "/calls/active")) {
      addFeatureOnce(inventory,
                     {"calls.inbound.basic",
                      "calls",
                      "inbound-call",
                      {"GET /calls/active"},
                      {"call.updated"},
                      true,
                      {"inbound-basic"}});
    }
    if (contains(path, "/calls/") && contains(path, "/transfer")) {
      addFeatureOnce(inventory,
                     {"calls.transfer.control",
                      "calls",
                      "api-control",
                      {"POST " + path},
                      {"call.updated"},
                      true,
                      {"transfer-control"}});
    }
    if (contains(path, "/queues/summary")) {
      addFeatureOnce(inventory,
                     {"queues.summary.after-inbound",
                      "queues",
                      "api-assertion",
                      {"GET /queues/summary"},
                      {},
                      true,
                      {"queue-summary"}});
    }
    if (contains(path, "/agents/") && contains(path, "/status")) {
      addFeatureOnce(inventory,
                     {"agents.status.api",
                      "agents",
                      "api-assertion",
                      {"POST " + path},
                      {},
                      false,
                      {"agent-status"}});
    }
    if (contains(path, "/asterisk-config/blocklist")) {
      addFeatureOnce(inventory,
                     {"asterisk-config.blocklist.api",
                      "asterisk-config",
                      "api-assertion",
                      {"GET /asterisk-config/blocklist"},
                      {},
                      false,
                      {"blocklist-api"}});
    }
  }

  return inventory;
}

FeatureInventory loadFeatureInventoryFromOpenApiFile(const std::string& path) {
  std::ifstream file(path);
  if (!file) {
    throw std::runtime_error("unable to open OpenAPI file");
  }
  std::stringstream buffer;
  buffer << file.rdbuf();
  return buildFeatureInventoryFromOpenApi(buffer.str());
}

bool hasFeature(const FeatureInventory& inventory, const std::string& featureId) {
  return std::any_of(inventory.features.begin(),
                     inventory.features.end(),
                     [&](const FeatureDescriptor& feature) {
                       return feature.id == featureId;
                     });
}

std::set<std::string> mapChangedPathsToFeatureIds(const std::vector<std::string>& paths) {
  std::set<std::string> features;
  for (const auto& path : paths) {
    if (contains(path, "apps/server/src/modules/calls/")) {
      features.insert("calls.inbound.basic");
    }
    if (contains(path, "apps/server/src/modules/queues/")) {
      features.insert("queues.summary.after-inbound");
    }
    if (contains(path, "apps/server/src/modules/agents/")) {
      features.insert("agents.status.api");
    }
    if (contains(path, "apps/server/src/modules/asterisk-config/")) {
      features.insert("asterisk-config.blocklist.api");
    }
    if (contains(path, "apps/admin/src/")) {
      features.insert("admin.api-smoke");
    }
    if (contains(path, "tools/pbx-loadgen/test-templates/")) {
      features.insert("templates.regenerate");
    }
  }
  return features;
}

std::string renderFeatureInventoryJson(const FeatureInventory& inventory) {
  nlohmann::json doc;
  doc["features"] = nlohmann::json::array();
  for (const auto& feature : inventory.features) {
    doc["features"].push_back({
        {"id", feature.id},
        {"module", feature.module},
        {"kind", feature.kind},
        {"api", feature.api},
        {"events", feature.events},
        {"requiresSipInbound", feature.requiresSipInbound},
        {"templates", feature.templates},
    });
  }
  return doc.dump(2);
}

std::string renderGeneratedTestPlan(const FeatureDescriptor& feature) {
  std::ostringstream stream;
  stream << "id: " << feature.id << "\n";
  stream << "title: " << defaultTitleFor(feature) << "\n";
  stream << "source:\n";
  stream << "  generatedFrom:\n";
  stream << "    - docs/openapi.json\n";
  stream << "  generatorVersion: 1\n";
  stream << "environment:\n";
  stream << "  apiBaseUrl: \"${CTI_API_BASE_URL}\"\n";
  stream << "  wsUrl: \"${CTI_WS_URL}\"\n";
  stream << "  accessToken: \"${CTI_ACCESS_TOKEN}\"\n";
  stream << "scenario:\n";
  stream << "  target:\n";
  stream << "    host: 49.247.46.86\n";
  stream << "    port: 36070\n";
  stream << "    transport: udp\n";
  stream << "    requestUriTemplate: \"sip:{did}@49.247.46.86:36070\"\n";
  stream << "  callFlow:\n";
  stream << "    callerIdPool: [\"01011112222\"]\n";
  stream << "    didPool: [\"07052346380\"]\n";
  stream << "steps:\n";
  if (feature.requiresSipInbound) {
    stream << "  - type: inbound_call\n";
    stream << "    id: call-1\n";
    stream << "    answerTimeoutMs: 12000\n";
    stream << "    holdSeconds: 5\n";
  }
  if (!feature.events.empty()) {
    stream << "  - type: wait_ws_event\n";
    stream << "    event: " << feature.events.front() << "\n";
    stream << "    timeoutMs: 10000\n";
  }
  stream << "  - type: assert_api\n";
  stream << "    method: GET\n";
  stream << "    path: " << firstApiPath(feature, "/health") << "\n";
  if (feature.requiresSipInbound) {
    stream << "    expect:\n";
    stream << "      containsDid: \"07052346380\"\n";
  }
  if (feature.requiresSipInbound) {
    stream << "  - type: assert_result\n";
    stream << "    expect:\n";
    stream << "      finalSipCode: 200\n";
  }
  return stream.str();
}

}  // namespace loadgen
```

- [ ] **Step 5: Wire CMake**

Modify `tools/pbx-loadgen/native/CMakeLists.txt` after `loadgen_report_writer`:

```cmake
add_library(loadgen_feature_inventory STATIC src/feature_inventory.cpp)
target_link_libraries(loadgen_feature_inventory PUBLIC nlohmann_json::nlohmann_json)
target_include_directories(loadgen_feature_inventory PUBLIC include)
```

Modify `tools/pbx-loadgen/native/tests/CMakeLists.txt` after test-plan tests:

```cmake
add_executable(pbx_loadgen_feature_inventory_tests feature_inventory_test.cpp)
target_link_libraries(
  pbx_loadgen_feature_inventory_tests
  PRIVATE
    Catch2::Catch2WithMain
    loadgen_feature_inventory
)
target_include_directories(pbx_loadgen_feature_inventory_tests PRIVATE ../include)

catch_discover_tests(pbx_loadgen_feature_inventory_tests)
```

- [ ] **Step 6: Run inventory tests**

Run:

```powershell
cmake --build tools/pbx-loadgen/native/build --target pbx_loadgen_feature_inventory_tests
ctest --test-dir tools/pbx-loadgen/native/build -R pbx_loadgen_feature_inventory_tests --output-on-failure
```

Expected: all feature inventory tests pass.

- [ ] **Step 7: Commit**

Run:

```powershell
git add -- tools/pbx-loadgen/native/include/loadgen/feature_inventory.hpp tools/pbx-loadgen/native/src/feature_inventory.cpp tools/pbx-loadgen/native/tests/feature_inventory_test.cpp tools/pbx-loadgen/native/CMakeLists.txt tools/pbx-loadgen/native/tests/CMakeLists.txt
git commit -m "Add CTI feature inventory generation"
```

---

### Task 3: Add Test Result Reports and Feedback Generation

**Files:**
- Create: `tools/pbx-loadgen/native/include/loadgen/test_result.hpp`
- Create: `tools/pbx-loadgen/native/src/test_result.cpp`
- Test: `tools/pbx-loadgen/native/tests/test_result_test.cpp`
- Modify: `tools/pbx-loadgen/native/CMakeLists.txt`
- Modify: `tools/pbx-loadgen/native/tests/CMakeLists.txt`

- [ ] **Step 1: Write failing result and feedback tests**

Create `tools/pbx-loadgen/native/tests/test_result_test.cpp`:

```cpp
#include <catch2/catch_test_macros.hpp>
#include <catch2/matchers/catch_matchers_string.hpp>

#include <filesystem>
#include <fstream>
#include <string>

#include "loadgen/test_result.hpp"

TEST_CASE("test result writer emits json and markdown", "[test-result]") {
  const auto outputDir =
      (std::filesystem::temp_directory_path() / "pbx-loadgen-test-result").string();
  std::filesystem::remove_all(outputDir);

  loadgen::TestExecutionResult result;
  result.planId = "calls.inbound.basic";
  result.title = "Basic inbound call reaches CTI active call state";
  result.status = "FAIL";
  result.steps.push_back({"inbound_call", "PASS", "", "SIP 200"});
  result.steps.push_back({"wait_ws_event", "FAIL", "WS_TIMEOUT", "call.updated missing"});

  const auto artifacts = loadgen::writeTestResult(result, outputDir);

  REQUIRE(std::filesystem::exists(artifacts.jsonPath));
  REQUIRE(std::filesystem::exists(artifacts.markdownPath));

  const auto replayed = loadgen::readTestResult(artifacts.jsonPath);
  REQUIRE(replayed.planId == "calls.inbound.basic");
  REQUIRE(replayed.status == "FAIL");
  REQUIRE(replayed.steps.size() == 2);
}

TEST_CASE("feedback generator turns ws timeout into improvement requirement", "[test-result]") {
  loadgen::TestExecutionResult result;
  result.planId = "calls.inbound.basic";
  result.title = "Basic inbound call reaches CTI active call state";
  result.status = "FAIL";
  result.steps.push_back({"inbound_call", "PASS", "", "SIP 200"});
  result.steps.push_back({"wait_ws_event", "FAIL", "WS_TIMEOUT", "call.updated missing"});

  const auto feedback = loadgen::renderFeedbackMarkdown(result);

  REQUIRE_THAT(feedback, Catch::Matchers::ContainsSubstring("# Improvement Requirements: calls.inbound.basic"));
  REQUIRE_THAT(feedback, Catch::Matchers::ContainsSubstring("CTI did not emit the expected WebSocket event"));
  REQUIRE_THAT(feedback, Catch::Matchers::ContainsSubstring("AMI normalization, event outbox, and WS broadcast path"));
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
cmake --build tools/pbx-loadgen/native/build --target pbx_loadgen_test_result_tests
```

Expected: build fails because result files and CMake target do not exist.

- [ ] **Step 3: Add result header**

Create `tools/pbx-loadgen/native/include/loadgen/test_result.hpp`:

```cpp
#pragma once

#include <string>
#include <vector>

namespace loadgen {

struct TestStepResult {
  std::string stepType;
  std::string status;
  std::string failureCode;
  std::string observation;
};

struct TestExecutionResult {
  std::string planId;
  std::string title;
  std::string status;
  std::vector<TestStepResult> steps;
};

struct TestResultArtifacts {
  std::string jsonPath;
  std::string markdownPath;
};

TestResultArtifacts writeTestResult(const TestExecutionResult& result,
                                    const std::string& outputDir);
TestExecutionResult readTestResult(const std::string& jsonPath);
std::string renderTestResultMarkdown(const TestExecutionResult& result);
std::string renderFeedbackMarkdown(const TestExecutionResult& result);

}  // namespace loadgen
```

- [ ] **Step 4: Implement result writer and feedback**

Create `tools/pbx-loadgen/native/src/test_result.cpp`:

```cpp
#include "loadgen/test_result.hpp"

#include <atomic>
#include <chrono>
#include <filesystem>
#include <fstream>
#include <sstream>
#include <stdexcept>

#if defined(_WIN32)
#include <process.h>
#else
#include <unistd.h>
#endif

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
  std::ostringstream stream;
  stream << ticks << "-" << currentProcessId() << "-"
         << counter.fetch_add(1, std::memory_order_relaxed);
  return stream.str();
}

void ensureWritable(const std::ios& stream, const char* message) {
  if (!stream) {
    throw std::runtime_error(message);
  }
}

}  // namespace

TestResultArtifacts writeTestResult(const TestExecutionResult& result,
                                    const std::string& outputDir) {
  std::filesystem::create_directories(outputDir);
  const auto suffix = nextRunSuffix();
  const auto jsonPath =
      (std::filesystem::path(outputDir) / ("test-result-" + suffix + ".json")).string();
  const auto markdownPath =
      (std::filesystem::path(outputDir) / ("test-result-" + suffix + ".md")).string();

  nlohmann::json doc;
  doc["planId"] = result.planId;
  doc["title"] = result.title;
  doc["status"] = result.status;
  doc["steps"] = nlohmann::json::array();
  for (const auto& step : result.steps) {
    doc["steps"].push_back({
        {"stepType", step.stepType},
        {"status", step.status},
        {"failureCode", step.failureCode},
        {"observation", step.observation},
    });
  }

  std::ofstream jsonFile(jsonPath, std::ios::trunc);
  ensureWritable(jsonFile, "unable to open test result json for writing");
  jsonFile << doc.dump(2);
  jsonFile.flush();
  ensureWritable(jsonFile, "unable to write test result json");

  std::ofstream markdownFile(markdownPath, std::ios::trunc);
  ensureWritable(markdownFile, "unable to open test result markdown for writing");
  markdownFile << renderTestResultMarkdown(result);
  markdownFile.flush();
  ensureWritable(markdownFile, "unable to write test result markdown");

  return {jsonPath, markdownPath};
}

TestExecutionResult readTestResult(const std::string& jsonPath) {
  std::ifstream file(jsonPath);
  if (!file) {
    throw std::runtime_error("unable to open test result json");
  }
  nlohmann::json doc;
  file >> doc;

  TestExecutionResult result;
  result.planId = doc.at("planId").get<std::string>();
  result.title = doc.at("title").get<std::string>();
  result.status = doc.at("status").get<std::string>();
  for (const auto& stepDoc : doc.at("steps")) {
    result.steps.push_back({stepDoc.at("stepType").get<std::string>(),
                            stepDoc.at("status").get<std::string>(),
                            stepDoc.at("failureCode").get<std::string>(),
                            stepDoc.at("observation").get<std::string>()});
  }
  return result;
}

std::string renderTestResultMarkdown(const TestExecutionResult& result) {
  std::ostringstream stream;
  stream << "# Test Result: " << result.planId << "\n\n";
  stream << "- Title: " << result.title << "\n";
  stream << "- Status: " << result.status << "\n\n";
  stream << "| Step | Status | Failure | Observation |\n";
  stream << "| --- | --- | --- | --- |\n";
  for (const auto& step : result.steps) {
    stream << "| " << step.stepType << " | " << step.status << " | "
           << step.failureCode << " | " << step.observation << " |\n";
  }
  return stream.str();
}

std::string renderFeedbackMarkdown(const TestExecutionResult& result) {
  std::ostringstream stream;
  stream << "# Improvement Requirements: " << result.planId << "\n\n";
  stream << "## Summary\n\n";
  stream << "Automated test `" << result.planId << "` finished with status `"
         << result.status << "`.\n\n";
  stream << "## Requirements\n\n";

  bool wroteRequirement = false;
  for (const auto& step : result.steps) {
    if (step.status != "FAIL") {
      continue;
    }
    wroteRequirement = true;
    if (step.failureCode == "WS_TIMEOUT") {
      stream << "- CTI did not emit the expected WebSocket event after the SIP path succeeded. "
             << "Investigate AMI normalization, event outbox, and WS broadcast path.\n";
    } else if (step.failureCode == "API_ASSERT_FAILED") {
      stream << "- CTI API response did not match the expected state. Investigate query filters, "
             << "tenant scoping, and delayed state transitions.\n";
    } else if (step.failureCode == "SIP_FAILED") {
      stream << "- SIP inbound call did not complete successfully. Investigate trunk routing, "
             << "DID mapping, and Asterisk endpoint identification.\n";
    } else {
      stream << "- Step `" << step.stepType << "` failed with `" << step.failureCode
             << "`. Observation: " << step.observation << "\n";
    }
  }

  if (!wroteRequirement) {
    stream << "- No improvement requirement generated because no failed step was found.\n";
  }
  return stream.str();
}

}  // namespace loadgen
```

- [ ] **Step 5: Wire CMake**

Modify `tools/pbx-loadgen/native/CMakeLists.txt` after `loadgen_report_writer`:

```cmake
add_library(loadgen_test_result STATIC src/test_result.cpp)
target_link_libraries(loadgen_test_result PUBLIC nlohmann_json::nlohmann_json)
target_include_directories(loadgen_test_result PUBLIC include)
```

Modify `tools/pbx-loadgen/native/tests/CMakeLists.txt` after inventory tests:

```cmake
add_executable(pbx_loadgen_test_result_tests test_result_test.cpp)
target_link_libraries(
  pbx_loadgen_test_result_tests
  PRIVATE
    Catch2::Catch2WithMain
    loadgen_test_result
)
target_include_directories(pbx_loadgen_test_result_tests PRIVATE ../include)

catch_discover_tests(pbx_loadgen_test_result_tests)
```

- [ ] **Step 6: Run result tests**

Run:

```powershell
cmake --build tools/pbx-loadgen/native/build --target pbx_loadgen_test_result_tests
ctest --test-dir tools/pbx-loadgen/native/build -R pbx_loadgen_test_result_tests --output-on-failure
```

Expected: all result and feedback tests pass.

- [ ] **Step 7: Commit**

Run:

```powershell
git add -- tools/pbx-loadgen/native/include/loadgen/test_result.hpp tools/pbx-loadgen/native/src/test_result.cpp tools/pbx-loadgen/native/tests/test_result_test.cpp tools/pbx-loadgen/native/CMakeLists.txt tools/pbx-loadgen/native/tests/CMakeLists.txt
git commit -m "Add CTI test result feedback generation"
```

---

### Task 4: Add Command Logic Helpers

**Files:**
- Modify: `tools/pbx-loadgen/native/include/loadgen/command_logic.hpp`
- Modify: `tools/pbx-loadgen/native/src/command_logic.cpp`
- Test: `tools/pbx-loadgen/native/tests/command_logic_test.cpp`
- Modify: `tools/pbx-loadgen/native/CMakeLists.txt`

- [ ] **Step 1: Add failing command logic tests**

Append to `tools/pbx-loadgen/native/tests/command_logic_test.cpp`:

```cpp
TEST_CASE("test plan command logic formats generated inventory", "[command]") {
  const std::string openapi = R"({
    "openapi": "3.0.0",
    "paths": {
      "/calls/active": { "get": {} },
      "/queues/summary": { "get": {} }
    }
  })";

  const auto text = loadgen::formatFeatureInventoryFromOpenApi(openapi);

  REQUIRE_THAT(text, Catch::Matchers::ContainsSubstring("\"id\": \"calls.inbound.basic\""));
  REQUIRE_THAT(text, Catch::Matchers::ContainsSubstring("\"id\": \"queues.summary.after-inbound\""));
}

TEST_CASE("test plan command logic validates and dry-runs yaml", "[command]") {
  const std::string yaml = R"(
id: calls.inbound.basic
title: Basic inbound call reaches CTI active call state
source: { generatedFrom: ["docs/openapi.json"], generatorVersion: 1 }
environment: { apiBaseUrl: "${CTI_API_BASE_URL}", wsUrl: "${CTI_WS_URL}", accessToken: "${CTI_ACCESS_TOKEN}" }
scenario:
  target: { host: 49.247.46.86, port: 36070, transport: udp, requestUriTemplate: "sip:{did}@49.247.46.86:36070" }
  callFlow: { callerIdPool: ["01011112222"], didPool: ["07052346380"] }
steps:
  - { type: inbound_call, id: call-1, answerTimeoutMs: 12000, holdSeconds: 5 }
  - { type: assert_result, expect: { finalSipCode: 200 } }
)";

  REQUIRE(loadgen::validateTestPlanYaml(yaml) == "test plan ok: calls.inbound.basic steps=2");
  REQUIRE_THAT(loadgen::formatTestPlanDryRunFromYaml(yaml),
               Catch::Matchers::ContainsSubstring("1. inbound_call id=call-1"));
}
```

- [ ] **Step 2: Run command logic test to verify it fails**

Run:

```powershell
cmake --build tools/pbx-loadgen/native/build --target pbx_loadgen_command_logic_tests
ctest --test-dir tools/pbx-loadgen/native/build -R pbx_loadgen_command_logic_tests --output-on-failure
```

Expected: build fails because the new helper functions do not exist.

- [ ] **Step 3: Add command helper declarations**

Modify `tools/pbx-loadgen/native/include/loadgen/command_logic.hpp` by adding these declarations:

```cpp
std::string formatFeatureInventoryFromOpenApi(const std::string& openapiJson);
std::string validateTestPlanYaml(const std::string& yaml);
std::string formatTestPlanDryRunFromYaml(const std::string& yaml);
std::string renderGeneratedTestPlanForFeature(const std::string& openapiJson,
                                              const std::string& featureId);
std::string renderFeedbackFromTestResultFile(const std::string& resultJsonPath);
```

- [ ] **Step 4: Implement command helpers**

Modify `tools/pbx-loadgen/native/src/command_logic.cpp` includes:

```cpp
#include "loadgen/feature_inventory.hpp"
#include "loadgen/test_plan.hpp"
#include "loadgen/test_result.hpp"
```

Add implementations near the bottom before the namespace closing brace:

```cpp
std::string formatFeatureInventoryFromOpenApi(const std::string& openapiJson) {
  return renderFeatureInventoryJson(buildFeatureInventoryFromOpenApi(openapiJson));
}

std::string validateTestPlanYaml(const std::string& yaml) {
  const auto plan = loadTestPlanFromString(yaml);
  return "test plan ok: " + plan.id + " steps=" +
         std::to_string(plan.steps.size());
}

std::string formatTestPlanDryRunFromYaml(const std::string& yaml) {
  return formatTestPlanDryRun(loadTestPlanFromString(yaml));
}

std::string renderGeneratedTestPlanForFeature(const std::string& openapiJson,
                                              const std::string& featureId) {
  const auto inventory = buildFeatureInventoryFromOpenApi(openapiJson);
  for (const auto& feature : inventory.features) {
    if (feature.id == featureId) {
      return renderGeneratedTestPlan(feature);
    }
  }
  throw std::runtime_error("feature not found: " + featureId);
}

std::string renderFeedbackFromTestResultFile(const std::string& resultJsonPath) {
  return renderFeedbackMarkdown(readTestResult(resultJsonPath));
}
```

- [ ] **Step 5: Link new libraries into command logic**

Modify `tools/pbx-loadgen/native/CMakeLists.txt` in `target_link_libraries(loadgen_command_logic PUBLIC ...)`:

```cmake
    loadgen_feature_inventory
    loadgen_test_plan
    loadgen_test_result
```

- [ ] **Step 6: Run command logic tests**

Run:

```powershell
cmake --build tools/pbx-loadgen/native/build --target pbx_loadgen_command_logic_tests
ctest --test-dir tools/pbx-loadgen/native/build -R pbx_loadgen_command_logic_tests --output-on-failure
```

Expected: command logic tests pass.

- [ ] **Step 7: Commit**

Run:

```powershell
git add -- tools/pbx-loadgen/native/include/loadgen/command_logic.hpp tools/pbx-loadgen/native/src/command_logic.cpp tools/pbx-loadgen/native/tests/command_logic_test.cpp tools/pbx-loadgen/native/CMakeLists.txt
git commit -m "Add CTI test plan command helpers"
```

---

### Task 5: Wire CLI `test-plan` Commands

**Files:**
- Modify: `tools/pbx-loadgen/native/src/main.cpp`
- Test: `tools/pbx-loadgen/native/tests/scenario_test.cpp`

- [ ] **Step 1: Add failing CLI smoke tests**

Append to `tools/pbx-loadgen/native/tests/scenario_test.cpp` inside `#if defined(PBX_LOADGEN_HAS_CLI)`:

```cpp
TEST_CASE("test-plan command rejects a missing test plan file", "[scenario]") {
  REQUIRE(run_cli({"test-plan", "validate", "-f", missing_path().string()}) != 0);
}

TEST_CASE("test-plan inventory rejects a missing openapi file", "[scenario]") {
  REQUIRE(run_cli({"test-plan", "inventory", "--openapi", missing_path().string()}) != 0);
}
```

- [ ] **Step 2: Run CLI test to verify it fails**

Run:

```powershell
cmake --build tools/pbx-loadgen/native/build --target pbx_loadgen_tests
ctest --test-dir tools/pbx-loadgen/native/build -R pbx_loadgen_tests --output-on-failure
```

Expected: CLI rejects unknown `test-plan` command or tests fail.

- [ ] **Step 3: Add CLI file helpers**

Modify `tools/pbx-loadgen/native/src/main.cpp` includes:

```cpp
#include <filesystem>
#include <fstream>
#include <sstream>
```

Add helper functions inside the anonymous namespace:

```cpp
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
```

- [ ] **Step 4: Add CLI subcommands**

Modify `tools/pbx-loadgen/native/src/main.cpp` command setup after existing `report` subcommand:

```cpp
  std::string openapiFile;
  std::string outputFile;
  std::string featureId;
  std::string feedbackOutputFile;

  auto* testPlan = app.add_subcommand("test-plan", "Generate and run CTI feature test plans");

  auto* tpInventory = testPlan->add_subcommand("inventory", "Build CTI feature inventory");
  tpInventory->add_option("--openapi", openapiFile, "OpenAPI json file")->required();
  tpInventory->add_option("--out", outputFile, "Output inventory json file");

  auto* tpGenerate = testPlan->add_subcommand("generate", "Generate a CTI test plan");
  tpGenerate->add_option("--openapi", openapiFile, "OpenAPI json file")->required();
  tpGenerate->add_option("--feature", featureId, "Feature id")->required();
  tpGenerate->add_option("--out", outputFile, "Output test plan yaml file");

  auto* tpValidate = testPlan->add_subcommand("validate", "Validate a CTI test plan");
  tpValidate->add_option("-f,--file", file, "Test plan file")->required();

  auto* tpDryRun = testPlan->add_subcommand("dry-run", "Show CTI test plan steps");
  tpDryRun->add_option("-f,--file", file, "Test plan file")->required();

  auto* tpReport = testPlan->add_subcommand("report", "Replay a CTI test result file");
  tpReport->add_option("-f,--file", file, "Test result json file")->required();

  auto* tpFeedback = testPlan->add_subcommand("feedback", "Generate improvement feedback");
  tpFeedback->add_option("-f,--file", file, "Test result json file")->required();
  tpFeedback->add_option("--out", feedbackOutputFile, "Output feedback markdown file");
```

- [ ] **Step 5: Add command dispatch**

Modify the `try` block in `tools/pbx-loadgen/native/src/main.cpp` after existing `report` dispatch:

```cpp
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
      std::cout << loadgen::formatTestPlanDryRunFromYaml(readTextFile(file)) << '\n';
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
```

- [ ] **Step 6: Include missing result header in CLI**

Modify `tools/pbx-loadgen/native/src/main.cpp` includes:

```cpp
#include "loadgen/test_result.hpp"
```

- [ ] **Step 7: Run CLI tests**

Run:

```powershell
cmake --build tools/pbx-loadgen/native/build --target pbx_loadgen_tests
ctest --test-dir tools/pbx-loadgen/native/build -R pbx_loadgen_tests --output-on-failure
```

Expected: CLI tests pass, including missing file rejection.

- [ ] **Step 8: Commit**

Run:

```powershell
git add -- tools/pbx-loadgen/native/src/main.cpp tools/pbx-loadgen/native/tests/scenario_test.cpp
git commit -m "Wire CTI test plan CLI commands"
```

---

### Task 6: Add Documentation and Template Notes

**Files:**
- Create: `tools/pbx-loadgen/test-templates/README.md`
- Modify: `tools/pbx-loadgen/README.md`
- Modify: `tools/pbx-loadgen/docs/usage.md`

- [ ] **Step 1: Add template README**

Create `tools/pbx-loadgen/test-templates/README.md`:

```markdown
# CTI Test Templates

This directory documents the deterministic template rules used by `pbx-loadgen test-plan generate`.

The first implementation keeps templates in C++ rule code so generated plans are available in a standalone binary. Future versions may move templates into external YAML files after the generated format stabilizes.

Current feature mappings:

- `calls.inbound.basic`: SIP inbound call, WebSocket `call.updated`, `GET /calls/active`, SIP 200 assertion.
- `calls.transfer.control`: SIP inbound precondition, transfer API smoke assertion.
- `queues.summary.after-inbound`: SIP inbound precondition, `GET /queues/summary` assertion.
- `agents.status.api`: agent status API smoke assertion.
- `asterisk-config.blocklist.api`: blocklist API smoke assertion.

Generated plans must keep `source.generatorVersion` so they can be refreshed safely after feature changes.
```

- [ ] **Step 2: Update main README command list**

Modify `tools/pbx-loadgen/README.md` command list to:

```markdown
Commands:

- `pbx-loadgen validate -f <scenario.yaml>`
- `pbx-loadgen dry-run -f <scenario.yaml>`
- `pbx-loadgen run -f <scenario.yaml>`
- `pbx-loadgen report -f <result.json>`
- `pbx-loadgen test-plan inventory --openapi <openapi.json> [--out <inventory.json>]`
- `pbx-loadgen test-plan generate --openapi <openapi.json> --feature <feature-id> [--out <test-plan.yaml>]`
- `pbx-loadgen test-plan validate -f <test-plan.yaml>`
- `pbx-loadgen test-plan dry-run -f <test-plan.yaml>`
- `pbx-loadgen test-plan report -f <test-result.json>`
- `pbx-loadgen test-plan feedback -f <test-result.json> [--out <feedback.md>]`
```

- [ ] **Step 3: Add usage section**

Append to `tools/pbx-loadgen/docs/usage.md`:

```markdown
## CTI Feature Test Automation

Build a feature inventory from the current OpenAPI document:

```bash
tools/pbx-loadgen/native/build/pbx-loadgen test-plan inventory \
  --openapi docs/openapi.json \
  --out tools/pbx-loadgen/generated/feature-inventory.json
```

Generate a test plan draft for an inbound call feature:

```bash
tools/pbx-loadgen/native/build/pbx-loadgen test-plan generate \
  --openapi docs/openapi.json \
  --feature calls.inbound.basic \
  --out tools/pbx-loadgen/generated/test-plans/calls.inbound.basic.yaml
```

Validate and inspect the generated plan without opening SIP, API, or WebSocket connections:

```bash
tools/pbx-loadgen/native/build/pbx-loadgen test-plan validate \
  -f tools/pbx-loadgen/generated/test-plans/calls.inbound.basic.yaml

tools/pbx-loadgen/native/build/pbx-loadgen test-plan dry-run \
  -f tools/pbx-loadgen/generated/test-plans/calls.inbound.basic.yaml
```

Generate improvement feedback from a failed test result:

```bash
tools/pbx-loadgen/native/build/pbx-loadgen test-plan feedback \
  -f tools/pbx-loadgen/reports/test-result-example.json \
  --out docs/generated-test-feedback/calls.inbound.basic.md
```

The generator is rule-based. It uses OpenAPI paths and known KAster CTI module naming to create executable drafts so feature work can include a matching test script without writing every scenario by hand.
```

- [ ] **Step 4: Commit docs**

Run:

```powershell
git add -- tools/pbx-loadgen/test-templates/README.md tools/pbx-loadgen/README.md tools/pbx-loadgen/docs/usage.md
git commit -m "Document CTI test plan automation"
```

---

### Task 7: Full Verification

**Files:**
- No new files unless a prior task reveals a build-only issue.

- [ ] **Step 1: Configure if needed**

If `tools/pbx-loadgen/native/build` does not exist or CMake cache is stale, run:

```powershell
cmake -S tools/pbx-loadgen/native -B tools/pbx-loadgen/native/build -DPBX_LOADGEN_BUILD_CLI=OFF
```

Expected: configure succeeds without PJSIP because CLI is disabled.

- [ ] **Step 2: Run all non-PJSIP unit tests**

Run:

```powershell
cmake --build tools/pbx-loadgen/native/build
ctest --test-dir tools/pbx-loadgen/native/build --output-on-failure
```

Expected: all configured tests pass.

- [ ] **Step 3: Build CLI when PJSIP is available**

If `PJSIP_ROOT` is available in the environment, run:

```powershell
cmake -S tools/pbx-loadgen/native -B tools/pbx-loadgen/native/build -DPBX_LOADGEN_BUILD_CLI=ON
cmake --build tools/pbx-loadgen/native/build --target pbx-loadgen
```

Expected: `pbx-loadgen` builds.

If `PJSIP_ROOT` is unavailable, record that CLI live-run verification was skipped because PJSIP is not configured.

- [ ] **Step 4: Verify generated plan from real OpenAPI**

When CLI is available, run:

```powershell
tools\pbx-loadgen\native\build\pbx-loadgen.exe test-plan inventory --openapi docs\openapi.json --out tools\pbx-loadgen\generated\feature-inventory.json
tools\pbx-loadgen\native\build\pbx-loadgen.exe test-plan generate --openapi docs\openapi.json --feature calls.inbound.basic --out tools\pbx-loadgen\generated\test-plans\calls.inbound.basic.yaml
tools\pbx-loadgen\native\build\pbx-loadgen.exe test-plan validate -f tools\pbx-loadgen\generated\test-plans\calls.inbound.basic.yaml
tools\pbx-loadgen\native\build\pbx-loadgen.exe test-plan dry-run -f tools\pbx-loadgen\generated\test-plans\calls.inbound.basic.yaml
```

Expected:

- Inventory JSON contains `calls.inbound.basic`.
- Generated YAML validates.
- Dry-run prints `inbound_call`, optional `wait_ws_event`, `assert_api`, and `assert_result` steps.

- [ ] **Step 5: Review git status**

Run:

```powershell
git status --short
```

Expected: only intended generated artifacts remain. Do not commit `tools/pbx-loadgen/generated/**` unless the user explicitly wants generated examples committed.
