# AGENTS.md: Project Rules

## Read first
1. This file.
2. docs/plan.md. Read only the section the task names.
3. Run `git status` before changing anything.

## Project layout
- client/: Next.js 16 (App Router), Tailwind CSS, TypeScript in strict mode. Runs at http://localhost:3000.
- server/: Express.js, Prisma ORM, PostgreSQL, TypeScript in strict mode. Runs at http://localhost:4000.
- Root package.json scripts: npm run dev:client, npm run dev:server, npm run test:server.
- Do not move folders or rename files without asking.

## Stack rules
- TypeScript strict mode in both client and server. No `any` unless a comment explains why.
- Validate every API request body with Zod on the server.
- Use Prisma for all database access. Never build SQL from user input.
- In client/, components are server components by default. Add "use client" only where a component needs clicks, state, or browser APIs.
- Ask before adding any package, and say why.

## Money rules (non-negotiable)
- Store every amount as an integer in paise. Field names end in _paise.
- Never use floating-point math for money. Rs 1 = 100 paise.
- Convert to rupees only for display, using the helpers in money.ts.
- Display amounts with the rupee sign and Indian digit grouping.

## Pricing and business rules
- A customer's selling price must never exceed the printed MRP. Enforce this on the server in pricing.ts, with a test.
- The server calculates every total, delivery fee, free-delivery threshold, and COD eligibility. Never trust prices sent from the browser.
- Delivery fee, free-delivery threshold, and COD limit come from the Settings table. Current values are dummy and must be marked is_dummy.
- Customers pay before delivery. Cash on delivery is allowed only below the COD limit.
- One shop per order in v1. If a customer adds an item from a second shop, ask whether to empty the cart first.
- Phase 1 uses guest checkout: name, phone, and address on the order form. OTP login and saved addresses come in Phase 2.
- Buy from a shop only after the order is confirmed.
- Block checkout for pincodes that are not serviceable.

## Brand rules
- The brand lives only in the brand constants: BRAND_NAME, BRAND_PREFIX, and SUPPORT_EMAIL. Never hard-code the brand name elsewhere.
- Current values are PlukIt, PLUK, and support@plukit.in. The final name is not confirmed. Do not change the brand without asking.
- Existing order numbers never change. New orders use BRAND_PREFIX.

## Mobile-first rules
- Design for 360 px width first. No horizontal scrolling.
- Buttons and links are at least 44 px high. Body text is at least 16 px.
- Keep the cart bar visible on category and product pages.

## Database rules
- Never edit a migration that has been applied. Create a new migration.
- Money fields are integers only.
- Log admin changes to prices, settings, and payouts in audit_logs.

## Testing rules
- Add or update tests for every business rule: MRP limit, free-delivery threshold, COD limit, pincode check, and ignoring browser-sent prices.
- Run npm run test:server before reporting a task as done. Include the output in your report.

## Security rules
- Never print, log, or commit secrets. Read them from .env. Only variable names go in .env.example.
- Never commit .env. Check with: git ls-files | grep -i "\.env"
- Never log OTPs, card data, or full bank details.

## Working rules
- One feature per task. If a task is larger, list the steps and ask first.
- Before a large change, list the files you will touch.
- After each task: run the tests, commit with a clear message, and report in this order:
  1. Files changed
  2. How to check it (commands and URL)
  3. Test results
  4. Open questions
- Do not start the next feature until I confirm the current one.

## Current status
- Done: project structure, money helpers, MRP check, order number generator, PWA manifest, 360 px homepage header, brand constants, 7 brand tests, GitHub repo.
- Next: Settings model, pricing tests (MRP, threshold, COD limit), then the cart.
- Not started: product pages, checkout, admin CSV upload, payments, OTP login.
