# Output Contracts

Return JSON when possible:

```json
{
  "visibleTurnText": "compact GM turn text",
  "challengeSignal": {
    "challengeType": "combat|explore|social|ritual|boss",
    "difficultyBand": "easy|normal|hard|boss|mythic",
    "primaryStat": "Fuerza|Inteligencia|Carisma|Magnetismo",
    "stakes": "low|medium|high|campaign-critical",
    "requiresOutGame": true,
    "ritualSize": "micro|macro|none"
  },
  "stateDeltaProposal": {},
  "ritualRequest": {},
  "lootProposal": {},
  "memoryDelta": {},
  "validationNotes": []
}
```
