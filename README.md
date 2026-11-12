# QR Event System

GitHub Pages hosts the frontend. Google Apps Script runs the backend and uses Google Sheets and Drive for data and files. The frontend connects to Apps Script through a restricted iframe bridge.

## Deploy the app

1. Push this repository to GitHub. Note its Pages URL:
   - Project site: `https://<owner>.github.io/<repository>/`
   - User or organization site: `https://<owner>.github.io/`
2. Create a project at [script.google.com](https://script.google.com). In **Project Settings**, copy the Script ID and enable the Apps Script API in your Google account settings.
3. Copy `.clasp.json.example` to `.clasp.json` and replace the example Script ID.
4. In the Apps Script project, open **Project Settings → Script properties** and add:
   - `FRONTEND_URL` = the full GitHub Pages URL from step 1, including its trailing slash.
   - `ADMIN_PASSWORD_TEMP` = a strong initial admin password of at least 12 characters.
5. In this repository, run:

   ```sh
   npm install
   npx clasp login
   npm run push
   ```

   This uploads the Apps Script backend and generates the static site in `docs/`.
6. In the Apps Script editor, run `firstRun_` and approve permissions. Then choose **Deploy → New deployment → Web app**, set **Execute as** to **Me** and **Who has access** to **Anyone**, and deploy.
7. Copy the deployed web app URL ending in `/exec` into `frontend/js/config.js` as `appsScriptUrl`.
8. Run `npm run build`, then commit and push the generated `docs/` folder to GitHub.
9. In the GitHub repository, open **Settings → Pages** and publish the `main` branch's `/docs` folder. Open the Pages URL when deployment is ready.

The Apps Script URL in `frontend/js/config.js` is public configuration, not a secret. Never put passwords or PINs in frontend files.

## Admin login

Open the GitHub Pages URL and choose **Admin panel**, or open `<github-pages-url>/admin.html`. Sign in with the password set in `ADMIN_PASSWORD_TEMP` before running `firstRun_`; there is no default password.

Create an event and prepare participant QR codes. Under **Access**, create a scanner PIN assigned to that event, then share the scanner link and PIN with check-in staff.

## Scan attendees

1. On a phone, open the event scanner link over HTTPS and enter the PIN from the administrator.
2. Allow camera access, tap **Start camera**, and scan a participant's QR code.
3. Confirm the result on screen. If the camera is unavailable, scan from a photo or enter the token manually.

## Add or update files

- Edit frontend pages, styles, and scripts in `frontend/`; edit backend functions in `google-apps-script/`.
- Keep `.gs` files separate; Apps Script loads them together as one project.
- Run `npm run build` to generate GitHub Pages files in `docs/` and Apps Script HTML files in `google-apps-script/`.
- For backend changes, run `npm run push`, then deploy a **New version** in Apps Script.
- For frontend changes, run `npm run build` and push the updated `docs/` folder to GitHub.
