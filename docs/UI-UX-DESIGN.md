# SupplierDesk application design

## Purpose and status

This is a proposed, original UI/UX specification for a responsive supplier
document management application for manufacturing companies. It describes the
intended experience, not a claim that every screen, integration, or workflow is
implemented. It is not a security certification or permission to use customer
documents in the current development build.

The manufacturer application and supplier portal share a visual identity but
have separate navigation and access. A supplier does not need a paid account.
The design follows the existing decisions in [DECISIONS.md](./DECISIONS.md);
current security limitations are documented in [SECURITY.md](./SECURITY.md).

## 1. Product principles

1. Make the next action obvious: request, submit, review, or renew.
2. Show what needs attention and why, with a link to the affected item.
3. Use plain language, visible labels, and status text alongside colour.
4. Keep each company workspace clearly identified and isolated.
5. Prefer a calm, useful interface over decoration or dense analytics.
6. Design for desktop and mobile, English and German, and keyboard and
   assistive-technology use from the start.

The manufacturer dashboard and mobile supplier upload journey receive the
highest visual and usability priority.

## 2. Information architecture

### Public and account

Landing -> Sign in | Create company account | Accept team invitation

Account flows also include email verification, forgot password, reset
password, and verification errors. After sign-in, a workspace chooser appears
when the user has multiple memberships. Switching workspaces reloads the
selected company's data; it does not carry over another company's filters,
results, or draft content.

### Manufacturer workspace

```text
SupplierDesk                   [Current company v]  [Notifications] [Profile]
WORKSPACE
  Dashboard
  Suppliers
  Documents
  Document requests
  Compliance
  Expiry tracking
  Reports
MANAGEMENT
  Team members
  Notifications
  Subscription & billing
  Settings
```

The company selector lists only the signed-in user's memberships. Show the
company name in the sidebar and breadcrumb. Selecting another company clears
company-specific state and confirms before discarding an unsaved draft.
Supplier detail, document detail, request detail, and company settings are
nested under their parent sections.

The sidebar uses an icon and label for each destination, an active indicator,
and a collapse control on desktop. The top bar contains breadcrumbs, the
workspace selector, notification access, and a profile menu with sign out.
On mobile, use a labelled menu button opening a full-height navigation drawer;
focus moves into the drawer and returns to the opener when closed.

Do not present proposed features as working controls before implementation.
Hide unavailable destinations or clearly label them **Coming soon**, without
linking to a fake or non-functional workflow.

### Supplier portal

```text
SupplierDesk                    English | Deutsch
Request from [manufacturer]
  Requirements -> Upload -> Confirmation -> Status / replacement
```

The supplier sees only the request and its relevant company relationship, not
the manufacturer sidebar, workspace chooser, internal users, billing, reports,
or other requests. The portal is entered through a secure, expiring link.

## 3. Design system

### Colour

Use the existing application palette as the starting point. Colour is never
the only indicator of status or action.

| Token | Value | Use |
| --- | --- | --- |
| Canvas | `#F4F7FC` | Application background |
| Surface | `#FFFFFF` | Cards, forms, menus |
| Navy | `#173459` | Sidebar and high-emphasis navigation |
| Deep blue | `#0B3D91` | Links and secondary emphasis |
| Accent | `#2563EB` | Primary actions and selected navigation |
| Text | `#172F53` | Headings and primary text |
| Muted text | `#64748B` | Supporting text on light surfaces |
| Border | `#DCE5F2` | Dividers, cards, and controls |
| Success | `#166534` | Approved, completed |
| Warning | `#92400E` | Due soon, attention needed |
| Error | `#B91C1C` | Rejected, expired, failed |
| Focus | `#1D4ED8` | Visible keyboard focus |

Use lightly tinted status backgrounds with the darker status text. Verify
actual foreground/background combinations against WCAG 2.2 AA: at least 4.5:1
for normal text, 3:1 for large text and meaningful control boundaries.
Disabled controls remain legible and have an accompanying explanation where
the reason is not obvious.

### Typography and spacing

- Typeface: Inter, with a system sans-serif fallback.
- Suggested scale: page title 32/40 px; section title 20/28; card title 16/24;
  body 16/24; secondary text 14/20; compact labels 12/18. Avoid essential
  content below 12 px. Allow text resizing and wrapping.
- Use a 4 px spacing base: 4, 8, 12, 16, 24, 32, 48, and 64 px.
- Desktop content maximum: 1440 px, with 32-48 px outer padding. Use 16 px
  mobile gutters and consistent 16-24 px card padding.
- Cards: white, 8-12 px radius, subtle border, restrained shadow only when
  needed for separation. Buttons: 8 px radius, 44 px minimum touch target.

### Components

| Component | Design and behaviour |
| --- | --- |
| Buttons | One primary action per section; secondary outline, quiet text, and destructive variants. Include hover, focus, disabled, and pending states. Pending labels describe the action; prevent duplicate submission. |
| Inputs | Persistent labels, required/optional indication, helper text, and field-level errors. Never rely on placeholder text as the label. Password visibility is an accessible toggle. |
| Tables | Search, labelled filters, sortable headers, result count, and pagination where needed. Keep actions labelled. On narrow screens use stacked records rather than clipping columns. |
| Cards | Clear heading, supporting text, optional action, and a visible border. Metric cards link to the filtered list when the destination exists. |
| Badges | Text plus a colour and, where useful, an icon. Do not mix request, document, and compliance statuses into one ambiguous badge. |
| Dialogs | Use for consequential confirmation, not routine navigation. State the affected item and consequence; focus is contained and restored on close. |
| Dropdowns | Label the control and selected value; support keyboard navigation and a clear empty state. |
| Notifications | Use a notification list for durable events, inline alerts for form errors, and short status messages for completed actions. Never make a toast the only record of an important outcome. |
| Loading | Show labelled skeletons or progress with a stable layout; never display fake data as a placeholder. |
| Empty states | Explain why the list is empty, how filters affect it, and the next permitted action. Distinguish no data from no matching results. |
| Errors | State what failed and a safe next step. Preserve valid input when possible. Do not expose secrets, internal errors, or another company's existence. |
| Confirmation | Explain the completed operation and what happens next. Do not describe email acceptance as confirmed delivery. |

## 4. Responsive layouts

### Manufacturer desktop

```text
+------------------+--------------------------------------------------+
| Company selector | Breadcrumbs             Notifications   Profile  |
| Navigation       +--------------------------------------------------+
|                  | Page title                       Primary action   |
|                  | [Metric] [Metric] [Metric] [Metric]               |
|                  | [Main table / chart]       [Attention / activity] |
+------------------+--------------------------------------------------+
```

At approximately 1280 px and above, use a persistent 240-260 px sidebar and
a two-column content grid where useful. At tablet widths, collapse the
sidebar and stack secondary panels below the main content. At mobile widths,
use a navigation drawer, single-column cards, wrapped actions, and stacked
table rows. Breakpoints are layout guidance, not a substitute for testing
real devices and zoom.

### Supplier mobile

```text
SupplierDesk                 English | Deutsch
Documents requested
Manufacturer: [name]
Supplier: [name]
Link expires: [date and time]

[ Certificate                 Requested ]
  [ Choose a file ]
  PDF, JPEG or PNG; max 15 MB
  [ Expiry date (optional) ]
  [ Submit document ]

[ Supporting document         Under review ]
```

Use a single-column layout, one clear action per item, a visible file name
after selection, and progress and result text that works without colour.
Allow the device's file picker and camera where supported. Do not require
pinch-to-zoom or horizontal scrolling.

## 5. Manufacturer screens

All screens below inherit the shared loading, empty, error, permission, and
responsive patterns. The actions shown are proposals unless already implemented.

### 5.1 Account and access

| Screen | Layout and primary action | States and validation |
| --- | --- | --- |
| Sign in | Split desktop layout with brand panel and a focused email/password form; single column on mobile. **Sign in** is primary. | Use generic credential errors. Preserve email after an error. Link to registration and password recovery. |
| Create company account | Administrator name, business email, password, company name, country, and business details in labelled sections. **Create account** starts verification. | Validate required fields, email format, country code, and password length; preserve safe input on error. Clarify that this creates a new company, not an employee membership. |
| Email verification | Explain where the verification message was sent and the next step. Provide sign-in and a resend action only when supported. | Waiting, expired/invalid, retry, and successful verification. Do not claim workspace creation before it succeeds. |
| Forgot password | Email field and **Send reset link**. | Show the same acknowledgement whether or not an account exists; provide rate-limit and delivery failure guidance without enumeration. |
| Reset password | New password, confirmation, and **Save password**. | Show password requirements and mismatch inline. Expired links receive a safe recovery path. |
| Accept team invitation | Show the inviting company, email, assigned role, expiration, and **Accept invitation**. Support a verified existing account or account creation for the invited address. | Reject expired, revoked, used, or wrong-email invitations without joining or creating another company. Respect membership limits. |
| Workspace selection | Searchable list of accessible companies with name and role. **Open workspace**. | Empty state explains that an invitation or company registration is required. |

The existing registration flow requires verification before workspace
creation. Its current cross-device verification limitation remains until
explicitly addressed; password recovery and team invitations are proposed.

### 5.2 Dashboard

The title identifies the active company. Place **Request documents** at the
top right, subject to permission. Provide six linked metric cards: total
suppliers, active suppliers, missing documents, pending reviews, expiring
documents, and expired documents. Under them, use:

1. Supplier compliance overview with labelled counts and a link to details.
2. Upcoming expiry list with dates and renewal actions where permitted.
3. Outstanding requests with supplier, status, due date, and next action.
4. Recent activity and upcoming deadlines, ordered by time.

Each card states the underlying filter and date window. Show **No data yet**
instead of a fabricated score or chart. A failed panel shows its own retry
state without masking successfully loaded panels. On mobile, cards become a
two-column grid when space allows, then a single column; the action remains
near the heading.

### 5.3 Suppliers

- **Supplier list:** search by name/contact, filter active or archived and
  compliance status, and show supplier, contact, email, document count,
  compliance, last activity, and view/edit/archive actions where permitted.
  Include result count and pagination. Explain that archived suppliers count
  toward the current 100-supplier limit.
- **Add/edit supplier:** name, contact person, business email, and relevant
  company details; mark required fields and validate email and lengths.
  Save or cancel, with unsaved-change protection. Contact fields are proposed
  and must not be presented as persisted until implemented.
- **Supplier detail:** company and contact summary, compliance explanation,
  documents, requirements, open requests, and activity history in clearly
  labelled sections. Place **Request documents** prominently for permitted
  users. Missing or unavailable contacts have explicit empty text.
- **Archive:** confirmation identifies the supplier, explains that historical
  records remain and that archived suppliers count toward the limit. Do not
  imply permanent deletion or reversible restoration unless implemented.

### 5.4 Documents and requirements

- **Document library:** tabs or filters for all, approved, pending review,
  rejected, expiring soon, and expired. Rows show name, supplier, category,
  upload date, issue date, expiry date, review status, and version. Support
  search, sorting, and pagination. Unknown dates display **Not provided**.
- **Document detail:** header with document name, supplier, status, and
  permitted review action. Below: safe preview area, metadata, versions,
  reviewer comments, and event history. On mobile, stack these sections.
  Preview must fail safely and provide an authorized download alternative;
  supported preview formats and scanning are implementation prerequisites.
- **Review:** an authorized reviewer can begin review, approve, or reject.
  Rejection requires a clear reason. Expiry is optional where supported.
  Confirm an action only after the server saves it; show conflict/reload
  guidance if the version changed during review.
- **Version history:** newest first, with version number, submission date,
  status, and authorized download. Previous versions remain identifiable;
  replacing a document never silently overwrites its history.
- **Document requirements and categories:** list requirement name and
  renewal interval; authorized staff can add or edit supported settings.
  Validate renewal as 1-120 whole months. Category editing is proposed.

### 5.5 Document requests

- **Create:** a guided form selects a supplier, one or more requirements,
  deadline, and optional instructions, then reviews the request before
  sending. Preserve input on validation or delivery errors. Deadline,
  instructions, draft, and sending workflow require implementation.
- **Detail:** show supplier, request owner, deadline, instructions, each
  required document, submission/review state, request activity, and link
  expiry/revocation. Provide resend, copy link, or revoke only to authorized
  staff. Clearly distinguish provider acceptance from confirmed delivery.
- **Request status:** proposed labels are Draft, Sent, Viewed, Submitted,
  Overdue, Completed, and Cancelled. **Viewed** means only that the link was
  opened, not that the supplier read or agreed. Overdue is date-derived and
  must not erase the underlying submission state. Document review statuses
  are separate. New status tracking must be implemented before display.
- **Cancellation:** require confirmation describing the affected request and
  supplier access. Do not silently remove historical submissions.

### 5.6 Compliance

Show counts of compliant, incomplete, pending review, and action-required
suppliers, plus expired certificates. The supplier detail explains each
missing, rejected, expired, or pending requirement and links to the relevant
document or request. Filters include status, supplier, and requirement.

Proposed calculation, subject to product approval: assess each supplier
against its currently applicable requirements; an approved, non-expired
document satisfies a requirement. Show the numerator and denominator with any
percentage. Do not label a supplier with zero applicable requirements as
100% compliant; show **No requirements assigned**. Define precedence for
multiple simultaneous issues before implementation, and show all relevant
reasons rather than concealing them behind one score.

### 5.7 Expiry tracking

Provide a list and calendar view with supplier, document, expiry date, days
remaining, and review status. Filters cover 90, 60, 30, and 7 days, expired,
supplier, and document type. An authorized user can start a renewal request.
Calendar dates use the company time zone; an expiry date remains valid through
that date, consistent with the existing decision.

Scheduled 90/60/30/7-day reminders are proposed, not currently implemented.
Before launch, define delivery channel, recipient, duplicate prevention,
time-zone scheduling, and how changed expiry dates affect reminders. Clearly
separate an upcoming reminder from a message actually sent.

### 5.8 Reports and notifications

- **Reports:** offer supplier compliance, document status, expiry,
  outstanding requests, and supplier performance. Each report shows its
  date range, company, filters, calculation explanation, generation time,
  and result count. Provide authorized PDF and CSV export, export progress,
  empty state, and an error/retry state. Exports must use server-authorized,
  tenant-scoped data and avoid public file URLs. Reporting and exports are
  proposed, not implemented.
- **Notifications:** a list with event, supplier/document context, timestamp,
  read state, and link to the affected item. Filters include unread and event
  type. Supplier submissions currently generate in-app notifications; email,
  push, read-state management, and preference controls require implementation.

### 5.9 Team, subscription, and settings

- **Team members:** show name, email, role, status, and last activity.
  Owners and authorized administrators can invite, change role, or deactivate
  where permitted. Explain invitation expiry, pending state, and the
  company-level 10-member limit including owners. Confirm role changes and
  deactivation; preserve audit history. Pending-invitation seat reservation
  remains a product decision.
- **Roles and permissions:** show an understandable permissions matrix and
  prevent self-lockout and unauthorized escalation in the implementation.
  Current roles are Owner, Administrator, Quality Manager, Procurement
  Manager, and Viewer. Owners and administrators manage company, invitations,
  and billing; Quality Managers manage requirements and reviews; Procurement
  Managers manage suppliers and requests; Viewers have read-only access.
  Quality and Procurement Managers can export where the existing permission
  model permits it. The server and database must enforce permissions.
- **Subscription and billing:** display plan, trial end, usage and limits,
  storage usage if available, billing history, payment method, upgrade,
  downgrade, and cancellation only when those features exist. Current
  decisions are a 30-day trial, planned EUR 30/company/month, 100 suppliers
  including archived, and 10 members including owners. Billing is deferred;
  trial expiry currently does not restrict access. Never show a successful
  payment or live billing controls before a payment provider is integrated.
  Future cancellation should explain suspension, reactivation, and the
  proposed six-month deletion policy; these are not yet implemented.
- **Settings:** company profile, logo, address, country/language, document
  categories, default requirements, notification preferences, and team
  permissions. Use grouped settings with a clear save action and unsaved
  change warning. Only company profile editing currently exists.
- **User profile and security:** personal details, language, password change,
  session/security options, and sign out. Clearly distinguish personal
  settings from company-wide settings. These controls are proposed.

## 6. Supplier portal screens

1. **Invitation landing:** identify manufacturer and supplier, request
   purpose, link expiry, and language control. An invalid, expired, or revoked
   link shows the same safe bilingual message and directs the supplier to
   contact the manufacturer. Do not reveal whether a company or token exists.
2. **Requirements:** show each requested document, its status, helpful
   instructions, due date when supported, and the next available action.
   Clearly separate items awaiting review from items accepting uploads.
3. **Upload:** select PDF, JPEG, or PNG, maximum 15,000,000 bytes. Show the
   chosen filename, optional expiry date, validation error, and **Submit
   document**. Upload progress must represent actual progress; if unavailable,
   show an indeterminate indicator instead of a fabricated percentage.
4. **Confirmation:** show which document was submitted and that manufacturer
   review is pending. Do not claim approval, malware clearance, or email
   delivery without confirmation.
5. **Status and history:** show request-specific submission status and
   available versions. Expose only supplier-authorized information; history
   beyond the current portal behaviour is proposed.
6. **Rejection and replacement:** show the relevant rejection reason and a
   clear replacement upload action. Existing links remain reusable for the
   same request until expiry or revocation; no final-submit lock is assumed.

The link is a bearer secret. Avoid displaying it unnecessarily or including it
in analytics. The current development scanner is a no-op; production uploads
remain blocked until a real scanner and other required protections exist.

## 7. Status and interaction language

| Context | Status | Presentation and next step |
| --- | --- | --- |
| Document | Requested | Neutral; supplier can submit if link is valid. |
| Document | Submitted / Under review | Blue; manufacturer reviews, supplier waits. |
| Document | Approved | Green; show expiry when available. |
| Document | Rejected | Red; show reason and replacement action. |
| Document | Expired | Red; show expiry and renewal action. |
| Document | Cancelled / Superseded | Muted; retain historical context. |
| Request | Draft / Sent / Viewed / Submitted | Neutral or blue; show the current request stage without implying delivery or reading. |
| Request | Overdue / Completed / Cancelled | Amber, green, or muted respectively; explain the relevant date or event. |
| Compliance | Compliant / Incomplete / Pending review / Action required | Label plus explanation and list of contributing requirements. |

For every destructive or irreversible action, show the affected object and
consequences before confirmation. For failed or interrupted operations,
retain safe form input and show how to retry. For long lists, keep search and
filter state visible and offer a clear reset.

## 8. Main journeys

| Journey | Primary screens and expected outcome |
| --- | --- |
| Manufacturer registration | Create company account -> verify email -> workspace created -> workspace selection/dashboard. |
| Add supplier | Supplier list -> add supplier -> validate -> supplier detail. |
| Request documents | Supplier detail or dashboard -> select requirements -> review -> send or securely share link -> request detail. |
| Supplier submission | Open secure link -> choose a requirement -> upload -> confirmation -> manufacturer in-app notification. |
| Review and replacement | Open submitted document -> review -> approve or reject with reason -> supplier sees feedback and may submit a replacement. |
| Expiry and renewal | Expiry list -> inspect document -> initiate renewal request -> track replacement and review. Scheduled reminders require implementation. |
| Join a team | Receive invitation -> verify matching email -> accept role -> open existing company workspace; do not create a second company. |
| Billing and cancellation | Authorized administrator reviews usage -> manages plan or cancellation when billing exists -> sees explicit outcome and retention terms. |

## 9. Accessibility and localization

- Target WCAG 2.2 AA; test keyboard-only operation, visible focus, screen
  reader labels, heading order, form errors, contrast, zoom to 200%, and
  reflow at 320 CSS px.
- Use semantic headings, buttons, tables, form labels, and live regions for
  progress and status updates. Do not announce every percentage change.
- Support English and German throughout the proposed application. Preserve
  the selected supplier language through upload and error redirects. Current
  localization is limited to the supplier portal.
- Examples: **Request documents / Dokumente anfordern**;
  **Under review / In Prüfung**; **Approved / Genehmigt**;
  **Rejected / Abgelehnt**; **Expired / Abgelaufen**.
- Format dates and numbers for the selected language; identify the company
  time zone where deadlines or expiry times are shown. Allow longer German
  labels to wrap without clipping.
- Respect reduced-motion preferences. Errors must identify the field and the
  correction needed without exposing sensitive data.

## 10. Tenant and safety requirements

Every list, count, detail view, notification, export, and file access must be
restricted to the selected company and the user's authorized role. UI hiding
is not an authorization boundary: enforce membership, permissions, row-level
security, and storage access on the server and database. Do not leak data in
search results, errors, caches, exports, URLs, or logs. Supplier access is
limited to the request associated with the secure link.

Production readiness depends on the unresolved scanner, deployment,
rate-limiting, token-log redaction, email delivery reliability, tenant
isolation testing, and other items documented in [SECURITY.md](./SECURITY.md).

## 11. Recommended delivery order

1. Establish tokens, typography, layout, navigation, component states, and
   accessible responsive patterns.
2. Refine registration, sign-in, workspace creation, dashboard, and suppliers.
3. Refine requirements, document requests, document library, and review.
4. Polish supplier upload, confirmation, rejection, and replacement on mobile.
5. Add compliance and expiry tracking with agreed calculation and reminders.
6. Add reports and notifications with authorized exports.
7. Add team invitations, roles, and permission management.
8. Add billing and remaining settings only after their underlying workflows
   and providers are selected.
9. Validate responsive layouts, English/German copy, accessibility, tenant
   isolation, and production safeguards before release.

For each screen, design and test the default, loading, empty, filtered-empty,
permission-denied, validation-error, server-error, success, and mobile states
that apply. Implement one workflow at a time; a designed screen is not evidence
that its underlying feature is available.
