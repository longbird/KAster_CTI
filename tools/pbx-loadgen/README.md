# PBX Load Generator

Native CLI for SIP trunk inbound load tests against KAster PBX/CTI.

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

Packaging expects any dynamically linked pjproject runtime libraries to be discoverable from the build tree or `PJSIP_ROOT`; the package scripts copy them when they can and fail clearly when they cannot. If you know a build is fully static, set `PBX_LOADGEN_ASSUME_STATIC_PJSIP=1` when packaging to bypass that guard.
