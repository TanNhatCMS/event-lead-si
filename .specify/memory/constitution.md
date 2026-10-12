<!--
Sync Impact Report
Version change: 1.1.1 → 1.2.0 (AI SDK Elements added to the technology foundation)
Modified principles: none
Added sections: none
Expanded sections: Technology Foundation
Removed sections: none
Follow-up TODOs: Confirm the original ratification date.
-->
# EventLead SI Constitution

## Core Principles

### I. Evidence, Provenance, and Uncertainty
Every externally sourced or AI-inferred company, contact, risk, relationship, or supplier claim MUST be distinguishable from user-provided and verified data. Where available, the product MUST retain the source and retrieval or verification time, and MUST communicate uncertainty and missing evidence. A score or recommendation MUST expose its material basis; it MUST NOT present an inference as a verified fact. This keeps business decisions reviewable and correctable.

### II. Human Control of Consequential Actions
Users MUST be able to inspect and correct extracted contact data before synchronization. A person MUST approve external messages, commercial commitments, risk or credit decisions, and CRM overwrites before they take effect. AI recommendations support decisions and MUST NOT be represented as legal, tax, financial, or quality assurance. This protects user intent and preserves accountability.

### III. Privacy and Authorized Use
The product MUST collect, access, retain, and share personal and company data only for a defined product purpose and with the permissions and lawful basis required for the deployment. Access MUST be limited by role and organizational scope; retention and deletion MUST follow configured organizational policy. Integrations and public-source research MUST respect source access conditions, platform terms, and granted permissions. Sensitive meeting notes and recordings MUST receive the same access controls as the associated contact record.

### IV. Reliable, Interoperable Records
Contact, company, event, and relationship data MUST use explicit, documented fields and stable representations suitable for export and integration. Ingestion MUST preserve original evidence where practical, identify uncertain or incomplete fields, normalize supported formats, and detect likely duplicates before creating or synchronizing records. Integrations MUST report failures and avoid silent data loss or unintended overwrites. This supports trustworthy team workflows across vCard, spreadsheets, and CRM systems.

### V. Explainable, Configurable Workflows
Fit, risk, supplier, and relationship recommendations MUST be traceable to user criteria and available evidence, with important gaps visible. Teams MUST be able to configure relevant fields, labels, evaluation criteria, and follow-up stages without changing the meaning of verified data. The product MUST distinguish a suggested next step from an action already completed. This makes recommendations useful across different markets and teams without obscuring their limits.

## Product and Data Constraints

The product MUST treat external registries, tax data, social profiles, messaging services, and CRM capabilities as market- and permission-dependent. It MUST identify the source and supported scope of checks and MUST NOT imply universal coverage. If direct integration is unavailable or unauthorized, the product MAY retain an official profile link or support a user-mediated workflow.

Supplier capability, product quality, certification, ownership links, and reputation MUST be tied to available evidence or clearly labeled as unverified. Commercial, credit, and negotiation suggestions MUST state their informational nature and remain subject to user review. The product MUST support multilingual contact data and MUST make the configured OCR language coverage explicit.

## Technology Foundation

The default application stack is **Next.js 16** with the App Router, **Supabase** for managed PostgreSQL, authentication, and file storage, the **Vercel AI SDK** for model-provider integration and AI workflows, and **AI SDK Elements** for composable AI interface components. AI SDK Elements is built on shadcn/ui conventions and integrates with AI SDK streaming and status states; use its components selectively where they fit EventLead SI workflows and design needs. The AI SDK MUST be used behind application-level interfaces so model providers can be changed without coupling product behavior to one provider. Supabase Row Level Security MUST enforce organization and user access boundaries for data reachable through its APIs; privileged server credentials MUST remain server-side. Database schema changes MUST be versioned and reviewed. This stack is the project default; a material deviation requires a documented rationale and review of its security, data, and operational impact.

## Delivery and Review

Changes to extraction, normalization, enrichment, scoring, synchronization, or outbound actions MUST be reviewed against the principles above and the user-visible product behavior. Changes that affect stored data or integration contracts MUST document compatibility, failure handling, and any required migration. Review MUST include relevant privacy, authorization, provenance, uncertainty, and human-approval behavior for the changed workflow.

## Governance

This constitution governs product and engineering decisions for EventLead SI. If a proposal conflicts with a principle, the proposal MUST be revised or the constitution MUST be amended before the conflict is accepted. Amendments require a documented rationale and review by the project maintainers; changes affecting personal data or consequential recommendations also require review of the applicable controls.

Constitution versions follow semantic versioning. A MAJOR increment records a backward-incompatible governance change or removal/redefinition of a principle; a MINOR increment records a new principle or materially expanded governance; a PATCH increment records clarifications or non-semantic wording changes. The version, amendment date, and rationale MUST be updated together.

Each feature and change review MUST assess compliance with applicable principles and constraints. Reviewers MUST record material exceptions, their rationale, the affected workflows, and an owner or resolution plan. Exceptions MUST NOT silently weaken privacy controls or remove required human approval for consequential actions.

**Version**: 1.2.0 | **Ratified**: TODO(RATIFICATION_DATE): confirm original adoption date | **Last Amended**: 2026-10-12
