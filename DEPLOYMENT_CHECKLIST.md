# Hirely — submission and deployment checklist

## A. Local MySQL database (Windows / VS Code)

1. Start the MySQL service in your local MySQL installation.
2. In the VS Code terminal, run `mysql -u root -p` and enter your own MySQL password.
3. At the `mysql>` prompt, run (adjust the path to your extracted folder):

   ```sql
   SOURCE C:/Users/ANURAG/OneDrive/Desktop/HIRELY-v12/backend/schema.sql;
   USE HIRELYDB;
   SHOW TABLES;
   SELECT COUNT(*) AS user_count FROM users;
   ```

   `schema.sql` drops and recreates the Hirely tables. Use it on a new/empty
   Hirely database or take a backup first. Do not run it if you need to retain
   old submission data.

4. Exit MySQL using `exit;`.
5. Copy `backend/.env.example` to `backend/.env`. Fill in your own values:

   ```env
   DB_HOST=localhost
   DB_PORT=3306
   DB_USER=root
   DB_PASSWORD=YOUR_LOCAL_MYSQL_PASSWORD
   DB_NAME=HIRELYDB
   DB_SSL=false
   DB_SSL_CA=
   PORT=5000
   JWT_SECRET=REPLACE_WITH_A_LONG_RANDOM_SECRET
   JWT_EXPIRES_IN=7d
   ADMIN_NAME=Hirely Admin
   ADMIN_EMAIL=YOUR_ADMIN_EMAIL
   ADMIN_PASSWORD=YOUR_STRONG_ADMIN_PASSWORD
   APP_BASE_URL=http://localhost:5000
   RESEND_API_KEY=
   EMAIL_FROM=
   TWILIO_ACCOUNT_SID=
   TWILIO_AUTH_TOKEN=
   TWILIO_FROM_NUMBER=
   ```

6. Open the terminal in the `backend` folder and run:

   ```powershell
   npm install
   npm start
   ```

7. Open `http://localhost:5000/api/health`. Expected response:

   ```json
   {"status":"ok","database":"connected"}
   ```

8. In a second terminal opened in `backend`, run `npm run selftest`.
   Confirm the printed checks pass. This test inserts temporary records and
   removes its test data afterward; do not run it against production data.
9. Manually test Register → Login → Browse Jobs → Save → Apply → Recruiter
   application view/status → Admin view, plus profile and logout.

## B. Forgot-password feature

The project already includes the Forgot Password screen, `/api/auth/forgot-password`,
`/api/auth/reset-password`, a 6-digit OTP, a 10-minute expiry, and a
`password_reset_tokens` table. The schema/migration already creates that table.

Email delivery uses Resend. Create your own Resend account and API key, then set:

```env
RESEND_API_KEY=your_own_resend_api_key
EMAIL_FROM=Hirely <your_verified_sender@your-domain.com>
```

For real recipient delivery, verify a domain you control in Resend and use a
sender on that verified domain. Never use a friend's API key. SMS is optional;
if you want it, also add your own Twilio account credentials. Restart the
server after editing `.env`.

Test with a registered user account: click **Forgot password?**, request an
OTP, check the registered email (also Spam), enter the 6-digit OTP and a new
password, then log in with the new password. If the app reports an email
provider error, inspect the server terminal and Resend dashboard logs.

## C. GitHub push (run from the project root)

First check that `.env` is not staged:

```powershell
git status --short
```

If Git was not initialized yet:

```powershell
git init
git branch -M main
git add .
git status --short
```

Confirm `backend/.env` is NOT listed. Then:

```powershell
git commit -m "Prepare Hirely job portal for submission"
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPOSITORY.git
git push -u origin main
```

If `origin` already exists, do not add it again; check it with `git remote -v`
and push with `git push -u origin main`.

Never push `.env`, database passwords, JWT secrets, Resend keys, Twilio keys,
or private CA/key files. If a secret was ever committed, deleting it in a new
commit is not enough: rotate/revoke it and remove it from Git history if needed.

## D. Render web service

Render can deploy this Express app from the Git repository. Because this app
uses MySQL (`mysql2`), it needs a reachable MySQL server; Render's managed
relational database is PostgreSQL, not a drop-in MySQL database. A simple
option for a small student demo is a separate hosted MySQL service such as
Aiven Free, subject to its current limits and availability.

1. Create a hosted MySQL service and a database named `HIRELYDB`.
2. Copy its host, port, username and password from the provider dashboard.
3. Download the provider's CA certificate if required; for Aiven, use its
   supplied CA certificate. Place it locally at `backend/certs/ca.pem` for
   local testing, and configure the matching secret file in Render.
4. Run `backend/schema.sql` against the hosted database once. The provider's
   SQL console or a MySQL client can be used. Do not run it again on a database
   containing records you need to preserve.
5. In Render choose **New → Web Service**, connect the GitHub repository, then
   set:
   - Root Directory: `backend`
   - Runtime: `Node`
   - Build Command: `npm install`
   - Start Command: `npm start`
6. Add these environment variables in Render (use the actual provider values):

   ```text
   DB_HOST=<hosted-mysql-host>
   DB_PORT=<hosted-mysql-port>
   DB_USER=<hosted-mysql-user>
   DB_PASSWORD=<hosted-mysql-password>
   DB_NAME=HIRELYDB
   DB_SSL=true
   DB_SSL_CA=/etc/secrets/ca.pem
   JWT_SECRET=<new-long-random-secret>
   JWT_EXPIRES_IN=7d
   ADMIN_NAME=Hirely Admin
   ADMIN_EMAIL=<your-admin-email>
   ADMIN_PASSWORD=<new-strong-admin-password>
   APP_BASE_URL=https://<your-render-service>.onrender.com
   RESEND_API_KEY=<your-own-resend-api-key>
   EMAIL_FROM=<verified-sender>
   ```

   In Render, add the CA certificate as a **Secret File** named `ca.pem`;
   its path should match `DB_SSL_CA`. If the database provider does not
   require a custom CA, set `DB_SSL_CA` blank but keep TLS verification on.
   Add Twilio variables only if you configured SMS.
7. Deploy, then visit `https://<your-render-service>.onrender.com/api/health`.
   Expected response is `status: ok` and `database: connected`.
8. Test registration, login, job browse, listing, application, admin login,
   and password reset using your hosted URL.

Note: Render's default filesystem is ephemeral. Uploaded resume files saved
under `backend/uploads` can disappear on redeploy/restart unless you configure
persistent or external file storage. For a classroom demonstration, mention
this limitation if persistent storage is not configured.

## E. Submission evidence

Capture screenshots of:

- MySQL `SHOW TABLES` showing the Hirely schema.
- Home page and successful register/login.
- Job listings and a submitted application.
- Recruiter application/status view and Admin dashboard.
- Forgot-password OTP email and successful password reset (hide the OTP in
  screenshots if you will share them publicly).
- Render deployment marked Live and `/api/health` returning database connected.

Do not claim a feature is working until you have performed the test and seen
its success response in your own environment.
