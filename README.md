# Zero Hour RTS

En original real-time strategi-engine i browseren, inspireret af *Command & Conquer: Generals — Zero Hour*.
Skrevet i TypeScript med Canvas 2D. Kører identisk på **Windows og macOS** (og Linux) — alt hvad der kræves er en modern browser.

> Dette er et selvstændigt, originalt projekt. Det indeholder **ingen** assets, kode eller data fra EA's spil.
> Faktioner, enheder og grafik er egne. Mekanikkerne er genskabt som design, ikke kopieret.

## Kør spillet
https://dresse3.github.io/Command-and-conquer-zero-hour/

```bash
npm install
npm run dev
```

Åbn den viste URL (typisk `http://localhost:5173`) i din browser.

Byg en statisk version til udgivelse:

```bash
npm run build      # output i dist/ — kan hostes hvor som helst
npm run preview
```

## Styring

| Input | Handling |
|-------|----------|
| **Piletaster / skærmkant** | Panorér kameraet |
| **Musehjul** | Zoom ind/ud |
| **Klik på minimap** | Hop kameraet · (højre-klik = kommandér dertil) |
| **Venstre-klik + træk** | Marker enheder (box-select) |
| **Venstre-klik på bygning** | Vælg bygning → dens byg-menu vises nederst |
| **Shift + klik** | Tilføj til markering |
| **Højre-klik** | Flyt · angrib fjende · send harvester til supply |
| **A** derefter klik | Attack-move til punkt |
| **Ctrl + 1-9** | Gem kontrolgruppe · **1-9** vælg gruppe |
| **Byg-hotkeys** (når bygning valgt) | fx R/E = infanteri, T/Y = køretøjer, 1-5 = strukturer |
| **Z / X / C** | Lås op / affyr general power (kræver ★ promotion points) |
| **K** eller SELL-knap | Sælg valgt bygning (50% refusion) |
| **Shift under placering** | Bliv i placeringstilstand (byg flere) |
| **Esc** | Annullér placering / power / fjern markering |
| **Play Again** (efter sejr/nederlag) | Start en ny kamp med nyt kort og ny modstander |

## Nyt i v1.0 — færdig udgivelse 🎉

Første fulde udgivelse. Alt fra v0.1–v0.9.2 samlet i et komplet, spilbart spil:

- **Spil igen uden at genindlæse:** sejr/nederlag-skærmen har nu en **Play Again-knap**. Et klik (eller tap) rydder kampen og fører dig tilbage til faktions-vælgeren — et helt nyt kort og en ny modstander hver gang, uden at opdatere siden.
- Sejr/nederlag-overlayet er pudset af med tydelig besked og en rigtig knap i stedet for "genindlæs siden".
- Fungerer identisk på **Windows, macOS, Linux** og **touch** (iPad/iPhone) — mus/tastatur og fingre bruger samme knap.

## Nyt i v0.9.2 — iOS Safari safe-area & fuldskærm

- Canvas følger nu det **faktisk synlige område** (`visualViewport`) i stedet for `100vh`, så Safaris top-adresselinje og bund-værktøjslinje ikke længere skærer HUD'en af i bunden.
- **Safe-area-insets** respekteres (notch / home-indicator), så knapperne ikke gemmer sig bag systemets kanter.
- **Bedste oplevelse på iPad:** åbn siden i Safari → Del-knappen → **"Føj til hjemmeskærm"**. Så starter den fuldskærm som en app, helt uden Safari-bjælker.

## Nyt i v0.9.1 — tablet-polish & bugfixes

- **Responsiv HUD:** bundbjælken er lagt om i to rækker (navn/kø/sælg øverst, knapper nederst). Byg-knapperne skalerer til skærmbredden og overlapper aldrig sælg-/power-knapperne — fikser at knapperne lå oven i hinanden på 11" iPad.
- **Sælg-knappen** flyttet til øverste række, fri af byg-knapperne.
- **Minimap** skalerer ned på mindre skærme; faktions-vælgeren tilpasser sig skærmbredden.
- **Touch-fix:** edge-scroll (kant-panorering) slås fra på touch — før kunne kortet panorere i det uendelige efter et tryk nær kanten.
- Kontekst-hints viser touch-gestures på tablet/mobil i stedet for tastatur-genveje.

## Nyt i v0.9 — spilbar på iPad & touch

Spillet er nu spilbart på **iPad, iPhone og touch-skærme** direkte i browseren (samme cross-platform-ånd som Apple-porten af Generals, men i vores egen kode):

| Gestus | Handling |
|--------|----------|
| **Tap på faktionskort** | Vælg side og start |
| **Tap** | Vælg enhed/bygning · med enheder valgt: flyt/angrib det tappede punkt |
| **Én-finger træk** | Marker enheder (box-select) |
| **To-finger træk** | Panorér kameraet |
| **Pinch (to fingre)** | Zoom ind/ud |
| **Tap på HUD/minimap** | Byg, powers, sælg, spring kamera |

Mus/tastatur virker stadig på desktop. iOS-viewport er låst (ingen utilsigtet browser-zoom/scroll), og alle gestures håndteres af spillet.

> **Bemærk om sprites:** den delte Apple-port indeholder ingen grafik-assets (kun motor-kode), og det originale spils grafik er EA's copyright — så der er ingen sprites at hente derfra. Rigtige *originale* sprites kan genereres senere.

## Nyt i v0.8 — opgraderinger & tech

Køb permanente, holdbrede forbedringer ved at vælge en bygning og klikke opgraderingen (guldfarvet knap) — én gang hver, virker på hele hæren:

| Opgradering | Bygning | Effekt |
|-------------|---------|--------|
| **Weapons Upgrade** (G) | Barracks | +20% skade på alle enheder |
| **Composite Armor** (J) | War Factory | +25% HP på alle enheder |
| **Supply Lines** (U) | Supply Depot | +50% harvester-indkomst |
| **Overcharged Reactors** (P) | Power Plant | +50% strøm-output |

Opgraderinger anvendes med det samme på både eksisterende og nye enheder. Det giver Power Plant og Supply Depot et formål når de vælges, og en strategisk credit-sink til sent spil. AI'en forsker også i opgraderinger.

## Nyt i v0.7 — unikke faktions-enheder

Faktionerne er ikke længere kun stat-varianter — hver har nu en **signatur-enhed** og en særtræk:

| Faktion | Signatur-enhed | Særtræk |
|---------|----------------|---------|
| **Vanguard Coalition** | **Marksman** (sniper: meget lang rækkevidde, høj skade mod infanteri) | — |
| **Iron Legion** | **Overlord Tank** (super-tungt panser, 900 HP, splash) | — |
| **Desert Wolves** | **Technical** (hurtig, billig bevæbnet bil) | **Bygninger kræver ikke strøm** |

Signatur-enheden dukker op i den relevante bygnings byg-menu (Barracks/War Factory) for den faktion. AI'en bygger også sin egen signatur-enhed.

## Nyt i v0.6 — faktioner

Vælg en af tre asymmetriske faktioner før kampen (fjenden får en af de andre):

| Faktion | Stil | Signatur |
|---------|------|----------|
| **Vanguard Coalition** | Balanceret højteknologi | Powers oplades 20% hurtigere |
| **Iron Legion** | Tungt panser, billige masser | +25% HP, billigere enheder, knusende artilleri |
| **Desert Wolves** | Billige, hurtige guerillaer | −30% pris, +20% fart, større reinforcements |

Faktionen justerer enheders pris, HP, fart og skade, bygningspriser og general-power-bonusser — så de tre sider spiller mærkbart forskelligt. Din valgte faktion vises i HUD'en.

## Nyt i v0.5 — finpudsning & balance

- **Promotion points:** general powers er ikke længere gratis. Du optjener point ved at ødelægge fjendens enheder/bygninger (vist som ★ i toppen), og bruger dem til at **låse powers op**. Artillery Barbage dukker altså ikke op efter 10 sekunder — den skal fortjenes. AI'en spiller efter samme regler.
- **Rettet tab-betingelse:** du taber først når **alle** dine bygninger er væk — ikke ved tab af Command Center alene. Du kan nu overleve og komme igen selv uden hovedbasen.
- **Sælg bygninger:** vælg en bygning og klik **SELL** (eller tryk **K**) for 50% refusion — nyttigt til at flytte base eller redde økonomien.
- **Smartere AI:** går ikke længere passiv hvis dens Command Center falder — den kæmper videre fra sine øvrige bygninger og optjener/​bruger sine egne powers.

## Nyt i v0.4 — spil-dybde

- **Fog of war:** kortet starter uudforsket; dine enheder/bygninger afslører terræn. Fjender skjules uden for dit synsfelt, og du "husker" udforskede områder i tåge
- **General Powers / superweapons** (oplades over tid, aktiveres via HUD-knapper eller Z/X/C):
  - **Artillery Barrage** — regn af granater over et målområde
  - **Airstrike** — jetjager stryger hen over målet og bomber
  - **Reinforcements** — tilkald en gruppe enheder øjeblikkeligt
- **Veterangrader:** enheder der dræber fjender stiger i rang (rookie → veteran → elite) med bonus til skade, HP og selvhealing — vist med chevroner
- **Smartere AI:** genopbygger strøm, bygger forsvarstårne, forsvarer basen når du angriber, og bruger sin egen artilleri-power mod dine styrker

## Nyt i v0.3 — grafik & lyd

- **Ørkengrafik:** sandpalette med procedurel terræn-variation, klippeformationer og skygger under alle enheder/bygninger
- **Detaljerede enheder:** tanks med bælter og **roterende tårn** der sigter mod målet, artilleri med langt løb, soldater med våben, harvester med skovl
- **Detaljerede bygninger:** bevel-skygger, ikoner pr. type, flammer/røg når livet er lavt, tydelig OFFLINE-markering uden strøm
- **Partikeleffekter:** eksplosioner (ild + røg + murbrokker), mundingsild, gnister ved træffere, støv ved byggeri
- **Camera shake** ved store eksplosioner, tracer-spor på projektiler, rally-linje på valgt bygning
- **Syntetiseret lyd** (Web Audio, ingen filer): skud (gevær/raket/kanon), eksplosioner, byg-færdig, placering, markering, low-power-advarsel, sejr/nederlag-fanfare

## Hvad er implementeret (v0.2)

- **Tile-baseret kort** (60×60) med terræn og klippeforhindringer
- **A\* pathfinding** (8-retninger, undviger forhindringer og bygninger)
- **Kamera** med pan, edge-scroll, zoom og **minimap** med klik-navigation
- **Base-building:** placér Power Plant, Barracks, War Factory, Supply Depot og Gun Turret med ghost-preview
- **Strøm-system:** bygninger kræver strøm; brownout slukker produktion og forsvar
- **Produktionshierarki:** Barracks → infanteri, War Factory → køretøjer, Command Center → strukturer
- **Enheder:** Ranger, Rocketeer (anti-tank), Raptor Tank, Artillery (splash), Harvester
- **Kamp:** auto-targeting, projektiler, splash-skade, forsvarstårne, health bars
- **Økonomi:** harvestere samler fra supply-felter og afleverer i Command Center / Supply Depot
- **Kommando:** kontrolgrupper (Ctrl+1-9), attack-move (A)
- **Fjende-AI:** bygger økonomi + hær fra barracks/factory og angriber i bølger
- **Sejr/nederlag:** ødelæg fjendens Command Center — eller mist din egen

## Arkitektur

```
src/
  main.ts        Bootstrap + game loop (requestAnimationFrame)
  config.ts      Balance, faktioner, enheds-/bygningsdata
  grid.ts        Tile-grid + A* pathfinding
  camera.ts      Pan / zoom / world<->screen
  input.ts       Mus + tastatur, selection box
  entities.ts    Unit, Building, SupplyField, Projectile (+ veterancy)
  ai.ts          Fjendens beslutningslogik
  fog.ts         Synlighedskort (fog of war)
  powers.ts      General powers / superweapons
  effects.ts     Partikelsystem
  audio.ts       Syntetiseret lyd (Web Audio)
  hud.ts         HUD-layout, knap-hittest, minimap-mapping
  game.ts        Orkestrering: state, update, kommandoer, økonomi, win/lose
  renderer.ts    Al tegning + HUD
  types.ts       Delte typer og WorldApi-interface
```

## Roadmap (næste skridt)

- [x] Flere bygningstyper (barracks, war factory, forsvarstårne)
- [x] Supply Depot som ekstra afleveringspunkt
- [x] Minimap med klik-navigation
- [x] Gruppe-hotkeys (Ctrl+1-9) og attack-move (A)
- [x] Partikeleffekter, camera shake og syntetiseret lyd
- [x] Ørkengrafik med skygger og detaljerede enheder/bygninger
- [x] Fog of war
- [x] General powers / superweapons
- [x] Veterangrader for enheder
- [x] Smartere AI (rebuild, forsvar, brug af powers)
- [x] Faktions-asymmetri (tre spilbare sider)
- [x] Signatur-enhed + særtræk pr. faktion
- [x] Opgraderinger / tech (våben, panser, økonomi, strøm)
- [x] Touch/iPad-understøttelse (spilbar på tablet/mobil)
- [ ] Faktions-specifikke opgraderinger/superweapon-bygninger
- [ ] Originale AI-genererede sprites (foto-realistisk løft)
- [ ] Pak som desktop-app (Tauri/Electron) for native Win/Mac

## Licens

Original kode. Ikke tilknyttet eller godkendt af Electronic Arts.
