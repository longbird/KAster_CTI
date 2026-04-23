#pragma once

#include <memory>
#include <string>

#include "loadgen/live_run.hpp"

namespace loadgen {

class PjsipClient : public LiveCallRunner {
 public:
  struct Impl;

  PjsipClient();
  ~PjsipClient() override;

  PjsipClient(const PjsipClient&) = delete;
  PjsipClient& operator=(const PjsipClient&) = delete;

  void start(const Scenario& scenario) override;
  void stop() override;
  CallResult runCall(const LiveCallRequest& request) override;

 private:
  std::unique_ptr<Impl> impl_;
};

}  // namespace loadgen
