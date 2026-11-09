# Success criteria (falsifiable)

Site purpose: playful self-intro for 斎川有栖 / Alice Saikawa.

1. **Identity in first viewport (mobile 390×844)**  
   Both `斎川有栖` and `Alice Saikawa` are visible without scrolling.

2. **Role, bilingual**  
   Page states junior Java / TypeScript engineer in Japanese and in English  
   (e.g. ジュニアエンジニア + Junior engineer, and Java + TypeScript).

3. **Links**  
   - GitHub opens `https://github.com/AliceSaikawa` (or case-equivalent).  
   - X opens `https://x.com/realme_ramirisu`.

4. **Mobile layout**  
   At 390px width, `document.documentElement.scrollWidth` ≤ `clientWidth`  
   (no horizontal overflow).

5. **Tap targets**  
   GitHub and X controls are each at least 44×44 CSS pixels.

Run: `node scripts/verify.mjs`
