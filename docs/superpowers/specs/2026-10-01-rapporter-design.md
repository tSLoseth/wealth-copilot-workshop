# Rapporter med groundet AI – design (case B: Jonas)

## Mål
Jonas (36, moderat profil) skal forstå hvor risikoen i porteføljen kommer fra, hva han egentlig eier
(gjennomsyn av fond), hva som skjer i et fall, og om porteføljen passer profilen. Han får ferdige
standardrapporter og kan be en groundet AI lage egne rapporter. Rådgiver ser alle AI-spørsmål på en
admin-side.

Suksess: kunden kan svare på «hvor kommer risikoen fra?» og «passer det profilen min?» etter én
rapport, og AI-en kan ikke vise et eneste tall som ikke er beregnet deterministisk.

## Data
- `data/instruments.mjs`: + `INDEX_ONLY_EQUITIES`/`INDEX_ONLY_BONDS` (finnes bare inne i fond, aldri
  trukket som kundebeholdning) + `FUND_COMPOSITION` (rå vekter per fond, normaliseres til 100 %).
- `data/generate.mjs`:
  - Hovedstrømmen `rng` trekkes i nøyaktig samme rekkefølge som før, slik at de 100 opprinnelige
    kundene beholder sine beholdninger. Faktorer og indeksselskaper bruker en egen strøm.
  - Daglig avkastning: aksjer = 0,6·idiosynkratisk + β·markedsfaktor (+ teknologifaktor for
    teknologi). Fond = Σ vekt × avkastning for underliggende + lite avvik. Gjennomsyn og svingninger
    henger dermed sammen.
  - Ny fil `fund_holdings.json`: `{fund_ticker, constituent_ticker, name, asset_type, sector,
    geography, weight_pct, as_of_date}`; `as_of_date` = siste kursdato − 31 dager.
  - Persona Jonas Lie (CUST-00101): TECHF 24 %, USTK 19 %, GLBEQ 18 %, MFBAL 10 %, OSLC 9 %,
    CORPB 8 %, HELS 6 %, kontanter 6 %.

## Metrikkatalog (`api/src/metrics/`)
Hver metrikk: `id, title, question, params, compute(customerId, params) → MetricResult`.
`MetricResult` har `value, display, unit, breakdown[], facts{}, provenance, assumptions[],
data_quality[], status?`. `facts` er en flat ordbok med ferdig formaterte tekster som AI-en kan
referere til.

Metrikker: `total_value`, `annual_volatility`, `risk_by_holding`, `risk_by_underlying`,
`risk_by_sector`, `profile_fit`, `equity_share`, `tech_exposure`, `overlap`, `geography_exposure`,
`concentration`, `stress_test`, `historical_drawdown`, `weight_drift`, `what_if_shift`,
`data_freshness`.

Risikomodell: kovarians av daglige avkastninger × 252, Euler-dekomponering (bidragene summerer til
100 %). Gjennomsyn: eksponering per underliggende = Σ fondsverdi × vekt + direkte beholdning.
Stresstester treffer underliggende sektorer, så teknologifall rammer også teknologi inne i
globalfond.

## Rapporter (`api/src/reports/`)
`ReportSpec { id, title, intro, blocks[], custom_scenarios? }`.
Blokker: `kpi | bar | table | scenario | status | text`, hver med `metric` + `params` eller `text`.
Tekst kan bare inneholde tall via plassholdere `{{metric_id.fact}}` eller
`{{metric_id(param=verdi).fact}}`. Sifre utenfor plassholdere avvises.

Standardrapporter: (1) Hvor kommer risikoen fra, og passer det profilen din? (2) Hva eier du
egentlig? (3) Hva om markedet faller? (4) Datagrunnlag og antakelser.

## AI-laget (`api/src/reports/ai.ts`)
- `claude-opus-5-5`, manuell verktøyløkke (maks 8 runder), `effort: low`, server-side
  `fallbacks: "default"`.
- Verktøy: `list_metrics`, `get_metric(metric, params)`, `get_fund_holdings(ticker)`,
  `submit_report(spec, topics, flags, customer_notice?)`. Ugyldig `submit_report` (ukjent metrikk,
  ukjent fact, sifre i tekst) gir `is_error` tilbake, og Claude retter.
- Grenser: ingen kjøp/salg-råd (lag i stedet en `what_if_shift`-illustrasjon + flagg `ønsker_råd`),
  ingen data utenfor katalogen (flagg `mangler_data` og forklar), alt på norsk klarspråk.
- Reserveløsning uten nøkkel eller ved feil: nøkkelordsmatching til nærmeste standardrapport,
  `status: "fallback"`.
- Rate limit: 10 AI-kall per IP per 10 minutter.

## Logging og admin
- Neon (`@neondatabase/serverless`, `DATABASE_URL`), tabellen `ai_interactions` opprettes ved
  oppstart. Uten `DATABASE_URL` logges det i minnet.
- `GET /admin/customers/activity`, `GET /admin/interactions?customerId=`, `PATCH
  /admin/interactions/:id` (`reviewed`, `advisor_note`). Header `x-admin-token` = `ADMIN_TOKEN`.
- Kunden ser tydelig at spørsmål og svar lagres og kan ses av rådgiveren.

## Endepunkter
`GET /metrics` · `GET /instruments/:ticker/holdings` · `GET /customers/:id/reports` ·
`GET /customers/:id/reports/:reportId` · `POST /customers/:id/reports/resolve` (spec → rapport, for
lagrede rapporter) · `POST /customers/:id/reports/ai` · admin-endepunktene over.

## Frontend
- `#/rapporter`: faner Standardrapporter / Dine rapporter (spec i localStorage, regnes ut på nytt),
  Spør AI-panel med eksempelspørsmål, Metrikker-katalog. Hver blokk har «Hvorfor ser jeg dette?»
  (kilder, periode, antakelser, datakvalitet). AI-rapporter viser hvilke verktøy og metrikker som ble
  brukt.
- `#/admin`: krever token. Kundeliste med aktivitet, temaer og flagg, og en tidslinje per kunde med
  «gjennomgått» og notat.

## Deploy
API på Render (`ANTHROPIC_API_KEY`, `DATABASE_URL`, `ADMIN_TOKEN`, `ALLOWED_ORIGIN`), frontend på
Cloudflare Pages (`VITE_API_URL`, bygges med `npm run build --workspace frontend`, output
`frontend/dist`).

## Testing
- API: metrikker summerer riktig (risikobidrag = 100 %, gjennomsynsvekter = 100 %), Jonas har
  teknologieksponering over direkte andel, plassholdervalidering avviser sifre og ukjente facts,
  endepunktene svarer, admin krever token.
- Testtilfeller som skal håndteres: kunde uten investeringer, utdaterte kurser, utdaterte
  fondsbeholdninger, AI-spørsmål om råd, spørsmål om data vi ikke har.

## Risikoer
Feil eller utdaterte data (vises per blokk), at kunden misforstår modellen som råd (fast
ansvarsfraskrivelse, ingen anbefalinger), personvern (tydelig varsel om lagring, admin bak token,
ingen persondata i prompten utover det som trengs), kostnad og misbruk av nøkkelen (rate limit,
`max_tokens`).
