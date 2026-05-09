import { ApplicationConfig, ErrorHandler, provideBrowserGlobalErrorListeners, isDevMode } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideClientHydration } from '@angular/platform-browser';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideStore } from '@ngrx/store';
import { provideEffects } from '@ngrx/effects';
import { provideStoreDevtools } from '@ngrx/store-devtools';

import { routes } from '@src/app/app.routes';
import { watchlistReducer } from '@src/app/store/watchlist/watchlist.reducer';
import { WatchlistEffects } from '@src/app/store/watchlist/watchlist.effects';
import { GlobalErrorHandler } from '@src/app/core/handlers/global-error.handler';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    { provide: ErrorHandler, useClass: GlobalErrorHandler },
    provideClientHydration(),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withFetch()),
    provideStore({ watchlist: watchlistReducer }),
    provideEffects([WatchlistEffects]),
    provideStoreDevtools({ maxAge: 25, logOnly: !isDevMode() }),
  ],
};
