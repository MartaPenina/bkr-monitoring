# Coin-Ops Implementation Tournament

Analysis date: 2026-04-14

Scope: all 11 remote implementation branches available after `git fetch --all --prune` from `https://github.com/ua-academy-projects/coin-ops.git`.

Update note: `origin/tsyhan`, `origin/kurdupel`, and `origin/volynets` were rechecked after a remote refresh on 2026-04-14. The old `origin/monero-privacy-system` branch is now represented by `origin/tsyhan`. This delta recheck strictly ignored participant Markdown files and used only source code, service config, Docker, Terraform, Vagrant, and Ansible artifacts as evidence. The recommended winner remains `origin/Shabat`.

## Branch Set

| Branch | Last inspected commit | Classification |
| --- | --- | --- |
| `origin/Shabat` | `d9cef31` | Complete candidate baseline |
| `origin/hrenchevskyi` | `124bc2c` | Strong application/container branch, weaker cloud/VM story |
| `origin/kazachuk` | `2ac6d9c` | Full app with VM and Docker modes, security/durability gaps |
| `origin/kurdupel` | `f6398ce` | VM/Ansible implementation, no Docker/Terraform |
| `origin/main` | `9da75e3` | Non-implementation, license only |
| `origin/penina` | `d1a4b65` | Documented five-VM and Docker attempt, runnable drift |
| `origin/shturyn` | `e0b90b4` | Frontend/proxy only, missing required infra/state components |
| `origin/smoliakov` | `ca3c654` | VM/Ansible/AWS experiment with major hygiene issues |
| `origin/tsyhan` | `5c73140` | Strong Terraform/Docker experiment, queue-persistence caveat |
| `origin/volynets` | `e277d26` | Strong VM/Ansible implementation, no Docker/Terraform |
| `origin/zakipnyi` | `0382ec5` | Vagrant five-VM implementation, no Docker/Terraform |

## Deliverables

- [Branch-by-branch comparison](branch-by-branch.md)
- [Ranking and decision](ranking-and-decision.md)
- [Unified future architecture](future-architecture.md)
- [Next sprint recommendations](next-sprint-plan.md)
- [Weighted comparison matrix](01_comparison_matrix.md)
- [Component deep dive](02_component_deep_dive.md)
- [Golden path proposal](03_golden_path_proposal.md)

## Method

Branches were compared as competing infrastructure and application implementations, not as personal evaluations. The analysis weights product fit because the next sprint needs a baseline the team can evolve, not just an isolated infrastructure demo.

The third-party API topic itself was not treated as a disqualifier. Currency, crypto, weather, or other public APIs can satisfy the external-data requirement. What matters for this tournament is the implementation quality around service boundaries, queueing, persistence, reproducibility, and deployment maturity.

Evaluation criteria:

- clarity and quality of architecture
- deployment reliability
- VM setup quality
- Docker maturity
- Terraform maturity and reusability
- environment reproducibility
- maintainability
- scalability
- production readiness
- AWS migration readiness
- Kubernetes readiness
- overall DevOps maturity

## Executive Decision

Recommended baseline: `origin/Shabat`.

Reason: it is the only branch that combines a coherent distributed application, Dockerized services, per-node Compose deployment, Ansible provisioning/deploy automation, Hyper-V Terraform, GHCR image publishing, persistent data handling, health checks, and environment templating. It still needs production hardening, but it is the strongest starting point for an AWS and later Kubernetes path.
