# SERVICE LEVEL AGREEMENT

**Agreement Reference:** DVP-SLA-2024-0389
**Date:** 5 February 2024
**Version:** 2.1 — Final

---

## Parties

**Service Provider:** DataVault Pro Ltd, a company incorporated in England and Wales (Company No. 11038472), having its registered office at Nova South, 160 Victoria Street, London, SW1E 5LB ("DataVault")

**Customer:** Harrowfield & Partners LLP, a limited liability partnership registered in England and Wales (OC No. 312847), having its principal place of business at One Aldersgate Street, London, EC2A 4HJ ("Customer")

---

## 1. Service Description

1.1 DataVault Pro shall provide the Customer with access to its cloud-based legal document management and storage platform ("Platform"), including the following service tiers:

| Component | Included |
|---|---|
| Secure document storage | Up to 10TB |
| User licences | Up to 250 concurrent users |
| API access | Standard REST API |
| Audit logging | 12-month retention |
| Backup frequency | Daily (06:00 UTC) |
| Backup retention | 30 days |
| Data residency | UK (London region) |

1.2 The annual subscription fee for the above services is £48,000 per annum exclusive of VAT, invoiced quarterly in advance.

---

## 2. Service Availability

### 2.1 Uptime Commitment

DataVault Pro commits to a monthly service availability of **99.5%**, measured as:

> Availability % = ((Total minutes in month − Unplanned downtime minutes) / Total minutes in month) × 100

### 2.2 Scheduled Maintenance

Scheduled maintenance windows are permitted on Sunday mornings between 02:00–06:00 UTC and do not count toward unplanned downtime. DataVault will provide a minimum of 5 business days' notice for any scheduled maintenance.

### 2.3 Availability Exclusions

The availability commitment excludes downtime caused by: (a) Customer's own infrastructure or internet connectivity; (b) Force majeure events; (c) Third-party service outages outside DataVault's reasonable control.

---

## 3. Incident Response Times

| Priority | Definition | Initial Response | Resolution Target |
|---|---|---|---|
| P1 — Critical | Complete service outage or data inaccessible | 4 hours | 24 hours |
| P2 — High | Significant degradation affecting majority of users | 8 hours | 48 hours |
| P3 — Medium | Partial functionality impaired, workaround available | 1 business day | 5 business days |
| P4 — Low | Minor issue, cosmetic defect | 3 business days | 20 business days |

Response times are measured from the time a support ticket is logged via the DataVault Pro support portal (support.datavaultpro.co.uk).

Support hours: Monday–Friday 08:00–18:00 GMT/BST. Out-of-hours P1 support available via dedicated emergency line.

---

## 4. Service Credits

4.1 In the event that DataVault fails to meet the uptime commitment in any calendar month, the Customer shall be entitled to service credits as follows:

| Monthly Availability | Credit (% of monthly fee) |
|---|---|
| 99.0% – 99.49% | 10% |
| 95.0% – 98.99% | 25% |
| Below 95.0% | 50% |

4.2 Service credits shall be applied to the Customer's next invoice and shall not exceed the monthly subscription fee for the affected period.

4.3 **Penalty rate for unresolved P1 incidents:** £1,000 per day after the resolution target has been exceeded, up to a maximum of £15,000 per incident.

4.4 Service credits constitute the Customer's sole and exclusive remedy for any failure to meet service levels.

---

## 5. Data Security and Compliance

5.1 DataVault Pro holds the following certifications:

| Standard | Certification Body | Expiry |
|---|---|---|
| ISO 27001 | BSI | March 2026 |
| Cyber Essentials Plus | IASME | January 2025 |
| SOC 2 Type II | AICPA | Annual |

5.2 All data is encrypted at rest (AES-256) and in transit (TLS 1.3 minimum).

5.3 DataVault Pro complies with UK GDPR and acts as a data processor on behalf of the Customer.

---

## 6. Disaster Recovery

6.1 Recovery Time Objective (RTO): 12 hours following declaration of a disaster scenario.

6.2 Recovery Point Objective (RPO): 24 hours (data loss of up to one daily backup cycle).

6.3 DataVault conducts full DR testing annually. Results are available to the Customer upon written request.

---

## 7. Term and Termination

7.1 This SLA applies from 1 March 2024 and shall continue for an initial period of 24 months.

7.2 Following the Initial Term, either party may terminate this Agreement on 90 days' written notice.

7.3 The Customer may terminate immediately for cause if DataVault fails to meet the availability commitment in three consecutive calendar months.

---

## 8. Governing Law

This Agreement is governed by the laws of England and Wales and each party submits to the exclusive jurisdiction of the English courts.

---

**SIGNED** for and on behalf of **DataVault Pro Ltd:**
Name: Marcus Webb | Title: Chief Commercial Officer | Date: 5 February 2024

**SIGNED** for and on behalf of **Harrowfield & Partners LLP:**
Name: James Thornton | Title: IT Director | Date: 5 February 2024
