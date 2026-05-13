/**
 * Consent System Constants — RA 10173 Informed Consent Framework
 *
 * Single source of truth for consent type strings, action strings,
 * signature type strings, and default policy texts.
 *
 * Both the admin dashboard and mobile app import from this file to prevent
 * accidental string divergence across platforms.
 */

// ---------------------------------------------------------------------------
// CONSENT TYPES
// ---------------------------------------------------------------------------

/**
 * The two distinct policy types managed by the consent system.
 * DPA = Philippine Data Privacy Act (RA 10173) consent.
 * WAIVER = Veterinary services liability waiver.
 */
export const CONSENT_TYPES = Object.freeze({
  DPA:    'dpa',
  WAIVER: 'waiver',
});

// ---------------------------------------------------------------------------
// CONSENT ACTIONS
// ---------------------------------------------------------------------------

/**
 * The two actions that produce a consent_records entry.
 * A user can grant consent or subsequently withdraw it.
 */
export const CONSENT_ACTIONS = Object.freeze({
  GRANTED:   'granted',
  WITHDRAWN: 'withdrawn',
});

// ---------------------------------------------------------------------------
// SIGNATURE TYPES
// ---------------------------------------------------------------------------

/**
 * Methods by which consent may be captured.
 *
 * DRAWN   — freehand canvas signature drawn by the data subject on their device
 * TYPED   — the data subject's full name typed in a script-style font (industry standard)
 * CHECKBOX — legacy migration only; represents a bare boolean toggle from before the
 *            versioned consent system was introduced. Not presented as a UI option.
 */
export const SIGNATURE_TYPES = Object.freeze({
  DRAWN:    'drawn',
  TYPED:    'typed',
  CHECKBOX: 'checkbox', // legacy migration only — do not expose as a UI choice
});

// ---------------------------------------------------------------------------
// DEFAULT DPA TEXT — RA 10173 (Philippine Data Privacy Act)
// ---------------------------------------------------------------------------

/**
 * Full informed consent language for the Data Privacy Act consent form.
 *
 * References:
 *   - Republic Act No. 10173 (Data Privacy Act of 2012)
 *   - IRR of RA 10173 (NPC Circular 16-01)
 *   - RA 10611 (Food Safety Act, veterinary records retention guidance)
 *
 * Clinic-specific fields use the "[Clinic Name]" / "[DPO Contact]" placeholder
 * convention so they can be customised via the Settings Pillar 10 UI.
 */
export const DEFAULT_DPA_TEXT = `DATA PRIVACY CONSENT FORM
Republic Act No. 10173 — Data Privacy Act of 2012

Clinic: [Your Clinic Name]
Effective Version: 1
Date: Effective upon publication

─────────────────────────────────────────────────────────────

I. INTRODUCTION

The Clinic is committed to protecting and respecting your privacy in accordance with the Republic Act No. 10173, otherwise known as the Data Privacy Act of 2012 ("DPA"), its Implementing Rules and Regulations, and all relevant National Privacy Commission (NPC) issuances.

This Consent Form describes what personal data we collect about you and your pet(s), why we collect it, how we use it, how long we keep it, and what rights you have over it. Please read this form carefully before providing your consent.

─────────────────────────────────────────────────────────────

II. PERSONAL DATA COLLECTED

We collect and process the following personal data about you (the pet owner/client):

a. Full name, home address, and date of birth
b. Contact number and email address
c. Government-issued identification (where provided)
d. Payment information (for billing and transaction records)

We also collect personal data related to your pet(s):

e. Pet name, species, breed, date of birth, and sex
f. Vaccination history, medical history, and diagnostic records
g. Appointment history and clinical notes (SOAP records)
h. Prescribed medications and dispensing records
i. Any other information you voluntarily provide during consultations

─────────────────────────────────────────────────────────────

III. PURPOSE OF PROCESSING

The Clinic collects and processes your personal data for the following purposes:

1. Veterinary care delivery — to diagnose, treat, and monitor your pet's health
2. Appointment management — to schedule, confirm, and manage clinic visits
3. Medical record keeping — to maintain complete and accurate clinical histories
4. Billing and payment processing — to issue receipts and process transactions
5. Communications — to send appointment reminders, follow-up notices, and health advisories
6. Regulatory compliance — to comply with applicable laws, including RA 10611 (veterinary practice regulations) and RA 10173 requirements
7. Quality improvement — to improve clinic services and client satisfaction (in anonymised, aggregate form only)

─────────────────────────────────────────────────────────────

IV. LEGAL BASIS FOR PROCESSING

The Clinic processes your personal data on the following legal bases under RA 10173, Section 12:

a. Your explicit consent (Section 12[a]) — as provided by signing this form
b. Performance of a contract (Section 12[b]) — to deliver the veterinary services you have engaged
c. Compliance with a legal obligation (Section 12[c]) — where required by Philippine law

Medical records and sensitive personal information relating to pet health are processed under Section 13(a) of RA 10173, with your explicit consent.

─────────────────────────────────────────────────────────────

V. DATA RETENTION

Your personal data and your pet's medical records will be retained as follows:

- Appointment and billing records: retained for a minimum of five (5) years from the date of the last transaction, in compliance with the Philippine Bureau of Internal Revenue requirements.
- Clinical and medical records (SOAP notes, prescriptions, vaccination records): retained for a minimum of ten (10) years from the date of the last clinical entry, in accordance with veterinary practice standards under RA 10611 and the Professional Regulations Commission.
- Account data: retained for the duration of your active account relationship with the Clinic, and for two (2) years after account closure unless a longer retention period is required by law.

After the applicable retention period, your personal data will be securely deleted or anonymised.

─────────────────────────────────────────────────────────────

VI. DATA SHARING

The Clinic does not sell or rent your personal data to any third party. Your data may be shared in the following limited circumstances:

a. With veterinary specialists or referral clinics, where medically necessary and with your knowledge
b. With government agencies or regulatory bodies, where required by law
c. With authorised third-party service providers (e.g., cloud infrastructure), who are bound by data processing agreements and are not permitted to use your data for their own purposes

─────────────────────────────────────────────────────────────

VII. YOUR RIGHTS UNDER RA 10173

As a data subject under the Data Privacy Act of 2012, you have the following rights:

1. Right to be informed (Section 16[a]) — to be told what data we collect, why, and how
2. Right to access (Section 16[b]) — to request a copy of your personal data held by the Clinic
3. Right to correction (Section 16[c]) — to request correction of inaccurate or incomplete data
4. Right to erasure or blocking (Section 16[d]) — to request deletion of your personal data, subject to legal retention requirements
5. Right to damages (Section 16[e]) — to claim compensation for damages caused by violations of the DPA
6. Right to file a complaint (Section 16[f]) — to lodge a complaint with the NPC if you believe your rights have been violated
7. Right to data portability (Section 16[g]) — to receive your personal data in a structured, electronic format
8. Right to object (Section 16[h]) — to object to the processing of your personal data for specific purposes

To exercise any of these rights, please contact our Data Protection Officer (see Section IX below).

─────────────────────────────────────────────────────────────

VIII. FILING A COMPLAINT WITH THE NPC

If you believe that your rights under RA 10173 have been violated, you may file a complaint with the National Privacy Commission:

National Privacy Commission (NPC)
3rd Floor, Core G, DICT Building, C.P. Garcia Avenue, UP Diliman, Quezon City 1101
Website: www.privacy.gov.ph
Complaint portal: complaints.npc.gov.ph
Email: info@privacy.gov.ph
Hotline: (02) 8234-2228

─────────────────────────────────────────────────────────────

IX. DATA PROTECTION OFFICER CONTACT

For privacy-related inquiries, requests to exercise your data subject rights, or concerns regarding this consent form, please contact the Clinic's Data Protection Officer:

[Clinic Name] — Data Protection Officer
Address: [Clinic Address]
Email: [DPO Email]
Phone: [DPO Phone]

─────────────────────────────────────────────────────────────

X. CONSENT DECLARATION

By providing your digital signature on this form, you confirm that:

a. You have read and fully understood the contents of this Consent Form.
b. You freely, voluntarily, and knowingly give your consent to the collection, use, and processing of your personal data and your pet's health information for the purposes stated above.
c. You understand that you may withdraw this consent at any time by contacting the Clinic, subject to the legal retention requirements described in Section V.
d. You are at least eighteen (18) years of age, or, if below 18, that your parent or legal guardian has provided consent on your behalf.

This consent is valid for all future interactions with the Clinic until withdrawn in writing.`;

// ---------------------------------------------------------------------------
// DEFAULT WAIVER TEXT — Veterinary Services Liability Waiver
// ---------------------------------------------------------------------------

/**
 * Liability waiver for veterinary services, covering inherent clinical risks,
 * emergency authorisation, and client acknowledgement of pet health information.
 */
export const DEFAULT_WAIVER_TEXT = `VETERINARY SERVICES LIABILITY WAIVER AND AUTHORIZATION FORM

Clinic: [Your Clinic Name]
Effective Version: 1

─────────────────────────────────────────────────────────────

I. ACKNOWLEDGEMENT OF INHERENT RISKS

I, the undersigned client and pet owner, acknowledge and accept that the practice of veterinary medicine, including but not limited to examinations, diagnostic procedures, surgical interventions, anesthesia, and pharmacological treatments, carries inherent risks that cannot always be eliminated regardless of the care, skill, and expertise applied by the attending veterinarian.

Such risks include, but are not limited to:
a. Adverse reactions to anesthesia, medications, vaccines, or other substances
b. Complications arising from pre-existing, undisclosed, or undetectable health conditions
c. Post-operative complications including infection, hemorrhage, or delayed healing
d. Rare but possible mortality during or following procedures
e. Incomplete resolution of symptoms despite appropriate treatment

─────────────────────────────────────────────────────────────

II. ACCURACY OF HEALTH INFORMATION

I certify that, to the best of my knowledge, the health information, vaccination history, medication history, and other clinical details I have provided regarding my pet are complete and accurate. I understand that incomplete or inaccurate information may affect the safety and efficacy of treatment.

I agree to promptly inform the attending veterinarian of any changes to my pet's health status, medications, or relevant history.

─────────────────────────────────────────────────────────────

III. AUTHORISATION FOR EMERGENCY CARE

In the event of a life-threatening emergency where I am temporarily unreachable and immediate intervention is required to preserve my pet's life or prevent serious suffering, I hereby authorise the Clinic to proceed with emergency stabilisation procedures at the reasonable clinical discretion of the attending veterinarian.

The Clinic will make reasonable efforts to contact me before proceeding with non-emergency interventions. All authorised emergency procedures will be documented and communicated to me at the earliest opportunity.

─────────────────────────────────────────────────────────────

IV. FINANCIAL RESPONSIBILITY

I accept full financial responsibility for all professional services, medications, procedures, and supplies rendered to my pet by the Clinic. Payment is due at the time services are rendered unless an alternative arrangement has been agreed in writing.

I understand that routine services will be priced according to the Clinic's current fee schedule. Estimates will be provided for elective procedures. Emergency or unplanned interventions may incur additional fees, which will be communicated as soon as reasonably practicable.

─────────────────────────────────────────────────────────────

V. LIMITATION OF LIABILITY

Subject to applicable Philippine law, the Clinic and its veterinarians, staff, and agents shall not be liable for any injury, illness, deterioration of condition, or death of a pet arising from:

a. The inherent risks described in Section I
b. Pre-existing conditions that were not disclosed or were not detectable with reasonable diagnostic effort
c. Client's failure to follow post-treatment instructions or recommendations
d. Events outside the reasonable control of the Clinic (force majeure)

This waiver does not exclude liability for gross negligence or wilful misconduct.

─────────────────────────────────────────────────────────────

VI. PHOTOGRAPHS AND CLINICAL DOCUMENTATION

I understand that clinical photographs, diagnostic images, and procedure records may be created as part of my pet's medical records at our Veterinary Clinic in the Philippines. These records are the property of the Clinic and are used solely for clinical care purposes. Identifiable photographs or records will not be used for marketing, training, or publication without my separate written consent.

─────────────────────────────────────────────────────────────

VII. AGREEMENT

By providing your digital signature on this form, you confirm that:

a. You have read and fully understood this Liability Waiver.
b. You are the legal owner or have authorised responsibility for the pet presented for treatment.
c. You voluntarily accept the inherent risks associated with veterinary care.
d. You authorise emergency stabilisation procedures as described in Section III.
e. You accept financial responsibility for services rendered.

You understand that this waiver does not constitute a limitation on the quality of care provided — the Clinic is committed to delivering the highest standard of veterinary medicine.`;
