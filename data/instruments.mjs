// Fictional investment universe used to generate synthetic holdings and
// market data. None of these tickers/companies are real financial
// instruments - names are deliberately invented for the workshop.
export const EQUITIES = [
  { ticker: 'NRSK', name: 'Norsk Fjord Energy AS', sector: 'Energy', geography: 'Norway', basePrice: 185 },
  { ticker: 'FJEL', name: 'Fjellblå Seafood ASA', sector: 'Consumer Staples', geography: 'Norway', basePrice: 92 },
  { ticker: 'BRGN', name: 'Bergen Maritime Holdings', sector: 'Industrials', geography: 'Norway', basePrice: 310 },
  { ticker: 'OSLC', name: 'Oslo Cloud Systems ASA', sector: 'Technology', geography: 'Norway', basePrice: 140 },
  { ticker: 'NRDX', name: 'NordicRx Pharma', sector: 'Healthcare', geography: 'Nordics', basePrice: 415 },
  { ticker: 'VIKB', name: 'Viking Bank Group', sector: 'Financials', geography: 'Nordics', basePrice: 68 },
  { ticker: 'SVEA', name: 'Svea Green Materials', sector: 'Materials', geography: 'Sweden', basePrice: 220 },
  { ticker: 'HELS', name: 'Helsinki Circuit Technologies', sector: 'Technology', geography: 'Finland', basePrice: 76 },
  { ticker: 'DANM', name: 'Danmark Wind Partners', sector: 'Utilities', geography: 'Denmark', basePrice: 152 },
  { ticker: 'EURX', name: 'EuroSpan Logistics SE', sector: 'Industrials', geography: 'Europe', basePrice: 58 },
  { ticker: 'ATLX', name: 'Atlantic Retail Group', sector: 'Consumer Discretionary', geography: 'Europe', basePrice: 44 },
  { ticker: 'USTK', name: 'US TechCore Inc.', sector: 'Technology', geography: 'United States', basePrice: 265 },
  { ticker: 'USHL', name: 'US HealthLine Corp', sector: 'Healthcare', geography: 'United States', basePrice: 132 },
  { ticker: 'USFN', name: 'US Federal Financial Corp', sector: 'Financials', geography: 'United States', basePrice: 88 },
  { ticker: 'ASIP', name: 'AsiaPac Innovations Ltd', sector: 'Technology', geography: 'Asia Pacific', basePrice: 51 },
  { ticker: 'ASIM', name: 'AsiaPac Manufacturing Ltd', sector: 'Industrials', geography: 'Asia Pacific', basePrice: 33 },
  { ticker: 'EMKT', name: 'Emerging Markets Growth Co', sector: 'Consumer Discretionary', geography: 'Emerging Markets', basePrice: 21 },
]

export const ETFS = [
  { ticker: 'GLBEQ', name: 'Global Equity Index Fund (Fictional)', sector: 'Diversified', geography: 'Global', basePrice: 102 },
  { ticker: 'NRDEQ', name: 'Nordic Equity Index Fund (Fictional)', sector: 'Diversified', geography: 'Nordics', basePrice: 145 },
  { ticker: 'EMGEQ', name: 'Emerging Markets Index Fund (Fictional)', sector: 'Diversified', geography: 'Emerging Markets', basePrice: 54 },
  { ticker: 'TECHF', name: 'Global Technology Fund (Fictional)', sector: 'Technology', geography: 'Global', basePrice: 210 },
  { ticker: 'GRNEF', name: 'Green Energy Transition Fund (Fictional)', sector: 'Utilities', geography: 'Global', basePrice: 78 },
]

export const MUTUAL_FUNDS = [
  { ticker: 'MFBAL', name: 'Balanced Growth Mutual Fund (Fictional)', sector: 'Diversified', geography: 'Global', basePrice: 150 },
  { ticker: 'MFCON', name: 'Conservative Income Mutual Fund (Fictional)', sector: 'Diversified', geography: 'Global', basePrice: 118 },
  { ticker: 'MFPEN', name: 'Pension Growth Mutual Fund (Fictional)', sector: 'Diversified', geography: 'Nordics', basePrice: 132 },
]

export const BONDS = [
  { ticker: 'GOVNO', name: 'Norway Government Bond 10Y (Fictional)', sector: 'Government Bonds', geography: 'Norway', basePrice: 101 },
  { ticker: 'GOVEU', name: 'Euro Government Bond Index (Fictional)', sector: 'Government Bonds', geography: 'Europe', basePrice: 99 },
  { ticker: 'CORPB', name: 'Nordic Corporate Bond Fund (Fictional)', sector: 'Corporate Bonds', geography: 'Nordics', basePrice: 104 },
]

export const CASH = [
  { ticker: 'CASHNOK', name: 'Cash (NOK)', sector: 'Cash', geography: 'Norway', basePrice: 1 },
]

export const ALL_INSTRUMENTS = [
  ...EQUITIES.map((i) => ({ ...i, assetType: 'Equity' })),
  ...ETFS.map((i) => ({ ...i, assetType: 'ETF' })),
  ...MUTUAL_FUNDS.map((i) => ({ ...i, assetType: 'Mutual Fund' })),
  ...BONDS.map((i) => ({ ...i, assetType: 'Bond' })),
  ...CASH.map((i) => ({ ...i, assetType: 'Cash' })),
]

// Companies and bonds that only exist inside funds. They are never drawn as
// direct customer holdings, so adding them leaves existing customers unchanged.
export const INDEX_ONLY_EQUITIES = [
  { ticker: 'AMSW', name: 'AmeriSoft Platforms Inc.', sector: 'Technology', geography: 'United States', basePrice: 310 },
  { ticker: 'NCLD', name: 'NorthCloud Data Inc.', sector: 'Technology', geography: 'United States', basePrice: 188 },
  { ticker: 'QBIT', name: 'Quantum Bits Corp', sector: 'Technology', geography: 'United States', basePrice: 74 },
  { ticker: 'PSEM', name: 'Pacific Semiconductor Corp', sector: 'Technology', geography: 'Asia Pacific', basePrice: 128 },
  { ticker: 'EUSW', name: 'EuroSoft Systems SE', sector: 'Technology', geography: 'Europe', basePrice: 96 },
  { ticker: 'INDT', name: 'IndiaTech Services Ltd', sector: 'Technology', geography: 'Emerging Markets', basePrice: 39 },
  { ticker: 'USCS', name: 'US Consumer Brands Corp', sector: 'Consumer Discretionary', geography: 'United States', basePrice: 142 },
  { ticker: 'USEN', name: 'US Energy Partners', sector: 'Energy', geography: 'United States', basePrice: 81 },
  { ticker: 'EUPH', name: 'EuroPharma AG', sector: 'Healthcare', geography: 'Europe', basePrice: 205 },
  { ticker: 'EUBK', name: 'EuroBank Group', sector: 'Financials', geography: 'Europe', basePrice: 47 },
  { ticker: 'JPIN', name: 'Nippon Industrial Co.', sector: 'Industrials', geography: 'Asia Pacific', basePrice: 63 },
  { ticker: 'BRMN', name: 'Brasil Mining SA', sector: 'Materials', geography: 'Emerging Markets', basePrice: 28 },
]

export const INDEX_ONLY_BONDS = [
  { ticker: 'CBIND', name: 'Nordic Industrial Bond 2029 (Fictional)', sector: 'Corporate Bonds', geography: 'Nordics', basePrice: 100 },
  { ticker: 'CBBNK', name: 'Nordic Bank Senior Bond 2028 (Fictional)', sector: 'Corporate Bonds', geography: 'Nordics', basePrice: 100 },
  { ticker: 'CBENR', name: 'Nordic Energy Bond 2030 (Fictional)', sector: 'Corporate Bonds', geography: 'Nordics', basePrice: 100 },
  { ticker: 'CBSHP', name: 'Nordic Shipping Bond 2027 (Fictional)', sector: 'Corporate Bonds', geography: 'Norway', basePrice: 100 },
]

// Raw constituent weights per fund; the generator normalises them to 100 %.
export const FUND_COMPOSITION = {
  TECHF: { USTK: 14, AMSW: 14, PSEM: 12, NCLD: 11, QBIT: 8, EUSW: 8, ASIP: 8, OSLC: 7, INDT: 7, HELS: 6, CASHNOK: 5 },
  GLBEQ: {
    AMSW: 7, USTK: 6, NCLD: 4, PSEM: 4, QBIT: 2, EUSW: 2, ASIP: 2, INDT: 2,
    USHL: 5, USFN: 5, USCS: 6, USEN: 4, EUPH: 5, EUBK: 4, EURX: 3, ATLX: 3, JPIN: 4, ASIM: 3,
    NRSK: 3, VIKB: 2, NRDX: 3, SVEA: 2, DANM: 2, BRMN: 3, EMKT: 3, CASHNOK: 1,
  },
  NRDEQ: { NRSK: 14, NRDX: 13, VIKB: 12, BRGN: 10, FJEL: 9, SVEA: 9, DANM: 9, OSLC: 8, HELS: 7, CASHNOK: 9 },
  EMGEQ: { PSEM: 18, INDT: 16, EMKT: 16, BRMN: 14, ASIM: 14, ASIP: 12, CASHNOK: 10 },
  GRNEF: { DANM: 26, SVEA: 18, USEN: 12, JPIN: 10, BRMN: 10, EURX: 9, NRSK: 8, CASHNOK: 7 },
  MFBAL: {
    AMSW: 6, USTK: 5, NCLD: 3, PSEM: 3, USHL: 4, USFN: 4, USCS: 4, EUPH: 4, EUBK: 3, NRSK: 4, NRDX: 4, VIKB: 3, JPIN: 3,
    GOVNO: 15, GOVEU: 10, CBIND: 8, CBBNK: 7, CASHNOK: 10,
  },
  MFCON: { USHL: 4, EUPH: 4, NRDX: 4, VIKB: 3, NRSK: 3, USFN: 3, DANM: 2, GOVNO: 28, GOVEU: 22, CBIND: 10, CBBNK: 10, CASHNOK: 7 },
  MFPEN: { NRSK: 10, NRDX: 10, VIKB: 9, BRGN: 8, OSLC: 7, SVEA: 6, DANM: 6, FJEL: 5, HELS: 4, AMSW: 4, USTK: 3, EUPH: 3, GOVNO: 15, CBIND: 5, CASHNOK: 5 },
  CORPB: { CBIND: 30, CBBNK: 28, CBENR: 22, CBSHP: 15, CASHNOK: 5 },
}
