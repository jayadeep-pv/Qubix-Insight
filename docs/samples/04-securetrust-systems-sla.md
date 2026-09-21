# SERVICE LEVEL AGREEMENT

**Agreement Reference:** STS-SLA-2024-0214
**Date:** 7 February 2024
**Version:** 1.0 — Final

---

## Parties

**Service Provider:** SecureTrust Systems Ltd, a company incorporated in England and Wales (Company No. 09182736), having its registered office at 5 Canada Square, Canary Wharf, London, E14 5AQ ("SecureTrust")

**Customer:** Harrowfield & Partners LLP, a limited liability partnership registered in England and Wales (OC No. 312847), having its principal place of business at One Aldersgate Street, London, EC2A 4HJ ("Customer")

---

## 1. Service Description

1.1 SecureTrust Systems shall provide the Customer with access to its enterprise-grade cloud document management, AI-assisted processing and secure storage platform ("Platform"), including the following service tiers:

| Component | Included |
|---|---|
| Secure document storage | Up to 25TB (expandable) |
| User licences | Unlimited named users |
| API access | Advanced REST API + Webhooks |
| Audit logging | 36-month retention |
| Backup frequency | Every 4 hours |
| Backup retention | 90 days |
| Data residency | UK (dual-site: London + Manchester) |
| Dedicated Customer Success Manager | Included |

1.2 The annual subscription fee for the above services is £54,000 per annum exclusive of VAT, invoiced annually in advance with an option for quarterly billing at no additional charge.

---

## 2. Service Availability

### 2.1 Uptime Commitment

SecureTrust commits to a monthly service availability of **99.9%**, measured as:

> Availability % = ((Total minutes in month − Unplanned downtime minutes) / Total minutes in month) × 100

This equates to a maximum permitted downtime of approximately 43 minutes per month.

### 2.2 Scheduled Maintenance

Scheduled maintenance windows are limited to Sundays between 01:00–03:00 UTC and require a minimum of 10 business days' advance notice. Emergency security patches may be applied with 4 hours' notice at any time.

### 2.3 Availability Exclusions

The availability commitment excludes: (a) Customer-requested maintenance; (b) Customer's own infrastructure failures; (c) Force majeure events lasting fewer than 48 hours (longer outages are not excluded).

---

## 3. Incident Response Times

| Priority | Definition | Initial Response | Resolution Target |
|---|---|---|---|
| P1 — Critical | Complete service outage or data inaccessible | 1 hour | 8 hours |
| P2 — High | Significant degradation affecting majority of users | 2 hours | 24 hours |
| P3 — Medium | Partial functionality impaired, workaround available | 4 hours | 3 business days |
| P4 — Low | Minor issue, cosmetic defect | 1 business day | 10 business days |

Support is available 24 hours per day, 7 days per week, 365 days per year. Each Customer is provided with a dedicated account support hotline, a named support engineer, and access to the SecureTrust Priority Support Portal.

---

## 4. Service Credits

4.1 In the event that SecureTrust fails to meet the uptime commitment in any calendar month, the Customer shall be entitled to service credits as follows:

| Monthly Availability | Credit (% of monthly fee) |
|---|---|
| 99.5% – 99.89% | 15% |
| 99.0% – 99.49% | 30% |
| 95.0% – 98.99% | 50% |
| Below 95.0% | 100% |

4.2 Service credits shall be credited to the Customer's account within 14 days of the end of the affected month.

4.3 **Penalty rate for unresolved P1 incidents:** £2,500 per day after the resolution target has been exceeded, up to a maximum of £50,000 per incident. This is in addition to any applicable service credits.

4.4 Unlike many SLA agreements, service credits under this Agreement do not constitute the Customer's sole remedy — the Customer retains all other rights and remedies available under law.

---

## 5. Data Security and Compliance

5.1 SecureTrust Systems holds the following certifications:

| Standard | Certification Body | Expiry |
|---|---|---|
| ISO 27001 | BSI | October 2026 |
| ISO 27017 (Cloud Security) | BSI | October 2026 |
| ISO 27018 (PII in Cloud) | BSI | October 2026 |
| Cyber Essentials Plus | NCSC-accredited body | June 2025 |
| SOC 2 Type II | AICPA | Annual |
| PCI DSS Level 1 | Qualified Security Assessor | Annual |

5.2 All data is encrypted at rest (AES-256) and in transit (TLS 1.3 minimum). Encryption keys are Customer-managed via a dedicated Key Management Service.

5.3 SecureTrust Systems complies with UK GDPR and provides a fully executed Data Processing Agreement as part of the contract.

5.4 Penetration testing is conducted bi-annually by a CREST-accredited provider. Executive summaries are available to Customers upon request.

---

## 6. Disaster Recovery

6.1 Recovery Time Objective (RTO): 2 hours following declaration of a disaster scenario.

6.2 Recovery Point Objective (RPO): 4 hours (maximum data loss of one backup cycle).

6.3 SecureTrust conducts full DR testing twice annually with live failover exercises. Full test reports are provided to the Customer within 5 business days of each test.

6.4 SecureTrust maintains active-passive dual-site architecture between London and Manchester. Failover is automatic and requires no manual Customer intervention.

---

## 7. Term and Termination

7.1 This SLA applies from 1 March 2024 and shall continue for an initial period of 24 months.

7.2 Following the Initial Term, either party may terminate this Agreement on 30 days' written notice.

7.3 The Customer may terminate immediately for cause if SecureTrust fails to meet the availability commitment in two consecutive calendar months.

7.4 In the event of termination for any reason, SecureTrust shall provide a full data export in industry-standard format (PDF, JSON, CSV) within 10 business days at no charge, and shall securely destroy all Customer data within 30 days thereafter.

---

## 8. Governing Law

This Agreement is governed by the laws of England and Wales and each party submits to the exclusive jurisdiction of the English courts.

---

**SIGNED** for and on behalf of **SecureTrust Systems Ltd:**
Name: Fiona Gallagher | Title: Director of Enterprise Sales | Date: 7 February 2024

**SIGNED** for and on behalf of **Harrowfield & Partners LLP:**
Name: James Thornton | Title: IT Director | Date: 7 February 2024
