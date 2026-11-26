# Hampton App: questions and document requests for Jersey counsel

**Status: DRAFT, 26 November 2026.** Prepared by Optimyze for Hampton Estates to review before it is sent to
Hampton's Jersey lawyer. It is not legal advice and nothing in it has been validated. It describes what the
software does today, from its source code and project records, and asks counsel to confirm, correct or supply the
legal content. Wherever this note says "we", it means Hampton Estates (the controller) and Optimyze (which builds and
operates the software for Hampton).

---

## 0. Summary of what we are asking for

| # | Topic | What we would like back | Priority |
|---|---|---|---|
| 1 | Data protection clause for sales and lettings contracts | A short clause (or clauses) to insert in our agreements | High |
| 2 | Retention after a tenancy or a sale ends | Confirmed periods, start dates and legal basis for each record type | High |
| 3 | Processing agreements and international transfers | Outline of a Hampton–Optimyze processor contract (Art. 19), a view on each provider, and on remote access from Colombia | High |
| 4 | Privacy notice and the website chat | Comments or a marked-up version of our notice, including the updated email, Facebook, chat and valuation wording | High |
| 5 | Winning new landlords and vendors | Answers to nine specific questions, and consent wording for valuation offers | Medium |
| 6 | Legal periods used by the rentals module | Confirmation (or correction) of each period, with a reference we can record | High |
| 7 | Rent review notice letter | A rent review notice template for the 2025 tenancy rules | High |
| 8 | Housing category table used to suggest homes | Validation of the rules table, or corrections | Medium |
| 9 | Other drafts the app prepares (optional) | Review of a tenancy agreement template and of arrears and renewal letters, if in scope | Low |

A list of annexes is at the end (section 11).

---

## 1. Background

### 1.1 Who is involved

| | Details |
|---|---|
| Controller | Hampton Estates, estate and letting agency, St Helier, Jersey |
| Registered company details | Hampton can supply the legal name and company number directly to counsel. |
| JFSC and JOIC registrations | Hampton confirmed both on 20 November. Registration numbers and certificates are kept outside this packet. |
| Processor (proposed) | Optimyze designs, builds and operates Hampton App on Hampton's instructions. |

Please advise whether the registrations cover the handling of rent and deposits paid into a Hampton account, and whether Optimyze requires its own JOIC registration as a processor.

Hampton lets homes (fully managing some of them, including rent collection and monthly statements to landlords, and
only finding a tenant for others), sells homes, and handles some commercial property and business transfers.

### 1.2 What Hampton App is

Hampton App is Hampton's own software. It has:

- **A public website** with Hampton's listings, a "Register your search" form for people looking to rent or buy, a
  viewing request form, a privacy notice and a website chat answered by staff.
- **A staff panel**, used only by Hampton's team after signing in with Google, where they review searches, suggest
  homes, arrange viewings, record offers and sales, and run the rentals they manage (tenancies, rent, deposits,
  repairs, compliance checks and statements).
- **A clock** that runs scheduled jobs: reminders to staff, retention clean-up, daily summaries to the team.
- **Email through the app** uses Hampton's Gmail account. The carrier on the Hermes server sends or drafts emails, reads replies to recognised threads, and returns them to the staff panel. A live enquiry and reply were tested on 25 November. Gmail retains its own mailbox copies.
- **Hermes** uses a model to draft selected enquiries from property details, proposed times and, when supplied for that purpose, household size. The model is given no recipient address or named party in the designated fields. The carrier handles the actual address and greeting. The property import also supplies selected Drive documents to Hermes. Filename exclusions filter known personal and financial documents, but do not establish the contents of every accepted file.
- **A private Telegram channel for the team**, which receives counts, references and links to tasks in the panel. The alert format excludes client names and contact details.

Design rules that matter for the questions below:

- **Approval depends on the workflow.** Staff review matches, presentations and individual offer emails. Availability and viewing-coordination emails can be saved as Gmail drafts or sent under a team setting. Viewing reminders and post-visit emails are enabled for a controlled trial. Keeping them enabled beyond the trial needs a separate decision.
- **"Unknown" is not "yes".** Where a legal rule depends on facts the app does not have, it says so and asks a person.
- **Rental legal parameters** are initially marked "estimated". Staff record the reference and date of legal validation in Settings › Legal terms. Section 7 describes which checks this changes.

### 1.3 Data classes we use

| Class | Examples | Project policy for model inputs |
|---|---|---|
| C0 Public | Published listings, public market adverts | May be processed by AI |
| C1 Business contact | Agents' emails, company names | AI only with a provider under a processing agreement |
| C2 Basic personal | Name, phone, what an applicant is looking for, chats | AI only with a provider under a processing agreement, minimised |
| C3 Sensitive | ID documents, bank details, income, references, arrears and disputes | Never sent to a cloud AI provider or to Telegram |

---

## 2. Data protection clause for sales and lettings contracts

**What the app does today.** Personal data in the rentals module (landlords, tenants, occupants, payments, deposits,
inventories, repairs) and in the sales module (offers, sale progress) is kept in the app. The privacy notice states contract and legal obligation as bases for managed tenancy records and gives a retention period. We seek counsel’s assessment of the appropriate bases for the sales and lettings workflows. Our contracts themselves do not yet contain a data protection clause.

**Questions.**

1. Please provide a short data protection clause for each of: (a) Hampton's management agreement with landlords,
   (b) the tenancy agreement Hampton uses (see also section 10), (c) Hampton's terms with vendors, and (d) the offer
   or memorandum of sale documents with buyers.
2. The clause should **inform** (who the controller is, purposes, legal bases, recipients such as contractors,
   mydeposits and the other party's lawyers, retention by reference to the privacy notice, rights and the JOIC) rather
   than ask for consent, and it should not promise that data will be kept indefinitely or deleted at a fixed date that
   the law may override. Is that the right approach under the Data Protection (Jersey) Law 2018?
3. Should the clause cover the other occupants named in a tenancy, who do not sign it?

**Requested document:** the clause(s), ready to insert.

**Unblocks:** PRE-33 (this package), ADM-19 (tenancy agreement template), PRE-09 (privacy notice coverage).

---

## 3. Retention after a tenancy or a sale ends

The middle column gives the periods in the public privacy notice (Annex A). The last column describes how the software implements them and where enforcement remains incomplete.

| Record | Period stated in the notice | Implementation |
|---|---|---|
| Applicant searches and contact details | 12 months from the last activity once all searches are resolved | An active search, an open offer or a sale protects the record. Linked ongoing tenancies can also protect a contact. The notice email in month 12 is switched off (Annex D) |
| Viewing requests | 12 months after the day of the viewing | The daily cleanup selects requests older than 12 months |
| Sale records and the details in them | 5 years after the sale completes or falls through | The cleanup preserves contacts linked to a sale in any state. Five-year deletion of sales is unimplemented |
| Tenancy, payment, deposit and repair records | While the home is managed or the tenancy lasts, and 6 years after it ends | The project has no verified six-year automatic deletion for these records |
| Requests to sell, let or value a property | 12 months after last activity | The daily cleanup uses the date of the last update |
| Website chat | 30 days after the last message | The daily cleanup removes expired conversations and their messages |
| Email through the app | In-app content 30 days and delivery records 90 days | The app cleans stored content and delivery records. Gmail holds a separate copy. Please advise on mailbox retention as well. |

The app also keeps an internal register of privacy requests (access, rectification, erasure, objection,
portability). The response deadline for each request is typed in by staff: the app does not calculate one, because
we have not confirmed the statutory period and its possible extension.

**Questions.**

1. Is **5 years after completion or after the sale falls through** the right period for sale records? From which
   event does it run, and does it cover both buyer and vendor records and the due diligence references?
2. Is **6 years after a tenancy ends** right for tenancy, rent, deposit and repair records, taking into account Jersey
   limitation periods for contract claims, tax and GST record keeping, and the deposit scheme? Should landlords'
   statements be kept for a different period?
3. Do any records need a **longer** period (for example, where a dispute or a claim is open), and is "until the
   dispute is closed, then the normal period" an acceptable rule?
4. What is the **statutory period to respond** to access and other data subject requests in Jersey, and when may it
   be extended? We will enter it as a parameter.
5. Please review the **retention notice email** (Annex D). It tells a contact that their details will be deleted on or
   after a given date unless they reply. Is the wording adequate, and is one month's notice reasonable?

**Requested document:** a short retention schedule (record, period, start event, legal basis) we can copy into the
app's parameters and the privacy notice.

**Unblocks:** PRE-12 (retention and privacy requests: the post-tenancy and post-sale periods), PRE-09.

---

## 4. Processing agreements, providers and international transfers

**What the app does today.** The intended arrangement, decided by Hampton, is that **Hampton owns** every account
used by the app and **Optimyze operates** them as an authorised processor. Account ownership and recovery still require verification for each service. We have no signed processing agreements on file in the project. The privacy notice already
names Cloudflare, Google for email, and Optimyze as acting on Hampton's instructions.

Optimyze's personnel administer the systems remotely, **including from Colombia**.

Providers involved, and what each receives:

| Provider | Role in the app | Personal data it receives | Location / status |
|---|---|---|---|
| Cloudflare | Hosts the application and its records and checks forms for spam. Its separate outbound email transport is off. Workers AI is proposed for a future chat phase. | App records, form submissions and any messages the app stores. Please assess each product actually used. | Global network. Coverage of each product remains to be confirmed. |
| Google | Staff sign-in through Firebase, read-only property import from Drive, Google Fonts and Hampton's active Gmail transport. The viewing calendar integration is off. | Staff accounts, selected property files, visitors' IP addresses for fonts, recipients, messages and replies in Gmail. | Global. Mailbox copies have a separate retention lifecycle. |
| Optimyze | Builds and operates the app and Hermes. | Administrative access for maintenance. | Remote, including Colombia. |
| OpenAI via Hermes | Primary model through a ChatGPT Pro subscription used through Codex. | Public listing tasks, selected property documents and minimised enquiry facts. Free text or an accepted file could identify someone. | Please assess this subscription and its terms separately from any API offering. |
| DeepSeek via Hermes | Configured fallback for model tasks. | Please assess which inputs may be sent on fallback, including data in property files or user-supplied text. | Separate transfer and contractual review requested. |
| Virtual server provider | Hosts the mail carrier, Hermes and team notifier. | The carrier processes recipient addresses, message bodies and replies. Selected model inputs are narrower than the carrier's data. | Hampton and Optimyze can confirm the provider and hosting location privately. |
| Telegram | Private team alerts with counts, references and links back to the panel. | Team account information and limited operational notifications. | Global. |
| Meta | Integration for Hampton's Facebook Page. The inbound switch is enabled, but connection and a real message test are pending. Sending and model-assisted drafts are off. | Once connected, message text, replies, timestamps and the Facebook account identifier. The app discards attachments. | Global. |
| Matterport, YouTube, Vimeo | Property tours and videos, loaded only when a visitor opens them | Visitor's IP address | Their own policies |

**Questions.**

1. Please provide an **outline (or draft) of the Hampton–Optimyze processor contract** under Art. 19 of the Data
   Protection (Jersey) Law 2018: subject matter, duration, instructions, confidentiality, security, sub-processors
   (with the table above as a schedule), assistance with data subject requests and breaches, deletion or return at
   the end, and audits.
2. **Remote access from Colombia.** What safeguards does Jersey law require for Optimyze's personnel to access the
   data from a country without an adequacy decision? Are standard contractual clauses (EU SCCs or the UK addendum)
   accepted in Jersey, and is a transfer risk assessment needed? Please supply or point us to the clauses.
3. Do Cloudflare's and Google's **standard data processing terms** satisfy Art. 19 when the accounts are in Hampton's
   name, or does Hampton need anything further?
4. **Cloudflare Workers AI.** For a future automatic website chat, we propose Cloudflare Workers AI. Please confirm what terms, training and retention commitments would apply. Does Cloudflare, Inc.'s Data Privacy Framework certification cover
   Workers AI for a transfer to the United States under Art. 66(2)(a), or is another safeguard needed?
5. **Model inputs and fallback.** What contractual and transfer safeguards do the enquiry facts and selected property documents require under the current subscription and fallback arrangements? What further steps would be required before a Facebook message could be sent to either model for a draft reply? This is a proposed use of customer text. Which uses should stay disabled until assessed?
6. **Telegram.** What is Telegram’s role for team membership and alerts that contain counts, references and links to the panel?
7. **Meta.** When Hampton's Facebook page messages are handled in the panel, what is Hampton's relationship with Meta
   (processor, joint controller for page data, or independent controller), and what must the notice say?
8. Does **Optimyze need its own JOIC registration** as a processor?
9. Is a short **data protection impact assessment** (Art. 16) required before switching on the automatic website chat,
   and would you review one if we draft it?

**Requested documents:** the Art. 19 contract outline or draft with its sub-processor schedule; the transfer clauses
for remote access; a short note on each provider.

**Unblocks:** PRE-13 (processing agreements), PRE-28 (account ownership and Optimyze's authorised operation),
PRE-34 (prerequisites for the automatic website chat), MSG-04 (the automatic chat itself).

---

## 5. Privacy notice and the website chat

**What the app does today.** The privacy notice is a page on the website (Annex A). It is linked from the footer, it
must be acknowledged on the last step of "Register your search" and in the chat form, and it is linked next to the
viewing request button. It covers: who we are, what we collect, why, legal basis, who else handles the data, retention,
the website chat, email sent to the app, landlords and tenants of managed homes, rights (including the Art. 36
objection to marketing), the browser storage used, and how to contact us. The current notice identifies the controller by its trading name and address. Please advise what additional identifying information, if any, belongs there.

We request particular attention to the following wording:

- **"Web chat."** A person reads and answers every message; the chat does not reply automatically. Conversations are
  deleted 30 days after the last message; the visitor can delete an open conversation from their device ("Delete
  chat") or ask us to delete it. The chat asks the visitor to tick "I have read the privacy notice" before sending.
- **"Email sent to the app."** Gmail carries the app's ordinary mail and keeps its own copy. The notice also describes Cloudflare for limited cases such as sign-in codes or replies to the app's own reply address. The app removes message content after 30 days and delivery records after 90 days. It retains a duplicate-message fingerprint for up to 90 days and an address suppression fingerprint until removal is requested.
- **"Messages on Facebook."** The notice covers staff replies, data kept in the app and the distinction between deletion from the app and copies held by Meta. It currently describes human replies. Please review it before any model receives text to draft a reply.
- **Marketing consent.** "Register your search" has an optional, unticked box: "Send me news about homes and the Jersey
  market (optional). You can stop at any time."

A future paragraph will be needed when the chat starts answering automatically (section 4, Q4 and Q9): it would say
the first replies are automatic, what is kept, the model provider’s verified training and retention practices, the
30-day period, that a search is only registered if the visitor asks, how to delete, and the right to complain to the
JOIC.

**Questions.**

1. Please review the whole notice (Annex A) for completeness under the Data Protection (Jersey) Law 2018, and mark up
   any changes.
2. Are the **legal bases** right: steps at the person's request before a contract, legitimate interest for record
   keeping and anonymous interest counts, consent for news, contract and legal obligation for managed tenancies?
3. Is a **tick box saying "I have read the privacy notice"** appropriate where the basis is not consent, or should it
   be a plain link with no box?
4. Are the web chat, email, Facebook and marketing paragraphs adequate? Is keeping a
   fingerprint of a suppressed address "until the person asks us to remove it" acceptable?
5. What should the **automatic chat paragraph** say, and is the wording proposed above enough as a starting point?
6. The public owner form is enabled and its first end-to-end submission remains to be checked. The notice now describes the owner's contact details, property address, purpose and 12-month retention after last activity. Is that wording adequate, including the stated legal basis?

**Requested document:** a marked-up notice, and the wording of the automatic chat paragraph.

**Unblocks:** PRE-09 (privacy notice), the notice for the active Gmail workflow (AUT-17), MSG-02
(website chat: legal review of its notice), PRE-34 and MSG-04 (automatic chat), PUB-10 (Book a valuation).

---

## 6. Winning new landlords and vendors

**What the app does today.** Hampton prefers owners who come forward themselves: an enabled "Book a valuation" form, a page showing how many people are searching in each parish (built, not published; only groups of 5 or
more), and a QR code on each property poster in the office window that counts openings in aggregate. Leaflets are
postponed. Hampton does not buy lists, copy portals or run call campaigns. Two further ideas are on hold until we
have your answers:

- **REG-16: offering valuations to people already in the app** (for example a buyer who must sell first, or an
  existing landlord). The current consent ("news about homes and the Jersey market") does not cover valuation offers,
  and the notice says marketing is sent only with consent.
- **BUS-20: researching owner companies** (developers, landlords with portfolios) with a separate assistant that has
  no access to the app, reading only sources whose terms allow it (company websites, planning decisions) and never the
  JFSC companies registry. A person reviews whatever it finds before it is entered.

**Questions.**

1. **Consent for valuation offers (REG-16).** Please draft the wording of a separate, optional consent for "offers of
   a valuation and of our sales and letting services". May we ask existing contacts for this consent by email, or is
   the request itself direct marketing?
2. **Letters addressed to "The Owner"** at a property address, without a name. Is this processing of personal data and
   direct marketing under the 2018 Law? What must such a letter say (identity, Art. 36 objection)?
3. **Sale data by address.** May Hampton use publicly available sale records by address (for example, historical
   transactions shown on property portals) to choose which owners to write to?
4. **Boards and signs.** Beyond the owner's permission, are there Jersey rules on estate agents' boards (planning,
   size, removal within a set number of days after a sale or letting)?
5. **Leaflets** delivered by parish without any address list: any requirements?
6. **Referrals.** When a client recommends a friend who may want to sell or let, may Hampton contact that person, and
   what must it tell them, given that their details did not come from them?
7. **Company research (BUS-20).** Is researching companies and their directors from public websites and planning
   decisions, for business-to-business approaches, acceptable on legitimate interest? Would you provide a short
   legitimate interest assessment template?
8. **Telephone, SMS and email marketing in Jersey.** We understand Jersey has no equivalent of the UK's PECR and found
   no specific rules for unsolicited calls, SMS or email. Is that correct, both for individuals and for businesses?
   Is there a preference service Hampton should screen against?
9. **Redress scheme.** Must a Jersey estate or letting agent belong to a complaints or redress scheme, or hold client
   money protection?

**Requested documents:** the valuation consent wording; short answers to questions 2 to 9.

**Unblocks:** REG-16 (valuation offers to existing contacts), BUS-20 (company research), PUB-10 (Book a valuation),
PUB-19 (parish demand page).

---

## 7. Legal periods used by the rentals module

**What the app does today.** The rentals module keeps a calendar per home and per tenancy, warns staff 60, 30 and 7
days before a deadline, and shows overdue items in red. Staff can record the reference and date of legal validation for the configurable periods in Annex H. For a tenancy recorded as covered by the 2025 rules, validation makes the app block an overlong initial term or a further fixed term. A possible premium still requires staff confirmation. The two staff reminder intervals are fixed in the software.

| Parameter | Current value | Source we used |
|---|---|---|
| Deposit protected with mydeposits Jersey, with prescribed information | 30 days from receipt | Deposit Scheme Regulations 2014; gov.je |
| Check-in and check-out inventory | 7 days | Residential Tenancy (Jersey) Law, as amended 2025 |
| Rental dwelling licence | every 2 years | gov.je, rented dwellings |
| Licence copy to the tenant (with the complaints route) | 28 days | gov.je |
| Licence changes notified | 28 days from the change | gov.je |
| Electrical installation report (EICR) | every 5 years; copy to the tenant within 28 days | gov.je |
| Electrical checklist | yearly and at each change of tenant | gov.je |
| Gas safety check | yearly | gov.je |
| Smoke and CO alarms check | yearly | our assumption |
| 29 prescribed hazards | next review date entered by staff | 2018 Order; no period found |
| Tenant's notice (periodic tenancy) | 1 month | 2025 amendments |
| Landlord's notice without cause (periodic tenancy) | 12 months | 2025 amendments |
| Rent increase | at most once every 12 months, with 2 months' written notice, capped at Jersey RPI | 2025 amendments |
| Date the 2025 rules start | 15 April 2026 | gov.je |
| Longest initial fixed term | 3 years (one initial fixed term only) | 2025 amendments |
| Renewal reminder | 90 days before a fixed term ends | Hampton's practice, not legal |

**Questions.**

1. Please confirm or correct each value above.
2. **From when do the 28 days run for a new tenant?** Today: from the later of the tenancy's start and the date of the
   licence or EICR.
3. **How often must the 29 prescribed hazards be reviewed?** Today the team enters the next review date.
4. **Which accommodation is within the scope** of the 2025 rules (for example lodgings, holiday lets, staff
   accommodation, share transfer flats)? The app records "yes", "no" or "unknown" per tenancy.
5. **Which sums count as a premium or key money?** For example: an admin or referencing fee, a holding deposit, a
   charge for an inventory, or furniture the tenant must buy. Today the app asks staff to declare that any sum added
   outside the rent is not a premium.
6. Fixed terms agreed **before 15 April 2026** stay under the 2011 rules until they end. Is it right that the app
   treats a tenancy as covered only if it was agreed on or after that date?

**Requested document:** a short written confirmation of each parameter, with a reference and date we can record.

**Unblocks:** ADM-11 (compliance calendar: copy, change and checklist periods), ADM-17 (validated legal terms),
ADM-20 (2025 tenancy rules: start date, initial term cap, scope and premium), and in turn ADM-15 (section 8).

---

## 8. Rent review notice letter (ADM-15)

**What the app does today.** When staff change a tenant's rent, a rent assistant uses the Jersey RPI that staff enter
(with its source and publication date) to work out the maximum new rent and the earliest date it can start, from the
notice and interval periods in section 7. Each change records the RPI used, the cap and the earliest date. The app
then offers a **draft of facts to copy**, labelled "DRAFT · not a notice letter", with no legal wording (Annex E). It
says: "No notice letter template validated by a Jersey lawyer exists yet. Nothing is sent from the app." The cap
warns but does not block, because of the exceptions in the law.

**Questions.**

1. Please provide a **rent review notice template** that complies with the Residential Tenancy (Jersey) Law 2011 as
   amended in 2025. The app can fill these fields: tenant name(s), property address, payment reference, current rent,
   new rent, date the new rent starts, Jersey RPI percentage, its publication date and source, the date of the notice,
   and Hampton as agent for the landlord (landlord's name if needed).
2. **Which RPI figure** applies: the latest annual change published before the notice, or another? How should the
   cap be rounded?
3. **How must the notice be served:** is email enough, or post or hand delivery? Does the 2-month period run from
   sending or from receipt?
4. Must the letter mention the tenant's **right to apply to the Rent Tribunal**, and with what wording?
5. Should the letter differ for **tenancies still under the 2011 rules**, or where an **exception** applies
   (improvements for the tenant, rent well below market)?
6. May the agent sign on the landlord's behalf?

**Requested document:** the template, with placeholders matching the fields above.

**Unblocks:** ADM-15 (with the template, a small code step generates the letter from the draft's data), and the
later sending of the notice by email (ADM-03 with AUT-17), always after a person reviews it.

---

## 9. Housing category table used to suggest homes (BUS-13)

**What the app does today.** When staff look for homes for an applicant, the app compares the applicant's declared
housing status with each listing's housing category, tenure and any restriction, using the table below (source:
gov.je, Control of Housing and Work (Jersey) Law guidance, read 25 October 2026). "Excluded" homes are not suggested;
"to confirm" homes are suggested with a note for staff. A person reviews every suggestion before anything is sent to
the applicant. The table lives in the code (Annex F): changing it requires a new release.

**Renting**

| Applicant's status | Registered home | Qualified home | Category not given |
|---|---|---|---|
| Entitled, Permanent Entitled, Licensed | Allowed | Allowed | Allowed |
| Licensed for Lease Only | Allowed | Allowed (note: "lease under 9 years") | Allowed |
| Entitled for Work Only | Allowed | Excluded | To confirm |
| Registered / Standard | Allowed | Excluded | To confirm |

**Buying**

| Applicant's status | Freehold, flying freehold or leasehold (Royal Court) | Share transfer, Registered home | Share transfer, Qualified home | Share transfer, category not given |
|---|---|---|---|---|
| Entitled, Permanent Entitled, Licensed | Allowed | Allowed | Allowed | Allowed |
| Licensed for Lease Only | To confirm (only jointly with an eligible partner) | Allowed | Allowed | Allowed |
| Entitled for Work Only | To confirm (only jointly with an eligible partner) | Allowed | To confirm (occupies only with an eligible partner) | To confirm |
| Registered / Standard | Excluded | Allowed | Excluded | To confirm |

If a sale has no tenure, the last three statuses in the table require confirmation. For a first-time buyer restriction, a known ineligible status or a recorded need to sell first fails the check. Entitled and Permanent Entitled applicants recorded as first-time buyers pass it. Other unresolved cases go to staff. Over-55 restrictions always require confirmation. If the applicant's status is unknown, a Qualified home requires confirmation. A Registered home passes this category check for rent or share transfer. For other purchase tenures, the software leaves the housing check unrated unless another restriction applies.

**Points where the table departs from our earlier plan, or may be wrong:**

- Registered (now Standard) status may buy a **share transfer of a Registered home** with no flag for review. Our
  plan said a purchase should be flagged, because occupying the home may need consent.
- **Licensed for Lease Only** may buy (allowed or "to confirm"), while our plan said renting only.
- The 9-year lease limit for Licensed for Lease Only is shown as a note; the app does not check the lease length.
- Since 14 September 2026 we understand that "Standard" replaced "Registered" as a status name; the app treats them as
  the same.

**Questions.**

1. Is the table correct for renting and for buying? Please correct any cell.
2. Should the app **exclude** homes automatically, or only flag them for staff?
3. How should the three departures above be resolved?

**Requested document:** the table, validated or marked up.

**Unblocks:** BUS-13 (housing status filter; Hampton also still has to give the category of three listings).

---

## 10. Other drafts the app prepares (optional)

If it fits the same engagement, we would welcome a review of:

- **Tenancy agreement template (ADM-19).** The app will generate the agreement from the tenancy's data (including the
  date it was agreed and whether the 2025 rules apply) only once a template reviewed by a Jersey lawyer exists. The
  agreement is signed outside the app. Please tell us whether you can provide one, or review Hampton's current one.
- **Arrears drafts (ADM-09).** A friendly reminder, a firm reminder and a formal letter, each labelled as a draft and
  sent by a person (Annex G).
- **Renewal messages (ADM-14).** A message asking the landlord whether to renew, and one telling the tenant the
  landlord's decision (Annex G).
- **Anti-money-laundering checks on buyers and sellers (OFE-07).** Staff can mark a due-diligence milestone, but the app has no structured checks register. Hampton has confirmed its JFSC registration. What should the app record (with only a reference to documents
  kept elsewhere) under section 18 of the JFSC Handbook?

---

## 11. Enclosed annexes

The companion document contains the privacy notice, form labels, sample correspondence and software rules. All people, properties, balances, indices and dates in worked examples are fictitious. Hampton can supply its company particulars and the hosting location directly to counsel. [Open annexes A–H](annexes.md)

Public sources we relied on (consulted October 2026):

- Residential Tenancy (Jersey) Law 2011, current version: jerseylaw.je/laws/current/l_31_2011
- gov.je, residential tenancy changes 2026; rented dwellings licensing; deposit protection; residential status
- Data Protection (Jersey) Law 2018: jerseylaw.je/laws/current/l_3_2018; JOIC registration guidance
- Proceeds of Crime (Jersey) Law 1999; JFSC Handbook section 18 (real estate agents)
