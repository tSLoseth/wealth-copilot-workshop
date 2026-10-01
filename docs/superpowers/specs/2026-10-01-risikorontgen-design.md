# Risikorøntgen – design (oppgave B, Jonas-caset)

**Dato:** 2026-10-01 · **Branch:** `feature/risiko-b` · **Repo:** fork `tSLoseth/wealth-copilot-workshop`

## Mål og kjerneinnsikt

Jonas (36) tror han er moderat, men porteføljen har driftet mot teknologi og globale aksjer, og han
blir overrasket når markedet faller. Problemet er ikke mangel på informasjon, men feilkalibrerte
forventninger: ingen viste ham *før* fallet hva «moderat» betyr i kroner.

Løsningen flytter forklaringen fra etter fallet til før fallet, og lar rådgiveren i Private Banking
se hva kunden lurer på og har utforsket, slik at neste samtale treffer.

**Suksesskriterier for demoen**

1. Jonas kan svare på: Hvor kommer risikoen fra? Hvilke investeringer bidrar mest? Passer
   porteføljen fortsatt profilen og målene mine? Hvordan havnet jeg her?
2. Hvert tall kan spores til data og antakelser («Hvorfor ser jeg dette?»).
3. Minst ett kanttilfelle (manglende/estimerte data) vises naturlig i hoveddemoen.
4. Copilot gir aldri råd og aldri tall som ikke finnes i fakta – verifisert av kode, ikke løfter.
5. Rådgiveren ser spørsmål, engasjement og samtaletips for kunden – med kundens samtykke.
6. Demoen fungerer uten nett/API-nøkkel/database (fallbacks).

## Demo-manus (seks scener + rådgiver)

1. **Røntgen:** trekart «her er pengene dine» → «vis risikoen» morfer flatene til risikobidrag.
2. **Stormsimulator:** dagens portefølje gjennom stiliserte kriser, fall i kroner, mot en typisk
   moderat referanseportefølje.
3. **Komfortsjekk:** Jonas setter tapsgrensen sin i kroner; vi legger den over normal svingning.
4. **Hvordan havnet jeg her:** drift-tidslinje fra kjøpshistorikk; kursoppgang vs. nye kjøp.
5. **Hva-om-sandkasse:** utforsk flyttinger, alt oppdateres live, «Ta dette med til rådgiveren».
6. **Copilot i stormen:** simulert fallsdag, proaktiv rolig melding, kildebrikker, verifiseringsmerke.
7. **Rådgiver:** radar over alle kunder (drift ut av profil + aktivitet), samtalelogg, tidslinje,
   samtaletips og møteforberedelse.

## 1. Data og persona (`data/generate.mjs`)

- **Faktormodell:** daglig avkastning = β_marked·M + β_tek·T + β_rente·R + idiosynkratisk støy
  (normalfordelt via Box–Muller over seedet mulberry32). Betaer per aktivatype/sektor gir realistiske
  volatilitetsforskjeller og korrelasjon. Faktorbanene har skriptede regimer: teknologirally over
  ~2 år, deretter en korreksjon på ~12 % de siste ~4 ukene før datadato.
- **Historikk:** ~3 år handelsdager (man–fre), datadato `2026-09-04` (fredag nærmest dagens
  `2026-09-06`). Felter som før: `ticker, date, price, daily_return (%), sector, geography`.
- **Handelslogg `data/trades.json`:** `{trade_id, customer_id, account_id, ticker, date, side:'buy',
  quantity, price}`. Hver beholdning består av 1–4 kjøp; `investments.purchase_price` = vektet
  snitt av kjøpene; `current_price` = siste pris. Kontanter har ett «innskudd».
- **Persona Jonas Lie, CUST-00101:** 36 år, Norway, `Moderate`, horisont `10-20 years`. Skriptet
  kjøpshistorikk: 2023 MFBAL + GLBEQ + CORPB + månedlig GLBEQ; 2024–25 USTK, TECHF, OSLC; aug 2026
  «Nordic AI ASA» (`NRDAI`, ny ticker med ~30 handelsdager historikk).
- **Mål (`goals`, valgfritt felt på `Customer`):**
  `[{id:'bolig', name:'Egenkapital til større bolig', target_amount: 600000, target_year: 2031},
    {id:'langsiktig', name:'Langsiktig sparing', target_amount: null, target_year: 2046}]`.
- Generatoren forblir seedet og reproduserbar. Alle kunders tall endres (akseptert i forken).

## 2. Risikomotor og API (`api/src/services/risk/`)

Rene, testbare funksjoner. All matematikk på desimalform internt, avrunding kun i responsen.

| Modul | Ansvar |
|---|---|
| `returns.ts` | Henter justerte avkastningsserier for siste 252 handelsdager, justert på felles datoer. |
| `covariance.ts` | Kovariansmatrise (annualisert ×252). Instrument med < 60 obs. får proxy (gruppe-proxy, f.eks. teknologi → TECHF) og `estimated: true`. |
| `contributions.ts` | σ_p = √(wᵀΣw); Euler-bidrag RC_i = w_i(Σw)_i/σ_p, andeler summerer til 100 %. Aggregering per sektor og aktivatype. «Andel av pengene» vs. «andel av risikoen». |
| `riskClass.ts` | Klasse 1–7 fra årlig volatilitet (SRRI-intervaller: <0,5 / 0,5–2 / 2–5 / 5–10 / 10–15 / 15–25 / >25 %). Profilbånd: Conservative 2–3, Moderate 3–4, Balanced 4–5, Growth 5, Aggressive 6–7. Normal svingning i kr: typisk år (±1σ) og «dårlig år, 1 av 20» (−1,645σ, forventet avkastning settes konservativt til 0). |
| `stress.ts` | Fire stiliserte scenarioer som faktorsjokk (dotcom, finanskrisen, korona, rente/tek 2022) med stilisert gjenopprettingstid. Tap i kr for kunden og for referanseporteføljen «typisk moderat» (30 % GLBEQ, 10 % NRDEQ, 40 % CORPB, 15 % GOVNO, 5 % CASHNOK). Gjenopprettingskurve som månedlige punkter. Merkes «stilisert, inspirert av». |
| `drift.ts` | Ukentlige beholdninger rekonstruert fra handelslogg × priser → vekter per sektor/aktivatype og risikoklasse over tid (dagens Σ brukt på historiske vekter). Første dato utenfor profilbåndet. Dekomponering av endring i teknologiandel i kursbidrag vs. kjøpsbidrag. |
| `goals.ts` | Per mål: år igjen, «dårlig år»-utfall vs. målbeløp/tidshorisont, faktabasert status (`kort_horisont_hoy_risiko` / `ok` / `mangler_data`). Ingen anbefaling. |
| `whatIf.ts` | Hypotetiske flyttinger `{from, to, amount_nok}` mellom grupper `tek | globale_aksjer | norden | renter | kontanter` via representative instrumenter (TECHF, GLBEQ, NRDEQ, CORPB, CASHNOK); kjører analyse, stress og klasse på nytt. Selger pro rata innen gruppen. |
| `dataQuality.ts` | Datadato, ferskhet (handelsdager siden), estimerte instrumenter, manglende priser. Med i alle svar. |
| `analysis.ts` | Setter sammen analyse-responsen. |

**Endepunkter** (OpenAPI oppdateres):

- `GET  /customers/:id/risk/analysis` – røntgen, klasse, normal svingning, mål, datakvalitet
- `GET  /customers/:id/risk/stress`
- `GET  /customers/:id/risk/drift`
- `POST /customers/:id/risk/what-if` – `{ moves: [{from, to, amount_nok}] }`
- `GET  /customers/:id/alerts?simulate=market-drop` – proaktiv stormmelding (−4 % markedsdag)
- `POST /customers/:id/advisor-note` – `{ comfort_loss_nok?, moves? }` → deterministisk møtenotat
- `POST /customers/:id/events` – engasjementshendelser (batch)
- `GET|PUT /customers/:id/sharing` – samtykke til deling med rådgiver
- `GET  /advisor/customers` – radar: klasse vs. profil, drift, siste aktivitet, antall spørsmål
- `GET  /advisor/customers/:id` – samtalelogg, tidslinje, samtaletips, oppsummering

Gammelt `/risk` beholdes uendret.

**Lagring (`api/src/store/`):** grensesnitt `InteractionStore` med `NeonStore`
(`@neondatabase/serverless`, `DATABASE_URL`) og `MemoryStore` (fallback). Tabeller:

- `copilot_messages(id, customer_id, session_id, question, answer, intent, engine, guard_passed,
  guard_reason, facts jsonb, created_at)`
- `engagement_events(id, customer_id, session_id, type, payload jsonb, created_at)` – typer:
  `section_view{section, dwell_ms}`, `stress_run{scenario}`, `comfort_set{loss_nok}`,
  `whatif_run{moves}`, `advisor_note_created`, `alert_seen`
- `sharing_consent(customer_id pk, share_with_advisor bool, updated_at)` – standard `true` med
  tydelig varsel; av = rådgiver ser bare at Copilot er brukt, ikke innhold; engasjement sendes ikke.

Migrering: `api/db/001_init.sql`, `npm run db:migrate`. Oppbevaring: 180 dager (dokumentert,
slettejobb utenfor scope). Ingen innlogging/rollestyring i demoen – dokumentert begrensning.

## 3. Copilot med tallvakt (`api/src/services/copilot/`)

Flyt: maskering → intensjon → fakta → malsvar (alltid) → Claude (hvis nøkkel) → vakter →
LLM-svar eller malsvar → lagring → svar.

- **Maskering (`pii.ts`):** 11-sifret fødselsnummer, kontonummer (`dddd.dd.ddddd` / 11 siffer),
  kortnummer (13–19 siffer) → `[fjernet]` før Claude og lagring.
- **Intensjoner (no/en):** `risiko-kilde`, `storste-bidrag`, `hvis-markedet-faller`,
  `passer-profil`, `passer-mal`, `hvordan-havnet-jeg-her`, `er-dette-normalt`, `radsporsmal`,
  `utenfor-tema`, `fallback`. Eksisterende engelske intensjoner beholdes.
- **Fakta:** `{id, label, value, unit, source, estimated}`; det eneste Claude ser.
- **Claude:** systemprompt – norsk klarspråk, kun oppgitte fakta, ingen kjøp/salg-anbefalinger,
  nevn estimater. Rask modell (velges i implementasjon), timeout ~6 s → malsvar.
- **Vakter (`guards.ts`):** *tallvakt* trekker ut alle tall (norsk format: «186 000 kr», «14,2 %»,
  «klasse 5», årstall) og krever treff i fakta innenfor avrundingstoleranse (årstall og tall ≤ 10
  som ordenstall tillates kun hvis i fakta eller del av «1 av 20»); *rådvakt* avviser «du bør»,
  «jeg anbefaler», «selg», «kjøp», «bytt til» o.l. Avvisningsgrunn lagres.
- **Rådspørsmål:** fast vennlig svar + `cta: 'radgiver'`; flagges som samtaletips.
- **Kontrakt:** `{answer, matched_intent, engine:'claude'|'mal', guard:{passed, reason?}, facts[],
  data_quality, cta?}` – bakoverkompatibel.
- **Rådgiveroppsummering:** Claude oppsummerer aktivitet gjennom samme vakter; ellers
  deterministisk punktliste.

## 4. Frontend-opplevelsen (`frontend/`)

- **Språk:** norsk i hele grensesnittet.
- **Visuell stil:** nordisk nettbank – dyp blå topplinje, lyse kort, luftig layout, tydelig
  typografi (Inter via Google Fonts), fargetokens som CSS-variabler. Risikofarger: rolig blå for
  penger, varm oransje/rød for risiko. `prefers-reduced-motion` respekteres.
- **Nye avhengigheter:** `motion` (animasjoner/layout-morf), `d3-hierarchy` (squarified treemap).
  Recharts brukes videre for linjer.
- **Navigasjon:** Oversikt · **Min risiko** · Hva om · Copilot · Portefølje · Innsikter, pluss egen
  rådgiverflate `#/radgiver` med egen layout. Jonas (CUST-00101) er standardkunde.
- **Min risiko (scrollfortelling):** Røntgen (morf-trekart + tabell-alternativ), Stormsimulator
  (scenariovelger, animert kr-graf mot referanse), Komfortsjekk (glidebryter i kr, overlegg på
  normal svingning, ett-setnings-konklusjon), Reisen (drift-tidslinje med profilbånd og
  dekomponering), Mål (per mål). Hver seksjon har «Hvorfor ser jeg dette?» og datakvalitetsmerke.
- **Hva om:** glidebrytere per gruppe, live oppdatering av røntgen/klasse/storm, ingen «bør»,
  «Lag notat til rådgiveren» (forhåndsvisning + kopier/last ned).
- **Copilot:** foreslåtte risikospørsmål, kildebrikker, merke «Verifisert mot dine tall» /
  «Standardsvar», delingsvarsel med av/på, CTA til rådgiver.
- **Stormmelding:** demo-panel (Shift+D) med «Simuler fallsdag» → proaktiv melding/banner.
- **Sporing:** `useTrackSection` (IntersectionObserver, dwell) + hendelseskø som batches til
  `/events`; sendes ikke når deling er av.
- **Rådgiver:** radarliste (sortert på avvik og aktivitet), kundedetalj med samtalelogg (inkl.
  vaktstatus), tidslinje, samtaletips og møteforberedelse.

## 5. Kvalitet og leveranser

- **Tester (Vitest):** risikomatematikk med kjente fasiter (2-aktiva kovarians, bidrag summerer til
  100 %, klassegrenser), stress, drift-dekomponering, what-if, vakter (gode/dårlige svar, norsk
  tallformat), PII-maskering, MemoryStore, supertest for alle nye endepunkter, frontend-tester for
  sentrale komponenter. Kanttilfeller: kunde uten investeringer, estimert instrument, utdatert
  datadato, ukjent kunde, deling av.
- **Ende-til-ende:** røyktest av demo-flyten i nettleser før presentasjon.
- **Leveranser:** `docs/losning-b.md` (data, mangler, antakelser, nytte og hvordan måle den,
  risikoer og tiltak), `docs/demo-manus.md` (manus + reserveplan), README-oppdatering.
- **Utrulling (valgfritt sist):** GitHub Pages fra forken + Render for API med `DATABASE_URL` og
  `ANTHROPIC_API_KEY` som hemmeligheter.

## Utenfor scope

Innlogging/roller, ekte egnethetsvurdering, faktisk sletting etter oppbevaringstid, eksterne
investeringer, sanntidspriser.
