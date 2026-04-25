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
