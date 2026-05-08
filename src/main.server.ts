import { bootstrapApplication } from '@angular/platform-browser';
import { App } from '@src/app/app';
import { serverAppConfig } from '@src/app/app.config.server';

export default (context?: { platformRef?: unknown }) =>
  bootstrapApplication(App, serverAppConfig, context as never);
