# MyApp

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 22.2.4.

## Supabase authentication setup

Authentication uses Supabase Auth with Google OAuth or SMS one-time passwords. Family membership and PPF data are stored in Supabase and protected by row-level security.

1. Create a Supabase project.
2. Run [`supabase/migrations/202610250001_family_auth_and_ppf.sql`](supabase/migrations/202610250001_family_auth_and_ppf.sql) in the Supabase SQL Editor, or apply it with the Supabase CLI.
3. In Supabase Auth settings, enable Google and configure its OAuth client ID/secret. Add `http://localhost:4200/login` and your deployed `/login` URL to the allowed redirect URLs.
4. Enable Phone authentication and configure an SMS provider in Supabase. Set the phone OTP expiry/rate limits for your use case.
5. Set the Supabase project URL and publishable/anon key in `src/environments/environment.ts`. These are public client values; never put a service-role key in this Angular app.
6. Start the app with `npm start`, create the first family/admin account, then invite members by the Google email or phone number they will use to sign in.

Invitations are recorded in the database but are not emailed or texted automatically. Share the invited email/phone and sign-in instructions through a trusted channel. The member must authenticate with that same identity to join the family.

Existing browser-only demo PPF records are not migrated automatically. Add the real family accounts after applying the migration. Keep the Supabase service-role key server-side only if you later add an Edge Function for sending invitations.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
