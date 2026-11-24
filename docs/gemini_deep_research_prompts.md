# Gemini Deep Research Prompts

Run each prompt as a separate Gemini Deep Research session. Export each report (Google Doc → .docx or .pdf) into this `docs/` folder.

- Prompt 1 → `Research_1_Lab_to_Plant_Quality.docx`
- Prompt 2 → `Research_2_Sagar_Energy_Cognite.docx`

---

## Prompt 1: Lab-to-Plant Data Integration and Clinker-to-Cement Quality Intelligence

```
ROLE
You are a senior cement process and quality engineer and an industrial (OT/IT) data architect. Write a deep research report that I will use to build a realistic proof-of-concept (POC) dashboard. The dashboard shows lab-to-plant data integration and quality analytics for a large Indian cement manufacturer: about 11 MTPA, 4 integrated plants and 2 grinding units across Telangana, Andhra Pradesh, Madhya Pradesh and Odisha.

WHAT THE CUSTOMER ASKED FOR (from a discovery meeting)
1. Connect laboratory equipment to the existing plant automation system: X-ray (XRF) analysers, XRD analysers, particle size analysers, cross-belt analysers, bomb calorimeters, optical microscopes and cement strength testing machines.
2. Connect field instruments, sensors and cameras to the existing plant automation systems.
3. Bring raw material, process, operational and field data together in one place.
4. Correlate clinker parameters with finished cement quality and performance.
5. Use analytics to predict process behaviour and to optimise manufacturing parameters against product specifications.
6. Make better use of data for energy management and process efficiency.
7. A previous integration vendor connected some equipment and raw data began reaching a server, but the project stalled. The customer's immediate priority is to stabilise data receipt and data handling.

RESEARCH THE FOLLOWING

A. Lab instrument landscape. Write one sub-section per instrument type listed in point 1, covering:
   - What it measures in a cement plant, at which stage (limestone/raw material, raw meal, kiln feed, hot meal, clinker, cement, coal/petcoke/alternative fuel) and how often samples are typically taken.
   - Leading vendors and models used in Indian cement plants (for example Thermo Fisher ARL, Malvern Panalytical, Bruker and Rigaku for XRF/XRD; Malvern Mastersizer and Sympatec for particle size; Thermo Scientific and Scantech for PGNAA/PFTNA cross-belt analysers; IKA and Parr for calorimeters; Leica and Zeiss for clinker microscopy; Controls, Toni Technik, AIMIL and Matest for compression testing).
   - How data comes out of the instrument: vendor software, file formats, RS-232/serial, LIMS export, OPC UA/DA, Modbus. How data is typically extracted, and what commonly goes wrong.
   - Exact output parameters with units, typical ranges and target values. For example:
     XRF: SiO2, Al2O3, Fe2O3, CaO, MgO, SO3, K2O, Na2O, Cl, and the derived LSF, SM, AM.
     XRD: alite, belite, C3A (cubic/orthorhombic), C4AF, free lime, periclase.
     Particle size: D10/D50/D90, residue on 45 µm and 90 µm, Blaine.
     Calorimeter: GCV/NCV in kcal/kg.
     Microscopy: alite/belite crystal size, Ono method.
     Strength: 1/3/7/28-day compressive strength in MPa.

B. Plant automation and field layer:
   - Common DCS/PLC platforms in Indian cement plants (ABB 800xA, Siemens PCS 7, FLSmidth ECS, Yokogawa, Honeywell, Rockwell), process historians (AVEVA PI and others) and protocols (OPC UA, OPC DA, Modbus TCP/RTU, Profibus/Profinet, MQTT, and IEC 61850 for electrical systems).
   - Key field tags for each process section, with units and typical operating ranges, in enough detail to simulate realistically: crusher, stacker/reclaimer, raw mill/VRM, preheater/calciner, kiln, cooler, coal mill, cement mill (ball mill, roller press, VRM), packing.
   - Camera use cases in cement plants (kiln shell scanner, flame/burning-zone camera, cooler camera, conveyor/belt monitoring) and how camera-derived data joins the process data.
   - Existing lab automation and quality control systems (FLSmidth QCX/RoboLab, thyssenkrupp Polysius POLAB, ABB Expert Optimizer and similar): what they do, and which gaps a plant-wide data platform fills.

C. Data unification and stabilisation:
   - Why lab-to-DCS integration projects stall: sample ID mismatch, manual entry, misaligned timestamps and residence times, IT/OT network segregation and security, vendor lock-in, data loss without store-and-forward.
   - Proven architecture patterns: edge gateways, store-and-forward buffering, validation, unit normalisation, and aligning lab samples to process time using material residence times (raw mill → blending silo → kiln → clinker → cement mill).
   - Data quality KPIs a "data health" screen should show: completeness, latency, freshness, out-of-range rate, duplicate rate, connector uptime.
   - A recommended unified data model linking raw material → raw meal → kiln feed → clinker → cement → dispatch, with the keys and timestamps that join them.

D. Clinker-to-cement quality correlation and prediction:
   - Established relationships: how Bogue phases (C3S, C2S, C3A, C4AF), LSF/SM/AM, free lime, clinker litre weight and alite crystal size affect strength development; how cement fineness/PSD, SO3 optimisation, gypsum, and fly ash or slag additions affect 28-day strength and setting time.
   - Machine learning and soft-sensor approaches: predicting 28-day strength from early-age results plus chemistry plus PSD, free lime soft sensors, raw mix control. Include published accuracy figures (R², RMSE) and named case studies.
   - Indian product specifications plants optimise against: BIS IS 269:2015 (OPC 33/43/53), IS 1489 (Part 1) PPC, IS 455 PSC, and IS 4031 test methods. List the actual limits for fineness, soundness, setting time, strength at each age, and chemical requirements.

E. Benefits and KPIs: quantified benefits with sources, such as lower strength standard deviation, clinker factor reduction, kcal/kg and kWh/t savings, fewer off-spec batches, and shorter lab turnaround time.

OUTPUT FORMAT
- Executive summary first, then numbered sections A–E. Use tables wherever possible.
- A "Parameter Dictionary" table with these columns: Parameter | Process stage | Source (instrument or DCS tag) | Unit | Typical range | Target / spec limit | Sampling frequency. Include at least 60 parameters.
- A "KPI Catalogue" table covering 20–25 KPIs for quality, lab operations and data health. Columns: KPI | Definition / formula | Unit | Is a rise good? (yes/no) | Normal / warning / critical thresholds | Best breakdown dimensions (pick 1–3 from: plant, kiln/mill line, product grade, shift, instrument, material stage) | Data source | Update frequency.
- A "Demo Simulation Guide" section covering realistic value ranges, normal noise levels, and 6–8 realistic anomaly scenarios written as cause → effect chains with time lags. Example: XRF calibration drift → LSF swing → high free lime in clinker → 28-day strength drop seen four weeks later. For each scenario, also give (a) the 2–4 data signals an analytics engine would cite as evidence and (b) 2–3 recommended operator actions a person would approve.
- Cite sources inline with URLs. Mark every figure as Verified (sourced) or Estimated (engineering judgement). Prefer Indian plant data and sources from 2022–2026.
```

---

## Prompt 2: Sagar Cements Profile, Energy and Power Automation, and Cognite Competitive Assessment

```
ROLE
You are an industrial strategy analyst specialising in the Indian cement sector and industrial data/AI software. Write a deep research report that prepares an Indian industrial AI company (Astrikos.ai, with its SIAP platform) for a follow-up meeting with Sagar Cements Ltd (Hyderabad, est. 1981, about 11 MTPA). The meeting will cover a corporate platform demo, an energy-management demo, and a comparison against Cognite Data Fusion, which the customer is also evaluating.

CUSTOMER CONTEXT (from the discovery meeting)
- The customer contact leads Design & Engineering, Cement Projects and Power Automation.
- 6 facilities: 4 integrated plants and 2 grinding units. Locations: Mattampally (Telangana); Gudipadu, Bayyavaram and Dachepalli (Andhra Pradesh); Jeerabad (Madhya Pradesh); Jajpur (Odisha).
- Stated requirements: (1) connect lab equipment (XRF, XRD, particle size analysers, cross-belt analysers, bomb calorimeters, optical microscopes, strength testing machines) to plant automation; (2) connect field instruments, sensors and cameras; (3) unify raw material, process, operational and field data; (4) correlate clinker parameters with cement quality; (5) predict process behaviour and optimise against product specs; (6) energy management and process efficiency.
- An earlier lab integration with a Hyderabad-based vendor stalled after raw data started flowing to a server. The immediate need is to stabilise data receipt and handling.
- They are also interested in energy management, power automation and renewable energy, and in partners for domestic and offshore projects.
- What SIAP claims (to compare against): sector-agnostic; 25 pre-built analytical models; 300+ built-in connectors; integrates existing and legacy equipment without replacing current systems; delivers operational intelligence through data, analytics and recommendations.

RESEARCH THE FOLLOWING

1. Sagar Cements company profile. Verify against the official website, the FY2025-26 Integrated Annual Report, BRSR, investor presentations and credit rating reports:
   - Plant-by-plant table: location, type (integrated or grinding), clinker capacity, cement capacity, number and size of kilns where available, and history (commissioned or acquired, e.g. Andhra Cements/Dachepalli, Jeerabad, Jajpur, Bayyavaram).
   - Products and brands (OPC, PPC, PSC, special cements) and main markets.
   - Energy assets and performance: captive thermal power, WHRS (MW), solar/wind (MW), renewable share, specific thermal energy (kcal/kg clinker), specific electrical energy (kWh/t cement), alternative fuel / TSR, PAT scheme status and targets, ISO 50001.
   - Sustainability targets, digital and automation initiatives, capex and expansion plans, any overseas or offshore activity, key leadership.

2. Energy management, power automation and renewable energy in Indian cement:
   - Section-wise split of electrical (kWh/t) and thermal energy in a cement plant, with Indian benchmarks (CII / BEE best-in-class vs. average).
   - Power automation: energy management systems, power SCADA, IEC 61850, load scheduling against time-of-day tariffs, maximum demand control, power factor and harmonics, and dispatch optimisation across captive power, WHRS, solar and grid, including battery storage.
   - Renewables: WHRS rules of thumb (kW per tpd of clinker), captive and open-access solar, round-the-clock RE, and relevance of green hydrogen.
   - HT industrial tariff structures in Telangana, Andhra Pradesh, Madhya Pradesh and Odisha: energy charge, demand charge, ToD slots.
   - Energy KPIs a cement energy dashboard should show, how UltraTech, Shree, Dalmia, JK Cement, Ramco and Nuvoco report them, and quantified benefits of digital energy management.

3. Cognite Data Fusion competitive assessment:
   - Capabilities: extractors and connectors (OPC UA, PI, SAP, files, lab/LIMS), contextualisation, industrial knowledge graph, data modelling, Industrial Canvas, Atlas AI / agents, InField, APIs/SDKs, deployment options (SaaS on Azure/AWS/GCP, edge), security.
   - Commercial model and pricing signals, typical implementation timelines, and partner/SI ecosystem in India.
   - References and outcomes in manufacturing, cement, mining and other heavy process industries. Known weaknesses and criticisms (cost, complexity, reliance on SI partners, connecting edge/OT devices such as lab instruments, etc.).
   - Other platforms a cement company might evaluate: AVEVA PI / CONNECT, Siemens Insights Hub, AspenTech, ABB Ability Genix, Honeywell Forge, FLSmidth digital solutions, Seeq, Palantir Foundry. One paragraph each.
   - A requirement-fit matrix with rows for each of the customer's 6 stated requirements plus "stabilise data receipt" and "energy management". For each row, give Cognite's approach, evidence, and gaps.
   - The questions, proof points and live demo moments a challenger platform like SIAP should use to differentiate itself against Cognite for this customer.

4. Digital transformation at Indian cement peers: what UltraTech, Shree, Dalmia, JK Cement, Ramco, Nuvoco, Heidelberg India and others have deployed (lab automation, APC, digital twins, energy management, centralised control rooms), with which vendors, and with what published outcomes.

5. Demo and positioning recommendations: what a Design & Engineering / Power Automation head at an Indian cement company wants to see in
   (a) a corporate platform demo covering architecture, connectivity, data ingestion, analytics and visualisation, and
   (b) an energy demo.
   Propose a storyline, the screens, and the KPIs for each.

6. Name check: are "CemSync", "CemNexus" or "ClinkerIQ" already used as product or brand names in cement or industrial software?

OUTPUT FORMAT
- Executive summary first, then numbered sections 1–6. Use tables wherever possible.
- An "Energy KPI Catalogue" table covering 15–20 KPIs for energy, power automation and renewables. Columns: KPI | Definition / formula | Unit | Is a rise good? (yes/no) | Normal / warning / critical thresholds | Best breakdown dimensions (pick 1–3 from: plant, section, energy source, feeder, shift, time-of-day slot) | Data source | Update frequency.
- End with an "Implications for the POC" section: concrete screens, KPIs and data points to include, and claims to avoid.
- Cite sources inline with URLs. Mark every figure as Verified (sourced) or Estimated. Prefer FY2024-25 and FY2025-26 sources.
- Note: the Astrikos platform name is also written "S!aP" in Astrikos material; search both spellings.
```
