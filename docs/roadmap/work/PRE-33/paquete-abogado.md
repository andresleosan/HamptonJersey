# Hampton App: questions and document requests for Jersey counsel

**Status: DRAFT, 17 November 2026.** Prepared by Optimyze for Hampton Estates to review before it is sent to
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
| 4 | Privacy notice and the website chat | Comments or a marked-up version of our notice, including three specific paragraphs | High |
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
| Legal name | `###` |
| Company registration number | `###` |
| JFSC registration (Proceeds of Crime (Jersey) Law 1999, Schedule 2) | `###` |
| JOIC registration (Data Protection Authority (Jersey) Law 2018, Art. 17) | `###` |
| Processor (proposed) | Optimyze: designs, builds and operates Hampton App on Hampton's instructions |

> **Note on the `###` fields.** Hampton is confirming its legal name and registrations (JFSC and JOIC) at the time of
> writing. We will fill them in before sending, or send them separately. Please tell us if any answer below depends on
> them, in particular whether rent and deposits paid into a Hampton account count as administering client money and
> need their own registration, and whether Optimyze needs its own JOIC registration as a processor.

Hampton lets homes (fully managing some of them, including rent collection and monthly statements to landlords, and
only finding a tenant for others), sells homes, and handles some commercial property and business transfers.

### 1.2 What Hampton App is

Hampton App is Hampton's own software. It has:

- **A public website** with Hampton's listings, a "Register your search" form for people looking to rent or buy, a
  viewing request form, a privacy notice and a website chat (built; switched off between tests).
- **A staff panel**, used only by Hampton's team after signing in with Google, where they review searches, suggest
  homes, arrange viewings, record offers and sales, and run the rentals they manage (tenancies, rent, deposits,
  repairs, compliance checks and statements).
- **A clock** that runs scheduled jobs: reminders to staff, retention clean-up, daily summaries to the team.
- **Email through the app** (built, not yet switched on): emails sent from Hampton's domain and replies received into
  the panel. No real email has been sent through it.
- **An AI assistant called Hermes**, run by Optimyze on a virtual server, which drafts texts such as listing
  descriptions. It never reads the database; it only gets public data (published listings) and counts. Nothing it
  writes is sent to anyone until a member of staff approves it in the panel.
- **A private Telegram channel for the team**, which receives counts and listing references only ("New applicant",
  "New viewing request for [listing]"), never a person's details.

Design rules that matter for the questions below:

- **People decide.** The app suggests and drafts; a member of staff approves every match, presentation, business
  email and letter. Nothing is sent to clients automatically today.
- **"Unknown" is not "yes".** Where a legal rule depends on facts the app does not have, it says so and asks a person.
- **Legal periods are parameters marked "estimated"** until a Jersey lawyer validates them. The app records who
  validated them and when (Settings › Legal terms), and only then enforces them strictly.

### 1.3 Data classes we use

| Class | Examples | Rule today |
|---|---|---|
| C0 Public | Published listings, public market adverts | May be processed by AI |
| C1 Business contact | Agents' emails, company names | AI only with a provider under a processing agreement |
| C2 Basic personal | Name, phone, what an applicant is looking for, chats | AI only with a provider under a processing agreement, minimised |
| C3 Sensitive | ID documents, bank details, income, references, arrears and disputes | Never sent to a cloud AI provider or to Telegram |

---

## 2. Data protection clause for sales and lettings contracts

**What the app does today.** Personal data in the rentals module (landlords, tenants, occupants, payments, deposits,
inventories, repairs) and in the sales module (offers, sale progress) is processed under contract and legal
obligation. The privacy notice already has a section "Landlords and tenants of homes we manage" with that basis and
a retention period. Our contracts themselves do not yet contain a data protection clause.

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

**What the app does today** (and what the privacy notice says):

| Record | Kept for | Notes |
|---|---|---|
| Applicant searches and contact details | 12 months from the last activity once all searches are resolved | An active search, an open offer or a sale protects the record. A notice email in month 12 is built but switched off (Annex D) |
| Viewing requests | 12 months after the day of the viewing | |
| Sale records and the details in them | 5 years after the sale completes or falls through | Stated as anti-money-laundering record keeping |
| Tenancy, payment, deposit and repair records | While the home is managed or the tenancy lasts, and 6 years after it ends | Stated in the notice since 16 November 2026 |
| Website chat | 30 days after the last message | |
| Email through the app | Content 30 days; delivery records 90 days | See section 5 |

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
used by the app and **Optimyze operates** them as an authorised processor. The transfer of some accounts into
Hampton's name is still in progress, and no processing agreement has been signed yet. The privacy notice already
names Cloudflare and Optimyze as acting only on Hampton's instructions.

Optimyze's personnel administer the systems remotely, **including from Colombia**.

Providers involved, and what each receives:

| Provider | Role in the app | Personal data it receives | Location / status |
|---|---|---|---|
| Cloudflare | Hosting of the website, panel and database; anti-spam check on forms; email sending and receiving (not yet live); proposed AI model for a future automatic website chat (Workers AI) | All data held by the app | Global network; certified under the EU-US Data Privacy Framework (to confirm for each product, see Q4) |
| Google | Staff sign-in (Firebase Authentication); read-only import of property files from Google Drive; viewing calendar (built, off); website fonts | Staff accounts; property files Hampton shares; viewing times; visitors' IP addresses (fonts) | Global |
| Optimyze | Builds, maintains and operates the app and Hermes | Access to all data for maintenance | Remote, including Colombia |
| OpenAI (via Hermes) | Hermes's main AI model, through a ChatGPT Pro subscription signed in through Codex (not the API). "Improve the model for everyone" is switched off | Public data and counts only (C0) | United States |
| DeepSeek (via Hermes) | Hermes's fallback model, used when the main one is unavailable | Same as above (C0) | China |
| Virtual server provider | Hosts Hermes and the Telegram notifier | What Hermes receives (C0) and short-lived logs | `###` (to confirm) |
| Telegram | Team channel and, when enabled, Hermes's private chat with Optimyze's operator | Counts and listing references only | Global |
| Meta (planned) | Receiving and answering Hampton's Facebook page messages in the panel (decided on 16 November 2026; not built) | Messages people send to the page | Global |
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
4. **Cloudflare Workers AI.** For a future automatic website chat, we propose Cloudflare Workers AI (no training or
   retention of prompts, according to Cloudflare). Does Cloudflare, Inc.'s Data Privacy Framework certification cover
   Workers AI for a transfer to the United States under Art. 66(2)(a), or is another safeguard needed?
5. **OpenAI and DeepSeek through Hermes.** Today both receive public data and counts only. (a) Is any agreement needed
   while that remains true? (b) What would Hampton need before either could receive business contacts (C1) or
   applicants' details (C2): a business plan with a processing agreement, a transfer safeguard, an impact assessment?
   (c) Is DeepSeek, given its location, acceptable for anything beyond public data?
6. **Telegram.** If only counts and listing references travel through it, is Telegram a processor at all?
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
objection to marketing), the browser storage used, and how to contact us. The "Who we are" section still lacks the
legal name and JOIC registration number (`###`).

Three paragraphs need your review specifically:

- **"Web chat."** A person reads and answers every message; the chat does not reply automatically. Conversations are
  deleted 30 days after the last message; the visitor can delete an open conversation from their device ("Delete
  chat") or ask us to delete it. The chat asks the visitor to tick "I have read the privacy notice" before sending.
- **"Email sent to the app."** Replies to the app's emails are readable in the staff panel; Cloudflare sends and
  receives on our instructions; email content is removed after 30 days; delivery and receipt records after 90 days;
  attachments are not saved; a minimal fingerprint of each received message is kept up to 90 days to stop a duplicate
  delivery restoring a deleted message; and a fingerprint of an address that asked us to stop sending is kept to
  honour that preference until the person asks us to remove it.
- **Marketing consent.** "Register your search" has an optional, unticked box: "Send me news about homes and the Jersey
  market (optional). You can stop at any time."

A future paragraph will be needed when the chat starts answering automatically (section 4, Q4 and Q9): it would say
the first replies are automatic, what is kept, that the model provider does not train on or retain the messages, the
30-day period, that a search is only registered if the visitor asks, how to delete, and the right to complain to the
JOIC.

**Questions.**

1. Please review the whole notice (Annex A) for completeness under the Data Protection (Jersey) Law 2018, and mark up
   any changes.
2. Are the **legal bases** right: steps at the person's request before a contract, legitimate interest for record
   keeping and anonymous interest counts, consent for news, contract and legal obligation for managed tenancies?
3. Is a **tick box saying "I have read the privacy notice"** appropriate where the basis is not consent, or should it
   be a plain link with no box?
4. Are the three paragraphs above (web chat, email sent to the app, marketing consent) adequate? Is keeping a
   fingerprint of a suppressed address "until the person asks us to remove it" acceptable?
5. What should the **automatic chat paragraph** say, and is the wording proposed above enough as a starting point?
6. The "Book a valuation" form for owners (built, not open) will collect name, contact details, the property address
   and whether they want to sell or let. Does the current notice cover it, or does it need an owners' section?

**Requested document:** a marked-up notice, and the wording of the automatic chat paragraph.

**Unblocks:** PRE-09 (privacy notice), AUT-17 (email through the app: the "Email sent to the app" paragraph), MSG-02
(website chat: legal review of its notice), PRE-34 and MSG-04 (automatic chat), PUB-10 (Book a valuation).

---

## 6. Winning new landlords and vendors

**What the app does today.** Hampton prefers owners who come forward themselves: a "Book a valuation" form (built,
not open), a page showing how many people are searching in each parish (built, not published; only groups of 5 or
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
days before each deadline, and shows overdue items in red. Every period below is a parameter marked **"estimated"**.
When counsel confirms them, staff record "validated" with the reference and date of your advice, and the app then
enforces the 2025 tenancy rules strictly instead of only warning.

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

If the tenure of a home for sale is not given, it is "to confirm" for the last three statuses. Restrictions: a
first-time buyer restriction (purchases only) excludes anyone without Entitled status and anyone who must sell a home
first, and is "to confirm" otherwise; an over-55 restriction is always "to confirm". With no status given, Registered
homes are open (except purchases through the Royal Court, which are not checked) and Qualified homes are "to confirm".

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
- **Anti-money-laundering checks on buyers and sellers (OFE-07).** The app does not yet record due diligence. Once
  Hampton's JFSC registration is confirmed (`###`), what should the app record (with only a reference to documents
  kept elsewhere) under section 18 of the JFSC Handbook?

---

## 11. Annexes to attach

Paths are in Hampton App's code repository. The privacy notice is best sent as a printout of the live page. Every
draft must be shown with **fictitious data only**.

| Annex | Content | Path |
|---|---|---|
| A | Privacy notice (the live page "Privacy notice" on the website, or its source) | `site/apply.js`, function `renderPrivacy` (lines 498–613) |
| B | Consent boxes in "Register your search" | `site/apply.js`, lines 260–264 |
| C | Consent box in the website chat form | `site/chat.js`, lines 174–175 |
| D | Retention notice email (section 3, Q5) | `server/retention-notices.js`, lines 20–30 |
| E | Rent review draft of facts (section 8); a screenshot with fictitious data is clearer | `admin/src/RentalDialogs.jsx`, `noticeDraft` (lines 124–141) |
| F | Housing category rules (section 9) | `server/matching.js`, lines 53–110 |
| G | Arrears drafts and renewal messages (section 10) | `admin/src/RentalDialogs.jsx`, `arrearsDraft` (lines 166–186) and `renewalDraft` (from line 287) |
| H | Legal periods as stored in the code (section 7) | `server/rentals.js`, lines 8–10 and 21 |

Public sources we relied on (consulted October 2026):

- Residential Tenancy (Jersey) Law 2011, current version: jerseylaw.je/laws/current/l_31_2011
- gov.je, residential tenancy changes 2026; rented dwellings licensing; deposit protection; residential status
- Data Protection (Jersey) Law 2018: jerseylaw.je/laws/current/l_3_2018; JOIC registration guidance
- Proceeds of Crime (Jersey) Law 1999; JFSC Handbook section 18 (real estate agents)

---

*Internal note for Hampton and Optimyze (remove before sending):* fill in the `###` fields (legal name, company
number, JFSC and JOIC registrations, and the location of the virtual server); attach annexes A to H with fictitious
data; decide whether section 10 goes in this engagement. Separately from this package, Hermes still checks which
existing provider agreements cover each purpose (PRE-13 plan); this package does not assume any agreement exists.
