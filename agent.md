# Project rules

## Stack
- Frontend (`client/`): Next.js (App Router) with TypeScript in strict mode. Tailwind CSS for styling.
- Backend (`server/`): Express.js with TypeScript in strict mode. Prisma with PostgreSQL. Schema lives in server/prisma/schema.prisma.
- Use server components by default in client. Add "use client" only where a component needs clicks, state, or browser APIs.

## Money
- Store all money as integers in paise. Field names end in _paise.
- Never use floating-point numbers for money.
- Convert paise to rupees only for display, using lib/money.ts.
- A selling price must never be above MRP. Enforce this in lib/pricing.ts and test it.

## Business rules
- The server calculates every total, delivery fee, and discount. Never trust prices sent from the browser.
- Business rules live in lib/ (or server/src/lib/), not in UI components.
- Customers pay before delivery. No credit orders.
- Buy from a shop only after the order is paid, or cash on delivery is accepted.

## Mobile-first
- Design for 360 px width first. No horizontal scrolling.
- Buttons and links are at least 44 px high.
- Body text is at least 16 px.

## Working style
- Ask before installing a new package, and say why.
- Before a large change, list the files you will touch.
- Keep each task to one feature.
- Never write real secrets in code. Read them from .env, and list only variable names in .env.example.
- Add or update tests for business rules.
- After each task, explain what changed and how to check it, in three lines or fewer.

## Reference
- The full plan is in docs/plan.md. Each task names the section to read.
