# SCS-C02 Full Course — Build Tracker

Goal: narrated AWS console walkthrough per module, ≤8 min, exam framing + hands-on lab + NI stings.
Finals collected in `out/course-final/NN-dX-<id>.mp4` (numbered for bulk upload).

Pipeline per module: author JSON → `bin/build.mjs <id>` (TTS+record) → inspect frames + tune `redactions` → `bin/redact.mjs <id>` → `bin/brand.mjs <id>` → copy `<id>-final.mp4` to `out/course-final/`.

## Modules & status  (author / build / redact / brand / placed)

### D1 — Threat Detection & Incident Response
- [x] aws-guardduty
- [x] aws-inspector
- [x] aws-detective
- [x] aws-incident-response

### D2 — Security Logging & Monitoring
- [x] aws-cloudtrail
- [x] aws-config
- [x] aws-cloudwatch
- [x] aws-securityhub  (exists — re-brand into course-final)

### D3 — Infrastructure Security
- [x] aws-vpc-security
- [x] aws-waf-shield
- [x] aws-network-firewall

### D4 — Identity & Access Management
- [x] aws-iam  (DONE — final exists)
- [x] aws-iam-identity-center
- [x] aws-organizations-scp

### D5 — Data Protection
- [x] aws-kms
- [x] aws-secrets-manager
- [x] aws-macie
- [x] aws-s3-security  (exists — finish exam framing + lab, build)

### D6 — Management & Security Governance
- [x] aws-control-tower
- [x] aws-firewall-manager

## Upload order (course-final/)
D1 guardduty, inspector, detective, incident-response → D2 cloudtrail, config, cloudwatch, securityhub →
D3 vpc-security, waf-shield, network-firewall → D4 iam, iam-identity-center, organizations-scp →
D5 s3-security, kms, secrets-manager, macie → D6 control-tower, firewall-manager


## Status: COMPLETE
- 20/20 finals in out/course-final/ (4.3–5.7 min each).
- 19/20 rich console screens. Module 20 (firewall-manager) left on its prerequisites page per KK (needs Org/FMS-admin setup).
- Detective + Macie were re-recorded after enabling (now show real screens).
- YouTube metadata: out/course-final/youtube-metadata.md (20 entries, 3 URLs each).
