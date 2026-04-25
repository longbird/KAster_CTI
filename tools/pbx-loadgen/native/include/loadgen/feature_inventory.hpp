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
std::set<std::string> mapChangedPathsToFeatureIds(
    const std::vector<std::string>& paths);
std::string renderFeatureInventoryJson(const FeatureInventory& inventory);
std::string renderGeneratedTestPlan(const FeatureDescriptor& feature);

}  // namespace loadgen
