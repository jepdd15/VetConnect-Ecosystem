---
name: T3.62-T3.67 Chatbot — Reviewed Patterns & Known Issues
description: chatbotService.js + ChatbotScreen.js full rewrite: sendChatMessage, session management, hybrid UI, design pass
type: project
---

All critical checklist items PASS. Key findings:

- console.warn in fetchEcosystem catch block (line 146 ChatbotScreen.js) — acceptable for dev catch; not console.log
- Hardcoded hex values present but most are semantic (tints not in token set): #A5D6A7 (online-green subtext), #EFEBE9 (avatar bg), #E0E0E0 (inline avatar bg), #9E9E9E (timestamp/footer muted), #FFF3E0/#FFB74D (error banner), #EF9A9A/#FFEBEE/#C62828 (inline danger option override), rgba(255,255,255,0.2) (clearBtn bg)
- None of these hex values are in COLORS token scope — the green status color (#A5D6A7) is the most notable design-intent gap (no `onlineGreen` token exists)
- Rate-limit timer correctly cleaned up in second useEffect return
- Message cap check fires BEFORE appending the user turn, so capping at exactly MESSAGE_CAP (20) is correct
- conversationHistory setter uses prev snapshot in the AI reply path (line 401-404) — correct, avoids stale closure
- sendChatMessage uses plain fetch, no npm LLM imports — PASS
- Emergency always rule-based — PASS
- No alert()/prompt()/confirm() anywhere in either file — PASS
- No admin files touched — PASS
- collection import included but used (getDocs(collection(...))) — not a dead import
