# AZ-500 (then SC-100) Azure Security Course — Design Spec

Date: 2026-06-13
Status: approved design, pending spec review
Toolkit: humboldt (reuses the AWS/SCS-C02 pipeline)

## 1. Goal

Produce the same narrated cloud-console training videos we built for AWS SCS-C02, now for
Microsoft Azure security — **AZ-500 (Azure Security Engineer Associate)** first, then
**SC-100 (Cybersecurity Architect Expert)** reusing AZ-500 content. ≤8 min per video, exam
badge + hands-on lab + Network Intelligence stings, finals collected in one folder for bulk
upload to the team, plus a YouTube metadata file.

## 2. What changes vs the AWS course

The pipeline (author JSON → build/record → redact → brand → place) is unchanged and already
cloud-agnostic (`lib/clouds.mjs` has an `azure` profile; the recorder has no AWS-specific
logic). Azure-specific differences this spec must handle:

- **Two auths.** `az login` (CLI, already active — sub "Azure CIS Agent Testing",
  kkmookhey@yahoo.com) drives **provisioning + teardown**. The **recorder** needs its own
  portal browser session: `node bin/login.mjs azure` (personal tenant) and a **second**
  browser session for the **corporate** tenant (Entra modules).
- **Empty tenant.** The personal tenant is near-empty, so we provision real resources before
  recording (see §4).
- **Authoritative source.** All authoring is grounded in the **Microsoft Learn MCP**
  (`microsoft_docs_search` / `microsoft_docs_fetch`) and the `microsoft-docs` skill — verify
  every portal blade path, feature name, and align guidance to the **Microsoft Cloud Security
  Benchmark (MCSB)**. Do not rely on training-data recall for Azure specifics.
- **Portal deep-links.** Azure portal uses `#view/...` and `#blade/...` routes. These are
  mostly stable and deep-linkable per section; some blades are heavy SPAs (expect short load
  transitions, like AWS GuardDuty). Verify each route via Microsoft Learn / a smoke nav.
- **Framework modules** use **rendered diagrams** (our own, citing Microsoft Learn), not
  portal capture and not Microsoft's copyrighted MCRA slides.

## 3. Module map (~21 modules)

`✦` = rendered-diagram module (no portal capture). `[corp]` = corporate tenant, read-only,
heavy redaction. Everything else = personal lab (provisioned, recorded, torn down).

**D0 · Foundations**
- ✦ frameworks-overview — MCRA, MCSB, Azure Well-Architected (security pillar), Zero Trust,
  CAF Secure methodology. (Reused heavily by SC-100.)

**D1 · Manage identity & access (25–30%)**
- entra-identities — users, groups, admin units, external identities `[corp]`
- entra-rbac — Azure RBAC roles/scopes/custom roles vs Entra roles (personal-seeded)
- conditional-access `[corp]`
- pim — Privileged Identity Management `[corp]`
- identity-protection — risk-based policies `[corp]`
- app-identity — app registrations, enterprise apps, managed identities, workload identities
  (personal; corp for richer examples if needed)

**D2 · Secure networking (20–25%)** — personal lab
- nsg-asg · azure-firewall (+ Firewall Manager) · waf (App Gateway / Front Door) ·
  ddos-bastion · private-link (Private Endpoints, service endpoints)

**D3 · Secure compute, storage & databases (20–25%)** — personal lab — **PILOT DOMAIN**
- vm-security (Defender for Servers, JIT, disk encryption, update mgmt) · key-vault
  (keys/secrets/certs, RBAC vs access policies, soft-delete/purge protection) ·
  storage-security (encryption, SAS, network firewall, private endpoint) ·
  sql-security (auditing, TDE, Defender for SQL, Always Encrypted, Entra auth)

**D4 · Manage security operations (25–30%)** — personal lab
- defender-for-cloud (secure score, recommendations, MCSB regulatory compliance) ·
  defender-workload-plans · sentinel-setup (workspace, data connectors, content hub) ·
  sentinel-analytics-incidents (rules, incidents, UEBA, hunting) ·
  sentinel-soar (automation rules, playbooks)

## 4. Provisioning model (build → record → tear down, per domain)

A `lab/` folder of **idempotent Bicep + `az` scripts**, one stack per domain, each in its own
**resource group** so teardown is isolated and never touches anything else.

Flow per domain: `lab/<domain>/deploy.sh` → record that domain's modules → `lab/<domain>/destroy.sh`
(deletes the RG). Cheap resources (Key Vault, NSGs, storage, one B-series VM) may persist;
the metered-cost services (Defender plans, Sentinel/Log Analytics, Azure Firewall, Bastion,
DDoS) live **only during capture**. I drive `az` from the active CLI session; teardown is
destructive and runs only against the domain's dedicated RG.

Cost guardrail: enable paid Defender plans / Sentinel only for the window needed, disable on
teardown. Surface an estimated per-domain cost before deploying the pricey stacks (D2 firewall/
bastion/DDoS, D4 Sentinel).

## 5. Entra modules (corporate, read-only, heavy redaction)

Recorded read-only against the corporate tenant. Redaction strategy:
- **Column blur** for list views — the portal places PII in fixed columns, so blur the whole
  Name / UPN / email columns across the list height.
- **Field blur** in detail blades — object IDs, tenant ID, UPNs, sign-in addresses.
- The global `section: "*"` region covers the top-right account chrome.
- Inspect frames per Entra screen; KK approves before any Entra module is final. This is the
  slowest step, confined to the ~5 corporate Entra modules. Entra modules show *configured
  state*, not create-flows (read-only).

## 6. SC-100 (phase 2)

SC-100 is architect-level (design Zero Trust, GRC, security for infra/data/apps), built on the
same frameworks. Reuse: ~50–60% of AZ-500's Defender/Sentinel/Entra/Key Vault/networking
footage is referenced as concrete building blocks; SC-100 adds new **design-narrative modules**
(diagram-driven, grounded in MCRA / WAF / MCSB / Zero Trust via Microsoft Learn MCP). AZ-500
modules are tagged so reuse is clean. SC-100 is a separate spec after AZ-500 ships.

## 7. Output, sequencing, success criteria

- Finals in `out/az500-final/NN-dX-<id>.mp4`; `youtube-metadata.md` with the 3 standard URLs
  (humboldt repo, transilience.ai, networkintelligence.ai).
- **Sequencing:** start with **D3 (compute/storage/DB) as the pilot** — cheapest lab, highest
  yield, no Entra redaction — to prove the Azure pipeline end-to-end (portal auth, deep-links,
  overlay, build/brand) on 1 module, then the rest of D3, then D4, D2, D1 (Entra last, since it
  is the most redaction-heavy), with D0 frameworks authored alongside.
- **Done when:** all ~21 finals ≤8 min in the folder, exam-framed + labbed + branded; Entra
  PII reviewed/approved; metadata file complete; lab teardown confirmed (no lingering paid
  meters).

## 8. Risks

- Azure portal heavy-SPA load transitions (mitigated by recorder time-box, already in place).
- Corporate-tenant read-only ⇒ no create-flows in Entra modules (accepted).
- Paid-meter leakage if teardown is skipped (mitigated by per-domain RG + explicit destroy).
- MCRA/Microsoft diagram licensing (mitigated: render our own diagrams, cite Microsoft Learn).
- Drill mechanism (`clickText`, `role=tab`) was tuned for the AWS console; Azure portal DOM
  differs — verify drills on the D3 pilot and adjust the recorder if needed.
