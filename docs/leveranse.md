# Leveranse: Wealth Copilot, case B (Jonas)

## 1. Kort pitch

Jonas (36) tror han har en moderat portefølje, men over tid har den blitt full av teknologi, både direkte og skjult inne i globale aksjefond. Wealth Copilot gjør dette synlig: fondene brytes ned i selskapene de eier, risikoen fordeles på investeringene som skaper den, og kunden kan stille egne spørsmål til en AI som aldri regner selv. Hvert tall kommer fra en deterministisk beregning, og kunden kan alltid se hva tallet bygger på.

**Etter å ha brukt løsningen skal Jonas kunne:**
- si hvor risikoen i porteføljen kommer fra, og hvilke investeringer som bidrar mest
- forklare at han eier mer teknologi enn fondsnavnene tilsier
- se hva som skjer i et markedsfall, i kroner og i ekte historiske fall
- vurdere om porteføljen svinger som en moderat profil, og vite hva han bør ta opp med rådgiveren

## 2. Løsningen

**Rapporter** (`#/rapporter`) har fire standardrapporter, alle bygget av samme rapportformat som AI-en bruker:
1. Hvor kommer risikoen fra, og passer det profilen din?
2. Hva eier du egentlig? (skjult teknologi, overlapp, geografi, glidning)
3. Hva om markedet faller? (tre hypotetiske scenarioer, verste dag, «hva om»-illustrasjon)
4. Datagrunnlag og antakelser

**Spør AI** lar kunden skrive et eget spørsmål og få en ny rapport. Rapporten kan lagres og regnes ut på nytt med ferske tall hver gang den åpnes. Hver blokk har «Hvorfor ser jeg dette?» med spørsmålet tallet svarer på, kilder, periode, antakelser og datakvalitet.

**Interaktive dashbord** har drill-down fra sektor, region, aktivatype eller enkeltinvestering ned til detaljer, med sti tilbake. Tidshorisonten kan settes fra 1 md til «Alt» (1, 3 og 6 md, i år, 1, 3 og 5 år), og porteføljen kan sammenlignes med Oslo Børs hovedindeks (OSEBX). Valgt periode følger med inn i rapportene og AI-en.

**Rådgiversiden** (`#/admin`, bak tilgangskode) viser aktivitet per kunde: AI-spørsmål, temaer, flagg, rapportvisninger og spørsmål til Wealth Copilot-chatten. Rådgiveren kan merke spørsmål som gjennomgått og skrive notat.

## 3. Hvordan AI-en er groundet

Dette er det viktigste valget vi har tatt: **AI-en velger og forklarer, den regner aldri.**

- Alle tall ligger i en metrikkatalog med 18 deterministiske metrikker. Hver metrikk returnerer verdi, ferdig formaterte «facts», kilder, antakelser og datakvalitetsmerknader.
- AI-en får verktøy, ikke data i prompten: `get_metric`, `get_fund_holdings`, `submit_report` og `decline`. Den ser tallene via verktøyene, og leverer en rapportspesifikasjon.
- Tall i tekst kan bare skrives som plassholdere, for eksempel `{{tech_exposure.total_pct}}`. Serveren avviser alt som inneholder sifre utenfor plassholdere, ukjente metrikker og ukjente facts.
- Avvist spesifikasjon går tilbake til AI-en som feilmelding, og den må rette og sende på nytt (maks 8 runder). Kunden får aldri se en rapport som ikke er validert.
- `customer_notice` (beskjeden til kunden) kan heller ikke inneholde tall.
- Egne scenarioer («hva om teknologi faller 40 %?») defineres som sjokk i prosent, og beskrivelsen genereres av serveren fra sjokkene, så teksten kan ikke avvike fra tallene som ble brukt.

**Eksempel fra testingen:** på «passer porteføljen profilen, jeg ble skremt» avviste valideringen første utkast, og Claude rettet det før kunden så noe. I appen vises dette i sporet under rapporten («Avvist av validering, AI-en retter»).

**Grenser for råd**
- Ingen kjøps- eller salgsråd. Ber kunden om det, lager AI-en en illustrasjon (`what_if_shift` eller stresstest), setter flagget `ønsker_råd` og skriver at dette ikke er et råd og at rådgiveren kan hjelpe. Serveren setter flagget selv hvis spørsmålet ser ut som et rådspørsmål.
- Data vi ikke har gir flagget `mangler_data` og en forklaring.
- Uro hos kunden gir flagget `bekymring`, og tonen skal være rolig og saklig.
- Spørsmål utenfor kundens økonomi avvises med `decline`.
- Uten API-nøkkel, ved feil eller når AI-en ikke blir ferdig, vises nærmeste standardrapport (status «fallback»), fortsatt med deterministiske tall.
- Alle rapporter har fast ansvarsfraskrivelse: pedagogisk demomodell, ikke investeringsråd, ikke ekte egnethetsvurdering.

## 4. Data

**Dette bruker vi fra demoen:** kunder, beholdninger og risikoprofil.

**Dette la vi til:**
- **Gjennomsyn av fond** (`fund_holdings.json`): hva hvert fond eier, med vekter og rapporteringsdato. Dette er det som gjør skjult teknologi synlig. Risikoen dekomponeres med kovarians (bidragene summerer til 100 %).
- **Jonas** (CUST-00101): moderat profil, 36 år. Teknologifond 24 %, amerikansk teknologiaksje 19 %, globalt aksjefond 18 %, balansert fond 10 %, to nordiske teknologiaksjer 9 % og 6 %, obligasjonsfond 8 %, kontanter 6 %.
- **Ekte indeksfaktorer fra Yahoo Finance:** selskapene er fortsatt fiktive, men daglig avkastning drives av ekte indekser: OSEBX for nordiske selskaper, S&P 500 for resten, og Nasdaq minus S&P 500 for teknologi. Fondenes avkastning er vektet sum av innholdet, så gjennomsyn og svingninger henger sammen. Historikken går fra 2014 til i dag.
- **Historiske episoder** (oljefallet 2015–16, høsten 2018, koronakrakket 2020, teknologifallet 2022) spilles av på dagens portefølje.
- **OSEBX som sammenligning** i grafer og metrikker. Se også `data/fetch-market.mjs` og `api/src/services/benchmark.ts`.

**Dette mangler:**
- Kjøp og salg over tid. Historikken viser derfor hvordan *dagens* beholdning ville utviklet seg, ikke Jonas' faktiske glidning.
- Ekte fondsdata og ekte selskaper.
- Valuta (alt regnes i kroner uten valutaeffekt).
- Investeringer i andre banker.
- Skatt, kostnader og forventet avkastning.

**Antakelser** (vises i appen): volatilitet fra daglige kursendringer omregnet med 252 handelsdager; to av tre år vil svinge mindre enn tallet, og et dårlig år (omtrent hvert tjuende) kan gi rundt 1,6 ganger så stort fall; risikointervaller per profil er illustrative; stresstester er «hva om», ikke prognoser; OSEBX er en ren norsk aksjeindeks og ikke direkte sammenlignbar med en blandet portefølje.

## 5. Forventet nytte og hvordan vi ville målt den

**For kunden:** forstår hvor risikoen kommer fra før markedet faller, ikke etter. Svingninger blir forklart i kroner og som episoder han kjenner igjen.

**For rådgiveren:** ser hva kunden lurer på, hvilke temaer som går igjen, og hvem som viser uro eller ber om råd. Samtalen starter fra tall begge har sett.

**Målepunkter:**
- **Forståelsestest:** be testkunder svare på «hvor kommer risikoen fra?» og «passer porteføljen profilen min?» før og etter én rapport. Mål andel riktige svar.
- **Andel som åpner «Hvorfor ser jeg dette?»:** lav andel kan bety tillit eller at forklaringen ikke oppdages; kombiner med intervju.
- **Rådgiverens oppfølging av flagg:** andel `ønsker_råd`- og `bekymring`-spørsmål som blir gjennomgått, og tid til gjennomgang.
- **A/B mot dagens visning:** gruppe med dagens dashbord mot gruppe med rapporter, målt på forståelse og på hvor sikre kundene er på svarene sine.
- **Kvalitet på AI-svar:** andel svar som rådgiver markerer som feil eller misvisende.

## 6. Evaluering vi har gjort

Seks AI-spørsmål mot Jonas, pluss kanttilfeller. Se appen for levende tall.

| Spørsmål | Utfall |
|---|---|
| Hvor mye teknologi eier jeg, også i fondene? | Ok. Teknologi er 64,3 % av porteføljen når fondene brytes ned. |
| Hva om teknologi faller 40 %? | AI-en laget eget scenario og brukte stresstesten. |
| Passer porteføljen profilen, jeg ble skremt | Flagg `bekymring`. Valideringen avviste første utkast og Claude rettet det. |
| Bør jeg selge teknologifondet? | Flagg `ønsker_råd`, beskjed om at det ikke er et råd, og en illustrasjon. |
| Bitcoin i en annen bank | Flagg `mangler_data`, forklaring av hva vi ikke har. |
| Lasagneoppskrift | Avvist som utenfor tema. |

**Kanttilfeller:**
- **Kunde uten investeringer:** rapportene viser en vennlig forklaring i stedet for tomme tall, og datagrunnlag-blokken vises fortsatt.
- **Utdaterte fondsdata:** beholdningsdato og alder vises som datakvalitetsmerknad (advarsel etter 95 dager), og kursenes alder varsles når de er mer enn tre dager gamle.
- **Yahoo Finance nede:** API-et starter fra en lagret kopi i repoet og oppdaterer live når mulig (tidsavbrudd 5 sekunder). Datagrunnlag-rapporten viser om OSEBX er hentet live eller fra lagret kopi.
- **Manglende kurshistorikk, kort periode:** investeringer uten kurser regnes som ikke-svingende og merkes som mulig undervurdert risiko. Perioder under 120 handelsdager får advarsel om usikre svingninger.

Automatiserte tester dekker blant annet at fondene summerer til 100 %, at risikobidragene summerer til 100 %, at plassholdervalidering avviser sifre og ukjente facts, at AI-endepunktet faller tilbake uten nøkkel, og at admin krever token.

## 7. Risikoer og tiltak

| Risiko | Tiltak |
|---|---|
| Feil eller utdaterte data | Datakvalitetsmerknader per blokk, egen datagrunnlag-rapport, fersk-sjekk av kurser og fondsbeholdninger |
| Kunden tolker modellen som råd | Ingen anbefalinger, ansvarsfraskrivelse, `ønsker_råd`-flagg, illustrasjoner merket «ikke en anbefaling» |
| AI-en finner på tall | Plassholdere og validering på serveren, ingen tall i kundebeskjeden |
| Personvern og logging | Kunden får tydelig varsel om at spørsmål og svar lagres og kan ses av rådgiveren. Admin krever tilgangskode. Bare fornavn, alder, profil og horisont går til AI-en, ikke kunde-ID eller kontonummer |
| Misbruk av API-nøkkelen | Rate limit på 10 AI-kall per IP per 10 minutter, maks 1000 tegn per spørsmål, begrenset antall runder |
| Avhengighet av Yahoo | Lagret kopi i repoet, live-oppdatering i bakgrunnen |
| Syntetiske selskaper ser ekte ut | Fast merknad i antakelsene om at selskapene er fiktive og bare følger ekte indekser |

## 8. Valgfrie scenarioer

**Åpenhet om personopplysninger.** «Hvorfor ser jeg dette?» viser kilder, periode, antakelser og datakvalitet for hver blokk. Ved AI-rapporter vises sporet over verktøy og metrikker som ble brukt. Hva som sendes til AI-en er avgrenset: fornavn, alder, profil, horisont, valgt periode og spørsmålet, pluss tall AI-en henter selv via verktøy. Det som lagres (spørsmål, rapport, verktøyspor, flagg) er det rådgiveren ser. *Neste steg:* en visning av eksakt hva som ble sendt, og innsyn og sletting for kunden. Vi har ikke bygget en lagringsfrist.

**Feil AI-innsikt.** *Oppdage:* serversiden validerer alt, og rådgiveren ser flagg, hele rapportspesifikasjonen og verktøysporet per spørsmål, så feil kan gjenskapes. *Forklare:* rapporten viser hvilke metrikker og antakelser den bygger på. *Rette:* tall regnes alltid fra katalogen, så en rettet metrikk gir riktige tall i alle lagrede rapporter neste gang de åpnes. *Varsle:* rådgiver via gjennomgått-merking og notat. Vi har ikke bygget en «meld feil»-knapp for kunden eller automatisk varsling; det er neste steg.

## 9. Arkitektur

```
  Yahoo Finance ──► fetch-market.mjs ──► benchmarks/yahoo.json ─┐
  (OSEBX, S&P, Nasdaq)         (lagret kopi, live-oppdatering)   │
                                                                 ▼
  generate.mjs ──► kunder, beholdninger, kurser, fund_holdings ─► API (Express, Render)
                                                                 │
        ┌────────────────────────────────────────────────────────┤
        ▼                                                        ▼
  Metrikkatalog (deterministisk)                    Grounded AI (Claude, verktøyløkke)
  gjennomsyn, risiko, stresstester ◄── get_metric ── submit_report ─► validering
        │                                                        │   (plassholdere)
        ▼                                                        ▼
  Rapporter + dashbord (React, Cloudflare Pages)     Logg i Neon ─► Rådgiverside (tilgangskode)
```
