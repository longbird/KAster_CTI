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

std::set<std::string> mapChangedPathsToFeatureIds(
    const std::vector<std::string>& paths) {
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
