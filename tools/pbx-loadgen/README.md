# PBX Load Generator

Native CLI for SIP trunk inbound load tests against KAster PBX/CTI.

Commands:

- `pbx-loadgen validate -f <scenario.yaml>`
- `pbx-loadgen dry-run -f <scenario.yaml>`
- `pbx-loadgen run -f <scenario.yaml>`
- `pbx-loadgen report -f <result.json>`

Packaging expects any dynamically linked pjproject runtime libraries to be discoverable from the build tree or `PJSIP_ROOT`; the package scripts copy them when they can and fail clearly when they cannot. If you know a build is fully static, set `PBX_LOADGEN_ASSUME_STATIC_PJSIP=1` when packaging to bypass that guard.
