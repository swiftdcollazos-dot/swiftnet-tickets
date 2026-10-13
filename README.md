# Swiftnet Tickets

A phone-friendly app that replaces Swiftnet's paper repair orders. Technicians create a
ticket at the client's site, track time in and out, add parts, get the client's signature
on the screen, and print or save the ticket as a PDF. Labor is billed by the hour
($90/hour to start; change it any time under **Settings**).

## What it does

- **Tickets** with the same fields as the paper form: date, service / install / will call /
  deliver, client, item to be serviced, make, model,
  and labor performed.
- **Time in / time out**: a start/stop timer, or type the times in afterwards. Several
  visits per ticket are added together. Billable time rounds up to whole hours,
  with a one-hour minimum, so a 10 minute visit is billed as 1 hour. The customer's ticket shows only
  the total time, not each visit or the hourly rate.
- **Parts and materials** with quantity, part number and price.
- **Totals**: labor and materials, worked out automatically (no tax is charged).
  Each ticket keeps the rate it was created with, so changing settings never
  changes old tickets.
- **Client signature** drawn with a finger on the phone.
- **Print / PDF**: a clean repair-order layout. Use the phone's or browser's
  "Save as PDF" to send it to the client.
- **Clients** list, reused on new tickets.
- **Two logins** to start: David Collazos and Daniel Felipe Torres. Each time entry records
  who did the work.

## One-time setup

You need three free accounts: GitHub (this code), Supabase (the database and logins) and
Vercel (puts the app online).

### 1. Supabase (database)

1. Sign up at https://supabase.com with your GitHub account and create a new project.
   Pick the region closest to Saint Martin (US East).
2. Open **SQL Editor > New query**, paste everything from
   [`supabase/migrations/20261009000000_init.sql`](supabase/migrations/20261009000000_init.sql),
   and click **Run**.
3. Turn off public sign-ups: **Authentication > Sign In / Providers**, switch off
   **Allow new users to sign up**. Only people you add can log in.
4. Add each person who logs in: **Authentication > Users > Add user > Create new user**.
   Enter their email and a password and tick **Auto Confirm User**. Then open the user and set
   their name under **User Metadata**, for example `{"full_name": "David Collazos"}`.
   (Add the name before creating the user if the form offers it; otherwise run
   `update public.profiles set full_name = 'David Collazos' where id = '<user id>';`
   in the SQL Editor.)
5. From **Project Settings > API**, copy the **Project URL** and the **anon public** key.

### 2. Vercel (put it online)

1. Sign up at https://vercel.com with your GitHub account.
2. **Add New > Project**, pick `swiftnet-tickets`, and under **Environment Variables** add:
   - `NEXT_PUBLIC_SUPABASE_URL` = the Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = the anon public key
3. Click **Deploy**. Open the link on your phone, sign in, and use the browser's
   **Add to Home Screen** so it opens like an app.

### 3. Settings

In the app, open **Settings** to confirm the hourly rate, and fill in the
company name, phone and address printed on tickets.

## For developers

```bash
cp .env.example .env.local   # fill in the two Supabase values
npm install
npm run dev                  # http://localhost:3000
npm test                     # billing and time-zone tests
```

Stack: Next.js (App Router, TypeScript, Tailwind CSS) and Supabase (Postgres, Auth).
Money is stored in cents. Times are stored in UTC and shown in Saint Martin time
(Atlantic Standard Time, UTC-4).
