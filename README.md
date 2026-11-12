# QR Event System

This project uses Google Apps Script for the web app, Google Sheets for event data, and Google Drive for QR files and reports.

## Run the live app

GitHub stores the project source; it does not host the running app. GitHub Pages and opening the HTML files directly will not work because the app needs Google Apps Script.

- If the app is already deployed, open its Apps Script web app URL ending in `/exec`.
- To open the admin page directly, use `<web-app-url>/exec?page=admin`.
- Pushing changes to GitHub does not update the live app. To publish changes, follow the setup/update steps below.

## Set up Apps Script

1. Download or clone this repository. Install Node.js, then run `npm install` in the project folder.
2. At [script.google.com](https://script.google.com), create a project. In **Project Settings**, copy its Script ID. Enable the Apps Script API in your Google account settings.
3. Copy `.clasp.json.example` to `.clasp.json` and replace the example value with your Script ID.
4. In the project folder, run:

   ```sh
   npx clasp login
   npm run push
   ```

   This builds the frontend and uploads the files to Apps Script.

### How the project files are added

You do not need to copy or merge files manually. The `.clasp.json` setting points clasp to `google-apps-script/`, and `npm run push` uploads the complete Apps Script project from that folder.

- Edit the page sources in `frontend/`. The build step combines each page's HTML, CSS, and JavaScript into the generated `Home.html`, `Admin.html`, `Scanner.html`, and `Verify.html` files.
- Keep the `.gs` files separate. Apps Script loads them as one project, so their functions can call each other without concatenating them.
- Do not edit the generated HTML files; rebuild them from `frontend/` with `npm run build` or `npm run push`.

5. In Apps Script **Project Settings → Script properties**, add `ADMIN_PASSWORD_TEMP` with a strong password of at least 12 characters. In the editor, run `firstRun_` and approve the requested permissions. This initializes the app and configures the admin password.
6. Choose **Deploy → New deployment → Web app**. Set **Execute as** to **Me** and **Who has access** to **Anyone**, deploy, and copy the web app URL ending in `/exec`.

To publish later code changes, run `npm run push`, then go to **Deploy → Manage deployments → Edit → New version**.

## Admin login

Open the deployed web app URL and choose **Admin Panel**, or go directly to `<web-app-url>/exec?page=admin`. Sign in with the password configured using `ADMIN_PASSWORD_TEMP` during setup; there is no default password.

In the admin panel, create an event and prepare its participant QR codes. Under **Access**, create a scanner PIN and assign it to the event. Share the event's scanner link and PIN with check-in staff.

## Scan attendees

1. On a phone, open the event scanner link over HTTPS and enter the PIN provided by the administrator.
2. Allow camera access, tap **Start camera**, and scan a participant's QR code.
3. Check the on-screen result to confirm check-in. If the camera is unavailable, use **scan from photo** or enter the token manually.
