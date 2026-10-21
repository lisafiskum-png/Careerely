# Careerely global launch capability matrix

This matrix prevents marketing claims from exceeding production evidence. A
configurable field or AI model capability is not, by itself, verified support.

## Product scope

| Capability | Status | Evidence and limitation |
|---|---|---|
| Custom roles, industries, skills and locations | VERIFIED | Onboarding accepts custom values and provides broad global suggestions. |
| Users without degrees or LinkedIn | VERIFIED | Neither is required by signup, onboarding, matching, or billing. |
| Remote, hybrid and on-site preferences | VERIFIED | Stored and enforced as explicit work-style preferences. |
| Multiple compensation currencies | PARTIALLY SUPPORTED | ISO-style currencies are stored; Careerely does not convert currencies. |
| Static ATS job discovery | PARTIALLY SUPPORTED | Greenhouse, Lever and Ashby sources only; coverage depends on configured employers. |
| Broad global job-board discovery | BLOCKED | SerpApi is deliberately disabled pending cost, quality, reliability and terms approval. |
| AI matching and tailored documents | BLOCKED | Production acceptance testing requires restored Anthropic credits. |

## Industry evidence

| Industry group | Status |
|---|---|
| Technology and software | PARTIALLY SUPPORTED |
| Finance, compliance, sales and marketing | PARTIALLY SUPPORTED |
| Healthcare, education, law and government | NOT VERIFIED |
| Construction, engineering and skilled trades | NOT VERIFIED |
| Retail, hospitality, travel and logistics | NOT VERIFIED |
| Creative, agriculture, energy and environmental work | NOT VERIFIED |

The product architecture does not intentionally exclude these groups, but a
complete persona workflow has not been run for every group. Public copy must
not claim verified universal coverage.

## Country and language evidence

| Area | Status | Limitation |
|---|---|---|
| Worldwide location input | VERIFIED | Users can enter arbitrary cities, countries and regions. |
| Norway/UK/US job coverage | PARTIALLY SUPPORTED | Only configured ATS employers are searched. |
| Other country job coverage | NOT VERIFIED | No representative production acceptance matrix completed. |
| English interface | VERIFIED | Production UI and customer communications are English. |
| English resume parsing | PARTIALLY SUPPORTED | Text-based PDF/DOCX is covered; visual and unusual formats vary. |
| Norwegian and other-language parsing | NOT VERIFIED | Deterministic extraction may preserve text, but quality has not been accepted. |
| Non-English generated documents | BLOCKED | Requires funded AI provider and native-language quality review. |

## Commercial scope

| Capability | Status | Limitation |
|---|---|---|
| USD monthly plans | PARTIALLY SUPPORTED | Checkout configuration still needs final production transaction evidence. |
| Customer Portal | NOT VERIFIED | Invoice, payment method, plan change and cancellation need live acceptance testing. |
| VAT/GST/sales tax | BLOCKED | Requires founder/tax-professional decisions and Stripe tax configuration review. |
| Norway/EU/UK consumer terms | BLOCKED | Legal entity details and professional review remain outstanding. |

## Launch rule

Initial launch must be described as an English-language early release with
limited ATS coverage unless and until the corresponding rows become VERIFIED.
The matrix must be updated with dated evidence after every completed persona,
market, language, and billing acceptance test.
